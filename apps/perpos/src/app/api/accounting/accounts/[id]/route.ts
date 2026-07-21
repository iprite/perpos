import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "../../../_lib/supabase";
import { setAuditContext } from "../../../_lib/audit";
import { recordMetric } from "@/lib/metrics";
import { requireAccountingMember, canWriteBackstage, accError } from "../../_lib";

const ROUTE = "/api/accounting/accounts/[id]";
const VALID_TYPES = ["asset", "liability", "equity", "income", "expense"];
type Ctx = { params: Promise<{ id: string }> };

/** PATCH → แก้ไขบัญชี (บัญชี is_system แก้ได้เฉพาะ is_active, ห้ามแก้ code/type) */
export async function PATCH(req: NextRequest, ctx: Ctx) {
  const t0 = Date.now();
  const { id } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const orgId = String(body.orgId ?? "");
  if (!orgId) return accError("missing orgId");

  const auth = await requireAccountingMember(req, orgId);
  if (!auth.ok) return auth.res;
  if (!canWriteBackstage(auth)) return accError("เฉพาะนักบัญชีเท่านั้นที่จัดการผังบัญชีได้", 403);

  const admin = createAdminClient();
  const { data: existing } = await admin
    .from("acc_accounts")
    .select("is_system")
    .eq("id", id)
    .eq("org_id", orgId)
    .maybeSingle();
  if (!existing) return accError("ไม่พบบัญชี", 404);
  const isSystem = (existing as { is_system: boolean }).is_system;

  const patch: Record<string, unknown> = {};
  if (body.name !== undefined) {
    const name = String(body.name).trim();
    if (!name) return accError("กรุณากรอกชื่อบัญชี");
    patch.name = name;
  }
  if (body.is_active !== undefined) patch.is_active = Boolean(body.is_active);
  // บัญชี system: ห้ามแก้ code/account_type/parent_id (กันโครงมาตรฐานเพี้ยน + auto-post พึ่งพา)
  if (!isSystem) {
    if (body.code !== undefined) {
      const code = String(body.code).trim();
      if (!code) return accError("กรุณากรอกเลขที่บัญชี");
      patch.code = code;
    }
    if (body.account_type !== undefined) {
      if (!VALID_TYPES.includes(String(body.account_type)))
        return accError("ประเภทบัญชีไม่ถูกต้อง");
      patch.account_type = body.account_type;
    }
    if (body.parent_id !== undefined) patch.parent_id = (body.parent_id as string) || null;
  } else if (body.code !== undefined || body.account_type !== undefined) {
    return accError("บัญชีมาตรฐานของระบบ แก้รหัส/ประเภทไม่ได้", 409);
  }
  if (Object.keys(patch).length === 0) return accError("ไม่มีข้อมูลที่จะแก้ไข");

  await setAuditContext(req, auth.userId, orgId);
  const { data, error } = await admin
    .from("acc_accounts")
    .update(patch)
    .eq("id", id)
    .eq("org_id", orgId)
    .select()
    .single();
  if (error) {
    void recordMetric({ orgId, route: ROUTE, method: req.method, status: 500, t0 });
    if ((error as { code?: string }).code === "23505") return accError("เลขที่บัญชีนี้มีอยู่แล้ว");
    return accError(error.message, 500);
  }
  void recordMetric({ orgId, route: ROUTE, method: req.method, status: 200, t0 });
  return NextResponse.json(data);
}

/** DELETE ?orgId= → ลบบัญชี (บัญชี is_system ลบไม่ได้ · ถูกอ้างใน journal → RESTRICT 23503) */
export async function DELETE(req: NextRequest, ctx: Ctx) {
  const t0 = Date.now();
  const { id } = await ctx.params;
  const orgId = req.nextUrl.searchParams.get("orgId") ?? "";
  if (!orgId) return accError("missing orgId");

  const auth = await requireAccountingMember(req, orgId);
  if (!auth.ok) return auth.res;
  if (!canWriteBackstage(auth)) return accError("เฉพาะนักบัญชีเท่านั้นที่จัดการผังบัญชีได้", 403);

  const admin = createAdminClient();
  const { data: existing } = await admin
    .from("acc_accounts")
    .select("is_system")
    .eq("id", id)
    .eq("org_id", orgId)
    .maybeSingle();
  if (!existing) return accError("ไม่พบบัญชี", 404);
  if ((existing as { is_system: boolean }).is_system) {
    return accError("บัญชีมาตรฐานของระบบ ลบไม่ได้", 409);
  }

  await setAuditContext(req, auth.userId, orgId);
  const { error } = await admin.from("acc_accounts").delete().eq("id", id).eq("org_id", orgId);
  if (error) {
    void recordMetric({ orgId, route: ROUTE, method: req.method, status: 500, t0 });
    // 23503 = ถูกอ้างใน journal_lines (RESTRICT)
    if ((error as { code?: string }).code === "23503") {
      return accError("บัญชีนี้ถูกใช้ในสมุดรายวันแล้ว ลบไม่ได้ (ปิดใช้งานแทนได้)", 409);
    }
    return accError(error.message, 500);
  }
  void recordMetric({ orgId, route: ROUTE, method: req.method, status: 200, t0 });
  return NextResponse.json({ ok: true });
}
