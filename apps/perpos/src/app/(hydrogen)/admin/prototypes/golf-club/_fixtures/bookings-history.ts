// bookings-history.ts — ประวัติการจองย้อนหลังของ 3 anchor member (AI-2 riskHigh/Medium/Low)
// ให้ total_bookings + no_show นับจากแถวจริงตรงกับ ai-mocks.ts เป๊ะ (ไม่ใช่เลขลอย):
//   gm-014 คุณวีรพงษ์: ประวัติ 11 แถว (4 no_show + 6 completed + 1 cancelled) + anchor วันนี้(pending) = 12 total, 4 no_show
//   gm-027 คุณสุกัญญา: ประวัติ 7 แถว (1 no_show + 6 completed) + anchor วันนี้(pending) = 8 total, 1 no_show
//   gm-003 คุณธนกฤต:  ประวัติ 23 แถว (20 completed + 2 cancelled + 1 confirmed อนาคต) + anchor วันนี้(confirmed) = 24 total, 0 no_show
// เพื่อประหยัดพื้นที่ ใช้ item เดียว (กรีนฟีต่อคน) ต่อแถว — ไม่ได้ใส่แคดดี้/รถทุกครั้งเหมือน anchor จริง
import { mkBooking } from "./_booking-factory";
import type { GolfBooking } from "./types";

const COURSE = "res-course-a";

// ---- gm-014 คุณวีรพงษ์ ศรีสมบัติ (11 แถว) ----
export const golfBookingsHistoryGm014: GolfBooking[] = [
  mkBooking({ id: "bkh-014-01", ref: "GC-20260208-090", type: "tee_time", resource: COURSE, date: "2026-02-08", time: "07:00", status: "no_show", channel: "line", member: "gm-014", amount: 2500, deposit: 500, paid: 500, payStatus: "deposit_paid", payMethod: "promptpay", createdAt: "2026-02-05T00:00:00.000Z" }),
  mkBooking({ id: "bkh-014-02", ref: "GC-20260301-090", type: "tee_time", resource: COURSE, date: "2026-03-01", time: "08:00", status: "completed", channel: "walk_in", member: "gm-014", amount: 2500, paid: 2500, payStatus: "paid", payMethod: "cash", createdAt: "2026-03-01T00:00:00.000Z" }),
  mkBooking({ id: "bkh-014-03", ref: "GC-20260322-090", type: "tee_time", resource: COURSE, date: "2026-03-22", time: "09:00", status: "no_show", channel: "line", member: "gm-014", amount: 2500, payStatus: "unpaid", createdAt: "2026-03-19T00:00:00.000Z" }),
  mkBooking({ id: "bkh-014-04", ref: "GC-20260405-090", type: "tee_time", resource: COURSE, date: "2026-04-05", time: "07:30", status: "completed", channel: "phone", member: "gm-014", amount: 2500, paid: 2500, payStatus: "paid", payMethod: "cash", createdAt: "2026-04-04T00:00:00.000Z" }),
  mkBooking({ id: "bkh-014-05", ref: "GC-20260419-090", type: "tee_time", resource: COURSE, date: "2026-04-19", time: "10:00", status: "completed", channel: "walk_in", member: "gm-014", amount: 2500, paid: 2500, payStatus: "paid", payMethod: "cash", createdAt: "2026-04-19T00:00:00.000Z" }),
  mkBooking({ id: "bkh-014-06", ref: "GC-20260503-090", type: "tee_time", resource: COURSE, date: "2026-05-03", time: "06:30", status: "no_show", channel: "line", member: "gm-014", amount: 2500, deposit: 500, paid: 500, payStatus: "deposit_paid", payMethod: "promptpay", createdAt: "2026-04-30T00:00:00.000Z" }),
  mkBooking({ id: "bkh-014-07", ref: "GC-20260517-090", type: "tee_time", resource: COURSE, date: "2026-05-17", time: "08:30", status: "completed", channel: "phone", member: "gm-014", amount: 2500, paid: 2500, payStatus: "paid", payMethod: "cash", createdAt: "2026-05-16T00:00:00.000Z" }),
  mkBooking({ id: "bkh-014-08", ref: "GC-20260531-090", type: "tee_time", resource: COURSE, date: "2026-05-31", time: "07:00", status: "cancelled", channel: "line", member: "gm-014", amount: 2500, deposit: 500, paid: 0, payStatus: "refunded", cancelledAt: "2026-05-29T00:00:00.000Z", cancelReason: "ลูกค้าขอยกเลิกเอง", createdAt: "2026-05-27T00:00:00.000Z" }),
  mkBooking({ id: "bkh-014-09", ref: "GC-20260607-090", type: "tee_time", resource: COURSE, date: "2026-06-07", time: "09:30", status: "completed", channel: "walk_in", member: "gm-014", amount: 2500, paid: 2500, payStatus: "paid", payMethod: "cash", createdAt: "2026-06-07T00:00:00.000Z" }),
  mkBooking({ id: "bkh-014-10", ref: "GC-20260621-090", type: "tee_time", resource: COURSE, date: "2026-06-21", time: "06:40", status: "no_show", channel: "line", member: "gm-014", amount: 2500, payStatus: "unpaid", createdAt: "2026-06-18T00:00:00.000Z" }),
  mkBooking({ id: "bkh-014-11", ref: "GC-20260628-090", type: "tee_time", resource: COURSE, date: "2026-06-28", time: "08:00", status: "completed", channel: "phone", member: "gm-014", amount: 2500, paid: 2500, payStatus: "paid", payMethod: "cash", createdAt: "2026-06-27T00:00:00.000Z" }),
];

