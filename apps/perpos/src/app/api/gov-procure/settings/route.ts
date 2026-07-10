import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "../../_lib/supabase";
import { setAuditContext } from "../../_lib/audit";
import { requireGovProcureMember, canManageSettings, orgIdFromQuery, govError } from "../_lib";
import { getSettings } from "@/lib/gov-procure/settings";

// field ที่แก้ได้ (whitelist §3.2b — org_id/timestamps server กำหนด)
const SETTINGS_WRITABLE: readonly string[] = [
  "sla_threshold",
  "pct_customer_change",
  "pct_petty",
  "pct_operate",
  "line_alert_enabled",
  "line_recipients",
  "line_weekly_enabled",
  "line_event_paid",
  "line_event_delivered",
] as const;

// GET /api/gov-procure/settings?orgId=... → member อ่านได้ (default ถ้ายังไม่มี row)
export async function GET(req: NextRequest) {
  const orgId = orgIdFromQuery(req);
  if (!orgId) return govError("missing orgId");

  const auth = await requireGovProcureMember(req, orgId);
  if (!auth.ok) return auth.res;

  try {
    const settings = await getSettings(createAdminClient(), orgId);
    return NextResponse.json({ settings });
  } catch (e) {
    return govError((e as Error).message, 500);
  }
}

// PUT /api/gov-procure/settings?orgId=... → บันทึก (เฉพาะ owner/manager — B2)
export async function PUT(req: NextRequest) {
  const orgId = orgIdFromQuery(req);
  if (!orgId) return govError("missing orgId");

  const auth = await requireGovProcureMember(req, orgId);
  if (!auth.ok) return auth.res;
  if (!canManageSettings(auth.role)) {
    return govError("ไม่มีสิทธิ์แก้ตั้งค่า (เฉพาะเจ้าของ/ผู้จัดการ)", 403);
  }

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const patch: Record<string, unknown> = {};
  for (const key of SETTINGS_WRITABLE) {
    if (key in body) patch[key] = body[key];
  }
  if (Object.keys(patch).length === 0) return govError("ไม่มีข้อมูลที่แก้ไขได้");

  const admin = createAdminClient();
  await setAuditContext(req, auth.userId, orgId);

  const { data, error } = await admin
    .from("gov_procure_settings")
    .upsert({ org_id: orgId, ...patch }, { onConflict: "org_id" })
    .select()
    .single();

  if (error) return govError(error.message, 500);
  return NextResponse.json({ settings: data });
}
