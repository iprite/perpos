import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "../../../../_lib/supabase";
import { setAuditContext } from "../../../../_lib/audit";
import { requireGovProcureMember, canWrite, orgIdFromQuery, govError } from "../../../_lib";
import { STAGE_MILESTONE_FIELD, STAGE_LABELS, isValidStage } from "@/lib/gov-procure/stage";
import { groupTargetForOrg } from "@/lib/gov-procure/line-group";
import { sendLineMessages } from "@/lib/line/send-messages";
import { getSettings } from "@/lib/gov-procure/settings";
import { buildStageEventFlex } from "@/lib/gov-procure/line-cards";
import {
  getOrgSlug,
  getRecipientLineUserIds,
  pushToGovTargets,
  normalizeRecipientRoles,
} from "@/lib/gov-procure/notify";
import type { GovProcureOrder, Stage } from "@/lib/gov-procure/types";

type Ctx = { params: Promise<{ id: string }> };

/**
 * PATCH /api/gov-procure/orders/[id]/stage?orgId=...
 * เลื่อน stage + set วันหมุดที่ตรงกับ stage (§4/§4.1). canWrite ทุก role รวม staff
 * (staff เลื่อน stage ได้ตาม spec — milestone dates ไม่ใช่ finance-locked field).
 *
 * body: { stage, milestone_date?, skip_date? }
 * - stage='closed' → set stage_manual_override=true, ไม่ตั้งวันหมุด (§4 closed ไม่ผูกหมุด)
 * - skip_date=true → set stage_manual_override=true, ไม่ตั้งวันหมุด (soft path §4.1)
 * - มี milestone_date + stage มี milestone field → ตั้งวันนั้น, stage_manual_override=false
 * - ไม่มีวัน/ไม่ skip → stage_manual_override=true (เลื่อนโดยไม่ระบุวัน)
 */
export async function PATCH(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const orgId = orgIdFromQuery(req);
  if (!orgId) return govError("missing orgId");

  const auth = await requireGovProcureMember(req, orgId);
  if (!auth.ok) return auth.res;
  if (!canWrite(auth.role)) return govError("ไม่มีสิทธิ์เลื่อนสถานะงาน", 403);

  const body = (await req.json().catch(() => ({}))) as {
    stage?: unknown;
    milestone_date?: unknown;
    skip_date?: unknown;
  };

  if (!isValidStage(body.stage)) {
    return govError("สถานะ (stage) ไม่ถูกต้อง");
  }
  const stage = body.stage;
  const skipDate = body.skip_date === true;
  const milestoneField = STAGE_MILESTONE_FIELD[stage];
  const milestoneDate =
    typeof body.milestone_date === "string" && body.milestone_date.trim() !== ""
      ? body.milestone_date
      : null;

  const patch: Record<string, unknown> = { stage };

  if (stage === "closed") {
    // ปิดงาน = manual close (ไม่ผูกหมุด)
    patch.stage_manual_override = true;
  } else if (skipDate) {
    // เลื่อนโดยไม่ระบุวัน (soft path)
    patch.stage_manual_override = true;
  } else if (milestoneDate && milestoneField) {
    // ระบุวันหมุด → set field ที่ตรง stage, ถือว่า derive-ตรง (ไม่ override)
    patch[milestoneField] = milestoneDate;
    patch.stage_manual_override = false;
  } else {
    // ไม่มีวัน/ไม่ skip → เลื่อนแบบ manual
    patch.stage_manual_override = true;
  }

  const admin = createAdminClient();
  await setAuditContext(req, auth.userId, orgId);

  // stage เดิม (ก่อนอัปเดต) — ใช้ตัดสิน T3 ว่า "เปลี่ยนเป็น" delivered/paid จริง (กัน re-fire ตอน patch ซ้ำ)
  const { data: prev } = await admin
    .from("gov_procure_orders")
    .select("stage")
    .eq("id", id)
    .eq("org_id", orgId)
    .maybeSingle();
  const prevStage = (prev as { stage?: string } | null)?.stage ?? null;

  const { data, error } = await admin
    .from("gov_procure_orders")
    .update(patch)
    .eq("id", id)
    .eq("org_id", orgId) // org isolation
    .select()
    .single();

  if (error) return govError(error.message, 500);
  if (!data) return govError("ไม่พบงาน", 404);

  // T3 — แจ้ง stage สำคัญผ่าน LINE (delivered/paid) หลัง update สำเร็จ (§5c T3).
  // ห้าม throw/block: LINE ส่งพลาดต้องไม่ทำให้ PATCH fail → try/catch เงียบ.
  // TODO(T3 debounce): spec ระบุ debounce 1 ชม./order — รอบนี้กันซ้ำด้วย "prevStage !== stage"
  //   (fire เฉพาะตอนเปลี่ยน stage จริง) พอสำหรับ use-case ปกติ; ถ้าต้อง debounce เข้ม
  //   ให้เพิ่มคอลัมน์ last_stage_notify_at ต่อ order แล้วเช็คก่อนส่ง.
  if (prevStage !== stage) {
    // await เพื่อให้ push เสร็จก่อนตอบ (serverless freeze หลัง response) — notify* จับ error
    // เองครบ ไม่ throw → PATCH สำเร็จเสมอแม้ LINE ล่ม
    if (stage === "delivered" || stage === "paid") {
      await notifyStageEvent(admin, orgId, data as GovProcureOrder, stage);
    } else {
      // stage อื่น ๆ — แจ้งเฉพาะ "กลุ่มทีมงาน/นักลงทุน" ที่ผูกไว้ (ข้อความสั้น ไม่สแปมรายบุคคล)
      await notifyGroupStageChange(admin, orgId, data as GovProcureOrder, prevStage, stage);
    }
  }

  return NextResponse.json({ order: data });
}