// ---- gm-027 คุณสุกัญญา ทองใบ (7 แถว) ----
export const golfBookingsHistoryGm027: GolfBooking[] = [
  mkBooking({ id: "bkh-027-01", ref: "GC-20260214-091", type: "tee_time", resource: COURSE, date: "2026-02-14", time: "10:00", status: "completed", channel: "web", member: "gm-027", amount: 2500, paid: 2500, payStatus: "paid", payMethod: "promptpay", createdAt: "2026-02-13T00:00:00.000Z" }),
  mkBooking({ id: "bkh-027-02", ref: "GC-20260308-091", type: "tee_time", resource: COURSE, date: "2026-03-08", time: "11:00", status: "no_show", channel: "web", member: "gm-027", amount: 2500, deposit: 500, paid: 500, payStatus: "deposit_paid", payMethod: "promptpay", createdAt: "2026-03-06T00:00:00.000Z" }),
  mkBooking({ id: "bkh-027-03", ref: "GC-20260329-091", type: "tee_time", resource: COURSE, date: "2026-03-29", time: "09:00", status: "completed", channel: "web", member: "gm-027", amount: 2500, paid: 2500, payStatus: "paid", payMethod: "card", createdAt: "2026-03-28T00:00:00.000Z" }),
  mkBooking({ id: "bkh-027-04", ref: "GC-20260412-091", type: "tee_time", resource: COURSE, date: "2026-04-12", time: "13:00", status: "completed", channel: "phone", member: "gm-027", amount: 2500, paid: 2500, payStatus: "paid", payMethod: "cash", createdAt: "2026-04-11T00:00:00.000Z" }),
  mkBooking({ id: "bkh-027-05", ref: "GC-20260426-091", type: "tee_time", resource: COURSE, date: "2026-04-26", time: "14:00", status: "completed", channel: "web", member: "gm-027", amount: 2500, deposit: 500, paid: 2500, payStatus: "paid", payMethod: "promptpay", createdAt: "2026-04-25T00:00:00.000Z" }),
  mkBooking({ id: "bkh-027-06", ref: "GC-20260510-091", type: "tee_time", resource: COURSE, date: "2026-05-10", time: "10:30", status: "completed", channel: "walk_in", member: "gm-027", amount: 2500, paid: 2500, payStatus: "paid", payMethod: "cash", createdAt: "2026-05-10T00:00:00.000Z" }),
  mkBooking({ id: "bkh-027-07", ref: "GC-20260524-091", type: "tee_time", resource: COURSE, date: "2026-05-24", time: "12:00", status: "completed", channel: "web", member: "gm-027", amount: 2500, paid: 2500, payStatus: "paid", payMethod: "promptpay", createdAt: "2026-05-23T00:00:00.000Z" }),
];

