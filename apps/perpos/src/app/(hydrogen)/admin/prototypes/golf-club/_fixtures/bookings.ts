// bookings.ts — golf_bookings (วันนี้ 2026-07-12 + พรุ่งนี้ 2026-07-13 + 2026-07-15)
// ANCHOR (ต้องตรงเป๊ะกับ ai-mocks.ts / line-mocks.ts):
//   วันนี้ 2026-07-12 (อาทิตย์) = 45 tee (จาก 60 slot) + 18 range = bookings_today 63
//   bands: เช้า 06:00–09:00 17/18 · สาย 09:00–12:00 15/18 · บ่าย 12:00–15:00 10/18 · เย็น 15:00–16:00 3/6
//   no_show_today = 3 (ทั้งหมดอยู่ช่วงเช้า) · deposit_pending_count = 5 (channel line + pending + unpaid)
//   revenue_today = Σ total_amount (status≠cancelled) = 128,400 ฿
//     = anchor(5,000+7,500+9,900=22,400) + tee เติม 42 แถว(95,200) + range 18 แถว(10,800)
//   GC-20260712-018 (gm-014) 07:20 · GC-20260712-031 (gm-027) 13:40 · GC-20260712-009 (gm-003) 08:10
//   พรุ่งนี้ 2026-07-13 (จันทร์) = 12 booking (bookings_tomorrow) รวม anchor LINE-mock GC-20260713-018 (gm-001)
//   2026-07-15 = GC-20260715-006 (gm-001, ไดร์ฟ Bay 5, pending) — ใช้ใน /คิวของฉัน (T7 mock)
import { mkBooking, ORG, type BookingItemSpec } from "./_booking-factory";
import type { GolfBooking } from "./types";

const COURSE = "res-course-a";
const gf = (label: string, qty: number, unitPrice: number): BookingItemSpec => ({
  priceId: "gf-we-morning",
  category: "green_fee",
  label,
  qty,
  unitPrice,
});

// ---- 3 anchor bookings วันนี้ (ผูก AI-2 risk cases) ----
const anchorToday: GolfBooking[] = [
  mkBooking({
    id: "bk-20260712-018",
    ref: "GC-20260712-018",
    type: "tee_time",
    resource: COURSE,
    date: "2026-07-12",
    time: "07:20",
    party: 2,
    status: "pending",
    channel: "line",
    member: "gm-014",
    amount: 5000,
    payStatus: "unpaid",
    items: [gf("กรีนฟี 18 หลุม (วันหยุด เช้า) ×2", 2, 2500)],
    notes: "จองผ่าน LINE ยังไม่ยืนยัน — เสี่ยง no-show สูง (AI-2 riskHigh)",
    createdAt: "2026-07-10T03:00:00.000Z",
  }),
  mkBooking({
    id: "bk-20260712-031",
    ref: "GC-20260712-031",
    type: "tee_time",
    resource: COURSE,
    date: "2026-07-12",
    time: "13:40",
    party: 3,
    status: "pending",
    channel: "web",
    member: "gm-027",
    amount: 7500,
    deposit: 1500,
    paid: 1500,
    payStatus: "deposit_paid",
    payMethod: "promptpay",
    items: [gf("กรีนฟี 18 หลุม (วันหยุด บ่าย) ×3", 3, 2500)],
    notes: "จองผ่านเว็บ ชำระมัดจำแล้ว รอสนามยืนยัน (AI-2 riskMedium)",
    createdAt: "2026-07-09T05:00:00.000Z",
  }),
  mkBooking({
    id: "bk-20260712-009",
    ref: "GC-20260712-009",
    type: "tee_time",
    resource: COURSE,
    date: "2026-07-12",
    time: "08:10",
    party: 4,
    caddie: 2,
    cart: 1,
    status: "confirmed",
    channel: "line",
    member: "gm-003",
    amount: 9900,
    paid: 9900,
    payStatus: "paid",
    payMethod: "promptpay",
    items: [
      { priceId: "gf-we-morning", category: "green_fee", label: "กรีนฟี 18 หลุม (วันหยุด เช้า, Gold ลด 15%) ×4", qty: 4, unitPrice: 2125 },
      { priceId: "caddie-fee", category: "caddie", label: "แคดดี้ ×2", qty: 2, unitPrice: 300 },
      { priceId: "cart-fee", category: "cart", label: "รถกอล์ฟ ×1", qty: 1, unitPrice: 800 },
    ],
    notes: "สมาชิก Gold ออกรอบสม่ำเสมอ — ความเสี่ยง no-show ต่ำมาก (AI-2 riskLow)",
    createdAt: "2026-07-05T02:30:00.000Z",
  }),
];

