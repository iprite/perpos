import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "../../../_lib/supabase";
import { setAuditContext } from "../../../_lib/audit";
import { recordMetric } from "@/lib/metrics";
import { requireAccountingMember, canWriteFrontstage, accError, num, round2 } from "../../_lib";

const ROUTE = "/api/accounting/entries/[id]";
const VALID_WHT = [1, 2, 3, 5, 10, 15];
type Ctx = { params: Promise<{ id: string }> };

/** PATCH → แก้ไขรายการ. กันแก้รายการ source≠manual (payroll/document auto-post). */
export async function PATCH(req: NextRequest, ctx: Ctx) {
  const t0 = Date.now();
  const { id } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const orgId = String(body.orgId ?? "");
  if (!orgId) return accError("missing orgId");

  const auth = await requireAccountingMember(req, orgId);
  if (!auth.ok) return auth.res;
  if (!canWriteFrontstage(auth.role)) return accError("ไม่มีสิทธิ์แก้ไขข้อมูล", 403);

  const admin = createAdminClient();
  const { data: existing } = await admin
    .from("acc_entries")
    .select("source, amount")
    .eq("id", id)
    .eq("org_id", orgId)
    .maybeSingle();
  if (!existing) return accError("ไม่พบรายการ", 404);
  if ((existing as { source: string }).source !== "manual") {
    return accError("รายการที่สร้างจากระบบอัตโนมัติ (เงินเดือน/เอกสาร) แก้ไขที่นี่ไม่ได้", 409);
  }

  const patch: Record<string, unknown> = {};
  if (body.kind !== undefined) {
    if (!["income", "expense"].includes(String(body.kind))) return accError("ประเภทไม่ถูกต้อง");
    patch.kind = body.kind;
  }
  if (body.entry_date !== undefined) {
    if (!String(body.entry_date)) return accError("กรุณาเลือกวันที่");
    patch.entry_date = body.entry_date;
  }
  let amount = num((existing as { amount: number }).amount);
  if (body.amount !== undefined) {
    amount = round2(num(body.amount, { nonNeg: true }));
    if (amount <= 0) return accError("จำนวนเงินต้องมากกว่า 0");
    patch.amount = amount;
  }
  if (body.category !== undefined) patch.category = (body.category as string) || null;
  if (body.description !== undefined) patch.description = (body.description as string) || null;
  if (body.contact_id !== undefined) patch.contact_id = (body.contact_id as string) || null;
  if (body.wht_rate !== undefined) {
    if (body.wht_rate === null || String(body.wht_rate) === "") {
      patch.wht_rate = null;
      patch.wht_amount = null;
    } else {
      const rate = num(body.wht_rate);
      if (!VALID_WHT.includes(rate)) return accError("อัตราภาษีหัก ณ ที่จ่ายไม่ถูกต้อง");
      patch.wht_rate = rate;
      patch.wht_amount = round2((amount * rate) / 100);
    }
  }
  if (Object.keys(patch).length === 0) return accError("ไม่มีข้อมูลที่จะแก้ไข");

  await setAuditContext(req, auth.userId, orgId);
  const { data, error } = await admin
    .from("acc_entries")
    .update(patch)
    .eq("id", id)
    .eq("org_id", orgId)
    .select()
    .single();
  if (error) {
    void recordMetric({ orgId, route: ROUTE, method: req.method, status: 500, t0 });
    return accError(error.message, 500);
  }
  void recordMetric({ orgId, route: ROUTE, method: req.method, status: 200, t0 });
  return NextResponse.json(data);
}

/** DELETE ?orgId= → ลบรายการ (เฉพาะ source=manual) */
export async function DELETE(req: NextRequest, ctx: Ctx) {
  const t0 = Date.now();
  const { id } = await ctx.params;
  const orgId = req.nextUrl.searchParams.get("orgId") ?? "";
  if (!orgId) return accError("missing orgId");

  const auth = await requireAccountingMember(req, orgId);
  if (!auth.ok) return auth.res;
  if (!canWriteFrontstage(auth.role)) return accError("ไม่มีสิทธิ์ลบข้อมูล", 403);

  const admin = createAdminClient();
  const { data: existing } = await admin
    .from("acc_entries")
    .select("source")
    .eq("id", id)
    .eq("org_id", orgId)
    .maybeSingle();
  if (!existing) return accError("ไม่พบรายการ", 404);
  if ((existing as { source: string }).source !== "manual") {
    return accError("รายการที่สร้างจากระบบอัตโนมัติ ลบที่นี่ไม่ได้", 409);
  }

  await setAuditContext(req, auth.userId, orgId);
  const { error } = await admin.from("acc_entries").delete().eq("id", id).eq("org_id", orgId);
  if (error) {
    void recordMetric({ orgId, route: ROUTE, method: req.method, status: 500, t0 });
    return accError(error.message, 500);
  }
  void recordMetric({ orgId, route: ROUTE, method: req.method, status: 200, t0 });
  return NextResponse.json({ ok: true });
}
