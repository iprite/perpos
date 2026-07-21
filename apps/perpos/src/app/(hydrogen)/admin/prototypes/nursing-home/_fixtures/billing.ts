// billing.ts — service_packages, resident_subscriptions, invoices, invoice_items, payments
import type {
  ServicePackage,
  ResidentSubscription,
  Invoice,
  InvoiceItem,
  InvoiceStatus,
  Payment,
} from "./types";

// ---- SERVICE_PACKAGES (4 แบบ ครบ care_level) ----
export const SERVICE_PACKAGES: ServicePackage[] = [
  {
    id: "pkg-001",
    name: "แพ็กเกจดูแลทั่วไป (Independent)",
    care_level: "independent",
    billing_cycle: "monthly",
    price: 18000,
    description: "ที่พัก + อาหาร 3 มื้อ + กิจกรรมกลุ่ม เหมาะผู้สูงอายุที่ช่วยเหลือตัวเองได้",
    is_active: true,
    created_at: "2022-01-01T08:00:00Z",
  },
  {
    id: "pkg-002",
    name: "แพ็กเกจดูแลช่วยเหลือ (Assisted Care)",
    care_level: "assisted",
    billing_cycle: "monthly",
    price: 28000,
    description: "รวม pkg-001 + ผู้ช่วยดูแลประจำ + กายภาพบำบัดพื้นฐาน + วัด vital รายวัน",
    is_active: true,
    created_at: "2022-01-01T08:00:00Z",
  },
  {
    id: "pkg-003",
    name: "แพ็กเกจดูแลเต็มรูปแบบ (Full Care)",
    care_level: "full_care",
    billing_cycle: "monthly",
    price: 38000,
    description:
      "รวม pkg-002 + พยาบาลดูแลใกล้ชิด + การให้ยาเฉพาะบุคคล (eMAR) + รายงานสุขภาพรายสัปดาห์",
    is_active: true,
    created_at: "2022-01-01T08:00:00Z",
  },
  {
    id: "pkg-004",
    name: "แพ็กเกจ Memory Care",
    care_level: "memory_care",
    billing_cycle: "monthly",
    price: 45000,
    description:
      "รวม pkg-003 + ห้อง Memory Care ปลอดภัย + กิจกรรมกระตุ้นสมองเฉพาะทาง + ทีมผู้เชี่ยวชาญ",
    is_active: true,
    created_at: "2022-01-01T08:00:00Z",
  },
];

