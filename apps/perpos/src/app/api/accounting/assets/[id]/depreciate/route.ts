import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "../../../../_lib/supabase";
import { setAuditContext } from "../../../../_lib/audit";
import { recordMetric } from "@/lib/metrics";
import {
  requireAccountingMember,
  canWriteBackstage,
  accError,
  assertPeriodOpen,
  num,
  round2,
} from "../../../_lib";
import { monthlyDepreciation } from "@/lib/accounting/assets";

const ROUTE = "/api/accounting/assets/[id]/depreciate";
type Ctx = { params: Promise<{ id: string }> };

// seed code (sync กับ bridge/provisioning B5 — [P6 decision])
const DEPR_EXPENSE_CODE = "5800"; // ค่าเสื่อมราคา
const DEPR_ACCUM_CODE = "1590"; // ค่าเสื่อมราคาสะสม (contra asset)

async function accountIdByCode(
  admin: ReturnType<typeof createAdminClient>,
  orgId: string,
  code: string,
): Promise<string | null> {
  const { data } = await admin
    .from("acc_accounts")
    .select("id")
    .eq("org_id", orgId)
    .eq("code", code)
    .maybeSingle();
  return (data as { id: string } | null)?.id ?? null;
}

/**
 * POST → ตั้งค่าเสื่อมงวดนี้ (accountant). body: { orgId, period_year, period_month }.
 *   - เส้นตรง: (cost − salvage) / life ต่อเดือน · งวดสุดท้ายปัดให้ accumulated ไม่เกิน cost−salvage
 *   - idempotent ต่อ (asset, period) ผ่าน partial unique depreciation (BLOCKER 2)
 *   - งวดปิด → 409 · post journal Dr 5800 / Cr 1590 + update accumulated
 */
export async function POST(req: NextRequest, ctx: Ctx) {
  const t0 = Date.now();
  const { id } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const orgId = String(body.orgId ?? "");
  if (!orgId) return accError("missing orgId");

  const auth = await requireAccountingMember(req, orgId);
  if (!auth.ok) return auth.res;
  if (!canWriteBackstage(auth.role))
    return accError("เฉพาะนักบัญชีเท่านั้นที่ตั้งค่าเสื่อมได้", 403);

  const periodYear = num(body.period_year);
  const periodMonth = num(body.period_month);
  if (periodYear < 2000 || periodMonth < 1 || periodMonth > 12) return accError("งวดไม่ถูกต้อง");

  const admin = createAdminClient();
  const { data: asset } = await admin
    .from("acc_assets")
    .select("name, cost, salvage_value, useful_life_months, accumulated_depreciation, status")
    .eq("id", id)
    .eq("org_id", orgId)
    .maybeSingle();
  if (!asset) return accError("ไม่พบสินทรัพย์", 404);
  const a = asset as {
    name: string;
    cost: number;
    salvage_value: number;
    useful_life_months: number;
    accumulated_depreciation: number;
    status: string;
  };
  if (a.status !== "active")
    return accError("สินทรัพย์นี้ไม่ได้ใช้งานแล้ว ตั้งค่าเสื่อมไม่ได้", 409);

  // คำนวณค่าเสื่อมงวด (เส้นตรง, ปัดงวดสุดท้าย)
  const depreciable = round2(Number(a.cost) - Number(a.salvage_value));
  const accumulated = round2(Number(a.accumulated_depreciation));
  const remaining = round2(depreciable - accumulated);
  if (remaining <= 0) return accError("สินทรัพย์นี้คิดค่าเสื่อมครบแล้ว", 409);
  const monthly = monthlyDepreciation(a);
  const deprThisPeriod = round2(Math.min(monthly, remaining));
  if (deprThisPeriod <= 0) return accError("ค่าเสื่อมงวดนี้เป็น 0", 409);

  // R1 — งวดปิด → 409
  const period = await assertPeriodOpen(admin, orgId, periodYear, periodMonth);
  if (!period.ok) return accError("งวดบัญชีนี้ปิดแล้ว ตั้งค่าเสื่อมไม่ได้", 409);

  // resolve บัญชี (fallback seed)
  const expenseId = await accountIdByCode(admin, orgId, DEPR_EXPENSE_CODE);
  const accumId = await accountIdByCode(admin, orgId, DEPR_ACCUM_CODE);
  if (!expenseId || !accumId) {
    return accError(
      `ไม่พบบัญชีค่าเสื่อม (${DEPR_EXPENSE_CODE}) หรือค่าเสื่อมสะสม (${DEPR_ACCUM_CODE}) ในผังบัญชี`,
      400,
    );
  }

  await setAuditContext(req, auth.userId, orgId);

  // post journal (idempotent ผ่าน partial unique depreciation — ยิงซ้ำ → 23505 → skip)
  const entryNumber = `JV-DEP-${id.slice(0, 8)}-${periodYear}${String(periodMonth).padStart(2, "0")}`;
  const { data: header, error: hErr } = await admin
    .from("acc_journal_entries")
    .insert({
      org_id: orgId,
      entry_number: entryNumber,
      entry_date: `${periodYear}-${String(periodMonth).padStart(2, "0")}-${String(new Date(periodYear, periodMonth, 0).getDate()).padStart(2, "0")}`,
      description: `ค่าเสื่อมราคา ${a.name} งวด ${periodMonth}/${periodYear}`,
      status: "posted",
      source: "depreciation",
      source_ref_id: id,
      period_year: periodYear,
      period_month: periodMonth,
      period_id: period.periodId,
      total_debit: deprThisPeriod,
      total_credit: deprThisPeriod,
      created_by: auth.userId,
    })
    .select("id")
    .single();
  if (hErr) {
    if ((hErr as { code?: string }).code === "23505") {
      return accError("สินทรัพย์นี้ตั้งค่าเสื่อมงวดนี้แล้ว", 409);
    }
    void recordMetric({ orgId, route: ROUTE, method: req.method, status: 500, t0 });
    return accError(hErr.message, 500);
  }
  const journalId = (header as { id: string }).id;

  const { error: lErr } = await admin.from("acc_journal_lines").insert([
    {
      org_id: orgId,
      journal_entry_id: journalId,
      account_id: expenseId,
      debit: deprThisPeriod,
      credit: 0,
      line_note: "ค่าเสื่อมราคา",
      sort_order: 0,
      created_by: auth.userId,
    },
    {
      org_id: orgId,
      journal_entry_id: journalId,
      account_id: accumId,
      debit: 0,
      credit: deprThisPeriod,
      line_note: "ค่าเสื่อมราคาสะสม",
      sort_order: 1,
      created_by: auth.userId,
    },
  ]);
  if (lErr) {
    await admin.from("acc_journal_entries").delete().eq("id", journalId).eq("org_id", orgId);
    void recordMetric({ orgId, route: ROUTE, method: req.method, status: 500, t0 });
    return accError(lErr.message, 500);
  }

  // update accumulated
  const { error: uErr } = await admin
    .from("acc_assets")
    .update({ accumulated_depreciation: round2(accumulated + deprThisPeriod) })
    .eq("id", id)
    .eq("org_id", orgId);
  if (uErr) {
    void recordMetric({ orgId, route: ROUTE, method: req.method, status: 500, t0 });
    return accError(uErr.message, 500);
  }

  void recordMetric({ orgId, route: ROUTE, method: req.method, status: 200, t0 });
  return NextResponse.json({ ok: true, journal_id: journalId, depreciation: deprThisPeriod });
}
