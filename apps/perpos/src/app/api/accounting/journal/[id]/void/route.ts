import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "../../../../_lib/supabase";
import { setAuditContext } from "../../../../_lib/audit";
import { recordMetric } from "@/lib/metrics";
import {
  requireAccountingMember,
  canWriteBackstage,
  accError,
  assertPeriodOpen,
} from "../../../_lib";

const ROUTE = "/api/accounting/journal/[id]/void";
type Ctx = { params: Promise<{ id: string }> };

/**
 * POST → void journal (posted/draft → void). posted แก้ไม่ได้ → void แล้วสร้างใหม่.
 *   - งวด closed → 409 (กันแก้บัญชีในงวดที่ปิดแล้ว)
 */
export async function POST(req: NextRequest, ctx: Ctx) {
  const t0 = Date.now();
  const { id } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const orgId = String(body.orgId ?? "");
  if (!orgId) return accError("missing orgId");

  const auth = await requireAccountingMember(req, orgId);
  if (!auth.ok) return auth.res;
  if (!canWriteBackstage(auth)) return accError("เฉพาะนักบัญชีเท่านั้นที่ลงบัญชีได้", 403);

  const admin = createAdminClient();
  const { data: entry } = await admin
    .from("acc_journal_entries")
    .select("status, entry_date")
    .eq("id", id)
    .eq("org_id", orgId)
    .maybeSingle();
  if (!entry) return accError("ไม่พบรายการสมุดรายวัน", 404);
  const e = entry as { status: string; entry_date: string };
  if (e.status === "void") return accError("รายการนี้ถูกยกเลิกแล้ว", 409);

  // งวดปิด → ห้าม void (กันแก้บัญชีในงวดที่ปิด)
  const year = Number(e.entry_date.slice(0, 4));
  const month = Number(e.entry_date.slice(5, 7));
  const period = await assertPeriodOpen(admin, orgId, year, month);
  if (!period.ok) return accError("งวดบัญชีนี้ปิดแล้ว ยกเลิกรายการไม่ได้", 409);

  await setAuditContext(req, auth.userId, orgId);
  const { data, error } = await admin
    .from("acc_journal_entries")
    .update({ status: "void" })
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