// ---- RESIDENT_SUBSCRIPTIONS ----
export const RESIDENT_SUBSCRIPTIONS: ResidentSubscription[] = [
  {
    id: "rsub-001",
    resident_id: "res-001",
    package_id: "pkg-002",
    monthly_price: 28000,
    start_date: "2025-03-01",
    end_date: null,
    is_active: true,
    created_at: "2025-03-01T08:00:00Z",
  },
  {
    id: "rsub-002",
    resident_id: "res-002",
    package_id: "pkg-003",
    monthly_price: 38000,
    start_date: "2024-11-01",
    end_date: null,
    is_active: true,
    created_at: "2024-11-15T08:00:00Z",
  },
  {
    id: "rsub-003",
    resident_id: "res-003",
    package_id: "pkg-001",
    monthly_price: 18000,
    start_date: "2025-02-01",
    end_date: null,
    is_active: true,
    created_at: "2025-01-10T08:00:00Z",
  },
  {
    id: "rsub-004",
    resident_id: "res-004",
    package_id: "pkg-002",
    monthly_price: 28000,
    start_date: "2025-03-01",
    end_date: null,
    is_active: true,
    created_at: "2025-02-20T08:00:00Z",
  },
  {
    id: "rsub-005",
    resident_id: "res-005",
    package_id: "pkg-003",
    monthly_price: 38000,
    start_date: "2024-09-01",
    end_date: null,
    is_active: true,
    created_at: "2024-08-05T08:00:00Z",
  },
  {
    id: "rsub-006",
    resident_id: "res-006",
    package_id: "pkg-004",
    monthly_price: 45000,
    start_date: "2025-04-01",
    end_date: null,
    is_active: true,
    created_at: "2025-04-01T08:00:00Z",
  },
  {
    id: "rsub-007",
    resident_id: "res-007",
    package_id: "pkg-002",
    monthly_price: 28000,
    start_date: "2025-06-01",
    end_date: null,
    is_active: true,
    created_at: "2025-05-12T08:00:00Z",
  },
  {
    id: "rsub-008",
    resident_id: "res-008",
    package_id: "pkg-003",
    monthly_price: 38000,
    start_date: "2025-01-01",
    end_date: null,
    is_active: true,
    created_at: "2024-12-01T08:00:00Z",
  },
  {
    id: "rsub-009",
    resident_id: "res-009",
    package_id: "pkg-001",
    monthly_price: 18000,
    start_date: "2025-06-01",
    end_date: null,
    is_active: true,
    created_at: "2025-06-01T08:00:00Z",
  },
  {
    id: "rsub-010",
    resident_id: "res-010",
    package_id: "pkg-003",
    monthly_price: 38000,
    start_date: "2025-02-01",
    end_date: null,
    is_active: true,
    created_at: "2025-01-20T08:00:00Z",
  },
  {
    id: "rsub-011",
    resident_id: "res-015",
    package_id: "pkg-004",
    monthly_price: 45000,
    start_date: "2025-05-01",
    end_date: null,
    is_active: true,
    created_at: "2025-05-01T08:00:00Z",
  },
  // discharged — inactive
  {
    id: "rsub-012",
    resident_id: "res-013",
    package_id: "pkg-002",
    monthly_price: 28000,
    start_date: "2024-06-01",
    end_date: "2025-05-31",
    is_active: false,
    created_at: "2024-06-01T08:00:00Z",
  },
];

