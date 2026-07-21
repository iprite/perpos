import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "../../_lib/supabase";
import { setAuditContext } from "../../_lib/audit";
import { recordMetric } from "@/lib/metrics";
import {
  requireAccountingMember,
  canWriteFrontstage,
  accError,
  orgIdFromQuery,
  num,
  round2,
  assertPeriodOpen,
} from "../_lib";
import { listEntries } from "@/lib/accounting/entries";

const ROUTE = "/api/accounting/entries";
const VALID_WHT = [1, 2, 3, 5, 10, 15];

/** GET ?orgId=&kind=&category=&from=&to= → รายรับ/รายจ่าย */
export async function GET(req: NextRequest) {
  const t0 = Date.now();
  const orgId = orgIdFromQuery(req);
  if (!orgId) return accError("missing orgId");

  const auth = await requireAccountingMember(req, orgId);
  if (!auth.ok) return auth.res;

  const p = req.nextUrl.searchParams;
  try {
    const data = await listEntries(auth.rls, orgId, {
      kind: p.get("kind") ?? undefined,
      category: p.get("category") ?? undefined,
      from: p.get("from") ?? undefined,
      to: p.get("to") ?? undefined,
      contactId: p.get("contactId") ?? undefined,
    });
    void recordMetric({ orgId, route: ROUTE, method: req.method, status: 200, t0 });
    return NextResponse.json({ entries: data });
  } catch (e) {
    void recordMetric({ orgId, route: ROUTE, method: req.method, status: 500, t0 });
    return accError((e as Error).message, 500);
  }
}

/** POST → บันทึกรายรับ/รายจ่าย (หน้าบ้าน) */
export async function POST(req: NextRequest) {
  const t0 = Date.now();
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const orgId = String(body.orgId ?? "");
  if (!orgId) return accError("missing orgId");

  const auth = await requireAccountingMember(req, orgId);
  if (!auth.ok) return auth.res;
  if (!canWriteFrontstage(auth)) return accError("ไม่มีสิทธิ์บันทึกข้อมูล", 403);

  const kind = String(body.kind ?? "");
  if (!["income", "expense"].includes(kind)) return accError("กรุณาเลือกประเภท รายรับ/รายจ่าย");
  const entryDate = String(body.entry_date ?? "");
  if (!entryDate) return accError("กรุณาเลือกวันที่");
  const amount = round2(num(body.amount, { nonNeg: true }));
  if (amount <= 0) return accError("จำนวนเงินต้องมากกว่า 0");

  // งวดปิดแล้วห้ามบันทึกลงงวดนั้น (Phase 1.4 — เดิมเส้นนี้ไม่เคยเช็ค)
  const periodClient = createAdminClient();
  const entryYear = Number(entryDate.slice(0, 4));
  const entryMonth = Number(entryDate.slice(5, 7));
  const periodOk = await assertPeriodOpen(periodClient, orgId, entryYear, entryMonth);
  if (!periodOk.ok)
    return accError(
      `งวดบัญชี ${entryYear}/${String(entryMonth).padStart(2, "0")} ปิดแล้ว บันทึกรายการไม่ได้`,
      409,
    );

  // WHT (โซนขั้นสูง) — optional
  let whtRate: number | null = null;
  let whtAmount: number | null = null;
  if (body.wht_rate !== undefined && body.wht_rate !== null && String(body.wht_rate) !== "") {
    whtRate = num(body.wht_rate);
    if (!VALID_WHT.includes(whtRate)) return accError("อัตราภาษีหัก ณ ที่จ่ายไม่ถูกต้อง");
    whtAmount = round2((amount * whtRate) / 100);
  }

  await setAuditContext(req, auth.userId, orgId);
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("acc_entries")
    .insert({
      org_id: orgId,
      kind,
      entry_date: entryDate,
      amount,
      category: (body.category as string) || null,
      description: (body.description as string) || null,
      contact_id: (body.contact_id as string) || null,
      source: "manual",
      wht_rate: whtRate,
      wht_amount: whtAmount,
      created_by: auth.userId,
    })
    .select()
    .single();
  if (error) {
    void recordMetric({ orgId, route: ROUTE, method: req.method, status: 500, t0 });
    return accError(error.message, 500);
  }
  void recordMetric({ orgId, route: ROUTE, method: req.method, status: 201, t0 });
  return NextResponse.json(data, { status: 201 });
}
