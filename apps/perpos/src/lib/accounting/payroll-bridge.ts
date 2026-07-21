/**
 * payroll-bridge.ts — สะพาน hrm → accounting (auto-post เงินเดือน) [binding contract §4]
 *
 * Trigger: hrm payroll run mark-paid (status='paid') → เรียก runPayrollBridge() in-process.
 *
 * ทำ 3 อย่าง idempotent ต่อ run_id:
 *   1. acc_entries (kind=expense, source=payroll, amount=total_earnings, category="เงินเดือน")
 *   2. acc_journal_entries (posted, source=payroll, 8 บรรทัด, Dr=Cr) + period_year/month
 *   3. upsert acc_tax_filings (pnd1, draft, wht_total, due_date=วันที่ 7 เดือนถัดไป, รวมยอด)
 *
 * Idempotency: partial unique payroll (org,source,source_ref_id) WHERE source='payroll'
 *   → ยิงซ้ำ → entry/journal มีแล้ว → skip (กันยอดเบิ้ล).
 *
 * 🔴 สมการ binding (I1/I2):
 *   total_earnings = net + wht + sso_employee + pvd_employee + extra_deductions
 *   extra_deductions_total = Σ(total_deductions − sso_employee − pvd_employee − wht_amount)   [DERIVE]
 *   total_earnings = Σ gross (รวม OT/เบี้ย/ค่าตำแหน่ง, ไม่แตก OT) → บัญชี 5100 ก้อนเดียว.
 *
 * no-op เงียบถ้า org ไม่เปิด module accounting (ไม่ทำ hrm mark-paid ล้ม).
 */
import { createAdminClient } from "@/app/api/_lib/supabase";

type Admin = ReturnType<typeof createAdminClient>;

/** รหัสบัญชี seed มาตรฐาน (sync กับ provisioning B5 + depreciation).
 *  [P6 decision] prototype ใช้ 1590 contra / 1510-1520 สินทรัพย์ —
 *  payroll-bridge ใช้เฉพาะกลุ่มเงินเดือน (5100-5120, 2210-2240, 1010/1020). */
const SEED_CODE = {
  cash: "1010", // เงินสด (default Cr ฝั่งจ่ายจริง)
  bank: "1020", // เงินฝากธนาคาร (ทางเลือก)
  salaryExpense: "5100", // เงินเดือนและค่าจ้าง (gross รวม OT/เบี้ย — I1)
  ssoEmployerExpense: "5110", // ค่าใช้จ่าย SSO นายจ้าง
  pvdEmployerExpense: "5120", // ค่าใช้จ่าย PVD นายจ้าง
  whtPayable: "2210", // ภาษีหัก ณ ที่จ่ายค้างจ่าย (PND1)
  ssoPayable: "2220", // ประกันสังคมค้างจ่าย
  pvdPayable: "2230", // กองทุนสำรองฯ ค้างจ่าย
  otherDeductPayable: "2240", // เงินหักอื่นค้างจ่าย
} as const;

/** map setting_key (hrm_account_settings) → seed fallback code.
 *  hrm ตั้งชื่อบัญชีเป็น account_label (text) ที่ map กับ code ใน acc_accounts (ผ่าน name/code). */
const HRM_SETTING_TO_CODE: Record<string, string> = {
  salary_expense: SEED_CODE.salaryExpense,
  sso_employer_expense: SEED_CODE.ssoEmployerExpense,
  pvd_employer_expense: SEED_CODE.pvdEmployerExpense,
  wht_payable: SEED_CODE.whtPayable,
  sso_payable: SEED_CODE.ssoPayable,
  pvd_payable: SEED_CODE.pvdPayable,
  other_deduct_payable: SEED_CODE.otherDeductPayable,
  cash: SEED_CODE.cash,
};

interface BridgePayload {
  org_id: string;
  run_id: string;
  run_number: string;
  period_year: number;
  period_month: number;
  total_earnings: number;
  sso_employee_total: number;
  sso_employer_total: number;
  pvd_employee_total: number;
  pvd_employer_total: number;
  wht_total: number;
  extra_deductions_total: number;
  net_total: number;
}

export interface BridgeResult {
  ok: boolean;
  /** เหตุผลเมื่อ no-op/skip (สำหรับ log) */
  reason?: "module_disabled" | "run_not_found" | "already_posted" | "imbalanced" | "error";
  message?: string;
  journalId?: string;
  entryId?: string;
}