// ---- INVOICES (หลายเดือน ครบทุก status) ----
export const INVOICES: Invoice[] = [
  // มิ.ย. 2026 — ออกบิลแล้ว
  {
    id: "inv-001",
    invoice_no: "INV-2026-0051",
    resident_id: "res-001",
    period_month: "2026-06",
    issue_date: "2026-06-01",
    due_date: "2026-06-15",
    status: "paid",
    subtotal: 28000,
    discount: 0,
    total: 28000,
    paid_amount: 28000,
    note: null,
    created_at: "2026-06-01T08:00:00Z",
  },
  {
    id: "inv-002",
    invoice_no: "INV-2026-0052",
    resident_id: "res-002",
    period_month: "2026-06",
    issue_date: "2026-06-01",
    due_date: "2026-06-15",
    status: "paid",
    subtotal: 38500,
    discount: 0,
    total: 38500,
    paid_amount: 38500,
    note: null,
    created_at: "2026-06-01T08:00:00Z",
  },
  {
    id: "inv-003",
    invoice_no: "INV-2026-0053",
    resident_id: "res-003",
    period_month: "2026-06",
    issue_date: "2026-06-01",
    due_date: "2026-06-15",
    status: "paid",
    subtotal: 18000,
    discount: 500,
    total: 17500,
    paid_amount: 17500,
    note: "ส่วนลดสมาชิกระยะยาว",
    created_at: "2026-06-01T08:00:00Z",
  },
  {
    id: "inv-004",
    invoice_no: "INV-2026-0054",
    resident_id: "res-004",
    period_month: "2026-06",
    issue_date: "2026-06-01",
    due_date: "2026-06-15",
    status: "partially_paid",
    subtotal: 29200,
    discount: 0,
    total: 29200,
    paid_amount: 14600,
    note: null,
    created_at: "2026-06-01T08:00:00Z",
  },
  {
    id: "inv-005",
    invoice_no: "INV-2026-0055",
    resident_id: "res-005",
    period_month: "2026-06",
    issue_date: "2026-06-01",
    due_date: "2026-06-15",
    status: "overdue",
    subtotal: 39500,
    discount: 0,
    total: 39500,
    paid_amount: 0,
    note: "ติดตามชำระ — เลยกำหนดแล้ว",
    created_at: "2026-06-01T08:00:00Z",
  },
  {
    id: "inv-006",
    invoice_no: "INV-2026-0056",
    resident_id: "res-006",
    period_month: "2026-06",
    issue_date: "2026-06-01",
    due_date: "2026-06-15",
    status: "paid",
    subtotal: 45000,
    discount: 0,
    total: 45000,
    paid_amount: 45000,
    note: null,
    created_at: "2026-06-01T08:00:00Z",
  },
  {
    id: "inv-007",
    invoice_no: "INV-2026-0057",
    resident_id: "res-007",
    period_month: "2026-06",
    issue_date: "2026-06-01",
    due_date: "2026-06-15",
    status: "issued",
    subtotal: 28000,
    discount: 0,
    total: 28000,
    paid_amount: 0,
    note: null,
    created_at: "2026-06-01T08:00:00Z",
  },
  {
    id: "inv-008",
    invoice_no: "INV-2026-0058",
    resident_id: "res-008",
    period_month: "2026-06",
    issue_date: "2026-06-01",
    due_date: "2026-06-15",
    status: "issued",
    subtotal: 38000,
    discount: 0,
    total: 38000,
    paid_amount: 0,
    note: null,
    created_at: "2026-06-01T08:00:00Z",
  },
  {
    id: "inv-009",
    invoice_no: "INV-2026-0059",
    resident_id: "res-009",
    period_month: "2026-06",
    issue_date: "2026-06-10",
    due_date: "2026-06-25",
    status: "draft",
    subtotal: 18000,
    discount: 0,
    total: 18000,
    paid_amount: 0,
    note: "ผู้พักใหม่ pro-rate",
    created_at: "2026-06-10T08:00:00Z",
  },
  {
    id: "inv-010",
    invoice_no: "INV-2026-0060",
    resident_id: "res-010",
    period_month: "2026-06",
    issue_date: "2026-06-01",
    due_date: "2026-06-15",
    status: "overdue",
    subtotal: 39000,
    discount: 0,
    total: 39000,
    paid_amount: 0,
    note: null,
    created_at: "2026-06-01T08:00:00Z",
  },
  {
    id: "inv-011",
    invoice_no: "INV-2026-0061",
    resident_id: "res-015",
    period_month: "2026-06",
    issue_date: "2026-06-01",
    due_date: "2026-06-15",
    status: "paid",
    subtotal: 45000,
    discount: 0,
    total: 45000,
    paid_amount: 45000,
    note: null,
    created_at: "2026-06-01T08:00:00Z",
  },
  // พ.ค. 2026 — ย้อนหลัง
  {
    id: "inv-012",
    invoice_no: "INV-2026-0040",
    resident_id: "res-001",
    period_month: "2026-05",
    issue_date: "2026-05-01",
    due_date: "2026-05-15",
    status: "paid",
    subtotal: 28000,
    discount: 0,
    total: 28000,
    paid_amount: 28000,
    note: null,
    created_at: "2026-05-01T08:00:00Z",
  },
  {
    id: "inv-013",
    invoice_no: "INV-2026-0041",
    resident_id: "res-002",
    period_month: "2026-05",
    issue_date: "2026-05-01",
    due_date: "2026-05-15",
    status: "paid",
    subtotal: 38000,
    discount: 0,
    total: 38000,
    paid_amount: 38000,
    note: null,
    created_at: "2026-05-01T08:00:00Z",
  },
  {
    id: "inv-014",
    invoice_no: "INV-2026-0042",
    resident_id: "res-005",
    period_month: "2026-05",
    issue_date: "2026-05-01",
    due_date: "2026-05-15",
    status: "overdue",
    subtotal: 39500,
    discount: 0,
    total: 39500,
    paid_amount: 0,
    note: "ค้างชำระต่อเนื่อง",
    created_at: "2026-05-01T08:00:00Z",
  },
  // void ตัวอย่าง
  {
    id: "inv-015",
    invoice_no: "INV-2026-0030",
    resident_id: "res-013",
    period_month: "2026-05",
    issue_date: "2026-05-01",
    due_date: "2026-05-15",
    status: "void",
    subtotal: 28000,
    discount: 0,
    total: 28000,
    paid_amount: 0,
    note: "ยกเลิก — จำหน่ายกลางเดือน",
    created_at: "2026-05-01T08:00:00Z",
  },
];