// ---- เช้า 06:00–09:00 (17/18 booked incl. 2 anchor) — 15 non-anchor ----
const morningFillers: GolfBooking[] = [
  mkBooking({ id: "bk-0712-m01", ref: "GC-20260712-001", type: "tee_time", resource: COURSE, date: "2026-07-12", time: "06:10", status: "completed", channel: "walk_in", contact: "คุณอาทิตย์ บุญมี", phone: "080-100-1001", amount: 2200, paid: 2200, payStatus: "paid", payMethod: "cash", createdAt: "2026-07-12T00:00:00.000Z" }),
  mkBooking({ id: "bk-0712-m02", ref: "GC-20260712-002", type: "tee_time", resource: COURSE, date: "2026-07-12", time: "06:20", status: "no_show", channel: "line", member: "gm-011", amount: 2200, deposit: 500, paid: 500, payStatus: "deposit_paid", payMethod: "promptpay", createdAt: "2026-07-08T00:00:00.000Z" }),
  mkBooking({ id: "bk-0712-m03", ref: "GC-20260712-003", type: "tee_time", resource: COURSE, date: "2026-07-12", time: "06:30", status: "completed", channel: "phone", member: "gm-005", amount: 2200, paid: 2200, payStatus: "paid", payMethod: "cash", createdAt: "2026-07-11T00:00:00.000Z" }),
  mkBooking({ id: "bk-0712-m04", ref: "GC-20260712-004", type: "tee_time", resource: COURSE, date: "2026-07-12", time: "06:40", status: "no_show", channel: "web", contact: "คุณสายฝน เมฆขาว", phone: "089-000-1104", amount: 2200, payStatus: "unpaid", createdAt: "2026-07-09T00:00:00.000Z" }),
  mkBooking({ id: "bk-0712-m05", ref: "GC-20260712-005", type: "tee_time", resource: COURSE, date: "2026-07-12", time: "06:50", status: "completed", channel: "walk_in", contact: "คุณไพศาล ยิ้มแย้ม", phone: "080-100-1005", amount: 2200, paid: 2200, payStatus: "paid", payMethod: "cash", createdAt: "2026-07-12T00:00:00.000Z" }),
  mkBooking({ id: "bk-0712-m06", ref: "GC-20260712-006", type: "tee_time", resource: COURSE, date: "2026-07-12", time: "07:00", status: "no_show", channel: "line", member: "gm-009", amount: 2200, deposit: 500, paid: 500, payStatus: "deposit_paid", payMethod: "promptpay", createdAt: "2026-07-07T00:00:00.000Z" }),
  mkBooking({ id: "bk-0712-m07", ref: "GC-20260712-007", type: "tee_time", resource: COURSE, date: "2026-07-12", time: "07:10", status: "completed", channel: "walk_in", contact: "คุณดำรง ศรีสมุทร", phone: "080-100-1007", amount: 2200, paid: 2200, payStatus: "paid", payMethod: "cash", createdAt: "2026-07-12T00:00:00.000Z" }),
  mkBooking({ id: "bk-0712-m08", ref: "GC-20260712-008", type: "tee_time", resource: COURSE, date: "2026-07-12", time: "07:30", status: "completed", channel: "phone", member: "gm-017", amount: 2200, paid: 2200, payStatus: "paid", payMethod: "cash", createdAt: "2026-07-11T00:00:00.000Z" }),
  mkBooking({ id: "bk-0712-m09", ref: "GC-20260712-010", type: "tee_time", resource: COURSE, date: "2026-07-12", time: "07:40", status: "checked_in", channel: "walk_in", contact: "คุณละออง บัวขาว", phone: "080-100-1009", amount: 2300, paid: 2300, payStatus: "paid", payMethod: "cash", checkedInAt: "2026-07-12T00:40:00.000Z", createdAt: "2026-07-12T00:00:00.000Z" }),
  mkBooking({ id: "bk-0712-m10", ref: "GC-20260712-011", type: "tee_time", resource: COURSE, date: "2026-07-12", time: "07:50", status: "checked_in", channel: "phone", member: "gm-019", amount: 2300, paid: 2300, payStatus: "paid", payMethod: "promptpay", checkedInAt: "2026-07-12T00:50:00.000Z", createdAt: "2026-07-11T00:00:00.000Z" }),
  mkBooking({ id: "bk-0712-m11", ref: "GC-20260712-012", type: "tee_time", resource: COURSE, date: "2026-07-12", time: "08:00", status: "checked_in", channel: "walk_in", contact: "คุณสมนึก ทองแดง", phone: "080-100-1011", amount: 2300, deposit: 500, paid: 500, payStatus: "deposit_paid", payMethod: "cash", checkedInAt: "2026-07-12T01:00:00.000Z", createdAt: "2026-07-12T00:00:00.000Z" }),
  mkBooking({ id: "bk-0712-m12", ref: "GC-20260712-013", type: "tee_time", resource: COURSE, date: "2026-07-12", time: "08:20", status: "checked_in", channel: "web", member: "gm-024", amount: 2300, paid: 2300, payStatus: "paid", payMethod: "promptpay", checkedInAt: "2026-07-12T01:20:00.000Z", createdAt: "2026-07-10T00:00:00.000Z" }),
  mkBooking({ id: "bk-0712-m13", ref: "GC-20260712-014", type: "tee_time", resource: COURSE, date: "2026-07-12", time: "08:30", status: "confirmed", channel: "walk_in", contact: "คุณอรทัย ไพลิน", phone: "080-100-1013", amount: 2300, deposit: 500, paid: 500, payStatus: "deposit_paid", payMethod: "promptpay", createdAt: "2026-07-12T00:00:00.000Z" }),
  mkBooking({ id: "bk-0712-m14", ref: "GC-20260712-015", type: "tee_time", resource: COURSE, date: "2026-07-12", time: "08:40", status: "confirmed", channel: "phone", member: "gm-032", amount: 2300, paid: 2300, payStatus: "paid", payMethod: "card", createdAt: "2026-07-11T00:00:00.000Z" }),
  mkBooking({ id: "bk-0712-m15", ref: "GC-20260712-016", type: "tee_time", resource: COURSE, date: "2026-07-12", time: "08:50", status: "confirmed", channel: "web", member: "gm-022", amount: 2300, payStatus: "unpaid", createdAt: "2026-07-10T00:00:00.000Z" }),
];

