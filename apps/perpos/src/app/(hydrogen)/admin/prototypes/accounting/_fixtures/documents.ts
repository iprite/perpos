// documents.ts — acc_documents + acc_document_lines
// ใบเสนอราคา/ใบแจ้งหนี้/ใบเสร็จ convert chain, หลายสถานะ, Non-VAT default
// รองรับ A3 เอกสารขาย + L4 ส่งใบแจ้งหนี้ + L5 หนี้เกินกำหนด
//
// discount rule: amount = qty × unit_price − discount
// subtotal = Σ(amount per line), total = subtotal + vat_amount (vat=0 ถ้า Non-VAT)
//
// สูตร discount:
//   lineDiscountAmount = discount_type==='percent'
//     ? round2(qty * unit_price * discount / 100)
//     : discount
//   amount = max(0, qty * unit_price − lineDiscountAmount)
//
// item_name = ชื่อสินค้า/บริการ (สั้น) — ถ้า product_id ระบุ ใช้ชื่อจาก acc_products
// description = รายละเอียดเพิ่มเติม (อาจว่าง "")
//
// ตัวอย่าง discount (โชว์ทั้ง 2 type):
//   dl-qt01-2:  percent 10% → lineDiscount=round2(1×15000×10/100)=1,500 → amount=13,500
//               qt01 subtotal = 30,000 + 13,500 = 43,500
//   dl-inv01-2: amount  2,000 บาท → amount=13,000  → inv01 subtotal 43,000
//   dl-inv03-1: percent 10% → lineDiscount=round2(1×55000×10/100)=5,500 → amount=49,500
//               inv03 subtotal = 49,500 + 20,000 = 69,500
//   dl-inv05-2: percent  5% → lineDiscount=round2(10×1000×5/100)=500 → amount=9,500
//               inv05 subtotal = 45,000 + 9,500 = 54,500

import type { AccDocument, AccDocumentLine } from "./types";
import { MOCK_ORG_ID } from "./org-settings";

const ORG = MOCK_ORG_ID;

// ---- Document Lines ----

