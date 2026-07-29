/** p2p_group — คำไทยของทุก enum (แหล่งเดียว) contract §3 */

import type {
  BankAccountType,
  CompanyStatus,
  CompanyType,
  DividendStatus,
  FinancialSource,
  IcStatus,
  IcType,
  InvestmentMethod,
  LoanStatus,
} from "./types";

export const COMPANY_TYPE_LABEL: Record<CompanyType, string> = {
  holding: "บริษัทแม่",
  subsidiary: "บริษัทย่อย",
  associate: "บริษัทร่วม",
  joint_venture: "กิจการร่วมค้า",
};

export const COMPANY_STATUS_LABEL: Record<CompanyStatus, string> = {
  active: "ดำเนินกิจการ",
  dormant: "หยุดดำเนินงาน",
  closed: "เลิกกิจการ",
};

export const FINANCIAL_SOURCE_LABEL: Record<FinancialSource, string> = {
  manual: "กรอกเอง",
  accounting: "จากระบบบัญชี",
};

export const INVESTMENT_METHOD_LABEL: Record<InvestmentMethod, string> = {
  cost: "ราคาทุน",
  equity: "ส่วนได้เสีย",
};

export const DIVIDEND_STATUS_LABEL: Record<DividendStatus, string> = {
  declared: "ประกาศจ่าย",
  paid: "รับแล้ว",
  cancelled: "ยกเลิก",
};

export const LOAN_STATUS_LABEL: Record<LoanStatus, string> = {
  active: "ยังไม่ชำระครบ",
  repaid: "ชำระครบแล้ว",
  written_off: "ตัดหนี้สูญ",
};

export const IC_TYPE_LABEL: Record<IcType, string> = {
  loan: "ให้กู้ยืม",
  loan_repayment: "ชำระคืนเงินกู้",
  interest: "ดอกเบี้ยรับ/จ่าย",
  management_fee: "ค่าบริหารจัดการ",
  service: "ค่าบริการ",
  goods: "ซื้อ-ขายสินค้า",
  expense_reimburse: "คืนเงินสำรองจ่าย",
  dividend: "เงินปันผล",
  capital: "เพิ่มทุน/ลงทุน",
};

export const IC_STATUS_LABEL: Record<IcStatus, string> = {
  open: "ค้างอยู่",
  settled: "ชำระแล้ว",
  cancelled: "ยกเลิก",
};

export const BANK_ACCOUNT_TYPE_LABEL: Record<BankAccountType, string> = {
  current: "กระแสรายวัน",
  savings: "ออมทรัพย์",
  fixed: "ฝากประจำ",
  other: "อื่น ๆ",
};

/** ตัวเลือกสำหรับ CustomSelect */
export function toOptions<T extends string>(
  map: Record<T, string>,
): { value: string; label: string }[] {
  return Object.entries(map).map(([value, label]) => ({ value, label: label as string }));
}

const THAI_MONTHS = [
  "ม.ค.",
  "ก.พ.",
  "มี.ค.",
  "เม.ย.",
  "พ.ค.",
  "มิ.ย.",
  "ก.ค.",
  "ส.ค.",
  "ก.ย.",
  "ต.ค.",
  "พ.ย.",
  "ธ.ค.",
];

/** "2026-07-01" → "ก.ค. 2569" (พ.ศ. บนจอ, CE ใน DB) */
export function formatThaiMonth(periodMonth: string): string {
  const [y, m] = periodMonth.split("-").map(Number);
  if (!y || !m) return periodMonth;
  return `${THAI_MONTHS[m - 1]} ${y + 543}`;
}

/** "2026-07-15" → "15 ก.ค. 2569" */
export function formatThaiDate(iso: string | null): string {
  if (!iso) return "—";
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  if (!y || !m || !d) return iso;
  return `${d} ${THAI_MONTHS[m - 1]} ${y + 543}`;
}

/**
 * เงินบาท — `null` แสดง "—" (ยังไม่มีข้อมูล ≠ 0)
 * ยอดลบใช้ U+2212 ตาม DESIGN §2
 */
export function formatMoney(v: number | null | undefined, opts?: { currency?: boolean }): string {
  if (v == null || !Number.isFinite(v)) return "—";
  const s = new Intl.NumberFormat("th-TH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Math.abs(v));
  return `${v < 0 ? "−" : ""}${s}${opts?.currency === false ? "" : " ฿"}`;
}

/** เปอร์เซ็นต์จากสัดส่วน (0.25 → "25.0%") · null → "—" */
export function formatPct(ratio: number | null | undefined, digits = 1): string {
  if (ratio == null || !Number.isFinite(ratio)) return "—";
  return `${(ratio * 100).toFixed(digits)}%`;
}