// ---- สาย 09:00–12:00 (15/18 booked) — รวม 1 deposit_pending (09:40) ----
const lateMorningFillers: GolfBooking[] = [
  mkBooking({ id: "bk-0712-l01", ref: "GC-20260712-017", type: "tee_time", resource: COURSE, date: "2026-07-12", time: "09:10", status: "completed", channel: "walk_in", contact: "คุณบรรจง ศิริพร", phone: "080-200-2001", amount: 2200, paid: 2200, payStatus: "paid", payMethod: "cash", createdAt: "2026-07-12T00:00:00.000Z" }),
  mkBooking({ id: "bk-0712-l02", ref: "GC-20260712-019", type: "tee_time", resource: COURSE, date: "2026-07-12", time: "09:20", status: "completed", channel: "phone", member: "gm-034", amount: 2200, paid: 2200, payStatus: "paid", payMethod: "promptpay", createdAt: "2026-07-11T00:00:00.000Z" }),
  mkBooking({ id: "bk-0712-l03", ref: "GC-20260712-020", type: "tee_time", resource: COURSE, date: "2026-07-12", time: "09:30", status: "completed", channel: "walk_in", contact: "คุณละมัย ทองย้อย", phone: "080-200-2003", amount: 2200, paid: 2200, payStatus: "paid", payMethod: "cash", createdAt: "2026-07-12T00:00:00.000Z" }),
  mkBooking({ id: "bk-0712-l04", ref: "GC-20260712-021", type: "tee_time", resource: COURSE, date: "2026-07-12", time: "09:40", status: "pending", channel: "line", member: "gm-026", amount: 2200, payStatus: "unpaid", createdAt: "2026-07-12T02:00:00.000Z", notes: "รอลูกค้าชำระมัดจำผ่าน LINE" }),
  mkBooking({ id: "bk-0712-l05", ref: "GC-20260712-022", type: "tee_time", resource: COURSE, date: "2026-07-12", time: "09:50", status: "checked_in", channel: "walk_in", contact: "คุณสมยศ ปิ่นทอง", phone: "080-200-2005", amount: 2200, paid: 2200, payStatus: "paid", payMethod: "cash", checkedInAt: "2026-07-12T02:50:00.000Z", createdAt: "2026-07-12T00:00:00.000Z" }),
  mkBooking({ id: "bk-0712-l06", ref: "GC-20260712-023", type: "tee_time", resource: COURSE, date: "2026-07-12", time: "10:00", status: "checked_in", channel: "phone", member: "gm-031", amount: 2200, deposit: 500, paid: 500, payStatus: "deposit_paid", payMethod: "promptpay", checkedInAt: "2026-07-12T03:00:00.000Z", createdAt: "2026-07-11T00:00:00.000Z" }),
  mkBooking({ id: "bk-0712-l07", ref: "GC-20260712-024", type: "tee_time", resource: COURSE, date: "2026-07-12", time: "10:10", status: "checked_in", channel: "walk_in", contact: "คุณอำไพ แซ่ตั้ง", phone: "080-200-2007", amount: 2200, paid: 2200, payStatus: "paid", payMethod: "cash", checkedInAt: "2026-07-12T03:10:00.000Z", createdAt: "2026-07-12T00:00:00.000Z" }),
  mkBooking({ id: "bk-0712-l08", ref: "GC-20260712-025", type: "tee_time", resource: COURSE, date: "2026-07-12", time: "10:20", status: "checked_in", channel: "web", member: "gm-037", amount: 2200, paid: 2200, payStatus: "paid", payMethod: "card", checkedInAt: "2026-07-12T03:20:00.000Z", createdAt: "2026-07-09T00:00:00.000Z" }),
  mkBooking({ id: "bk-0712-l09", ref: "GC-20260712-026", type: "tee_time", resource: COURSE, date: "2026-07-12", time: "10:40", status: "confirmed", channel: "walk_in", contact: "คุณสมศรี บัวลอย", phone: "080-200-2009", amount: 2300, deposit: 500, paid: 500, payStatus: "deposit_paid", payMethod: "cash", createdAt: "2026-07-12T00:00:00.000Z" }),
  mkBooking({ id: "bk-0712-l10", ref: "GC-20260712-027", type: "tee_time", resource: COURSE, date: "2026-07-12", time: "10:50", status: "confirmed", channel: "phone", member: "gm-015", amount: 2300, paid: 2300, payStatus: "paid", payMethod: "promptpay", createdAt: "2026-07-10T00:00:00.000Z" }),
  mkBooking({ id: "bk-0712-l11", ref: "GC-20260712-028", type: "tee_time", resource: COURSE, date: "2026-07-12", time: "11:00", status: "confirmed", channel: "web", member: "gm-039", amount: 2300, deposit: 500, paid: 500, payStatus: "deposit_paid", payMethod: "card", createdAt: "2026-07-08T00:00:00.000Z" }),
  mkBooking({ id: "bk-0712-l12", ref: "GC-20260712-029", type: "tee_time", resource: COURSE, date: "2026-07-12", time: "11:10", status: "confirmed", channel: "walk_in", contact: "คุณสมาน เพ็ชรดี", phone: "080-200-2012", amount: 2300, payStatus: "unpaid", createdAt: "2026-07-12T00:00:00.000Z" }),
  mkBooking({ id: "bk-0712-l13", ref: "GC-20260712-030", type: "tee_time", resource: COURSE, date: "2026-07-12", time: "11:20", status: "confirmed", channel: "phone", member: "gm-028", amount: 2300, paid: 2300, payStatus: "paid", payMethod: "cash", createdAt: "2026-07-11T00:00:00.000Z" }),
  mkBooking({ id: "bk-0712-l14", ref: "GC-20260712-032", type: "tee_time", resource: COURSE, date: "2026-07-12", time: "11:30", status: "confirmed", channel: "web", member: "gm-002", amount: 2300, deposit: 500, paid: 500, payStatus: "deposit_paid", payMethod: "promptpay", createdAt: "2026-07-09T00:00:00.000Z" }),
  mkBooking({ id: "bk-0712-l15", ref: "GC-20260712-033", type: "tee_time", resource: COURSE, date: "2026-07-12", time: "11:50", status: "confirmed", channel: "walk_in", contact: "คุณอุทัย ศรีจันทร์", phone: "080-200-2015", amount: 2300, payStatus: "unpaid", createdAt: "2026-07-12T00:00:00.000Z" }),
];