export const mockDocumentLines: AccDocumentLine[] = [
  // --- doc-qt01 (ใบเสนอราคา — ออกแบบโลโก้) ---
  {
    id: "dl-qt01-1",
    org_id: ORG,
    document_id: "doc-qt01",
    item_name: "ออกแบบโลโก้และ Brand Identity",
    description: "",
    qty: 1,
    unit_price: 30000.0,
    discount: 0,
    discount_type: "amount",
    amount: 30000.0, // 1×30000−0
    sort_order: 1,
    product_id: "prd-svc001",
  },
  {
    id: "dl-qt01-2",
    org_id: ORG,
    document_id: "doc-qt01",
    item_name: "ออกแบบกราฟิกและสื่อประชาสัมพันธ์",
    description: "Brand Guideline สำหรับโลโก้ชุดที่ 1",
    qty: 1,
    unit_price: 15000.0,
    discount: 10, // ส่วนลด 10%
    discount_type: "percent", // lineDiscount = round2(1×15000×10/100) = 1,500
    amount: 13500.0, // 1×15000 − 1500
    sort_order: 2,
    product_id: "prd-svc002",
  },

  // --- doc-inv01 (ใบแจ้งหนี้ — convert จาก qt01) ---
  {
    id: "dl-inv01-1",
    org_id: ORG,
    document_id: "doc-inv01",
    item_name: "ออกแบบโลโก้และ Brand Identity",
    description: "",
    qty: 1,
    unit_price: 30000.0,
    discount: 0,
    discount_type: "amount",
    amount: 30000.0,
    sort_order: 1,
    product_id: "prd-svc001",
  },
  {
    id: "dl-inv01-2",
    org_id: ORG,
    document_id: "doc-inv01",
    item_name: "ออกแบบกราฟิกและสื่อประชาสัมพันธ์",
    description: "Brand Guideline ฉบับปรับปรุง",
    qty: 1,
    unit_price: 15000.0,
    discount: 2000.0,
    discount_type: "amount", // ส่วนลดตามที่ตกลงใน quotation
    amount: 13000.0, // 1×15000−2000
    sort_order: 2,
    product_id: "prd-svc002",
  },

  // --- doc-rc01 (ใบเสร็จ — ถ่ายภาพสินค้า) ---
  {
    id: "dl-rc01-1",
    org_id: ORG,
    document_id: "doc-rc01",
    item_name: "ถ่ายภาพสินค้า",
    description: "10 ภาพ, 2 มุมต่อภาพ",
    qty: 10,
    unit_price: 1200.0,
    discount: 0,
    discount_type: "amount",
    amount: 12000.0, // 10×1200−0
    sort_order: 1,
    product_id: null, // พิมพ์เอง ไม่ link product
  },
  {
    id: "dl-rc01-2",
    org_id: ORG,
    document_id: "doc-rc01",
    item_name: "ตกแต่งภาพ Retouching",
    description: "",
    qty: 10,
    unit_price: 300.0,
    discount: 0,
    discount_type: "amount",
    amount: 3000.0, // 10×300−0
    sort_order: 2,
    product_id: null,
  },

  // --- doc-inv02 (ใบแจ้งหนี้ — ออกแบบเว็บไซต์) ---
  {
    id: "dl-inv02-1",
    org_id: ORG,
    document_id: "doc-inv02",
    item_name: "ออกแบบ UX/UI เว็บไซต์และแอปพลิเคชัน",
    description: "5 หน้าหลัก",
    qty: 1,
    unit_price: 18000.0,
    discount: 0,
    discount_type: "amount",
    amount: 18000.0,
    sort_order: 1,
    product_id: "prd-svc003",
  },
  {
    id: "dl-inv02-2",
    org_id: ORG,
    document_id: "doc-inv02",
    item_name: "จัดทำ Prototype Figma",
    description: "",
    qty: 1,
    unit_price: 10500.0,
    discount: 0,
    discount_type: "amount",
    amount: 10500.0,
    sort_order: 2,
    product_id: null,
  },

  // --- doc-inv03 (ใบแจ้งหนี้ — ระบบ POS — overdue) ---
  {
    id: "dl-inv03-1",
    org_id: ORG,
    document_id: "doc-inv03",
    item_name: "พัฒนาซอฟต์แวร์และระบบ",
    description: "ระบบ POS Dashboard (frontend)",
    qty: 1,
    unit_price: 55000.0,
    discount: 10.0,
    discount_type: "percent", // ส่วนลดพิเศษลูกค้าเก่า 10% → 5,500
    amount: 49500.0, // 1×55000 − 5500
    sort_order: 1,
    product_id: "prd-svc004",
  },
  {
    id: "dl-inv03-2",
    org_id: ORG,
    document_id: "doc-inv03",
    item_name: "ออกแบบ Report Template",
    description: "5 แบบ",
    qty: 5,
    unit_price: 4000.0,
    discount: 0,
    discount_type: "amount",
    amount: 20000.0, // 5×4000−0
    sort_order: 2,
    product_id: null,
  },

  // --- doc-inv04 (ใบแจ้งหนี้ — packaging — draft) ---
  {
    id: "dl-inv04-1",
    org_id: ORG,
    document_id: "doc-inv04",
    item_name: "ออกแบบกราฟิกและสื่อประชาสัมพันธ์",
    description: "ออกแบบ packaging สินค้า 3 แบบ",
    qty: 3,
    unit_price: 7000.0,
    discount: 0,
    discount_type: "amount",
    amount: 21000.0, // 3×7000−0
    sort_order: 1,
    product_id: "prd-svc002",
  },
  {
    id: "dl-inv04-2",
    org_id: ORG,
    document_id: "doc-inv04",
    item_name: "ค่าส่งไฟล์ Print-ready",
    description: "",
    qty: 1,
    unit_price: 1000.0,
    discount: 0,
    discount_type: "amount",
    amount: 1000.0,
    sort_order: 2,
    product_id: null,
  },

  // --- doc-inv05 (ใบแจ้งหนี้ — dashboard Q2 — sent พร้อมส่ง LINE: L4) ---
  {
    id: "dl-inv05-1",
    org_id: ORG,
    document_id: "doc-inv05",
    item_name: "ออกแบบ UX/UI เว็บไซต์และแอปพลิเคชัน",
    description: "ระบบ Analytics Dashboard Q2",
    qty: 1,
    unit_price: 45000.0,
    discount: 0,
    discount_type: "amount",
    amount: 45000.0,
    sort_order: 1,
    product_id: "prd-svc003",
  },
  {
    id: "dl-inv05-2",
    org_id: ORG,
    document_id: "doc-inv05",
    item_name: "Data Visualization Components",
    description: "10 ชิ้น",
    qty: 10,
    unit_price: 1000.0,
    discount: 5, // ส่วนลด 5%
    discount_type: "percent", // lineDiscount = round2(10×1000×5/100) = 500
    amount: 9500.0, // 10×1000 − 500
    sort_order: 2,
    product_id: null,
  },

  // --- doc-inv06 (ใบแจ้งหนี้ — retainer มิถุนายน) ---
  {
    id: "dl-inv06-1",
    org_id: ORG,
    document_id: "doc-inv06",
    item_name: "ค่าบริการ Retainer รายเดือน",
    description: "มิถุนายน 2569",
    qty: 1,
    unit_price: 18000.0,
    discount: 0,
    discount_type: "amount",
    amount: 18000.0,
    sort_order: 1,
    product_id: "prd-svc005",
  },

  // --- doc-qt02 (ใบเสนอราคา — mobile app ใหม่) ---
  {
    id: "dl-qt02-1",
    org_id: ORG,
    document_id: "doc-qt02",
    item_name: "พัฒนาซอฟต์แวร์และระบบ",
    description: "แอปพลิเคชัน Mobile iOS + Android",
    qty: 1,
    unit_price: 150000.0,
    discount: 0,
    discount_type: "amount",
    amount: 150000.0,
    sort_order: 1,
    product_id: "prd-svc004",
  },
  {
    id: "dl-qt02-2",
    org_id: ORG,
    document_id: "doc-qt02",
    item_name: "Prototype & User Testing",
    description: "2 รอบ",
    qty: 2,
    unit_price: 25000.0,
    discount: 0,
    discount_type: "amount",
    amount: 50000.0, // 2×25000−0
    sort_order: 2,
    product_id: null,
  },

  // --- doc-inv07 (ใบแจ้งหนี้ — overdue เกินกำหนด — L5) ---
  {
    id: "dl-inv07-1",
    org_id: ORG,
    document_id: "doc-inv07",
    item_name: "ออกแบบกราฟิกและสื่อประชาสัมพันธ์",
    description: "สื่อโปรโมชัน Banner, Flyer 10 ชิ้น",
    qty: 10,
    unit_price: 2800.0,
    discount: 0,
    discount_type: "amount",
    amount: 28000.0, // 10×2800−0
    sort_order: 1,
    product_id: "prd-svc002",
  },
];

