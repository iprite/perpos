// payments.ts — payments ผูก booking (มัดจำ/ส่วนเหลือ/extra/refund)
// RULE: amount บวกเสมอทุก kind รวม refund (แสดง − ที่ UI layer)
// ยอดค้าง = grand_total − Σamount(kind!=refund) + Σamount(kind=refund)
//
// สถานะการชำระ (เพื่อโชว์ filter):
//   จ่ายครบ: bk-0001(3200), bk-0004(4800), bk-0007(2200), bk-0019(10500), bk-0020(3200), bk-0021(2400), bk-0022(10500), bk-0023(1200), bk-0024(3600), bk-0027(1400), bk-0028(7000)
//   ค้างบางส่วน: bk-0002(3800 จ่าย 1000 = ค้าง 2800), bk-0003(18500 จ่าย 10000 = ค้าง 8500), bk-0005(9000 จ่าย 3000 = ค้าง 6000), bk-0006(9500 จ่าย 5000 = ค้าง 4500), bk-0008(2400 จ่าย 1200 = ค้าง 1200), bk-0011(6200 จ่าย 3000 = ค้าง 3200)
//   ยังไม่จ่าย: bk-0009(2700), bk-0010(5400), bk-0012(2100)
//   refund: bk-0025(ยกเลิก คืนมัดจำ 50% = 600)
//
// รวมรายรับ JUNE 2026 (รับเข้าจริง = ไม่นับ refund ออก)
// วันนี้ (23 มิ.ย.): bk-0012 2100 + bk-0015 deposit 600 = 2700 + ค่า extra อื่น
// ยอดค้างรวม: 2800+8500+6000+4500+1200+3200+2700+5400+2100 = 36,400 ฿ (บาง booking ยังไม่จ่ายเลย)

import type { Payment } from "./types";
import { MOCK_ORG_ID } from "./room-type-config";