// ---- บ่าย 12:00–15:00 (10/18 booked incl. 1 anchor 13:40) — 9 non-anchor รวม 2 deposit_pending ----
const afternoonFillers: GolfBooking[] = [
  mkBooking({ id: "bk-0712-a01", ref: "GC-20260712-034", type: "tee_time", resource: COURSE, date: "2026-07-12", time: "12:00", status: "pending", channel: "line", member: "gm-018", amount: 2200, payStatus: "unpaid", createdAt: "2026-07-12T03:30:00.000Z", notes: "แพ็กเกจ Gold หมดอายุแล้ว — ใช้ราคา member fallback รอชำระมัดจำ" }),
  mkBooking({ id: "bk-0712-a02", ref: "GC-20260712-035", type: "tee_time", resource: COURSE, date: "2026-07-12", time: "12:10", status: "confirmed", channel: "walk_in", contact: "คุณสมจิตร แก้วมูล", phone: "080-300-3002", amount: 2200, deposit: 500, paid: 500, payStatus: "deposit_paid", payMethod: "promptpay", createdAt: "2026-07-12T00:00:00.000Z" }),
  mkBooking({ id: "bk-0712-a03", ref: "GC-20260712-036", type: "tee_time", resource: COURSE, date: "2026-07-12", time: "12:30", status: "confirmed", channel: "phone", member: "gm-033", amount: 2200, paid: 2200, payStatus: "paid", payMethod: "cash", createdAt: "2026-07-10T00:00:00.000Z" }),
  mkBooking({ id: "bk-0712-a04", ref: "GC-20260712-037", type: "tee_time", resource: COURSE, date: "2026-07-12", time: "12:50", status: "pending", channel: "line", member: "gm-013", amount: 2200, payStatus: "unpaid", createdAt: "2026-07-12T03:45:00.000Z", notes: "ลูกค้า VIP รอชำระมัดจำผ่าน LINE" }),
  mkBooking({ id: "bk-0712-a05", ref: "GC-20260712-038", type: "tee_time", resource: COURSE, date: "2026-07-12", time: "13:10", status: "confirmed", channel: "web", member: "gm-021", amount: 2300, deposit: 500, paid: 500, payStatus: "deposit_paid", payMethod: "card", createdAt: "2026-07-09T00:00:00.000Z" }),
  mkBooking({ id: "bk-0712-a06", ref: "GC-20260712-040", type: "tee_time", resource: COURSE, date: "2026-07-12", time: "14:00", status: "confirmed", channel: "walk_in", contact: "คุณสมาน อยู่ดี", phone: "080-300-3006", amount: 2300, paid: 2300, payStatus: "paid", payMethod: "cash", createdAt: "2026-07-12T00:00:00.000Z" }),
  mkBooking({ id: "bk-0712-a07", ref: "GC-20260712-041", type: "tee_time", resource: COURSE, date: "2026-07-12", time: "14:10", status: "confirmed", channel: "phone", member: "gm-006", amount: 2300, deposit: 500, paid: 500, payStatus: "deposit_paid", payMethod: "promptpay", createdAt: "2026-07-08T00:00:00.000Z" }),
  mkBooking({ id: "bk-0712-a08", ref: "GC-20260712-042", type: "tee_time", resource: COURSE, date: "2026-07-12", time: "14:30", status: "confirmed", channel: "web", member: "gm-030", amount: 2300, paid: 2300, payStatus: "paid", payMethod: "card", createdAt: "2026-07-07T00:00:00.000Z" }),
  mkBooking({ id: "bk-0712-a09", ref: "GC-20260712-043", type: "tee_time", resource: COURSE, date: "2026-07-12", time: "14:50", status: "confirmed", channel: "walk_in", contact: "คุณบุญมี ทองแท้", phone: "080-300-3009", amount: 2300, payStatus: "unpaid", createdAt: "2026-07-12T00:00:00.000Z" }),
];