// ---- INVOICE_ITEMS (ครบ kind) ----
export const INVOICE_ITEMS: InvoiceItem[] = [
  // inv-001 (res-001 มิ.ย.)
  {
    id: "ii-001",
    invoice_id: "inv-001",
    kind: "package",
    description: "แพ็กเกจดูแลช่วยเหลือ (Assisted Care) — มิ.ย. 2569",
    quantity: 1,
    unit_price: 28000,
    amount: 28000,
    ref_id: "pkg-002",
    created_at: "2026-06-01T08:00:00Z",
  },
  // inv-002 (res-002 มิ.ย.)
  {
    id: "ii-002",
    invoice_id: "inv-002",
    kind: "package",
    description: "แพ็กเกจดูแลเต็มรูปแบบ (Full Care) — มิ.ย. 2569",
    quantity: 1,
    unit_price: 38000,
    amount: 38000,
    ref_id: "pkg-003",
    created_at: "2026-06-01T08:00:00Z",
  },
  {
    id: "ii-003",
    invoice_id: "inv-002",
    kind: "procedure",
    description: "กายภาพบำบัดเพิ่มเติม — 5 ครั้ง",
    quantity: 5,
    unit_price: 100,
    amount: 500,
    ref_id: null,
    created_at: "2026-06-01T08:00:00Z",
  },
  // inv-003 (res-003 มิ.ย.)
  {
    id: "ii-004",
    invoice_id: "inv-003",
    kind: "package",
    description: "แพ็กเกจดูแลทั่วไป (Independent) — มิ.ย. 2569",
    quantity: 1,
    unit_price: 18000,
    amount: 18000,
    ref_id: "pkg-001",
    created_at: "2026-06-01T08:00:00Z",
  },
  {
    id: "ii-005",
    invoice_id: "inv-003",
    kind: "adjustment",
    description: "ส่วนลดสมาชิกระยะยาว (>1 ปี)",
    quantity: 1,
    unit_price: -500,
    amount: -500,
    ref_id: null,
    created_at: "2026-06-01T08:00:00Z",
  },
  // inv-004 (res-004 มิ.ย. — partial)
  {
    id: "ii-006",
    invoice_id: "inv-004",
    kind: "package",
    description: "แพ็กเกจดูแลช่วยเหลือ (Assisted Care) — มิ.ย. 2569",
    quantity: 1,
    unit_price: 28000,
    amount: 28000,
    ref_id: "pkg-002",
    created_at: "2026-06-01T08:00:00Z",
  },
  {
    id: "ii-007",
    invoice_id: "inv-004",
    kind: "medication",
    description: "ยา Allopurinol 100mg x 30 เม็ด (นอกแพ็กเกจ)",
    quantity: 30,
    unit_price: 40,
    amount: 1200,
    ref_id: "mo-006",
    created_at: "2026-06-01T08:00:00Z",
  },
  // inv-005 (res-005 มิ.ย. — overdue)
  {
    id: "ii-008",
    invoice_id: "inv-005",
    kind: "package",
    description: "แพ็กเกจดูแลเต็มรูปแบบ (Full Care) — มิ.ย. 2569",
    quantity: 1,
    unit_price: 38000,
    amount: 38000,
    ref_id: "pkg-003",
    created_at: "2026-06-01T08:00:00Z",
  },
  {
    id: "ii-009",
    invoice_id: "inv-005",
    kind: "medication",
    description: "Insulin Glargine x 1 ขวด",
    quantity: 1,
    unit_price: 800,
    amount: 800,
    ref_id: "mo-007",
    created_at: "2026-06-01T08:00:00Z",
  },
  {
    id: "ii-010",
    invoice_id: "inv-005",
    kind: "extra",
    description: "ถุงมือ/ชุดใช้แล้วทิ้ง เดือน มิ.ย.",
    quantity: 1,
    unit_price: 700,
    amount: 700,
    ref_id: null,
    created_at: "2026-06-01T08:00:00Z",
  },
  // inv-006 (res-006 Memory Care)
  {
    id: "ii-011",
    invoice_id: "inv-006",
    kind: "package",
    description: "แพ็กเกจ Memory Care — มิ.ย. 2569",
    quantity: 1,
    unit_price: 45000,
    amount: 45000,
    ref_id: "pkg-004",
    created_at: "2026-06-01T08:00:00Z",
  },
  // inv-007 (res-007)
  {
    id: "ii-012",
    invoice_id: "inv-007",
    kind: "package",
    description: "แพ็กเกจดูแลช่วยเหลือ (Assisted Care) — มิ.ย. 2569",
    quantity: 1,
    unit_price: 28000,
    amount: 28000,
    ref_id: "pkg-002",
    created_at: "2026-06-01T08:00:00Z",
  },
  // inv-008 (res-008)
  {
    id: "ii-013",
    invoice_id: "inv-008",
    kind: "package",
    description: "แพ็กเกจดูแลเต็มรูปแบบ (Full Care) — มิ.ย. 2569",
    quantity: 1,
    unit_price: 38000,
    amount: 38000,
    ref_id: "pkg-003",
    created_at: "2026-06-01T08:00:00Z",
  },
  // inv-009 (res-009 ใหม่)
  {
    id: "ii-014",
    invoice_id: "inv-009",
    kind: "package",
    description: "แพ็กเกจดูแลทั่วไป — 1–30 มิ.ย. 2569",
    quantity: 1,
    unit_price: 18000,
    amount: 18000,
    ref_id: "pkg-001",
    created_at: "2026-06-10T08:00:00Z",
  },
  // inv-010 (res-010 overdue)
  {
    id: "ii-015",
    invoice_id: "inv-010",
    kind: "package",
    description: "แพ็กเกจดูแลเต็มรูปแบบ (Full Care) — มิ.ย. 2569",
    quantity: 1,
    unit_price: 38000,
    amount: 38000,
    ref_id: "pkg-003",
    created_at: "2026-06-01T08:00:00Z",
  },
  {
    id: "ii-016",
    invoice_id: "inv-010",
    kind: "extra",
    description: "อุปกรณ์ช่วยหายใจ Salbutamol inhaler x 2",
    quantity: 2,
    unit_price: 500,
    amount: 1000,
    ref_id: "mo-013",
    created_at: "2026-06-01T08:00:00Z",
  },
  // inv-011 (res-015)
  {
    id: "ii-017",
    invoice_id: "inv-011",
    kind: "package",
    description: "แพ็กเกจ Memory Care — มิ.ย. 2569",
    quantity: 1,
    unit_price: 45000,
    amount: 45000,
    ref_id: "pkg-004",
    created_at: "2026-06-01T08:00:00Z",
  },
  // inv-014 (res-005 พ.ค. — overdue)
  {
    id: "ii-018",
    invoice_id: "inv-014",
    kind: "package",
    description: "แพ็กเกจดูแลเต็มรูปแบบ (Full Care) — พ.ค. 2569",
    quantity: 1,
    unit_price: 38000,
    amount: 38000,
    ref_id: "pkg-003",
    created_at: "2026-05-01T08:00:00Z",
  },
  {
    id: "ii-019",
    invoice_id: "inv-014",
    kind: "medication",
    description: "Insulin Glargine x 1 ขวด",
    quantity: 1,
    unit_price: 800,
    amount: 800,
    ref_id: "mo-007",
    created_at: "2026-05-01T08:00:00Z",
  },
  {
    id: "ii-020",
    invoice_id: "inv-014",
    kind: "extra",
    description: "ถุงมือ/ชุดใช้แล้วทิ้ง เดือน พ.ค.",
    quantity: 1,
    unit_price: 700,
    amount: 700,
    ref_id: null,
    created_at: "2026-05-01T08:00:00Z",
  },
];

