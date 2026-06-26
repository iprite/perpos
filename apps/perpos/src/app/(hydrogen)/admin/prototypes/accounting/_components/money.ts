// money.ts — helper ตัวเลขบัญชี (cockpit) ของ prototype accounting
// รายรับ-รายจ่าย: income = เงินเข้า · expense = เงินออก · net = income − expense
//
// 🔒 convention (LOCKED): amount เก็บค่าบวกเสมอ (≥ 0) ทั้ง income/expense.
//   ทิศทาง (เข้า/ออก) อยู่ที่ field `kind` ไม่ใช่ที่เครื่องหมายของ amount.

import type { AccEntry } from "../_fixtures/types";

/** ยอดสุทธิที่ได้รับจริงหลังหัก ณ ที่จ่าย (income ที่มี WHT) */
export function netReceivable(entry: AccEntry): number {
  if (entry.kind !== "income" || !entry.wht_amount) return entry.amount;
  return entry.amount - entry.wht_amount;
}

/** รวม income ของชุด entries */
export function sumIncome(entries: AccEntry[]): number {
  return entries.filter((e) => e.kind === "income").reduce((s, e) => s + e.amount, 0);
}

/** รวม expense ของชุด entries */
export function sumExpense(entries: AccEntry[]): number {
  return entries.filter((e) => e.kind === "expense").reduce((s, e) => s + e.amount, 0);
}

/** คงเหลือสุทธิ (income − expense) ของชุด entries */
export function netBalance(entries: AccEntry[]): number {
  return sumIncome(entries) - sumExpense(entries);
}

/** คำนวณยอดหัก ณ ที่จ่ายจากอัตรา (wht_rate %) */
export function computeWht(amount: number, rate: number | null): number {
  if (!rate || rate <= 0) return 0;
  return Math.round(amount * (rate / 100) * 100) / 100;
}
