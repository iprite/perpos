import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "../../../../_lib/supabase";
import { setAuditContext } from "../../../../_lib/audit";
import { recordMetric } from "@/lib/metrics";
import {
  requireAccountingMember,
  canWriteBackstage,
  accError,
  assertPeriodOpen,
  round2,
} from "../../../_lib";

const ROUTE = "/api/accounting/journal/[id]/post";
type Ctx = { params: Promise<{ id: string }> };

/**
 * POST → post journal (draft → posted).
 *   - เช็ค Σdebit = Σcredit (R1 binding) ก่อน post
 *   - เช็คงวด open (R1) → 409 ถ้า closed
 *   - link period_id ถ้ามี period row ของงวด
 */
export async function POST(req: NextRequest, ctx: Ctx) {
  const t0 = Date.now();
  const { id } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const orgId = String(body.orgId ?? "");
  if (!orgId) return accError("missing orgId");

  const auth = await requireAccountingMember(req, orgId);
  if (!auth.ok) return auth.res;
  if (!canWriteBackstage(auth.role)) return accError("เฉพาะนักบัญชีเท่านั้นที่ลงบัญชีได้", 403);

  const admin = createAdminClient();
  const { data: entry } = await admin
    .from("acc_journal_entries")
    .select("status, entry_date")
    .eq("id", id)
    .eq("org_id", orgId)
    .maybeSingle();
  if (!entry) return accError("ไม่พบรายการสมุดรายวัน", 404);
  const e = entry as { status: string; entry_date: string };
  if (e.status === "posted") return accError("รายการนี้ลงบัญชีแล้ว", 409);
  if (e.status === "void") return accError("รายการนี้ถูกยกเลิกแล้ว", 409);

  // คำนวณ Σ จาก lines (source of truth — ไม่เชื่อ total_* ใน header)
  const { data: lines } = await admin
    .from("acc_journal_lines")
    .select("debit, credit")
    .eq("journal_entry_id", id)
    .eq("org_id", orgId);
  if (!lines || lines.length < 2) return accError("รายการต้องมีบรรทัดบัญชีอย่างน้อย 2 บรรทัด", 400);
  let totalDebit = 0;
  let totalCredit = 0;
  for (const l of lines as { debit: number; credit: number }[]) {
    totalDebit += Number(l.debit) || 0;
    totalCredit += Number(l.credit) || 0;
  }
  totalDebit = round2(totalDebit);
  totalCredit = round2(totalCredit);
  if (Math.abs(totalDebit - totalCredit) > 0.01) {
    return accError(`ยอดไม่สมดุล — เดบิต ${totalDebit} ไม่เท่าเครดิต ${totalCredit}`, 400);
  }

  // R1 — งวดปิด → 409
  const year = Number(e.entry_date.slice(0, 4));
  const month = Number(e.entry_date.slice(5, 7));
  const period = await assertPeriodOpen(admin, orgId, year, month);
  if (!period.ok) return accError("งวดบัญชีนี้ปิดแล้ว ลงบัญชีเพิ่มไม่ได้", 409);

  await setAuditContext(req, auth.userId, orgId);
  const { data, error } = await admin
    .from("acc_journal_entries")
    .update({
      status: "posted",
      period_id: period.periodId,
      total_debit: totalDebit,
      total_credit: totalCredit,
    })
    .eq("id", id)
    .eq("org_id", orgId)
    .eq("status", "draft") // กัน race double-post
    .select()
    .single();
  if (error) {
    void recordMetric({ orgId, route: ROUTE, method: req.method, status: 500, t0 });
    return accError(error.message, 500);
  }
  void recordMetric({ orgId, route: ROUTE, method: req.method, status: 200, t0 });
  return NextResponse.json(data);
}
