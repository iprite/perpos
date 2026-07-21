import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "../../_lib/supabase";
import { setAuditContext } from "../../_lib/audit";
import { recordMetric } from "@/lib/metrics";
import { requireAccountingMember, canEditSettings, accError, orgIdFromQuery, num } from "../_lib";
import { getOrgSettings } from "@/lib/accounting/settings";

const ROUTE = "/api/accounting/settings";

/** GET ?orgId= → ตั้งค่าองค์กร (null = ยังไม่ seed → UI ใช้ Non-VAT default) */
export async function GET(req: NextRequest) {
  const t0 = Date.now();
  const orgId = orgIdFromQuery(req);
  if (!orgId) return accError("missing orgId");

  const auth = await requireAccountingMember(req, orgId);
  if (!auth.ok) return auth.res;

  try {
    const data = await getOrgSettings(auth.rls, orgId);
    void recordMetric({ orgId, route: ROUTE, method: req.method, status: 200, t0 });
    return NextResponse.json({ settings: data });
  } catch (e) {
    void recordMetric({ orgId, route: ROUTE, method: req.method, status: 500, t0 });
    return accError((e as Error).message, 500);
  }
}

/** PUT → upsert ตั้งค่าองค์กร (VAT toggle ฯลฯ). owner เท่านั้น (role matrix settings = A). */
export async function PUT(req: NextRequest) {
  const t0 = Date.now();
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const orgId = String(body.orgId ?? "");
  if (!orgId) return accError("missing orgId");

  const auth = await requireAccountingMember(req, orgId);
  if (!auth.ok) return auth.res;
  if (!canEditSettings(auth.role))
    return accError("เฉพาะเจ้าของเท่านั้นที่แก้ตั้งค่าองค์กรได้", 403);

  const patch: Record<string, unknown> = { org_id: orgId };
  if (body.is_vat_registered !== undefined)
    patch.is_vat_registered = Boolean(body.is_vat_registered);
  if (body.vat_rate !== undefined) patch.vat_rate = num(body.vat_rate, { nonNeg: true });
  if (body.fiscal_start_month !== undefined) {
    const m = num(body.fiscal_start_month);
    if (m < 1 || m > 12) return accError("เดือนเริ่มรอบบัญชีไม่ถูกต้อง");
    patch.fiscal_start_month = m;
  }
  if (body.doc_number_prefix !== undefined)
    patch.doc_number_prefix = body.doc_number_prefix ?? null;
  if (body.address !== undefined) patch.address = (body.address as string) || null;
  if (body.tax_id !== undefined) patch.tax_id = (body.tax_id as string) || null;
  if (body.branch !== undefined) patch.branch = (body.branch as string) || null;
  if (body.org_name !== undefined) patch.org_name = (body.org_name as string) || null;
  if (body.logo_data_url !== undefined)
    patch.logo_data_url = (body.logo_data_url as string) || null;
  if (body.signature_data_url !== undefined)
    patch.signature_data_url = (body.signature_data_url as string) || null;

  await setAuditContext(req, auth.userId, orgId);
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("acc_org_settings")
    .upsert(patch, { onConflict: "org_id" })
    .select()
    .single();
  if (error) {
    void recordMetric({ orgId, route: ROUTE, method: req.method, status: 500, t0 });
    return accError(error.message, 500);
  }
  void recordMetric({ orgId, route: ROUTE, method: req.method, status: 200, t0 });
  return NextResponse.json(data);
}
