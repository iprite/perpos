/**
 * API Route Handler: /api/acc-firm/ocr/mappings
 *
 * จัดการ "ความจำ" ของ self-improvement loop (ocr_vendor_mappings) + สถิติความแม่นยำ
 *
 *   GET    ?firmOrgId=&clientOrgId=   — รายการผู้ขายที่จำได้ + สถิติ (clientOrgId ว่าง = ทุกลูกค้าของสำนักงาน)
 *   PATCH  { firmOrgId, mappingId, debitAccountId }  — แก้บัญชีที่จำผิด
 *   DELETE { firmOrgId, mappingId }                  — ลบความจำรายการนั้น
 *
 * Auth: requireModuleMember(acc_firm) + IDOR guard — mapping ต้องอยู่ใน client org
 * ที่เป็น engagement สถานะ active ของสำนักงานนี้เท่านั้น
 */
import { NextRequest } from "next/server";
import { requireModuleMember } from "../../../_lib/module-auth";
import { createAdminClient } from "../../../_lib/supabase";
import { ok, Err } from "../../../_lib/response";
import { listVendorMappings, getFeedbackStats } from "@/lib/acc-firm/ocr-memory";

/** คืน client org id ที่สำนักงานนี้ดูแลอยู่ (active) — จำกัดเป็นรายเดียวถ้าระบุ clientOrgId */
async function resolveClientScope(
  admin: ReturnType<typeof createAdminClient>,
  firmOrgId: string,
  clientOrgId?: string | null,
): Promise<string[] | null> {
  const { data, error } = await admin
    .from("acc_firm_clients")
    .select("client_org_id")
    .eq("firm_org_id", firmOrgId)
    .eq("status", "active");

  if (error) throw new Error(error.message);
  const all = (data ?? []).map((r: { client_org_id: string }) => r.client_org_id);

  if (!clientOrgId) return all;
  return all.includes(clientOrgId) ? [clientOrgId] : null; // null = ไม่ใช่ลูกค้าของสำนักงานนี้
}

export async function GET(req: NextRequest) {
  const firmOrgId = req.nextUrl.searchParams.get("firmOrgId");
  const clientOrgId = req.nextUrl.searchParams.get("clientOrgId");
  if (!firmOrgId) return Err.missingField("firmOrgId");

  const auth = await requireModuleMember(req, firmOrgId, "acc_firm");
  if (!auth.ok) return auth.res;

  const admin = createAdminClient();
  try {
    const scope = await resolveClientScope(admin, firmOrgId, clientOrgId);
    if (scope === null) return Err.forbidden("ไม่มีสิทธิ์เข้าถึงข้อมูลของลูกค้ารายนี้");

    const [mappings, stats] = await Promise.all([
      listVendorMappings(admin, scope),
      getFeedbackStats(admin, scope),
    ]);
    return ok({ mappings, stats });
  } catch (e) {
    return Err.dbError(e);
  }
}

export async function PATCH(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const { firmOrgId, mappingId, debitAccountId } = body ?? {};
  if (!firmOrgId) return Err.missingField("firmOrgId");
  if (!mappingId) return Err.missingField("mappingId");
  if (!debitAccountId) return Err.missingField("debitAccountId");

  const auth = await requireModuleMember(req, firmOrgId, "acc_firm");
  if (!auth.ok) return auth.res;
  if (auth.moduleRole === "viewer") return Err.forbidden("ไม่มีสิทธิ์แก้ไขความจำของระบบ");

  const admin = createAdminClient();
  try {
    // mapping ต้องเป็นของลูกค้าที่สำนักงานนี้ดูแลอยู่
    const { data: mapping, error: mErr } = await admin
      .from("ocr_vendor_mappings")
      .select("id, org_id")
      .eq("id", mappingId)
      .maybeSingle();
    if (mErr) return Err.dbError(mErr);
    if (!mapping) return Err.notFound("Vendor mapping", mappingId);

    const scope = await resolveClientScope(admin, firmOrgId, mapping.org_id as string);
    if (scope === null) return Err.forbidden("ไม่มีสิทธิ์แก้ไขความจำของลูกค้ารายนี้");

    // บัญชีใหม่ต้องอยู่ในผังบัญชีของ client org เดียวกัน (กันชี้ข้ามองค์กร)
    const { data: acc, error: aErr } = await admin
      .from("acc_accounts")
      .select("id")
      .eq("id", debitAccountId)
      .eq("org_id", mapping.org_id)
      .eq("is_active", true)
      .maybeSingle();
    if (aErr) return Err.dbError(aErr);
    if (!acc) return Err.invalidFormat("debitAccountId", "ไม่อยู่ในผังบัญชีของลูกค้ารายนี้");

    const { error: uErr } = await admin
      .from("ocr_vendor_mappings")
      .update({ debit_account_id: debitAccountId })
      .eq("id", mappingId);
    if (uErr) return Err.dbError(uErr);

    return ok({ message: "แก้ไขความจำเรียบร้อย" });
  } catch (e) {
    return Err.dbError(e);
  }
}

export async function DELETE(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const { firmOrgId, mappingId } = body ?? {};
  if (!firmOrgId) return Err.missingField("firmOrgId");
  if (!mappingId) return Err.missingField("mappingId");

  const auth = await requireModuleMember(req, firmOrgId, "acc_firm");
  if (!auth.ok) return auth.res;
  if (auth.moduleRole === "viewer") return Err.forbidden("ไม่มีสิทธิ์ลบความจำของระบบ");

  const admin = createAdminClient();
  try {
    const { data: mapping, error: mErr } = await admin
      .from("ocr_vendor_mappings")
      .select("id, org_id")
      .eq("id", mappingId)
      .maybeSingle();
    if (mErr) return Err.dbError(mErr);
    if (!mapping) return Err.notFound("Vendor mapping", mappingId);

    const scope = await resolveClientScope(admin, firmOrgId, mapping.org_id as string);
    if (scope === null) return Err.forbidden("ไม่มีสิทธิ์ลบความจำของลูกค้ารายนี้");

    const { error: dErr } = await admin.from("ocr_vendor_mappings").delete().eq("id", mappingId);
    if (dErr) return Err.dbError(dErr);

    return ok({ message: "ลบความจำเรียบร้อย" });
  } catch (e) {
    return Err.dbError(e);
  }
}
