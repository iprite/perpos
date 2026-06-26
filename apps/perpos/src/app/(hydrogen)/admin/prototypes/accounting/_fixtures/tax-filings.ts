// tax-filings.ts — acc_tax_filings (แบบภาษี PP30/PND1/PND3)
// Non-VAT org: PP30 ซ่อนอยู่ใน UI จน is_vat_registered=true → toggle แล้วโผล่
// PP30 มีอยู่ใน fixture เสมอ (เพื่อให้ toggle VAT แล้วเห็นข้อมูลทันที)
// PND1 draft ต่อเดือน (auto-post จาก payroll) + 1 ใบ ready ใกล้ครบกำหนด (L2)

import type { AccTaxFiling } from "./types";
import { MOCK_ORG_ID } from "./org-settings";

const ORG = MOCK_ORG_ID;

export const mockTaxFilings: AccTaxFiling[] = [
  // PND1 เมษายน — filed แล้ว
  {
    id: "tax-pnd1-apr-2026",
    org_id: ORG,
    tax_kind: "pnd1",
    period_year: 2026,
    period_month: 4,
    status: "filed",
    sales_vat: null,
    purchase_vat: null,
    net_payable: 3150.0,
    wht_total: 3150.0,
    due_date: "2026-05-07", // วันที่ 7 ของเดือนถัดไป
    filed_at: "2026-05-06T15:30:00.000Z",
    created_at: "2026-04-30T18:00:00.000Z",
  },
  // PND1 พฤษภาคม — ready (ใกล้ครบกำหนด — L2 เตือน LINE)
  {
    id: "tax-pnd1-may-2026",
    org_id: ORG,
    tax_kind: "pnd1",
    period_year: 2026,
    period_month: 5,
    status: "ready",
    sales_vat: null,
    purchase_vat: null,
    net_payable: 3150.0,
    wht_total: 3150.0,
    due_date: "2026-06-07", // อีก 11 วัน จาก 26 มิ.ย. 2569 (TODAY)
    filed_at: null,
    created_at: "2026-05-31T18:00:00.000Z",
  },
  // PND1 มิถุนายน — draft (auto-post จาก payroll มิ.ย.)
  {
    id: "tax-pnd1-jun-2026",
    org_id: ORG,
    tax_kind: "pnd1",
    period_year: 2026,
    period_month: 6,
    status: "draft",
    sales_vat: null,
    purchase_vat: null,
    net_payable: 3150.0,
    wht_total: 3150.0,
    due_date: "2026-07-07",
    filed_at: null,
    created_at: "2026-06-20T18:00:00.000Z",
  },
  // PND3 มิถุนายน — draft (ค่าจ้างบุคคล/ฟรีแลนซ์ WHT 3%)
  {
    id: "tax-pnd3-jun-2026",
    org_id: ORG,
    tax_kind: "pnd3",
    period_year: 2026,
    period_month: 6,
    status: "draft",
    sales_vat: null,
    purchase_vat: null,
    net_payable: 1410.0, // wht จากค่าจ้างฟรีแลนซ์ + อินฟลูเอนเซอร์ 360+450+360+540+960=2,670 ← ตัวเลข WHT สะสม
    wht_total: 2670.0,
    due_date: "2026-07-07",
    filed_at: null,
    created_at: "2026-06-26T09:00:00.000Z",
  },

  // ────── PP30 (ภ.พ.30 VAT) — โผล่เมื่อ is_vat_registered = true ──────
  // พฤษภาคม 2026 — filed แล้ว (due 15 มิ.ย. ผ่านมาแล้ว)
  // รายได้เดือน พ.ค. ~97,500 ฿ × 7% VAT output = 6,825
  // ซื้อวัตถุดิบ/อุปกรณ์ ~42,000 ฿ × 7% VAT input = 2,940
  // ภาษีที่ต้องจ่ายสุทธิ = 6,825 − 2,940 = 3,885
  {
    id: "tax-pp30-may-2026",
    org_id: ORG,
    tax_kind: "pp30",
    period_year: 2026,
    period_month: 5,
    status: "filed",
    sales_vat: 6825.0, // output VAT (ขาออก)
    purchase_vat: 2940.0, // input VAT (ซื้อเข้า)
    net_payable: 3885.0, // 6,825 − 2,940
    wht_total: null,
    due_date: "2026-06-15", // PP30 due = วันที่ 15 ของเดือนถัดไป
    filed_at: "2026-06-14T11:20:00.000Z",
    created_at: "2026-05-31T18:00:00.000Z",
  },

  // มิถุนายน 2026 — ready (ใกล้ครบกำหนด 15 ก.ค. — L2 เตือน LINE)
  // รายได้เดือน มิ.ย. ~121,300 ฿ × 7% VAT output = 8,491
  // ซื้อวัตถุดิบ/อุปกรณ์ ~55,000 ฿ × 7% VAT input = 3,850
  // ภาษีที่ต้องจ่ายสุทธิ = 8,491 − 3,850 = 4,641
  {
    id: "tax-pp30-jun-2026",
    org_id: ORG,
    tax_kind: "pp30",
    period_year: 2026,
    period_month: 6,
    status: "ready",
    sales_vat: 8491.0, // output VAT (ขาออก)
    purchase_vat: 3850.0, // input VAT (ซื้อเข้า)
    net_payable: 4641.0, // 8,491 − 3,850
    wht_total: null,
    due_date: "2026-07-15", // PP30 due = วันที่ 15 ของเดือนถัดไป
    filed_at: null,
    created_at: "2026-06-26T10:00:00.000Z",
  },
];

/** แบบที่ใกล้ครบกำหนดและยังไม่ยื่น (L2 เตือน LINE) */
export const pendingTaxFilings = mockTaxFilings.filter(
  (t) => t.status === "ready" || t.status === "draft",
);

/** Tax glossary (§5 U2) — enum → ป้ายไทยที่ owner เข้าใจ */
export const TAX_GLOSSARY: Record<string, string> = {
  pp30: "ภาษีมูลค่าเพิ่ม (VAT)",
  pnd1: "ภาษีเงินเดือนพนักงาน",
  pnd3: "ภาษีหัก ค่าจ้างบุคคล",
  pnd53: "ภาษีหัก ค่าจ้างบริษัท",
};

/** วันที่แสดง due_date เป็นภาษาไทย + จำนวนวันที่เหลือ */
export function dueDateLabel(
  dueDateISO: string,
  todayISO = "2026-06-26",
): { label: string; daysLeft: number } {
  const due = new Date(dueDateISO);
  const today = new Date(todayISO);
  const diffMs = due.getTime() - today.getTime();
  const daysLeft = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
  const thYear = due.getFullYear() + 543;
  const months = [
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
  const label = `${due.getDate()} ${months[due.getMonth()]} ${thYear}`;
  return { label, daysLeft };
}
