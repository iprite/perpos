/**
 * notify.ts — LINE แจ้งเตือนของโมดูล just_me (contract §6.2)
 *
 * ⛔ กฎที่ห้ามพัง:
 *  1. **ข้อมูลต้นทุนส่งเฉพาะผู้ที่มีสิทธิ์เห็น** — ผู้รับต้องเป็น `module_members` ของ org นี้ที่ role = owner/manager
 *     (viewer ไม่มีวันได้รับการ์ดที่มีตัวเลขต้นทุน) · query ด้วย org_id ตรงเสมอ ไม่พึ่ง active org ของผู้รับ
 *  2. ยิงตอน mutation เท่านั้น (ไม่มี cron) และ **best-effort** — ส่งไม่สำเร็จห้ามทำให้ mutation ล้ม
 *  3. "เกินงบ" แจ้ง **ครั้งแรกที่ข้ามเส้น** — ผู้เรียกต้องส่ง summary ก่อน/หลัง mutation มาเทียบ
 *     (before.over_budget = false → after.over_budget = true เท่านั้นจึงส่ง) ไม่ใช่ส่งทุกครั้งที่บันทึก
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { sendLineMessages, type LineMessage } from "@/lib/line/send-messages";
import { buildBillingCard, buildOverBudgetCard, buildPrSubmittedCard } from "./line-cards";
import type { ProjectMoneySummary } from "./project-metrics";
import type { JustMeProject, JustMeProjectBilling, JustMePurchaseRequest } from "./types";

const MODULE_KEY = "just_me";
/** เฉพาะบทบาทที่ "เห็นต้นทุนได้" (ตรงกับ `just_me_has_cost_access()` ที่ DB) */
const COST_ACCESS_ROLES = ["owner", "manager"];

function appBaseUrl(): string {
  return process.env.APP_BASE_URL || "https://app.perpos.ai";
}

/** slug ของ org สำหรับทำลิงก์ในการ์ด — ไม่พบ = ใช้ org_id (ลิงก์ยังเปิดได้) */
async function orgSlug(admin: SupabaseClient, orgId: string): Promise<string> {
  const { data } = await admin.from("organizations").select("slug").eq("id", orgId).maybeSingle();
  return (data as { slug: string | null } | null)?.slug ?? orgId;
}

/**
 * line_user_id ของสมาชิกโมดูลที่มีสิทธิ์เห็นต้นทุน (owner/manager) และผูก LINE แล้ว
 * `onlyRoles` ใช้เมื่ออยากแคบกว่านั้น (เช่น ผู้อนุมัติ = owner เท่านั้น)
 */
export async function getJustMeCostRecipients(
  admin: SupabaseClient,
  orgId: string,
  onlyRoles?: string[],
): Promise<string[]> {
  const roles = (onlyRoles ?? COST_ACCESS_ROLES).filter((r) => COST_ACCESS_ROLES.includes(r));
  if (roles.length === 0) return [];

  const { data: members, error } = await admin
    .from("module_members")
    .select("user_id, module_role")
    .eq("org_id", orgId)
    .eq("module_key", MODULE_KEY)
    .eq("is_active", true)
    .in("module_role", roles);
  if (error) return [];

  const userIds = Array.from(
    new Set((members ?? []).map((m) => (m as { user_id: string }).user_id)),
  );
  if (userIds.length === 0) return [];

  const { data: profiles } = await admin
    .from("profiles")
    .select("id, line_user_id")
    .in("id", userIds);

  const out = new Set<string>();
  for (const p of profiles ?? []) {
    const lid = (p as { line_user_id: string | null }).line_user_id;
    if (lid && lid.trim()) out.add(lid.trim());
  }
  return Array.from(out);
}

/** ส่งแบบไม่ throw — ปัญหาการส่งไม่ควรทำให้การบันทึกข้อมูลล้ม */
async function push(to: string[], messages: LineMessage[], tag: string): Promise<void> {
  if (to.length === 0) return;
  const res = await sendLineMessages({ to, messages }).catch((e) => ({
    ok: false as const,
    error: String(e),
  }));
  if (!res.ok) console.error(`[just-me:notify:${tag}] push failed`, res.error);
}

async function displayName(admin: SupabaseClient, userId: string | null): Promise<string | null> {
  if (!userId) return null;
  const { data } = await admin
    .from("profiles")
    .select("display_name, email")
    .eq("id", userId)
    .maybeSingle();
  const row = data as { display_name: string | null; email: string | null } | null;
  return row?.display_name || row?.email || null;
}