// ---- PAYMENTS (ครบ method) ----
export const PAYMENTS: Payment[] = [
  // inv-001 (res-001 paid)
  {
    id: "pay-001",
    invoice_id: "inv-001",
    paid_at: "2026-06-03T10:00:00Z",
    amount: 28000,
    method: "transfer",
    reference: "SCB-2026060300001",
    received_by: "stf-006",
    note: null,
    created_at: "2026-06-03T10:05:00Z",
  },
  // inv-002 (res-002 paid)
  {
    id: "pay-002",
    invoice_id: "inv-002",
    paid_at: "2026-06-05T11:00:00Z",
    amount: 38500,
    method: "transfer",
    reference: "KTB-2026060500012",
    received_by: "stf-006",
    note: null,
    created_at: "2026-06-05T11:05:00Z",
  },
  // inv-003 (res-003 paid)
  {
    id: "pay-003",
    invoice_id: "inv-003",
    paid_at: "2026-06-02T09:00:00Z",
    amount: 17500,
    method: "cash",
    reference: null,
    received_by: "stf-006",
    note: "รับเงินสดครบ",
    created_at: "2026-06-02T09:05:00Z",
  },
  // inv-004 (res-004 partial — 2 งวด)
  {
    id: "pay-004",
    invoice_id: "inv-004",
    paid_at: "2026-06-10T14:00:00Z",
    amount: 14600,
    method: "transfer",
    reference: "KBANK-2026061000005",
    received_by: "stf-006",
    note: "ชำระงวดแรก 50%",
    created_at: "2026-06-10T14:05:00Z",
  },
  // inv-006 (res-006 Memory Care paid)
  {
    id: "pay-005",
    invoice_id: "inv-006",
    paid_at: "2026-06-01T15:00:00Z",
    amount: 45000,
    method: "card",
    reference: "VISA-****4521",
    received_by: "stf-006",
    note: null,
    created_at: "2026-06-01T15:05:00Z",
  },
  // inv-011 (res-015 paid)
  {
    id: "pay-006",
    invoice_id: "inv-011",
    paid_at: "2026-06-04T09:30:00Z",
    amount: 45000,
    method: "transfer",
    reference: "SCB-2026060400008",
    received_by: "stf-006",
    note: null,
    created_at: "2026-06-04T09:35:00Z",
  },
  // inv-012 (res-001 พ.ค.)
  {
    id: "pay-007",
    invoice_id: "inv-012",
    paid_at: "2026-05-05T10:00:00Z",
    amount: 28000,
    method: "transfer",
    reference: "SCB-2026050500003",
    received_by: "stf-006",
    note: null,
    created_at: "2026-05-05T10:05:00Z",
  },
  // inv-013 (res-002 พ.ค.)
  {
    id: "pay-008",
    invoice_id: "inv-013",
    paid_at: "2026-05-07T11:30:00Z",
    amount: 38000,
    method: "cheque",
    reference: "เช็ค #001234 BBL",
    received_by: "stf-006",
    note: "เช็คล่วงวันที่ 7 พ.ค.",
    created_at: "2026-05-07T11:35:00Z",
  },
];