/** stage ที่ไม่ใช่ delivered/paid → ข้อความสั้นเข้ากลุ่มที่ผูกไว้เท่านั้น */
async function notifyGroupStageChange(
  admin: ReturnType<typeof createAdminClient>,
  orgId: string,
  order: GovProcureOrder,
  prevStage: string | null,
  stage: string,
) {
  try {
    const groupId = await groupTargetForOrg(admin, orgId);
    if (!groupId) return;

    const slug = await getOrgSlug(admin, orgId);
    const name = order.qt_reference || order.product_description || "งานจัดซื้อ";
    const value = order.price_incl_vat
      ? ` · ${new Intl.NumberFormat("th-TH").format(order.price_incl_vat)} ฿`
      : "";
    const text = [
      `🔄 เปลี่ยนสถานะงาน`,
      "",
      `${name}${value}`,
      `${prevStage ? `${STAGE_LABELS[prevStage as Stage] ?? prevStage} → ` : ""}${
        STAGE_LABELS[stage as Stage] ?? stage
      }`,
      "",
      `https://app.perpos.ai/${slug}/gov-procure/orders`,
    ].join("\n");

    await sendLineMessages({ to: groupId, messages: [{ type: "text", text }] });
  } catch (e) {
    console.error("[gov-procure] group stage notify failed", orgId, order.id, e);
  }
}

/** ส่ง Flex T3 ให้ owner+manager ที่ผูก LINE — เช็ค toggle ต่อ event (paid=on, delivered=off default) */
async function notifyStageEvent(
  admin: ReturnType<typeof createAdminClient>,
  orgId: string,
  order: GovProcureOrder,
  stage: "delivered" | "paid",
) {
  try {
    const settings = await getSettings(admin, orgId);
    const enabled = stage === "paid" ? settings.line_event_paid : settings.line_event_delivered;
    if (!enabled) return;

    const roles = normalizeRecipientRoles(settings.line_recipients);
    const to = await getRecipientLineUserIds(admin, orgId, roles);

    const slug = await getOrgSlug(admin, orgId);
    const flex = buildStageEventFlex(order, stage, settings.sla_threshold, slug);
    // กลุ่มทีมงาน/นักลงทุนที่ผูกไว้ + ผู้รับรายบุคคล
    await pushToGovTargets(admin, orgId, to, [flex]);
  } catch (e) {
    console.error("[gov-procure] T3 stage notify failed", orgId, order.id, e);
  }
}