// ─── 1. ใบขอซื้อส่งขออนุมัติ → ผู้อนุมัติ ───────────────────────────────────
/**
 * ผู้รับ = **owner เท่านั้น** (ผู้อนุมัติตามค่าตั้งต้น `pr_approval_required`)
 * ถ้า org ไม่ได้บังคับให้ owner อนุมัติ → ส่งถึง manager ด้วย (ทั้งคู่มีสิทธิ์เห็นต้นทุน)
 */
export async function notifyPrSubmitted(
  admin: SupabaseClient,
  args: {
    orgId: string;
    pr: JustMePurchaseRequest;
    itemCount: number;
    ownerApprovalOnly: boolean;
    submittedBy: string | null;
  },
): Promise<void> {
  try {
    const roles = args.ownerApprovalOnly ? ["owner"] : COST_ACCESS_ROLES;
    const [to, slug, submitter] = await Promise.all([
      getJustMeCostRecipients(admin, args.orgId, roles),
      orgSlug(admin, args.orgId),
      displayName(admin, args.submittedBy),
    ]);
    if (to.length === 0) return;

    let projectName: string | null = null;
    if (args.pr.project_id) {
      const { data } = await admin
        .from("just_me_projects")
        .select("name")
        .eq("org_id", args.orgId)
        .eq("id", args.pr.project_id)
        .maybeSingle();
      projectName = (data as { name: string } | null)?.name ?? null;
    }

    const card = buildPrSubmittedCard({
      prCode: args.pr.pr_code,
      projectName,
      estimatedCost: args.pr.total_estimated_cost,
      neededDate: args.pr.needed_date,
      itemCount: args.itemCount,
      submitterName: submitter,
      url: `${appBaseUrl()}/${slug}/just-me/purchase-requests/${args.pr.id}`,
    });
    await push(to, [card], "pr-submitted");
  } catch (e) {
    console.error("[just-me:notify:pr-submitted]", String(e));
  }
}

// ─── 2. ต้นทุนจริง+ผูกพัน ข้ามเส้นงบ → owner + manager ──────────────────────
/**
 * ส่ง **เฉพาะครั้งแรกที่ข้ามเส้น** — ผู้เรียกส่ง summary ก่อน/หลัง mutation มาให้เทียบ
 * (ไม่มีคอลัมน์ dedup ใน DB จึงใช้ "การเปลี่ยนสถานะภายในคำสั่งเดียว" เป็นตัวกันสแปม)
 */
export async function notifyOverBudgetCrossed(
  admin: SupabaseClient,
  args: {
    orgId: string;
    project: Pick<JustMeProject, "id" | "project_code" | "name">;
    before: ProjectMoneySummary;
    after: ProjectMoneySummary;
  },
): Promise<void> {
  if (args.before.over_budget || !args.after.over_budget) return;
  try {
    const [to, slug] = await Promise.all([
      getJustMeCostRecipients(admin, args.orgId),
      orgSlug(admin, args.orgId),
    ]);
    if (to.length === 0) return;

    const card = buildOverBudgetCard({
      projectCode: args.project.project_code,
      projectName: args.project.name,
      budgetCost: args.after.budget_cost,
      actualCost: args.after.actual_cost,
      committedCost: args.after.committed_cost,
      variance: args.after.cost_variance,
      url: `${appBaseUrl()}/${slug}/just-me/projects/${args.project.id}`,
    });
    await push(to, [card], "over-budget");
  } catch (e) {
    console.error("[just-me:notify:over-budget]", String(e));
  }
}

// ─── 3. งวดงาน (พร้อมวางบิล / วางบิลแล้ว) → owner + manager ─────────────────
export async function notifyBillingEvent(
  admin: SupabaseClient,
  args: {
    orgId: string;
    event: "ready" | "invoiced";
    project: Pick<JustMeProject, "id" | "project_code" | "name">;
    billing: Pick<JustMeProjectBilling, "seq" | "title" | "amount" | "due_date">;
    docNumber?: string | null;
  },
): Promise<void> {
  try {
    const [to, slug] = await Promise.all([
      getJustMeCostRecipients(admin, args.orgId),
      orgSlug(admin, args.orgId),
    ]);
    if (to.length === 0) return;

    const card = buildBillingCard({
      event: args.event,
      projectCode: args.project.project_code,
      projectName: args.project.name,
      seq: args.billing.seq,
      title: args.billing.title,
      amount: args.billing.amount,
      dueDate: args.billing.due_date,
      docNumber: args.docNumber ?? null,
      url: `${appBaseUrl()}/${slug}/just-me/projects/${args.project.id}?tab=billings`,
    });
    await push(to, [card], `billing-${args.event}`);
  } catch (e) {
    console.error("[just-me:notify:billing]", String(e));
  }
}
