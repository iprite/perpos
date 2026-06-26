import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "../../../_lib/supabase";
import { setAuditContext } from "../../../_lib/audit";
import { recordMetric } from "@/lib/metrics";
import { requireAccountingMember, canWriteBackstage, accError, num } from "../../_lib";

const ROUTE = "/api/accounting/tax-filings/[id]";
const VALID_STATUS = ["draft", "ready", "filed"];
type Ctx = { params: Promise<{ id: string }> };

/** PATCH → แก้แบบภาษี (accountant). filed แล้วแก้ตัวเลขไม่ได้. */
export async function PATCH(req: NextRequest, ctx: Ctx) {
  const t0 = Date.now();
  const { id } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const orgId = String(body.orgId ?? "");
  if (!orgId) return accError("missing orgId");

  const auth = await requireAccountingMember(req, orgId);
  if (!auth.ok) return auth.res;
  if (!canWriteBackstage(auth.role)) return accError("เฉพาะนักบัญชีเท่านั้นที่จัดการภาษีได้", 403);

  const admin = createAdminClient();
  const { data: existing } = await admin
    .from("acc_tax_filings")
    .select("status")
    .eq("id", id)
    .eq("org_id", orgId)
    .maybeSingle();
  if (!existing) return accError("ไม่พบแบบภาษี", 404);
  if ((existing as { status: string }).status === "filed") {
    return accError("แบบภาษีที่ยื่นแล้ว แก้ไม่ได้", 409);
  }

  const patch: Record<string, unknown> = {};
  if (body.status !== undefined) {
    if (!VALID_STATUS.includes(String(body.status))) return accError("สถานะไม่ถูกต้อง");
    patch.status = body.status;
  }
  for (const f of ["sales_vat", "purchase_vat", "net_payable", "wht_total"]) {
    if (body[f] !== undefined) patch[f] = body[f] === null ? null : num(body[f]);
  }
  if (body.due_date !== undefined && String(body.due_date)) patch.due_date = body.due_date;
  if (Object.keys(patch).length === 0) return accError("ไม่มีข้อมูลที่จะแก้ไข");

  await setAuditContext(req, auth.userId, orgId);
  const { data, error } = await admin
    .from("acc_tax_filings")
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