export const payments: Payment[] = [
  // ============================================================
  // bk-0001 — สมชาย 3,200 ฿ — จ่ายครบ (โอน)
  // ============================================================
  {
    id: "pay-001-1",
    org_id: MOCK_ORG_ID,
    booking_id: "bk-0001",
    kind: "deposit",
    method: "transfer",
    amount: 1600,
    paid_at: "2026-06-21T13:30:00.000Z",
    reference: "REF-20260621-001",
    received_by: null,
    note: "มัดจำ 50%",
    created_at: "2026-06-21T13:30:00.000Z",
  },
  {
    id: "pay-001-2",
    org_id: MOCK_ORG_ID,
    booking_id: "bk-0001",
    kind: "balance",
    method: "cash",
    amount: 1600,
    paid_at: "2026-06-22T20:00:00.000Z",
    reference: null,
    received_by: null,
    note: "ชำระส่วนที่เหลือ",
    created_at: "2026-06-22T20:00:00.000Z",
  },
  // ยอดค้าง bk-0001 = 3200 − 3200 = 0 ✓

  // ============================================================
  // bk-0002 — วิภาวดี 3,800 ฿ — จ่ายมัดจำ ค้าง 2,800
  // ============================================================
  {
    id: "pay-002-1",
    org_id: MOCK_ORG_ID,
    booking_id: "bk-0002",
    kind: "deposit",
    method: "transfer",
    amount: 1000,
    paid_at: "2026-06-20T10:30:00.000Z",
    reference: "REF-20260620-002",
    received_by: null,
    note: "มัดจำจอง",
    created_at: "2026-06-20T10:30:00.000Z",
  },
  // ยอดค้าง bk-0002 = 3800 − 1000 = 2,800 ✓

  // ============================================================
  // bk-0003 — Tanaka 18,500 ฿ — จ่ายมัดจำ+บางส่วน ค้าง 8,500
  // ============================================================
  {
    id: "pay-003-1",
    org_id: MOCK_ORG_ID,
    booking_id: "bk-0003",
    kind: "deposit",
    method: "ota",
    amount: 7000,
    paid_at: "2026-06-18T08:30:00.000Z",
    reference: "AGODA-TH-889900",
    received_by: null,
    note: "มัดจำ Agoda",
    created_at: "2026-06-18T08:30:00.000Z",
  },
  {
    id: "pay-003-2",
    org_id: MOCK_ORG_ID,
    booking_id: "bk-0003",
    kind: "extra",
    method: "cash",
    amount: 3000,
    paid_at: "2026-06-22T19:00:00.000Z",
    reference: null,
    received_by: null,
    note: "ค่าอาหารเช้า + บริการพิเศษ",
    created_at: "2026-06-22T19:00:00.000Z",
  },
  // ยอดค้าง bk-0003 = 18500 − (7000+3000) = 8,500 ✓

  // ============================================================
  // bk-0004 — ประยุทธ 4,800 ฿ — จ่ายครบ (เงินสด)
  // ============================================================
  {
    id: "pay-004-1",
    org_id: MOCK_ORG_ID,
    booking_id: "bk-0004",
    kind: "deposit",
    method: "cash",
    amount: 2400,
    paid_at: "2026-06-20T16:10:00.000Z",
    reference: null,
    received_by: null,
    note: "มัดจำเช็คอิน",
    created_at: "2026-06-20T16:10:00.000Z",
  },
  {
    id: "pay-004-2",
    org_id: MOCK_ORG_ID,
    booking_id: "bk-0004",
    kind: "balance",
    method: "cash",
    amount: 2400,
    paid_at: "2026-06-22T19:30:00.000Z",
    reference: null,
    received_by: null,
    note: null,
    created_at: "2026-06-22T19:30:00.000Z",
  },
  // ยอดค้าง bk-0004 = 4800 − 4800 = 0 ✓

  // ============================================================
  // bk-0005 — Wang Fang 9,000 ฿ — จ่ายมัดจำ Agoda ค้าง 6,000
  // ============================================================
  {
    id: "pay-005-1",
    org_id: MOCK_ORG_ID,
    booking_id: "bk-0005",
    kind: "deposit",
    method: "ota",
    amount: 3000,
    paid_at: "2026-06-17T07:30:00.000Z",
    reference: "AGODA-CN-112233",
    received_by: null,
    note: "มัดจำ Agoda",
    created_at: "2026-06-17T07:30:00.000Z",
  },
  // ยอดค้าง bk-0005 = 9000 − 3000 = 6,000 ✓

  // ============================================================
  // bk-0006 — James Anderson 9,500 ฿ — จ่ายมัดจำ Booking.com ค้าง 4,500
  // ============================================================
  {
    id: "pay-006-1",
    org_id: MOCK_ORG_ID,
    booking_id: "bk-0006",
    kind: "deposit",
    method: "ota",
    amount: 5000,
    paid_at: "2026-06-18T09:30:00.000Z",
    reference: "BDC-GB-554433",
    received_by: null,
    note: "มัดจำ Booking.com",
    created_at: "2026-06-18T09:30:00.000Z",
  },
  // ยอดค้าง bk-0006 = 9500 − 5000 = 4,500 ✓

  // ============================================================
  // bk-0007 — สุนิสา 2,200 ฿ — จ่ายครบ
  // ============================================================
  {
    id: "pay-007-1",
    org_id: MOCK_ORG_ID,
    booking_id: "bk-0007",
    kind: "balance",
    method: "qr",
    amount: 2200,
    paid_at: "2026-06-21T17:10:00.000Z",
    reference: null,
    received_by: null,
    note: "จ่ายเต็มตอนเช็คอิน QR",
    created_at: "2026-06-21T17:10:00.000Z",
  },
  // ยอดค้าง bk-0007 = 2200 − 2200 = 0 ✓

  // ============================================================
  // bk-0008 — ธนพล 2,400 ฿ — จ่ายมัดจำ ค้าง 1,200
  // ============================================================
  {
    id: "pay-008-1",
    org_id: MOCK_ORG_ID,
    booking_id: "bk-0008",
    kind: "deposit",
    method: "transfer",
    amount: 1200,
    paid_at: "2026-06-20T11:30:00.000Z",
    reference: "REF-20260620-008",
    received_by: null,
    note: "มัดจำ 50%",
    created_at: "2026-06-20T11:30:00.000Z",
  },
  // ยอดค้าง bk-0008 = 2400 − 1200 = 1,200 ✓

  // ============================================================
  // bk-0009 — มานิตา 2,700 ฿ — ยังไม่จ่ายเลย (ค้าง 2,700)
  // ============================================================
  // (ไม่มี payment)
  // ยอดค้าง bk-0009 = 2700 ✓

  // ============================================================
  // bk-0010 — Li Wei 5,400 ฿ — ยังไม่จ่ายเลย (ค้าง 5,400)
  // ============================================================
  // (ไม่มี payment)
  // ยอดค้าง bk-0010 = 5400 ✓

  // ============================================================
  // bk-0011 — อรพรรณ 6,200 ฿ — จ่ายมัดจำ ค้าง 3,200
  // ============================================================
  {
    id: "pay-011-1",
    org_id: MOCK_ORG_ID,
    booking_id: "bk-0011",
    kind: "deposit",
    method: "transfer",
    amount: 3000,
    paid_at: "2026-06-20T14:30:00.000Z",
    reference: "REF-20260620-011",
    received_by: null,
    note: "มัดจำ Traveloka",
    created_at: "2026-06-20T14:30:00.000Z",
  },
  // ยอดค้าง bk-0011 = 6200 − 3000 = 3,200 ✓

  // ============================================================
  // bk-0012 — สมศักดิ์ hourly 2,100 ฿ — จ่ายวันนี้ (เงินสด)
  // ============================================================
  {
    id: "pay-012-1",
    org_id: MOCK_ORG_ID,
    booking_id: "bk-0012",
    kind: "balance",
    method: "cash",
    amount: 2100,
    paid_at: "2026-06-23T10:00:00.000Z",
    reference: null,
    received_by: null,
    note: "จ่ายเต็มรายชั่วโมง",
    created_at: "2026-06-23T10:00:00.000Z",
  },
  // ยอดค้าง bk-0012 = 2100 − 2100 = 0 ✓

  // ============================================================
  // bk-0013 — Sarah Miller 7,200 ฿ — จ่ายมัดจำ Agoda วันนี้
  // ============================================================
  {
    id: "pay-013-1",
    org_id: MOCK_ORG_ID,
    booking_id: "bk-0013",
    kind: "deposit",
    method: "ota",
    amount: 3600,
    paid_at: "2026-06-23T09:00:00.000Z",
    reference: "AGODA-US-776655",
    received_by: null,
    note: "มัดจำ Agoda 50%",
    created_at: "2026-06-23T09:00:00.000Z",
  },
  // ยอดค้าง bk-0013 = 7200 − 3600 = 3,600

  // ============================================================
  // bk-0015 — อนุชา 1,200 ฿ — deposit วันนี้
  // ============================================================
  {
    id: "pay-015-1",
    org_id: MOCK_ORG_ID,
    booking_id: "bk-0015",
    kind: "deposit",
    method: "cash",
    amount: 600,
    paid_at: "2026-06-23T10:20:00.000Z",
    reference: null,
    received_by: null,
    note: "มัดจำ 50%",
    created_at: "2026-06-23T10:20:00.000Z",
  },
  // ยอดค้าง bk-0015 = 1200 − 600 = 600

  // ============================================================
  // bk-0019 — Tanaka ครั้งก่อน 10,500 ฿ — จ่ายครบ
  // ============================================================
  {
    id: "pay-019-1",
    org_id: MOCK_ORG_ID,
    booking_id: "bk-0019",
    kind: "balance",
    method: "credit_card",
    amount: 10500,
    paid_at: "2026-06-08T11:00:00.000Z",
    reference: null,
    received_by: null,
    note: "บัตรเครดิต",
    created_at: "2026-06-08T11:00:00.000Z",
  },
  // ยอดค้าง bk-0019 = 10500 − 10500 = 0 ✓

  // ============================================================
  // bk-0020 — สมชาย ครั้งก่อน 3,200 ฿ — จ่ายครบ
  // ============================================================
  {
    id: "pay-020-1",
    org_id: MOCK_ORG_ID,
    booking_id: "bk-0020",
    kind: "balance",
    method: "transfer",
    amount: 3200,
    paid_at: "2026-06-10T12:00:00.000Z",
    reference: "REF-20260610-020",
    received_by: null,
    note: null,
    created_at: "2026-06-10T12:00:00.000Z",
  },

  // ============================================================
  // bk-0021 — วิภาวดี ครั้งก่อน 2,400 ฿ — จ่ายครบ
  // ============================================================
  {
    id: "pay-021-1",
    org_id: MOCK_ORG_ID,
    booking_id: "bk-0021",
    kind: "balance",
    method: "qr",
    amount: 2400,
    paid_at: "2026-06-11T11:00:00.000Z",
    reference: null,
    received_by: null,
    note: "QR PromptPay",
    created_at: "2026-06-11T11:00:00.000Z",
  },

  // ============================================================
  // bk-0022 — Siriwan 10,500 ฿ — จ่ายครบตอนเช็คเอาท์
  // ============================================================
  {
    id: "pay-022-1",
    org_id: MOCK_ORG_ID,
    booking_id: "bk-0022",
    kind: "deposit",
    method: "transfer",
    amount: 5000,
    paid_at: "2026-06-18T10:30:00.000Z",
    reference: "REF-20260618-022",
    received_by: null,
    note: "มัดจำ",
    created_at: "2026-06-18T10:30:00.000Z",
  },
  {
    id: "pay-022-2",
    org_id: MOCK_ORG_ID,
    booking_id: "bk-0022",
    kind: "balance",
    method: "credit_card",
    amount: 5500,
    paid_at: "2026-06-23T10:10:00.000Z",
    reference: null,
    received_by: null,
    note: "ชำระส่วนที่เหลือ บัตรเครดิต",
    created_at: "2026-06-23T10:10:00.000Z",
  },
  // ยอดค้าง bk-0022 = 10500 − 10500 = 0 ✓

  // ============================================================
  // bk-0023 — กมลวรรณ 1,200 ฿ — จ่ายครบ
  // ============================================================
  {
    id: "pay-023-1",
    org_id: MOCK_ORG_ID,
    booking_id: "bk-0023",
    kind: "balance",
    method: "cash",
    amount: 1200,
    paid_at: "2026-06-23T09:30:00.000Z",
    reference: null,
    received_by: null,
    note: null,
    created_at: "2026-06-23T09:30:00.000Z",
  },

  // ============================================================
  // bk-0024 — วรากร 3,600 ฿ — จ่ายครบ
  // ============================================================
  {
    id: "pay-024-1",
    org_id: MOCK_ORG_ID,
    booking_id: "bk-0024",
    kind: "balance",
    method: "qr",
    amount: 3600,
    paid_at: "2026-06-23T10:00:00.000Z",
    reference: null,
    received_by: null,
    note: "QR PromptPay ตอนเช็คเอาท์",
    created_at: "2026-06-23T10:00:00.000Z",
  },

  // ============================================================
  // bk-0025 — รัตนา ยกเลิก — คืนมัดจำ 50% = 600 ฿ (refund)
  // ============================================================
  {
    id: "pay-025-1",
    org_id: MOCK_ORG_ID,
    booking_id: "bk-0025",
    kind: "deposit",
    method: "transfer",
    amount: 1200,
    paid_at: "2026-06-08T10:30:00.000Z",
    reference: "REF-20260608-025",
    received_by: null,
    note: "มัดจำเดิม",
    created_at: "2026-06-08T10:30:00.000Z",
  },
  {
    id: "pay-025-2",
    org_id: MOCK_ORG_ID,
    booking_id: "bk-0025",
    kind: "refund",
    method: "transfer",
    amount: 600, // บวกเสมอ (= เงินออก/คืนแขก) แสดง − ที่ UI
    paid_at: "2026-06-12T14:30:00.000Z",
    reference: "REFUND-20260612-001",
    received_by: null,
    note: "คืนมัดจำ 50% กรณียกเลิก",
    created_at: "2026-06-12T14:30:00.000Z",
  },
  // ยอดค้าง bk-0025 = 2400 − 1200 + 600 = 1,800 (ยอดที่ต้องชำระ = เงินยกเลิก refund ออกไปแล้ว)

  // ============================================================
  // bk-0027 — hourly เมื่อวาน 1,400 ฿ จ่ายครบ
  // ============================================================
  {
    id: "pay-027-1",
    org_id: MOCK_ORG_ID,
    booking_id: "bk-0027",
    kind: "balance",
    method: "cash",
    amount: 1400,
    paid_at: "2026-06-22T13:05:00.000Z",
    reference: null,
    received_by: null,
    note: null,
    created_at: "2026-06-22T13:05:00.000Z",
  },

  // ============================================================
  // bk-0028 — Tanaka ต้นเดือน 7,000 ฿ จ่ายครบ
  // ============================================================
  {
    id: "pay-028-1",
    org_id: MOCK_ORG_ID,
    booking_id: "bk-0028",
    kind: "balance",
    method: "credit_card",
    amount: 7000,
    paid_at: "2026-06-03T11:00:00.000Z",
    reference: null,
    received_by: null,
    note: null,
    created_at: "2026-06-03T11:00:00.000Z",
  },
];

// ============================================================
// Helper summary สำหรับ dashboard/reports
// ============================================================

/** รายรับรวมวันนี้ (23 มิ.ย. 2026) — เฉพาะ paid_at วันนี้ */
export const revenueTodayFromPayments = payments
  .filter((p) => p.paid_at.startsWith("2026-06-23") && p.kind !== "refund")
  .reduce((sum, p) => sum + p.amount, 0);
// pay-012-1(2100) + pay-013-1(3600) + pay-015-1(600) + pay-022-2(5500) + pay-023-1(1200) + pay-024-1(3600) = 16,600 ฿

/** รายรับรวมเดือน มิ.ย. 2026 */
export const revenueMtdFromPayments = payments
  .filter((p) => p.paid_at.startsWith("2026-06") && p.kind !== "refund")
  .reduce((sum, p) => sum + p.amount, 0);