// ---- เย็น 15:00–16:00 (3/6 booked) — รวม 1 deposit_pending (15:40, ครบ 5 deposit_pending ของวัน) ----
const eveningFillers: GolfBooking[] = [
  mkBooking({ id: "bk-0712-e01", ref: "GC-20260712-044", type: "tee_time", resource: COURSE, date: "2026-07-12", time: "15:00", status: "confirmed", channel: "walk_in", contact: "คุณสายัณห์ ทองอินทร์", phone: "080-400-4001", amount: 2300, paid: 2300, payStatus: "paid", payMethod: "cash", createdAt: "2026-07-12T00:00:00.000Z" }),
  mkBooking({ id: "bk-0712-e02", ref: "GC-20260712-045", type: "tee_time", resource: COURSE, date: "2026-07-12", time: "15:20", status: "confirmed", channel: "web", member: "gm-004", amount: 2300, deposit: 500, paid: 500, payStatus: "deposit_paid", payMethod: "promptpay", createdAt: "2026-07-06T00:00:00.000Z" }),
  mkBooking({ id: "bk-0712-e03", ref: "GC-20260712-046", type: "tee_time", resource: COURSE, date: "2026-07-12", time: "15:40", status: "pending", channel: "line", member: "gm-007", amount: 2900, payStatus: "unpaid", createdAt: "2026-07-12T04:00:00.000Z", notes: "รอชำระมัดจำผ่าน LINE — deposit_pending ตัวที่ 5 ของวัน" }),
];

