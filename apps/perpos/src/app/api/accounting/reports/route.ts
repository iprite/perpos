import { NextRequest, NextResponse } from "next/server";
import { recordMetric } from "@/lib/metrics";
import { requireAccountingMember, accError, orgIdFromQuery } from "../_lib";
import { trialBalance, incomeStatement, balanceSheet, ledger } from "@/lib/accounting/reports";

const ROUTE = "/api/accounting/reports";

/**
 * GET ?orgId=&type=trial-balance|income-statement|balance-sheet|ledger&from=&to=&account=
 *   งบการเงินจาก journal posted. role: ทุก role อ่านได้ (viewer ก็เห็น) ยกเว้น staff (–) —
 *   staff ไม่มีสิทธิ์หลังบ้าน แต่ guard ที่หน้า/เมนู; API คืน data ตาม member (RLS อ่านได้).
 */
export async function GET(req: NextRequest) {
  const t0 = Date.now();
  const orgId = orgIdFromQuery(req);
  if (!orgId) return accError("missing orgId");

  const auth = await requireAccountingMember(req, orgId);
  if (!auth.ok) return auth.res;
  // staff = หน้าบ้านเท่านั้น (role matrix reports = –)
  if (auth.role === "staff") return accError("ไม่มีสิทธิ์ดูรายงานการเงิน", 403);

  const p = req.nextUrl.searchParams;
  const type = p.get("type") ?? "trial-balance";
  const from = p.get("from") ?? undefined;
  const to = p.get("to") ?? undefined;
  const db = auth.rls;

  try {
    let payload: unknown;
    switch (type) {
      case "trial-balance":
        payload = await trialBalance(db, orgId, { from, to });
        break;
      case "income-statement":
        payload = await incomeStatement(db, orgId, { from, to });
        break;
      case "balance-sheet":
        payload = await balanceSheet(db, orgId, { to });
        break;
      case "ledger": {
        const account = p.get("account");
        if (!account) return accError("กรุณาเลือกบัญชี (ledger)");
        payload = await ledger(db, orgId, account, { from, to });
        break;
      }
      default:
        return accError("ชนิดรายงานไม่ถูกต้อง");
    }
    void recordMetric({ orgId, route: ROUTE, method: req.method, status: 200, t0 });
    return NextResponse.json({ type, report: payload });
  } catch (e) {
    void recordMetric({ orgId, route: ROUTE, method: req.method, status: 500, t0 });
    return accError((e as Error).message, 500);
  }
}
