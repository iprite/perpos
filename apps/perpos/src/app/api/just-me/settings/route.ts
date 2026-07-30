/**
 * /api/just-me/settings — ค่าตั้งต้นบริษัทของโมดูลโครงการ (1 แถวต่อ org)
 * GET = cost-access (ค่า margin/เกณฑ์เตือน = ข้อมูลกำไร) · PUT = owner เท่านั้น
 * ยังไม่มีแถวใน DB → คืนค่า default ที่ตรงกับ DEFAULT ของ migration (ไม่ใช่ค่าว่าง)
 */

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "../../_lib/supabase";
import { auditMutation, guard, jmError, numOrNull } from "../_lib";
import { getSettings } from "@/lib/just-me/price-book";

export async function GET(req: NextRequest) {
  const g = await guard(req, { cost: true });
  if (!g.ok) return g.res;

  try {
    return NextResponse.json({ settings: await getSettings(createAdminClient(), g.orgId) });
  } catch (e) {
    return jmError(e instanceof Error ? e.message : "โหลดค่าตั้งต้นไม่สำเร็จ", 500);
  }
}

export async function PUT(req: NextRequest) {
  const g = await guard(req, { write: true, cost: true, owner: true });
  if (!g.ok) return g.res;

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const payload: Record<string, unknown> = {};

  const margin = numOrNull(body.default_margin_pct);
  if (margin !== undefined) {
    if (margin === null) return jmError("กรุณาระบุ %กำไรเริ่มต้น", 400);
    payload.default_margin_pct = margin;
  }
  const overhead = numOrNull(body.default_overhead_pct);
  if (overhead !== undefined) {
    if (overhead !== null && overhead < 0) return jmError("%ค่าดำเนินการติดลบไม่ได้", 400);
    payload.default_overhead_pct = overhead;
  }
  const alert = numOrNull(body.cost_alert_pct);
  if (alert !== undefined) {
    if (alert === null || alert < 0) return jmError("เกณฑ์เตือนราคาต้องเป็นตัวเลขไม่ติดลบ", 400);
    payload.cost_alert_pct = alert;
  }
  if ("pr_approval_required" in body) {
    payload.pr_approval_required = Boolean(body.pr_approval_required);
  }
  if (Object.keys(payload).length === 0) return jmError("ไม่มีข้อมูลที่จะบันทึก", 400);

  await auditMutation(req, g.auth);
  const { data, error } = await createAdminClient()
    .from("just_me_settings")
    .upsert({ org_id: g.orgId, created_by: g.auth.userId, ...payload }, { onConflict: "org_id" })
    .select("*")
    .single();
  if (error) return jmError(error.message, 500);

  return NextResponse.json({ settings: data });
}