// ---- ไดร์ฟ (driving_range) 18 booking — bay-01..08,10,11 (bay-09/12 = maintenance) ----
const rangeFillers: GolfBooking[] = [
  mkBooking({ id: "bk-0712-r01", ref: "GC-20260712-R01", type: "driving_range", resource: "res-bay-01", date: "2026-07-12", time: "09:00", endTime: "10:00", status: "completed", channel: "walk_in", contact: "คุณสมปอง ใจสุข", phone: "080-500-5001", amount: 500, paid: 500, payStatus: "paid", payMethod: "cash", bucketQty: 2, bucketPriceId: "bucket-m", items: [{ priceId: "bucket-m", category: "range_bucket", label: "ตะกร้ากลาง 50 ลูก ×2", qty: 2, unitPrice: 150 }], createdAt: "2026-07-12T00:00:00.000Z" }),
  mkBooking({ id: "bk-0712-r02", ref: "GC-20260712-R02", type: "driving_range", resource: "res-bay-02", date: "2026-07-12", time: "09:30", endTime: "10:30", status: "completed", channel: "phone", member: "gm-012", amount: 500, paid: 500, payStatus: "paid", payMethod: "promptpay", bucketQty: 2, bucketPriceId: "bucket-m", createdAt: "2026-07-11T00:00:00.000Z" }),
  mkBooking({ id: "bk-0712-r03", ref: "GC-20260712-R03", type: "driving_range", resource: "res-bay-03", date: "2026-07-12", time: "10:15", endTime: "11:15", status: "checked_in", channel: "walk_in", contact: "คุณละไม สายทอง", phone: "080-500-5003", amount: 500, paid: 500, payStatus: "paid", payMethod: "cash", bucketQty: 2, bucketPriceId: "bucket-m", checkedInAt: "2026-07-12T03:15:00.000Z", createdAt: "2026-07-12T00:00:00.000Z" }),
  mkBooking({ id: "bk-0712-r04", ref: "GC-20260712-R04", type: "driving_range", resource: "res-bay-04", date: "2026-07-12", time: "10:45", endTime: "11:45", status: "checked_in", channel: "web", member: "gm-025", amount: 500, paid: 500, payStatus: "paid", payMethod: "promptpay", bucketQty: 2, bucketPriceId: "bucket-m", checkedInAt: "2026-07-12T03:45:00.000Z", createdAt: "2026-07-10T00:00:00.000Z" }),
  mkBooking({ id: "bk-0712-r05", ref: "GC-20260712-R05", type: "driving_range", resource: "res-bay-05", date: "2026-07-12", time: "11:15", endTime: "12:15", status: "confirmed", channel: "walk_in", contact: "คุณสมนึก ไพรจิตร", phone: "080-500-5005", amount: 500, paid: 500, payStatus: "paid", payMethod: "cash", bucketQty: 2, bucketPriceId: "bucket-m", createdAt: "2026-07-12T00:00:00.000Z" }),
  mkBooking({ id: "bk-0712-r06", ref: "GC-20260712-R06", type: "driving_range", resource: "res-bay-06", date: "2026-07-12", time: "11:45", endTime: "12:45", status: "confirmed", channel: "phone", member: "gm-002", amount: 500, paid: 500, payStatus: "paid", payMethod: "promptpay", bucketQty: 2, bucketPriceId: "bucket-m", createdAt: "2026-07-11T00:00:00.000Z" }),
  mkBooking({ id: "bk-0712-r07", ref: "GC-20260712-R07", type: "driving_range", resource: "res-bay-07", date: "2026-07-12", time: "12:15", endTime: "13:15", status: "confirmed", channel: "walk_in", contact: "คุณอนงค์ ทับทิมทอง", phone: "080-500-5007", amount: 500, paid: 500, payStatus: "paid", payMethod: "cash", bucketQty: 2, bucketPriceId: "bucket-m", createdAt: "2026-07-12T00:00:00.000Z" }),
  mkBooking({ id: "bk-0712-r08", ref: "GC-20260712-R08", type: "driving_range", resource: "res-bay-08", date: "2026-07-12", time: "12:45", endTime: "13:45", status: "confirmed", channel: "web", member: "gm-023", amount: 500, paid: 500, payStatus: "paid", payMethod: "card", bucketQty: 2, bucketPriceId: "bucket-m", createdAt: "2026-07-09T00:00:00.000Z" }),
  mkBooking({ id: "bk-0712-r09", ref: "GC-20260712-R09", type: "driving_range", resource: "res-bay-10", date: "2026-07-12", time: "13:15", endTime: "14:15", status: "pending", channel: "line", member: "gm-034", amount: 500, deposit: 300, paid: 300, payStatus: "deposit_paid", payMethod: "promptpay", bucketQty: 2, bucketPriceId: "bucket-m", createdAt: "2026-07-12T04:15:00.000Z" }),
  mkBooking({ id: "bk-0712-r10", ref: "GC-20260712-R10", type: "driving_range", resource: "res-bay-11", date: "2026-07-12", time: "13:45", endTime: "14:45", status: "confirmed", channel: "walk_in", contact: "คุณประไพ วงศ์สุวรรณ", phone: "080-500-5010", amount: 700, paid: 700, payStatus: "paid", payMethod: "cash", bucketQty: 1, bucketPriceId: "bucket-l", items: [{ priceId: "bucket-l", category: "range_bucket", label: "แพ็กเกจตะกร้าไดร์ฟ (ใหญ่+เล็ก)", qty: 1, unitPrice: 700 }], createdAt: "2026-07-12T00:00:00.000Z" }),
  mkBooking({ id: "bk-0712-r11", ref: "GC-20260712-R11", type: "driving_range", resource: "res-bay-01", date: "2026-07-12", time: "14:15", endTime: "15:15", status: "confirmed", channel: "phone", member: "gm-038", amount: 700, paid: 700, payStatus: "paid", payMethod: "promptpay", bucketQty: 1, bucketPriceId: "bucket-l", createdAt: "2026-07-11T00:00:00.000Z" }),
  mkBooking({ id: "bk-0712-r12", ref: "GC-20260712-R12", type: "driving_range", resource: "res-bay-02", date: "2026-07-12", time: "14:45", endTime: "15:45", status: "confirmed", channel: "walk_in", contact: "คุณสมหวัง บุญยิ่ง", phone: "080-500-5012", amount: 700, paid: 700, payStatus: "paid", payMethod: "cash", bucketQty: 1, bucketPriceId: "bucket-l", createdAt: "2026-07-12T00:00:00.000Z" }),
  mkBooking({ id: "bk-0712-r13", ref: "GC-20260712-R13", type: "driving_range", resource: "res-bay-03", date: "2026-07-12", time: "15:15", endTime: "16:15", status: "confirmed", channel: "web", member: "gm-039", amount: 700, paid: 700, payStatus: "paid", payMethod: "card", bucketQty: 1, bucketPriceId: "bucket-l", createdAt: "2026-07-08T00:00:00.000Z" }),
  mkBooking({ id: "bk-0712-r14", ref: "GC-20260712-R14", type: "driving_range", resource: "res-bay-04", date: "2026-07-12", time: "15:45", endTime: "16:45", status: "confirmed", channel: "walk_in", contact: "คุณวิไลวรรณ ศรีสุวรรณ", phone: "080-500-5014", amount: 700, paid: 700, payStatus: "paid", payMethod: "cash", bucketQty: 1, bucketPriceId: "bucket-l", createdAt: "2026-07-12T00:00:00.000Z" }),
  mkBooking({ id: "bk-0712-r15", ref: "GC-20260712-R15", type: "driving_range", resource: "res-bay-05", date: "2026-07-12", time: "16:15", endTime: "17:15", status: "confirmed", channel: "phone", member: "gm-005", amount: 700, paid: 700, payStatus: "paid", payMethod: "promptpay", bucketQty: 1, bucketPriceId: "bucket-l", createdAt: "2026-07-11T00:00:00.000Z" }),
  mkBooking({ id: "bk-0712-r16", ref: "GC-20260712-R16", type: "driving_range", resource: "res-bay-06", date: "2026-07-12", time: "17:00", endTime: "18:00", status: "confirmed", channel: "walk_in", contact: "คุณสำรอง ทองมี", phone: "080-500-5016", amount: 700, paid: 700, payStatus: "paid", payMethod: "cash", bucketQty: 1, bucketPriceId: "bucket-l", createdAt: "2026-07-12T00:00:00.000Z" }),
  mkBooking({ id: "bk-0712-r17", ref: "GC-20260712-R17", type: "driving_range", resource: "res-bay-07", date: "2026-07-12", time: "18:00", endTime: "19:00", status: "pending", channel: "line", member: "gm-028", amount: 700, deposit: 300, paid: 300, payStatus: "deposit_paid", payMethod: "promptpay", bucketQty: 1, bucketPriceId: "bucket-l", createdAt: "2026-07-12T04:30:00.000Z" }),
  mkBooking({ id: "bk-0712-r18", ref: "GC-20260712-R18", type: "driving_range", resource: "res-bay-08", date: "2026-07-12", time: "19:00", endTime: "20:00", status: "confirmed", channel: "web", member: "gm-010", amount: 700, paid: 700, payStatus: "paid", payMethod: "card", bucketQty: 1, bucketPriceId: "bucket-l", createdAt: "2026-07-07T00:00:00.000Z" }),
];

