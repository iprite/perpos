/**
 * guard.ts — server helper ของหน้า `[orgSlug]/bi/*` (ผู้ช่วยวิเคราะห์ธุรกิจ)
 *
 * ⚠️ ต่างจากโมดูล per-org อื่น (tmc/gov_procure): ตาราง `bi_*` ถูก
 * `REVOKE ALL … FROM anon, authenticated` (ผลรีวิวความปลอดภัย S1) →
 * **ห้ามอ่านด้วย RLS client (`createSupabaseServerClient`) เด็ดขาด** จะได้ permission denied
 *
 * ท่าที่ถูก (contract §6.5 + หมายเหตุใน `lib/bi/threads.ts`):
 *   1. resolve slug → orgId + role ด้วย `getModuleRoleForCurrentUser(orgId, 'bi')` (ด่านสิทธิ์จริง)
 *   2. ดึงข้อมูลผ่าน `lib/bi/*` เท่านั้น โดยส่ง service-role client ที่สร้างในไฟล์นี้เข้าไป
 *      — ไม่มีหน้าไหน query ตาราง `bi_*` เอง
 */
import "server-only";

import { notFound } from "next/navigation";
import {
  getCurrentUserId,
  getModuleRoleForCurrentUser,
  getOrganizationsForCurrentUser,
} from "@/lib/accounting/queries";
import { createAdminClient } from "@/app/api/_lib/supabase";
import { canModuleWrite } from "@/lib/modules";
import { listVisibleMetrics } from "@/lib/bi/metrics";
import { resolveOrgScopes } from "@/lib/bi/resolver";
import { getThread, listThreads } from "@/lib/bi/threads";
import type { BiMessage, BiMetricSummary, BiRole, BiThread } from "@/lib/bi/types";

export interface BiPageContext {
  orgId: string;
  orgSlug: string;
  /** profile id ของผู้เรียก — **ต้องใช้กรองข้อมูลเจ้าของทุกครั้ง** (service-role ไม่มี RLS ช่วย) */
  profileId: string;
  role: BiRole;
  /** owner/analyst ถามและให้คะแนนได้ · viewer อ่านประวัติอย่างเดียว */
  canWrite: boolean;
}

/**
 * Guard หน้า BI — เรียกบนสุดของทุก server page ใต้ `[orgSlug]/bi`
 * ด่าน: org member → module เปิดอยู่ (`org_module_settings.is_enabled`) → เป็นสมาชิก module
 * (การเช็ค is_enabled ทำให้ rollback plan "ปิด module" ปิดหน้าเว็บได้จริง ไม่ใช่แค่ซ่อนเมนู)
 */
export async function requireBiPage(orgSlug: string): Promise<BiPageContext> {
  const orgs = await getOrganizationsForCurrentUser();
  const org = orgs.find((o) => o.slug === orgSlug);
  if (!org) notFound();

  const role = (await getModuleRoleForCurrentUser(org.id, "bi")) as BiRole | null;
  if (!role) notFound();

  const enabled = await isBiEnabledForOrg(org.id);
  if (!enabled) notFound();

  const profileId = await getCurrentUserId();
  if (!profileId) notFound();

  return {
    orgId: org.id,
    orgSlug,
    profileId,
    role,
    canWrite: canModuleWrite("bi", role),
  };
}

/** module `bi` ถูกเปิดให้ org นี้อยู่ไหม (ท่าเดียวกับ `requireModuleMember` ฝั่ง API) */
async function isBiEnabledForOrg(orgId: string): Promise<boolean> {
  const { data } = await createAdminClient()
    .from("org_module_settings")
    .select("is_enabled")
    .eq("organization_id", orgId)
    .eq("module_key", "bi")
    .maybeSingle();
  return Boolean((data as { is_enabled?: boolean } | null)?.is_enabled);
}

export interface BiChatInitialData {
  threads: BiThread[];
  activeThreadId: string | null;
  messages: BiMessage[];
  metrics: BiMetricSummary[];
}

/**
 * ข้อมูลตั้งต้นของหน้าแชท (SSR) — รายการบทสนทนา + ข้อความของ thread ที่เลือก
 * + metric ที่ role นี้เห็นได้ (ใช้ทำ "คำถามตัวอย่าง")
 */
export async function loadChatInitialData(
  ctx: BiPageContext,
  threadId?: string | null,
): Promise<BiChatInitialData> {
  const admin = createAdminClient();

  // ⚠️ อ่านผ่าน service-role → **RLS ไม่ทำงาน ต้องกรองเจ้าของเอง** (`profileId` ของผู้เรียก)
  // ถ้าถอด `profileId` ออก = viewer/analyst จะเห็นบทสนทนา (และผลลัพธ์ metric owner-only) ของคนอื่น
  const [threads, metrics] = await Promise.all([
    listThreads(admin, ctx.orgId, { profileId: ctx.profileId }),
    loadVisibleMetrics(ctx),
  ]);

  const wanted = threadId && threads.some((t) => t.id === threadId) ? threadId : null;
  const active = wanted ?? threads[0]?.id ?? null;

  let messages: BiMessage[] = [];
  if (active) {
    const found = await getThread(admin, ctx.orgId, active, ctx.profileId);
    messages = found?.messages ?? [];
  }

  return { threads, activeThreadId: active, messages, metrics };
}

/** metric ที่ verified + อยู่ใน scope ที่ org เปิด + role นี้เห็นได้ (§5 RBAC ระดับ metric) */
export async function loadVisibleMetrics(ctx: BiPageContext): Promise<BiMetricSummary[]> {
  const admin = createAdminClient();
  const scopes = await resolveOrgScopes(admin, ctx.orgId);
  return listVisibleMetrics({ admin, scopes, role: ctx.role });
}
