// money.ts (production) — helper ตัวเลขบัญชี (cockpit) ของ module accounting
// รายรับ-รายจ่าย: income = เงินเข้า · expense = เงินออก · net = income − expense
//
// 🔒 convention (LOCKED): amount เก็บค่าบวกเสมอ (≥ 0) ทั้ง income/expense.
//   ทิศทาง (เข้า/ออก) อยู่ที่ field `kind` ไม่ใช่ที่เครื่องหมายของ amount.
// pure (ไม่พึ่ง mock) — type จาก lib/accounting/types.ts (= contract เดียวกับ fixtures)

import type { AccEntry } from "@/lib/accounting/types";

/** รวม income ของชุด entries */
export function sumIncome(entries: AccEntry[]): number {
  return entries.filter((e) => e.kind === "income").reduce((s, e) => s + Number(e.amount || 0), 0);
}

/** รวม expense ของชุด entries */
export function sumExpense(entries: AccEntry[]): number {
  return entries.filter((e) => e.kind === "expense").reduce((s, e) => s + Number(e.amount || 0), 0);
}

/** คำนวณยอดหัก ณ ที่จ่ายจากอัตรา (wht_rate %) */
export function computeWht(amount: number, rate: number | null): number {
  if (!rate || rate <= 0) return 0;
  return Math.round(amount * (rate / 100) * 100) / 100;
}