// ---- พรุ่งนี้ 2026-07-13 (จันทร์) = 12 booking รวม anchor LINE-mock (gm-001) ----
const tomorrow: GolfBooking[] = [
  mkBooking({
    id: "bk-20260713-018",
    ref: "GC-20260713-018",
    type: "tee_time",
    resource: COURSE,
    date: "2026-07-13",
    time: "07:30",
    party: 4,
    caddie: 2,
    cart: 1,
    status: "confirmed",
    channel: "line",
    member: "gm-001",
    amount: 9600,
    deposit: 2000,
    paid: 2000,
    payStatus: "deposit_paid",
    payMethod: "promptpay",
    items: [
      { priceId: "gf-we-morning", category: "green_fee", label: "กรีนฟีสมาชิก 18 หลุม (Gold) ×4", qty: 4, unitPrice: 2050 },
      { priceId: "caddie-fee", category: "caddie", label: "แคดดี้ ×2", qty: 2, unitPrice: 300 },
      { priceId: "cart-fee", category: "cart", label: "รถกอล์ฟ ×1", qty: 1, unitPrice: 800 },
    ],
    notes: "anchor LINE mock (T3 ยืนยันการจอง) — ยอดคงเหลือ 7,600 ฿ ชำระที่เคาน์เตอร์วันเล่น",
    createdAt: "2026-07-11T02:00:00.000Z",
  }),
  mkBooking({ id: "bk-0713-002", ref: "GC-20260713-002", type: "tee_time", resource: COURSE, date: "2026-07-13", time: "06:20", status: "confirmed", channel: "walk_in", contact: "คุณสมพงศ์ เรืองฤทธิ์", phone: "080-600-6002", amount: 1800, deposit: 500, paid: 500, payStatus: "deposit_paid", payMethod: "cash", simpleItem: { priceId: "gf-wd", category: "green_fee", label: "กรีนฟี 18 หลุม (วันธรรมดา)" }, createdAt: "2026-07-12T00:00:00.000Z" }),
  mkBooking({ id: "bk-0713-003", ref: "GC-20260713-003", type: "tee_time", resource: COURSE, date: "2026-07-13", time: "06:40", status: "confirmed", channel: "phone", member: "gm-016", amount: 1620, deposit: 500, paid: 500, payStatus: "deposit_paid", payMethod: "promptpay", simpleItem: { priceId: "gf-wd", category: "green_fee", label: "กรีนฟี 18 หลุม (วันธรรมดา, Silver ลด 10%)" }, createdAt: "2026-07-11T00:00:00.000Z" }),
  mkBooking({ id: "bk-0713-004", ref: "GC-20260713-004", type: "tee_time", resource: COURSE, date: "2026-07-13", time: "07:00", status: "pending", channel: "line", member: "gm-024", amount: 1800, payStatus: "unpaid", simpleItem: { priceId: "gf-wd", category: "green_fee", label: "กรีนฟี 18 หลุม (วันธรรมดา)" }, createdAt: "2026-07-12T05:00:00.000Z" }),
  mkBooking({ id: "bk-0713-005", ref: "GC-20260713-005", type: "tee_time", resource: COURSE, date: "2026-07-13", time: "08:00", status: "confirmed", channel: "walk_in", contact: "คุณอุไรวรรณ ทองพูล", phone: "080-600-6005", amount: 1800, paid: 1800, payStatus: "paid", payMethod: "cash", simpleItem: { priceId: "gf-wd", category: "green_fee", label: "กรีนฟี 18 หลุม (วันธรรมดา)" }, createdAt: "2026-07-12T00:00:00.000Z" }),
  mkBooking({ id: "bk-0713-006", ref: "GC-20260713-006", type: "tee_time", resource: COURSE, date: "2026-07-13", time: "09:20", status: "confirmed", channel: "web", member: "gm-035", amount: 1800, deposit: 500, paid: 500, payStatus: "deposit_paid", payMethod: "card", simpleItem: { priceId: "gf-wd", category: "green_fee", label: "กรีนฟี 18 หลุม (วันธรรมดา)" }, createdAt: "2026-07-10T00:00:00.000Z" }),
  mkBooking({ id: "bk-0713-007", ref: "GC-20260713-007", type: "tee_time", resource: COURSE, date: "2026-07-13", time: "10:40", status: "pending", channel: "line", member: "gm-020", amount: 1800, payStatus: "unpaid", simpleItem: { priceId: "gf-wd", category: "green_fee", label: "กรีนฟี 18 หลุม (วันธรรมดา)" }, notes: "ลูกค้าเคยถูกบล็อกจาก no-show — staff ควรโทรยืนยันก่อน", createdAt: "2026-07-12T05:10:00.000Z" }),
  mkBooking({ id: "bk-0713-008", ref: "GC-20260713-008", type: "tee_time", resource: COURSE, date: "2026-07-13", time: "13:20", status: "confirmed", channel: "phone", member: "gm-032", amount: 1800, paid: 1800, payStatus: "paid", payMethod: "cash", simpleItem: { priceId: "gf-wd", category: "green_fee", label: "กรีนฟี 18 หลุม (วันธรรมดา)" }, createdAt: "2026-07-11T00:00:00.000Z" }),
  mkBooking({ id: "bk-0713-r01", ref: "GC-20260713-R01", type: "driving_range", resource: "res-bay-02", date: "2026-07-13", time: "17:00", endTime: "18:00", status: "confirmed", channel: "walk_in", contact: "คุณสมเจตน์ แก้วใส", phone: "080-600-6008", amount: 500, paid: 500, payStatus: "paid", payMethod: "cash", bucketQty: 2, bucketPriceId: "bucket-m", createdAt: "2026-07-12T00:00:00.000Z" }),
  mkBooking({ id: "bk-0713-r02", ref: "GC-20260713-R02", type: "driving_range", resource: "res-bay-03", date: "2026-07-13", time: "17:00", endTime: "18:00", status: "pending", channel: "line", member: "gm-009", amount: 300, payStatus: "unpaid", bucketQty: 1, bucketPriceId: "bucket-l-eve", simpleItem: { priceId: "bucket-l-eve", category: "range_bucket", label: "ตะกร้าใหญ่ 100 ลูก (ไดร์ฟ เย็น)" }, createdAt: "2026-07-12T05:20:00.000Z" }),
  mkBooking({ id: "bk-0713-r03", ref: "GC-20260713-R03", type: "driving_range", resource: "res-bay-04", date: "2026-07-13", time: "18:00", endTime: "19:00", status: "confirmed", channel: "phone", member: "gm-011", amount: 300, paid: 300, payStatus: "paid", payMethod: "cash", bucketQty: 1, bucketPriceId: "bucket-l-eve", createdAt: "2026-07-11T00:00:00.000Z" }),
  mkBooking({ id: "bk-0713-r04", ref: "GC-20260713-R04", type: "driving_range", resource: "res-bay-06", date: "2026-07-13", time: "18:30", endTime: "19:30", status: "confirmed", channel: "web", member: "gm-036" /* blocked ในสนาม แต่ยังจองไดร์ฟ (bay ไม่บล็อกโดยตรง) */, amount: 300, paid: 300, payStatus: "paid", payMethod: "card", bucketQty: 1, bucketPriceId: "bucket-l-eve", createdAt: "2026-07-10T00:00:00.000Z" }),
];