// ════════════════════════════════════════════════════════════════════════
// ยอดค้างชำระ (Accounts Receivable) — สูตรเดียวของทั้งโมดูล (single source of truth)
// ════════════════════════════════════════════════════════════════════════
// นิยาม AR = ผลรวมยอดคงเหลือ (total − paid_amount) ของบิลที่ "ออกแล้วและยังเก็บไม่ครบ"
// = สถานะ issued / partially_paid / overdue เท่านั้น
//   • draft = ยังไม่ออกบิล → ไม่นับ
//   • paid  = เก็บครบ → คงเหลือ 0
//   • void  = ยกเลิก → ไม่นับ
// ทุกหน้า (dashboard / invoices / payments / reports) ต้อง derive จาก helper ชุดนี้
// ห้าม hardcode ยอด AR หรือคำนวณสูตรเองซ้ำในหน้า

/** วันอ้างอิง "วันนี้" ของ prototype — ใช้คิดอายุหนี้ (aging) */
export const AR_AS_OF = "2026-06-22";

/** สถานะบิลที่ถือเป็นลูกหนี้ค้างชำระ (ออกบิลแล้ว ยังเก็บไม่ครบ) */
export const AR_OPEN_STATUSES: InvoiceStatus[] = ["issued", "partially_paid", "overdue"];