// ---- gm-003 คุณธนกฤต วัฒนชัย (23 แถว — Gold ลด 15% จาก 2,500 = 2,125) ----
export const golfBookingsHistoryGm003: GolfBooking[] = [
  mkBooking({ id: "bkh-003-01", ref: "GC-20260104-092", type: "tee_time", resource: COURSE, date: "2026-01-04", time: "07:00", status: "completed", channel: "line", member: "gm-003", amount: 2125, paid: 2125, payStatus: "paid", payMethod: "promptpay", createdAt: "2026-01-03T00:00:00.000Z" }),
  mkBooking({ id: "bkh-003-02", ref: "GC-20260118-092", type: "tee_time", resource: COURSE, date: "2026-01-18", time: "08:00", status: "completed", channel: "line", member: "gm-003", amount: 2125, paid: 2125, payStatus: "paid", payMethod: "promptpay", createdAt: "2026-01-17T00:00:00.000Z" }),
  mkBooking({ id: "bkh-003-03", ref: "GC-20260201-092", type: "tee_time", resource: COURSE, date: "2026-02-01", time: "07:30", status: "completed", channel: "line", member: "gm-003", amount: 2125, paid: 2125, payStatus: "paid", payMethod: "promptpay", createdAt: "2026-01-31T00:00:00.000Z" }),
  mkBooking({ id: "bkh-003-04", ref: "GC-20260208-092", type: "tee_time", resource: COURSE, date: "2026-02-08", time: "09:00", status: "completed", channel: "walk_in", member: "gm-003", amount: 2125, paid: 2125, payStatus: "paid", payMethod: "cash", createdAt: "2026-02-08T00:00:00.000Z" }),
  mkBooking({ id: "bkh-003-05", ref: "GC-20260215-092", type: "tee_time", resource: COURSE, date: "2026-02-15", time: "07:00", status: "cancelled", channel: "line", member: "gm-003", amount: 2125, deposit: 0, paid: 0, payStatus: "unpaid", cancelledAt: "2026-02-13T00:00:00.000Z", cancelReason: "สนามปิดปรับปรุงหลุม 7", createdAt: "2026-02-12T00:00:00.000Z" }),
  mkBooking({ id: "bkh-003-06", ref: "GC-20260222-092", type: "tee_time", resource: COURSE, date: "2026-02-22", time: "08:30", status: "completed", channel: "line", member: "gm-003", amount: 2125, paid: 2125, payStatus: "paid", payMethod: "promptpay", createdAt: "2026-02-21T00:00:00.000Z" }),
  mkBooking({ id: "bkh-003-07", ref: "GC-20260301-092", type: "tee_time", resource: COURSE, date: "2026-03-01", time: "07:00", status: "completed", channel: "line", member: "gm-003", amount: 2125, paid: 2125, payStatus: "paid", payMethod: "promptpay", createdAt: "2026-02-28T00:00:00.000Z" }),
  mkBooking({ id: "bkh-003-08", ref: "GC-20260308-092", type: "tee_time", resource: COURSE, date: "2026-03-08", time: "10:00", status: "completed", channel: "walk_in", member: "gm-003", amount: 2125, paid: 2125, payStatus: "paid", payMethod: "cash", createdAt: "2026-03-08T00:00:00.000Z" }),
  mkBooking({ id: "bkh-003-09", ref: "GC-20260315-092", type: "tee_time", resource: COURSE, date: "2026-03-15", time: "07:30", status: "completed", channel: "line", member: "gm-003", amount: 2125, paid: 2125, payStatus: "paid", payMethod: "promptpay", createdAt: "2026-03-14T00:00:00.000Z" }),
  mkBooking({ id: "bkh-003-10", ref: "GC-20260322-092", type: "tee_time", resource: COURSE, date: "2026-03-22", time: "08:00", status: "completed", channel: "line", member: "gm-003", amount: 2125, paid: 2125, payStatus: "paid", payMethod: "promptpay", createdAt: "2026-03-21T00:00:00.000Z" }),
  mkBooking({ id: "bkh-003-11", ref: "GC-20260329-092", type: "tee_time", resource: COURSE, date: "2026-03-29", time: "09:00", status: "completed", channel: "walk_in", member: "gm-003", amount: 2125, paid: 2125, payStatus: "paid", payMethod: "cash", createdAt: "2026-03-29T00:00:00.000Z" }),
  mkBooking({ id: "bkh-003-12", ref: "GC-20260405-092", type: "tee_time", resource: COURSE, date: "2026-04-05", time: "07:00", status: "completed", channel: "line", member: "gm-003", amount: 2125, paid: 2125, payStatus: "paid", payMethod: "promptpay", createdAt: "2026-04-04T00:00:00.000Z" }),
  mkBooking({ id: "bkh-003-13", ref: "GC-20260412-092", type: "tee_time", resource: COURSE, date: "2026-04-12", time: "08:30", status: "completed", channel: "line", member: "gm-003", amount: 2125, paid: 2125, payStatus: "paid", payMethod: "promptpay", createdAt: "2026-04-11T00:00:00.000Z" }),
  mkBooking({ id: "bkh-003-14", ref: "GC-20260419-092", type: "tee_time", resource: COURSE, date: "2026-04-19", time: "07:30", status: "cancelled", channel: "line", member: "gm-003", amount: 2125, deposit: 0, paid: 0, payStatus: "unpaid", cancelledAt: "2026-04-17T00:00:00.000Z", cancelReason: "ลูกค้าติดธุระด่วน", createdAt: "2026-04-16T00:00:00.000Z" }),
  mkBooking({ id: "bkh-003-15", ref: "GC-20260426-092", type: "tee_time", resource: COURSE, date: "2026-04-26", time: "09:00", status: "completed", channel: "walk_in", member: "gm-003", amount: 2125, paid: 2125, payStatus: "paid", payMethod: "cash", createdAt: "2026-04-26T00:00:00.000Z" }),
  mkBooking({ id: "bkh-003-16", ref: "GC-20260503-092", type: "tee_time", resource: COURSE, date: "2026-05-03", time: "07:00", status: "completed", channel: "line", member: "gm-003", amount: 2125, paid: 2125, payStatus: "paid", payMethod: "promptpay", createdAt: "2026-05-02T00:00:00.000Z" }),
  mkBooking({ id: "bkh-003-17", ref: "GC-20260510-092", type: "tee_time", resource: COURSE, date: "2026-05-10", time: "08:00", status: "completed", channel: "line", member: "gm-003", amount: 2125, paid: 2125, payStatus: "paid", payMethod: "promptpay", createdAt: "2026-05-09T00:00:00.000Z" }),
  mkBooking({ id: "bkh-003-18", ref: "GC-20260517-092", type: "tee_time", resource: COURSE, date: "2026-05-17", time: "07:30", status: "completed", channel: "walk_in", member: "gm-003", amount: 2125, paid: 2125, payStatus: "paid", payMethod: "cash", createdAt: "2026-05-17T00:00:00.000Z" }),
  mkBooking({ id: "bkh-003-19", ref: "GC-20260524-092", type: "tee_time", resource: COURSE, date: "2026-05-24", time: "09:00", status: "completed", channel: "line", member: "gm-003", amount: 2125, paid: 2125, payStatus: "paid", payMethod: "promptpay", createdAt: "2026-05-23T00:00:00.000Z" }),
  mkBooking({ id: "bkh-003-20", ref: "GC-20260531-092", type: "tee_time", resource: COURSE, date: "2026-05-31", time: "08:00", status: "completed", channel: "line", member: "gm-003", amount: 2125, paid: 2125, payStatus: "paid", payMethod: "promptpay", createdAt: "2026-05-30T00:00:00.000Z" }),
  mkBooking({ id: "bkh-003-21", ref: "GC-20260607-092", type: "tee_time", resource: COURSE, date: "2026-06-07", time: "07:00", status: "completed", channel: "walk_in", member: "gm-003", amount: 2125, paid: 2125, payStatus: "paid", payMethod: "cash", createdAt: "2026-06-07T00:00:00.000Z" }),
  mkBooking({ id: "bkh-003-22", ref: "GC-20260614-092", type: "tee_time", resource: COURSE, date: "2026-06-14", time: "08:30", status: "completed", channel: "line", member: "gm-003", amount: 2125, paid: 2125, payStatus: "paid", payMethod: "promptpay", createdAt: "2026-06-13T00:00:00.000Z" }),
  mkBooking({ id: "bkh-003-23", ref: "GC-20260719-092", type: "tee_time", resource: COURSE, date: "2026-07-19", time: "07:30", status: "confirmed", channel: "line", member: "gm-003", amount: 2125, deposit: 0, paid: 2125, payStatus: "paid", payMethod: "promptpay", createdAt: "2026-07-11T00:00:00.000Z", notes: "จองล่วงหน้ารอบถัดไป" }),
];

export const golfBookingsHistory: GolfBooking[] = [
  ...golfBookingsHistoryGm014,
  ...golfBookingsHistoryGm027,
  ...golfBookingsHistoryGm003,
];