// ---- 2026-07-15 = anchor /คิวของฉัน (T7 mock) ----
const jul15: GolfBooking[] = [
  mkBooking({
    id: "bk-20260715-006",
    ref: "GC-20260715-006",
    type: "driving_range",
    resource: "res-bay-05",
    date: "2026-07-15",
    time: "18:00",
    endTime: "19:00",
    status: "pending",
    channel: "line",
    member: "gm-001",
    amount: 300,
    payStatus: "unpaid",
    bucketQty: 1,
    bucketPriceId: "bucket-l-eve",
    simpleItem: { priceId: "bucket-l-eve", category: "range_bucket", label: "ตะกร้าใหญ่ 100 ลูก (ไดร์ฟ เย็น)" },
    notes: "anchor /คิวของฉัน (T7) — รอยืนยัน",
    createdAt: "2026-07-12T06:00:00.000Z",
  }),
];

// ---- variety เพิ่มเติม (สัปดาห์ก่อนหน้า) — โชว์ cancelled + statuses อื่นในหน้า Bookings list ----
const pastWeekVariety: GolfBooking[] = [
  mkBooking({ id: "bk-0708-01", ref: "GC-20260708-001", type: "tee_time", resource: COURSE, date: "2026-07-08", time: "07:00", status: "cancelled", channel: "web", contact: "คุณสมนึก ไชยา", phone: "080-700-7001", amount: 1800, deposit: 500, paid: 0, payStatus: "refunded", simpleItem: { priceId: "gf-wd", category: "green_fee", label: "กรีนฟี 18 หลุม (วันธรรมดา)" }, cancelledAt: "2026-07-07T09:00:00.000Z", cancelReason: "ลูกค้าติดธุระกะทันหัน", createdAt: "2026-07-05T00:00:00.000Z" }),
  mkBooking({ id: "bk-0709-01", ref: "GC-20260709-001", type: "tee_time", resource: COURSE, date: "2026-07-09", time: "08:00", status: "completed", channel: "walk_in", contact: "คุณประไพร บุญสม", phone: "080-700-7002", amount: 1800, paid: 1800, payStatus: "paid", payMethod: "cash", simpleItem: { priceId: "gf-wd", category: "green_fee", label: "กรีนฟี 18 หลุม (วันธรรมดา)" }, createdAt: "2026-07-09T00:00:00.000Z" }),
  mkBooking({ id: "bk-0710-01", ref: "GC-20260710-001", type: "driving_range", resource: "res-bay-06", date: "2026-07-10", time: "17:30", endTime: "18:30", status: "cancelled", channel: "line", member: "gm-008", amount: 300, deposit: 0, paid: 0, payStatus: "unpaid", bucketQty: 1, bucketPriceId: "bucket-l-eve", cancelledAt: "2026-07-10T08:00:00.000Z", cancelReason: "ฝนตกหนัก bay เปียก", createdAt: "2026-07-09T00:00:00.000Z" }),
  mkBooking({ id: "bk-0711-01", ref: "GC-20260711-001", type: "tee_time", resource: COURSE, date: "2026-07-11", time: "09:00", status: "completed", channel: "phone", member: "gm-022", amount: 1800, paid: 1800, payStatus: "paid", payMethod: "promptpay", simpleItem: { priceId: "gf-wd", category: "green_fee", label: "กรีนฟี 18 หลุม (วันธรรมดา)" }, createdAt: "2026-07-10T00:00:00.000Z" }),
];

export const golfBookingsToday: GolfBooking[] = [
  ...anchorToday,
  ...morningFillers,
  ...lateMorningFillers,
  ...afternoonFillers,
  ...eveningFillers,
  ...rangeFillers,
];

export const golfBookingsOtherDays: GolfBooking[] = [...tomorrow, ...jul15, ...pastWeekVariety];

export const golfBookings: GolfBooking[] = [...golfBookingsToday, ...golfBookingsOtherDays];

export { ORG as GOLF_ORG_ID };