/** ยอดคงเหลือต้องชำระของบิล 1 ใบ (ไม่ติดลบ) */
export function invoiceBalance(inv: Invoice): number {
  return Math.max(0, inv.total - inv.paid_amount);
}

/** บิลที่เข้าข่ายลูกหนี้ค้างชำระ (มียอดคงเหลือ > 0) */
export function arOutstandingInvoices(invoices: Invoice[] = INVOICES): Invoice[] {
  return invoices.filter((i) => AR_OPEN_STATUSES.includes(i.status) && invoiceBalance(i) > 0);
}

/** ยอด AR รวม = ผลรวมยอดคงเหลือของบิลค้างชำระทั้งหมด */
export function arOutstandingTotal(invoices: Invoice[] = INVOICES): number {
  return arOutstandingInvoices(invoices).reduce((s, i) => s + invoiceBalance(i), 0);
}

function daysOverdue(due: string, asOf: string = AR_AS_OF): number {
  return Math.floor((new Date(asOf).getTime() - new Date(due).getTime()) / 86400000);
}

export type ArAging = {
  current: number; // ยังไม่ถึงกำหนด (od ≤ 0)
  d1_30: number; // เกินกำหนด 1–30 วัน
  d31_60: number; // เกินกำหนด 31–60 วัน
  d60plus: number; // เกินกำหนด > 60 วัน
  total: number; // = current + d1_30 + d31_60 + d60plus
  overdueTotal: number; // = d1_30 + d31_60 + d60plus
  overdueCount: number; // จำนวนบิลที่เกินกำหนด
  count: number; // จำนวนบิลค้างชำระทั้งหมด
};

/**
 * คิดอายุหนี้คงค้าง (AR aging) จากบิลค้างชำระ — bucket รวมแล้ว = total เสมอ
 * ใช้สูตร/ชุดบิลเดียวกับ arOutstandingTotal()
 */
export function computeArAging(invoices: Invoice[] = INVOICES, asOf: string = AR_AS_OF): ArAging {
  const a: ArAging = {
    current: 0,
    d1_30: 0,
    d31_60: 0,
    d60plus: 0,
    total: 0,
    overdueTotal: 0,
    overdueCount: 0,
    count: 0,
  };
  for (const inv of arOutstandingInvoices(invoices)) {
    const bal = invoiceBalance(inv);
    const od = daysOverdue(inv.due_date, asOf);
    a.total += bal;
    a.count += 1;
    if (od <= 0) {
      a.current += bal;
    } else {
      a.overdueTotal += bal;
      a.overdueCount += 1;
      if (od <= 30) a.d1_30 += bal;
      else if (od <= 60) a.d31_60 += bal;
      else a.d60plus += bal;
    }
  }
  return a;
}

/** สรุป AR aging ของชุดบิลเริ่มต้น (derived — ไม่ hardcode) — ใช้ใน dashboard */
export const AR_AGING_SUMMARY: ArAging = computeArAging();