function round2(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/** หา account id จาก code ภายใน org (fallback seed). */
async function accountIdByCode(admin: Admin, orgId: string, code: string): Promise<string | null> {
  const { data } = await admin
    .from("acc_accounts")
    .select("id")
    .eq("org_id", orgId)
    .eq("code", code)
    .maybeSingle();
  return (data as { id: string } | null)?.id ?? null;
}

/**
 * resolve รหัสบัญชีจาก hrm_account_settings ก่อน (ถ้ามี account_label ที่ match code/name)
 * ไม่งั้น fallback seed code. คืน Map<settingKey, accountId|null>.
 */
async function resolveAccountIds(
  admin: Admin,
  orgId: string,
): Promise<Record<string, string | null>> {
  // อ่าน hrm_account_settings (อาจไม่มี → ใช้ fallback ทั้งหมด)
  const { data: settings } = await admin
    .from("hrm_account_settings")
    .select("setting_key, account_label")
    .eq("org_id", orgId);
  const labelByKey = new Map<string, string>();
  for (const s of (settings ?? []) as { setting_key: string; account_label: string | null }[]) {
    if (s.account_label) labelByKey.set(s.setting_key, s.account_label);
  }

  const out: Record<string, string | null> = {};
  for (const [settingKey, fallbackCode] of Object.entries(HRM_SETTING_TO_CODE)) {
    let id: string | null = null;
    const label = labelByKey.get(settingKey);
    if (label) {
      // account_label อาจเป็น code หรือ name → ลองหาด้วย code ก่อน แล้ว name
      id = await accountIdByCode(admin, orgId, label);
      if (!id) {
        const { data } = await admin
          .from("acc_accounts")
          .select("id")
          .eq("org_id", orgId)
          .eq("name", label)
          .maybeSingle();
        id = (data as { id: string } | null)?.id ?? null;
      }
    }
    if (!id) id = await accountIdByCode(admin, orgId, fallbackCode);
    out[settingKey] = id;
  }
  return out;
}

/**
 * runPayrollBridge — สะพานหลัก (in-process). caller (hrm mark-paid) wrap try/catch เอง.
 * คืน BridgeResult — ไม่ throw จาก path ปกติ (no-op/skip = ok:false + reason).
 */
export async function runPayrollBridge(
  orgId: string,
  runId: string,
  triggeredBy: string | null,
): Promise<BridgeResult> {
  const admin = createAdminClient();

  // 1) no-op เงียบถ้า org ไม่เปิด module accounting
  const { data: modSetting } = await admin
    .from("org_module_settings")
    .select("is_enabled")
    .eq("organization_id", orgId)
    .eq("module_key", "accounting")
    .maybeSingle();
  if (!(modSetting as { is_enabled?: boolean } | null)?.is_enabled) {
    return { ok: false, reason: "module_disabled" };
  }

  // 2) idempotency — journal payroll ของ run นี้มีแล้ว → skip
  const { data: existing } = await admin
    .from("acc_journal_entries")
    .select("id")
    .eq("org_id", orgId)
    .eq("source", "payroll")
    .eq("source_ref_id", runId)
    .maybeSingle();
  if (existing) {
    return { ok: true, reason: "already_posted", journalId: (existing as { id: string }).id };
  }

  // 3) อ่าน run + payslips
  const { data: run } = await admin
    .from("hrm_payroll_runs")
    .select("run_number, period_year, period_month, total_earnings, total_net")
    .eq("org_id", orgId)
    .eq("id", runId)
    .maybeSingle();
  if (!run) return { ok: false, reason: "run_not_found" };
  const r = run as {
    run_number: string;
    period_year: number;
    period_month: number;
    total_earnings: number;
    total_net: number;
  };

  const { data: slips } = await admin
    .from("hrm_payslips")
    .select(
      "sso_employee, sso_employer, pvd_employee, pvd_employer, wht_amount, total_deductions, net_pay, gross",
    )
    .eq("org_id", orgId)
    .eq("run_id", runId);

  // 4) คำนวณ payload (I1/I2)
  let sso_employee_total = 0;
  let sso_employer_total = 0;
  let pvd_employee_total = 0;
  let pvd_employer_total = 0;
  let wht_total = 0;
  let extra_deductions_total = 0;
  let net_total = 0;
  let gross_total = 0;
  for (const s of (slips ?? []) as Record<string, number>[]) {
    const ssoE = Number(s.sso_employee) || 0;
    const pvdE = Number(s.pvd_employee) || 0;
    const wht = Number(s.wht_amount) || 0;
    const totDed = Number(s.total_deductions) || 0;
    sso_employee_total += ssoE;
    sso_employer_total += Number(s.sso_employer) || 0;
    pvd_employee_total += pvdE;
    pvd_employer_total += Number(s.pvd_employer) || 0;
    wht_total += wht;
    net_total += Number(s.net_pay) || 0;
    gross_total += Number(s.gross) || 0;
    // I2 DERIVE: extra = total_deductions − sso_employee − pvd_employee − wht_amount
    extra_deductions_total += Math.max(0, round2(totDed - ssoE - pvdE - wht));
  }

  // total_earnings = Σ gross (I1) — ใช้ run.total_earnings ถ้ามี ไม่งั้น Σ gross จาก payslips
  const total_earnings = round2(Number(r.total_earnings) || gross_total);

  const payload: BridgePayload = {
    org_id: orgId,
    run_id: runId,
    run_number: r.run_number,
    period_year: r.period_year,
    period_month: r.period_month,
    total_earnings,
    sso_employee_total: round2(sso_employee_total),
    sso_employer_total: round2(sso_employer_total),
    pvd_employee_total: round2(pvd_employee_total),
    pvd_employer_total: round2(pvd_employer_total),
    wht_total: round2(wht_total),
    extra_deductions_total: round2(extra_deductions_total),
    net_total: round2(net_total),
  };

  // 5) resolve รหัสบัญชี
  const acc = await resolveAccountIds(admin, orgId);
  const missing = Object.entries(acc)
    .filter(([, id]) => !id)
    .map(([k]) => HRM_SETTING_TO_CODE[k]);
  if (missing.length > 0) {
    return {
      ok: false,
      reason: "error",
      message: `ไม่พบบัญชีที่จำเป็นสำหรับลงบัญชีเงินเดือน (รหัส: ${missing.join(", ")}) — ตรวจสอบผังบัญชี`,
    };
  }

  // 6) ประกอบ 8 บรรทัด (ข้ามบรรทัดที่ค่า=0 — org non-PVD/non-extra เหลือ 5 บรรทัด)
  type Line = { account_id: string; debit: number; credit: number; line_note: string };
  const lines: Line[] = [];
  const dr = (id: string, amt: number, note: string) => {
    if (amt > 0) lines.push({ account_id: id, debit: amt, credit: 0, line_note: note });
  };
  const cr = (id: string, amt: number, note: string) => {
    if (amt > 0) lines.push({ account_id: id, debit: 0, credit: amt, line_note: note });
  };
  dr(acc.salary_expense!, payload.total_earnings, "เงินเดือนและค่าจ้าง (รวม OT/เบี้ย)");
  dr(acc.sso_employer_expense!, payload.sso_employer_total, "ค่าใช้จ่าย SSO นายจ้าง");
  dr(acc.pvd_employer_expense!, payload.pvd_employer_total, "ค่าใช้จ่าย PVD นายจ้าง");
  cr(acc.cash!, payload.net_total, "เงินสด/ธนาคาร (จ่ายสุทธิ)");
  cr(acc.wht_payable!, payload.wht_total, "WHT ค้างจ่าย (PND1)");
  cr(
    acc.sso_payable!,
    round2(payload.sso_employee_total + payload.sso_employer_total),
    "SSO ค้างจ่าย",
  );
  cr(
    acc.pvd_payable!,
    round2(payload.pvd_employee_total + payload.pvd_employer_total),
    "PVD ค้างจ่าย",
  );
  cr(acc.other_deduct_payable!, payload.extra_deductions_total, "เงินหักอื่นค้างจ่าย");

  const totalDebit = round2(lines.reduce((s, l) => s + l.debit, 0));
  const totalCredit = round2(lines.reduce((s, l) => s + l.credit, 0));
  // 7) เช็คสมดุล (R2 — Dr=Cr) ก่อน post
  if (Math.abs(totalDebit - totalCredit) > 0.01) {
    return {
      ok: false,
      reason: "imbalanced",
      message: `ยอดเดบิต (${totalDebit}) ไม่เท่าเครดิต (${totalCredit}) — สะพานเงินเดือนไม่สมดุล`,
    };
  }

  // 8) สร้าง journal header (posted) + lines + entry — idempotent ผ่าน partial unique (catch 23505)
  const entryNumber = `JV-PR-${payload.run_number}`;
  const { data: jHeader, error: jErr } = await admin
    .from("acc_journal_entries")
    .insert({
      org_id: orgId,
      entry_number: entryNumber,
      entry_date: new Date().toISOString().slice(0, 10),
      description: `ลงบัญชีเงินเดือน รอบ ${payload.run_number}`,
      status: "posted",
      source: "payroll",
      source_ref_id: runId,
      period_year: payload.period_year,
      period_month: payload.period_month,
      total_debit: totalDebit,
      total_credit: totalCredit,
      created_by: triggeredBy,
    })
    .select("id")
    .single();
  if (jErr) {
    // 23505 = unique violation → มี run นี้แล้ว (race) → ถือว่า skip สำเร็จ
    if ((jErr as { code?: string }).code === "23505") {
      return { ok: true, reason: "already_posted" };
    }
    return { ok: false, reason: "error", message: jErr.message };
  }
  const journalId = (jHeader as { id: string }).id;

  const lineRows = lines.map((l, i) => ({
    org_id: orgId,
    journal_entry_id: journalId,
    account_id: l.account_id,
    debit: l.debit,
    credit: l.credit,
    line_note: l.line_note,
    sort_order: i,
    created_by: triggeredBy,
  }));
  const { error: lErr } = await admin.from("acc_journal_lines").insert(lineRows);
  if (lErr) {
    // rollback header (best-effort) — ถ้าล้ม คน/fallback retry ได้ (header skip ครั้งหน้า)
    await admin.from("acc_journal_entries").delete().eq("id", journalId).eq("org_id", orgId);
    return { ok: false, reason: "error", message: lErr.message };
  }

  // 9) acc_entries (expense/payroll) — โผล่ใน cockpit เจ้าของ
  const { data: entryRow } = await admin
    .from("acc_entries")
    .insert({
      org_id: orgId,
      kind: "expense",
      entry_date: new Date().toISOString().slice(0, 10),
      amount: payload.total_earnings,
      category: "เงินเดือน",
      description: `เงินเดือน รอบ ${payload.run_number}`,
      source: "payroll",
      source_ref_id: runId,
      journal_entry_id: journalId,
      created_by: triggeredBy,
    })
    .select("id")
    .single();

  // 10) upsert acc_tax_filings (pnd1 draft, due=วันที่ 7 เดือนถัดไป, รวมยอด)
  if (payload.wht_total > 0) {
    await upsertPnd1(admin, payload, triggeredBy);
  }

  return {
    ok: true,
    journalId,
    entryId: (entryRow as { id: string } | null)?.id,
  };
}

/** upsert pnd1 draft ของงวด — บวกยอด wht ถ้ามี draft อยู่ · ไม่แตะถ้า status≠draft. */
async function upsertPnd1(
  admin: Admin,
  payload: BridgePayload,
  triggeredBy: string | null,
): Promise<void> {
  // due_date = วันที่ 7 ของเดือนถัดไป
  let dueYear = payload.period_year;
  let dueMonth = payload.period_month + 1;
  if (dueMonth > 12) {
    dueMonth = 1;
    dueYear += 1;
  }
  const dueDate = `${dueYear}-${String(dueMonth).padStart(2, "0")}-07`;

  const { data: existing } = await admin
    .from("acc_tax_filings")
    .select("id, status, wht_total")
    .eq("org_id", payload.org_id)
    .eq("tax_kind", "pnd1")
    .eq("period_year", payload.period_year)
    .eq("period_month", payload.period_month)
    .maybeSingle();

  const row = existing as { id: string; status: string; wht_total: number | null } | null;
  if (row) {
    if (row.status !== "draft") return; // ยื่นแล้ว → ไม่แตะ
    await admin
      .from("acc_tax_filings")
      .update({ wht_total: round2((Number(row.wht_total) || 0) + payload.wht_total) })
      .eq("id", row.id)
      .eq("org_id", payload.org_id);
    return;
  }

  await admin.from("acc_tax_filings").insert({
    org_id: payload.org_id,
    tax_kind: "pnd1",
    period_year: payload.period_year,
    period_month: payload.period_month,
    status: "draft",
    wht_total: payload.wht_total,
    due_date: dueDate,
    created_by: triggeredBy,
  });
}