// ---- Documents ----
// subtotal = Σ(line.amount) ตาม discount ที่ระบุแล้ว
// Non-VAT: vat_amount = 0, total = subtotal

export const mockDocuments: AccDocument[] = [
  // 1. ใบเสนอราคา → accepted (convert แล้ว)
  // lines: dl-qt01-1(30,000) + dl-qt01-2(13,500 หลัง percent10%) = 43,500
  {
    id: "doc-qt01",
    org_id: ORG,
    doc_type: "quotation",
    doc_number: "QT-2026-0001",
    contact_id: "cnt-c01",
    issue_date: "2026-03-25",
    due_date: null,
    status: "accepted",
    vat_enabled: false,
    subtotal: 43500.0,
    vat_amount: 0,
    total: 43500.0,
    converted_from_id: null,
    note: "ราคายังไม่รวม VAT (Non-VAT) / ส่วนลด Brand Guideline 10% (1,500 บาท)",
    created_at: "2026-03-25T09:00:00.000Z",
    contact_name: "บริษัท ไทยดีไซน์ สตูดิโอ จำกัด",
  },
  // 2. ใบแจ้งหนี้ — paid (จาก qt01)
  // lines: dl-inv01-1 (30000) + dl-inv01-2 (13000 หลังส่วนลด 2000) = 43,000
  {
    id: "doc-inv01",
    org_id: ORG,
    doc_type: "invoice",
    doc_number: "INV-2026-0001",
    contact_id: "cnt-c01",
    issue_date: "2026-04-01",
    due_date: "2026-04-30",
    status: "paid",
    vat_enabled: false,
    subtotal: 43000.0,
    vat_amount: 0,
    total: 43000.0,
    converted_from_id: "doc-qt01",
    note: null,
    created_at: "2026-04-01T09:00:00.000Z",
    contact_name: "บริษัท ไทยดีไซน์ สตูดิโอ จำกัด",
  },
  // 3. ใบเสร็จรับเงิน — ถ่ายภาพสินค้า
  // lines: dl-rc01-1 (12000) + dl-rc01-2 (3000) = 15,000
  {
    id: "doc-rc01",
    org_id: ORG,
    doc_type: "receipt",
    doc_number: "RC-2026-0001",
    contact_id: "cnt-c02",
    issue_date: "2026-04-20",
    due_date: null,
    status: "paid",
    vat_enabled: false,
    subtotal: 15000.0,
    vat_amount: 0,
    total: 15000.0,
    converted_from_id: null,
    note: "ชำระเต็มจำนวน",
    created_at: "2026-04-20T13:00:00.000Z",
    contact_name: "ร้านกาแฟ บ้านเช้า",
  },
  // 4. ใบแจ้งหนี้ — paid (ออกแบบเว็บ)
  // lines: dl-inv02-1 (18000) + dl-inv02-2 (10500) = 28,500
  {
    id: "doc-inv02",
    org_id: ORG,
    doc_type: "invoice",
    doc_number: "INV-2026-0002",
    contact_id: "cnt-b01",
    issue_date: "2026-04-08",
    due_date: "2026-05-08",
    status: "paid",
    vat_enabled: false,
    subtotal: 28500.0,
    vat_amount: 0,
    total: 28500.0,
    wht_rate: 3, // หัก ณ ที่จ่าย 3% (ค่าบริการ)
    wht_amount: 855.0, // 28500 × 3% — ยอดชำระสุทธิ 27,645
    converted_from_id: null,
    note: null,
    created_at: "2026-04-08T10:00:00.000Z",
    contact_name: "บริษัท ครีเอทีฟ เน็ตเวิร์ค จำกัด",
  },
  // 5. ใบแจ้งหนี้ — OVERDUE (ระบบ POS — L5 ตัวอย่าง)
  // lines: dl-inv03-1 (49500 หลังส่วนลด 10%) + dl-inv03-2 (20000) = 69,500
  {
    id: "doc-inv03",
    org_id: ORG,
    doc_type: "invoice",
    doc_number: "INV-2026-0003",
    contact_id: "cnt-c03",
    issue_date: "2026-05-02",
    due_date: "2026-05-31",
    status: "overdue",
    vat_enabled: false,
    subtotal: 69500.0,
    vat_amount: 0,
    total: 69500.0,
    converted_from_id: null,
    note: "ครบกำหนดชำระ 31 พ.ค. 2569 — ยังไม่ได้รับชำระ (ส่วนลดพิเศษลูกค้าเก่า 10%)",
    created_at: "2026-05-02T10:00:00.000Z",
    contact_name: "ห้างหุ้นส่วน วังทองก่อสร้าง",
  },
  // 6. ใบแจ้งหนี้ — draft (packaging)
  // lines: dl-inv04-1 (21000) + dl-inv04-2 (1000) = 22,000
  {
    id: "doc-inv04",
    org_id: ORG,
    doc_type: "invoice",
    doc_number: "INV-2026-0004",
    contact_id: "cnt-c04",
    issue_date: "2026-05-10",
    due_date: "2026-06-10",
    status: "draft",
    vat_enabled: false,
    subtotal: 22000.0,
    vat_amount: 0,
    total: 22000.0,
    converted_from_id: null,
    note: "รอตรวจสอบก่อนส่ง",
    created_at: "2026-05-10T11:00:00.000Z",
    contact_name: "คุณสมชาย วงศ์สุข (บุคคลธรรมดา)",
  },
  // 7. ใบแจ้งหนี้ — sent (dashboard Q2 — พร้อมส่ง LINE: L4)
  // lines: dl-inv05-1(45,000) + dl-inv05-2(9,500 หลัง percent5%) = 54,500
  {
    id: "doc-inv05",
    org_id: ORG,
    doc_type: "invoice",
    doc_number: "INV-2026-0005",
    contact_id: "cnt-c01",
    issue_date: "2026-06-02",
    due_date: "2026-07-02",
    status: "sent",
    vat_enabled: false,
    subtotal: 54500.0,
    vat_amount: 0,
    total: 54500.0,
    converted_from_id: null,
    note: "ส่งทาง Email แล้ว 2 มิ.ย. 2569 (ส่วนลด Data Viz 5% = 500 บาท)",
    created_at: "2026-06-02T09:00:00.000Z",
    contact_name: "บริษัท ไทยดีไซน์ สตูดิโอ จำกัด",
  },
  // 8. ใบแจ้งหนี้ — sent (retainer มิถุนายน)
  // lines: dl-inv06-1 (18000) = 18,000
  {
    id: "doc-inv06",
    org_id: ORG,
    doc_type: "invoice",
    doc_number: "INV-2026-0006",
    contact_id: "cnt-b01",
    issue_date: "2026-06-06",
    due_date: "2026-06-30",
    status: "sent",
    vat_enabled: false,
    subtotal: 18000.0,
    vat_amount: 0,
    total: 18000.0,
    converted_from_id: null,
    note: null,
    created_at: "2026-06-06T10:00:00.000Z",
    contact_name: "บริษัท ครีเอทีฟ เน็ตเวิร์ค จำกัด",
  },
  // 9. ใบเสนอราคา — draft (mobile app ใหม่)
  // lines: dl-qt02-1 (150000) + dl-qt02-2 (50000) = 200,000
  {
    id: "doc-qt02",
    org_id: ORG,
    doc_type: "quotation",
    doc_number: "QT-2026-0002",
    contact_id: "cnt-c03",
    issue_date: "2026-06-15",
    due_date: null,
    status: "draft",
    vat_enabled: false,
    subtotal: 200000.0,
    vat_amount: 0,
    total: 200000.0,
    converted_from_id: null,
    note: "รอ sign off จากลูกค้าก่อนออก invoice",
    created_at: "2026-06-15T14:00:00.000Z",
    contact_name: "ห้างหุ้นส่วน วังทองก่อสร้าง",
  },
  // 10. ใบแจ้งหนี้ — OVERDUE อีกใบ (L5 ตัวอย่างที่ 2)
  // lines: dl-inv07-1 (28000) = 28,000
  {
    id: "doc-inv07",
    org_id: ORG,
    doc_type: "invoice",
    doc_number: "INV-2026-0007",
    contact_id: "cnt-b01",
    issue_date: "2026-04-15",
    due_date: "2026-05-15",
    status: "overdue",
    vat_enabled: false,
    subtotal: 28000.0,
    vat_amount: 0,
    total: 28000.0,
    converted_from_id: null,
    note: "เกินกำหนด 40 วัน",
    created_at: "2026-04-15T09:00:00.000Z",
    contact_name: "บริษัท ครีเอทีฟ เน็ตเวิร์ค จำกัด",
  },
];

/** เพิ่ม lines เข้า document (สะดวกใช้ใน UI) */
export const mockDocumentsWithLines: AccDocument[] = mockDocuments.map((doc) => ({
  ...doc,
  lines: mockDocumentLines.filter((l) => l.document_id === doc.id),
}));

/** ใบ overdue ทั้งหมด (L5) */
export const overdueDocuments = mockDocuments.filter((d) => d.status === "overdue");

/** ใบที่พร้อมส่ง LINE (L4) — status=sent */
export const readyToSendLineDocuments = mockDocuments.filter((d) => d.status === "sent");
