// ai-mocks.ts — Mock AI responses (canned, prototype เท่านั้น — ไม่เรียก API จริง)
// ยึด golf-ai-mocks-spec.md (ai-strategist P1) ตรงเป๊ะ — rule คำนวณ signals, AI แค่ "เล่า" (ไม่คิดเลข)
//
// สูตรยืนยันกับ fixture จริง (bookings.ts):
//   วันนี้ = 2026-07-12 (อาทิตย์) — course 1 สนาม tee_interval 10 นาที เปิด 06:00–16:00 → 60 slot/วัน
//   tee_booked วันนี้ = 45 (3 anchor + 15 เช้า + 15 สาย + 9 บ่าย + 3 เย็น = 45) → tee_util_pct = 45/60 = 75%
//   bands: เช้า 17/18=94% · สาย 15/18=83% · บ่าย 10/18=56% · เย็น 3/6=50%
//   range วันนี้ = 18 booking (จาก 12 bay, หลาย time-slot/bay) · range_util_pct = 48 (ให้ตามที่ ai-strategist กำหนด)
//   bookings_today = 45(tee) + 18(range) = 63 · no_show_today = 3 (bk-0712-m02/m04/m06 ช่วงเช้า)
//   revenue_today = Σ total_amount (status≠cancelled) = anchor(5,000+7,500+9,900=22,400)
//     + tee เติม 42 แถว(95,200) + range 18 แถว(10,800) = 128,400 ฿
//   deposit_pending_count = 5 (channel line + pending + unpaid): GC-018, bk-0712-l04(09:40),
//     bk-0712-a01(12:00), bk-0712-a04(12:50), bk-0712-e03(15:40)
//   bookings_tomorrow (2026-07-13) = 12 (ดู bookings.ts `tomorrow`)
import type { GolfBookingStatus, GolfPaymentStatus } from "./types";

// ==================== AI-1 — Occupancy Brief ====================
export interface GolfOccupancyBrief {
  period: string;
  scope: "day" | "week";
  day_label: string;
  input: {
    tee_slots_total: number;
    tee_booked: number;
    tee_util_pct: number;
    range_bays: number;
    range_util_pct: number;
    bookings_today: number;
    bookings_today_tee: number;
    bookings_today_range: number;
    bookings_tomorrow: number;
    no_show_today: number;
    revenue_today: number;
    deposit_pending_count: number;
    bands: { label: string; slots: number; booked: number; util_pct: number }[];
  };
  output: { narration: string; highlights: string[]; recommend: string[]; confidence: number };
}

export const golfBriefToday: GolfOccupancyBrief = {
  period: "2026-07-12",
  scope: "day",
  day_label: "อาทิตย์ (วันหยุด)",
  input: {
    tee_slots_total: 60,
    tee_booked: 45,
    tee_util_pct: 75,
    range_bays: 12,
    range_util_pct: 48,
    bookings_today: 63,
    bookings_today_tee: 45,
    bookings_today_range: 18,
    bookings_tomorrow: 12,
    no_show_today: 3,
    revenue_today: 128400,
    deposit_pending_count: 5,
    bands: [
      { label: "เช้า 06:00–09:00", slots: 18, booked: 17, util_pct: 94 },
      { label: "สาย 09:00–12:00", slots: 18, booked: 15, util_pct: 83 },
      { label: "บ่าย 12:00–15:00", slots: 18, booked: 10, util_pct: 56 },
      { label: "เย็น 15:00–16:00", slots: 6, booked: 3, util_pct: 50 },
    ],
  },
  output: {
    narration:
      "วันอาทิตย์นี้สนามกอล์ฟจองแล้ว 75% (45/60 ช่อง) รายได้วันนี้ 128,400 ฿ ช่วงเช้า 06:00–09:00 เกือบเต็ม (94%) เป็นพีคของวัน ขณะที่ช่วงบ่าย 12:00–15:00 ยังว่างถึง 44% (เหลือ 8 ช่อง) สนามไดร์ฟใช้งาน 48% ยังรับได้อีกมาก มีจอง LINE รอชำระมัดจำ 5 ราย และวันจันทร์พรุ่งนี้จองล่วงหน้าเพียง 12 ราย ควรกระตุ้นดีมานด์วันธรรมดา",
    highlights: [
      "สนามกอล์ฟจอง 75% (45/60) · พีคเช้า 06:00–09:00 เต็ม 94%",
      "บ่าย 12:00–15:00 ว่าง 8 ช่อง (44%) — โอกาสขายเพิ่ม",
      "รายได้วันนี้ 128,400 ฿ · ไดร์ฟใช้งานแค่ 48%",
      "จอง LINE รอชำระมัดจำ 5 ราย · จันทร์พรุ่งนี้จองล่วงหน้าแค่ 12",
    ],
    recommend: [
      "เปิดโปร Twilight ลดกรีนฟีช่วงบ่าย 12:00–15:00 (ว่าง 8 ช่อง) ดึงนักกอล์ฟหลังมื้อเที่ยง",
      "ดันแพ็กเกจตะกร้าลูกไดร์ฟช่วงบ่าย–เย็น เพราะ bay ว่างเกินครึ่ง",
      "ตามจอง LINE 5 รายที่ค้างมัดจำให้ยืนยัน ลดความเสี่ยงหลุดช่องพีค",
      "จันทร์จองน้อย (12) — ยิงดีลวันธรรมดา/ราคาสมาชิกทาง LINE ล่วงหน้า",
    ],
    confidence: 0.9,
  },
};

export const golfBriefWeek: GolfOccupancyBrief = {
  period: "2026-07-06_2026-07-12",
  scope: "week",
  day_label: "6–12 ก.ค. 2569",
  input: {
    tee_slots_total: 420,
    tee_booked: 231,
    tee_util_pct: 55,
    range_bays: 12,
    range_util_pct: 41,
    bookings_today: 63,
    bookings_today_tee: 45,
    bookings_today_range: 18,
    bookings_tomorrow: 12,
    no_show_today: 3,
    revenue_today: 128400,
    deposit_pending_count: 5,
    bands: [
      { label: "จ–ศ (วันธรรมดา)", slots: 300, booked: 138, util_pct: 46 },
      { label: "ส–อา (วันหยุด)", slots: 120, booked: 93, util_pct: 78 },
    ],
  },
  output: {
    narration:
      "สัปดาห์นี้สนามกอล์ฟใช้งานเฉลี่ย 55% แต่แยกชัดเป็น 2 โลก — วันหยุด (ส–อา) แน่น 78% ส่วนวันธรรมดา (จ–ศ) เพียง 46% ช่องว่างเกือบทั้งหมดกระจุกวันธรรมดา สนามไดร์ฟทั้งสัปดาห์ 41% รายได้พีควันอาทิตย์ 128,400 ฿ กลยุทธ์ควรโฟกัสเติมช่องวันธรรมดามากกว่าวันหยุดที่เต็มอยู่แล้ว",
    highlights: [
      "utilization เฉลี่ย 55% · วันหยุด 78% vs วันธรรมดา 46%",
      "ช่องว่างกระจุกวันธรรมดา (จ–ศ) — เป้าหลักของโปรฯ",
      "สนามไดร์ฟ 41% ทั้งสัปดาห์ ยังโตได้อีกมาก",
    ],
    recommend: [
      "แพ็กเกจ Weekday Unlimited / กรีนฟีสมาชิกวันธรรมดา ดึงคนวันจ–ศ",
      "จับมือกลุ่มบริษัท/ออกรอบหมู่คณะช่วงวันธรรมดา",
      "โปรตะกร้าไดร์ฟชั่วโมงเร่งด่วนเย็นวันธรรมดา เพิ่ม bay utilization",
    ],
    confidence: 0.87,
  },
};

// ==================== AI-2 — No-show Risk Guard ====================
export interface GolfNoShowRisk {
  booking_ref: string;
  member_id: string | null;
  member_name: string;
  input: {
    risk_level: "high" | "medium" | "low";
    no_show_count: number;
    no_show_rate_pct: number;
    total_bookings: number;
    channel: string;
    payment_status: GolfPaymentStatus;
    booking_status: GolfBookingStatus;
    slot_label: string;
    band_util_pct: number;
  };
  output: { risk_level: "high" | "medium" | "low"; reason: string; suggest: string[]; confidence: number };
}

export const golfRiskHigh: GolfNoShowRisk = {
  booking_ref: "GC-20260712-018",
  member_id: "gm-014",
  member_name: "คุณวีรพงษ์ ศรีสมบัติ",
  input: {
    risk_level: "high",
    no_show_count: 4,
    no_show_rate_pct: 33,
    total_bookings: 12,
    channel: "line",
    payment_status: "unpaid",
    booking_status: "pending",
    slot_label: "อา. 07:20 (ช่วงพีคเช้า)",
    band_util_pct: 94,
  },
  output: {
    risk_level: "high",
    reason:
      "ลูกค้ารายนี้ไม่มาตามนัด 4 ครั้งจาก 12 ครั้ง (อัตรา no-show 33%) จองผ่าน LINE ยังไม่ยืนยันและยังไม่ชำระมัดจำ อีกทั้งเป็นช่วงเช้าพีค (เต็ม 94%) หากหลุดจะเสียช่องที่ขายต่อได้ยาก — ความเสี่ยงสูง",
    suggest: [
      "ขอมัดจำก่อนยืนยันคิว (เช่น 50% ของกรีนฟี) ผ่าน LINE",
      "ส่งข้อความยืนยันซ้ำ ให้กดยืนยันภายในวันนี้ ไม่งั้นปล่อยช่องคืน",
      "เตรียม waitlist ช่วงเช้าไว้แทนหากไม่ยืนยัน",
    ],
    confidence: 0.86,
  },
};

export const golfRiskMedium: GolfNoShowRisk = {
  booking_ref: "GC-20260712-031",
  member_id: "gm-027",
  member_name: "คุณสุกัญญา ทองใบ",
  input: {
    risk_level: "medium",
    no_show_count: 1,
    no_show_rate_pct: 12,
    total_bookings: 8,
    channel: "web",
    payment_status: "deposit_paid",
    booking_status: "pending",
    slot_label: "อา. 13:40 (ช่วงบ่าย)",
    band_util_pct: 56,
  },
  output: {
    risk_level: "medium",
    reason:
      "มีประวัติ no-show 1 ครั้งจาก 8 (12%) จองผ่านเว็บและชำระมัดจำแล้วซึ่งช่วยลดความเสี่ยง แต่คิวยังไม่ยืนยันและเป็นช่วงบ่ายที่ดีมานด์ปานกลาง — เสี่ยงระดับกลาง",
    suggest: [
      "ส่งเตือนยืนยันคิวก่อนถึงวันเล่นตามปกติ",
      "ถ้าไม่ยืนยันภายในคืนนี้ ค่อยติดตามทาง LINE",
    ],
    confidence: 0.8,
  },
};

export const golfRiskLow: GolfNoShowRisk = {
  booking_ref: "GC-20260712-009",
  member_id: "gm-003",
  member_name: "คุณธนกฤต วัฒนชัย (Gold)",
  input: {
    risk_level: "low",
    no_show_count: 0,
    no_show_rate_pct: 0,
    total_bookings: 24,
    channel: "line",
    payment_status: "paid",
    booking_status: "confirmed",
    slot_label: "อา. 08:10 (พีคเช้า)",
    band_util_pct: 94,
  },
  output: {
    risk_level: "low",
    reason:
      "สมาชิกระดับ Gold ออกรอบสม่ำเสมอ 24 ครั้ง ไม่เคย no-show ชำระเต็มและยืนยันคิวแล้ว — ความเสี่ยงต่ำมาก",
    suggest: ["ไม่ต้องดำเนินการเพิ่ม — พร้อมต้อนรับตามคิว"],
    confidence: 0.92,
  },
};

// ==================== AI-3 — Dynamic Pricing Suggestion (beta, teaser) ====================
export interface GolfPricingSuggestion {
  period: string;
  scope: "day" | "week";
  input: {
    items: {
      key: string;
      label: string;
      day_type: string;
      band: string;
      current_price: number;
      util_pct: number;
      signal: "high_demand" | "low_demand";
      suggested_price: number;
      delta_pct: number;
    }[];
  };
  output: { narration: string; suggestions: string[]; confidence: number; disclaimer: string };
}

export const golfPricingSuggestion: GolfPricingSuggestion = {
  period: "2026-07-12",
  scope: "week",
  input: {
    items: [
      {
        key: "gf-we-morning",
        label: "กรีนฟี 18 หลุม (วันหยุด เช้า)",
        day_type: "weekend",
        band: "06:00–09:00",
        current_price: 2500,
        util_pct: 94,
        signal: "high_demand",
        suggested_price: 2800,
        delta_pct: 12,
      },
      {
        key: "gf-we-noon",
        label: "กรีนฟี 18 หลุม (วันหยุด บ่าย)",
        day_type: "weekend",
        band: "12:00–15:00",
        current_price: 2500,
        util_pct: 56,
        signal: "low_demand",
        suggested_price: 1990,
        delta_pct: -20,
      },
      {
        key: "gf-wd",
        label: "กรีนฟี 18 หลุม (วันธรรมดา)",
        day_type: "weekday",
        band: "ทั้งวัน",
        current_price: 1800,
        util_pct: 46,
        signal: "low_demand",
        suggested_price: 1490,
        delta_pct: -17,
      },
      {
        key: "bucket-l-eve",
        label: "ตะกร้าใหญ่ 100 ลูก (ไดร์ฟ เย็น)",
        day_type: "weekday",
        band: "17:00–20:00",
        current_price: 300,
        util_pct: 41,
        signal: "low_demand",
        suggested_price: 250,
        delta_pct: -17,
      },
    ],
  },
  output: {
    narration:
      "จากอัตราการใช้สนามรอบสัปดาห์ที่ผ่านมา ช่วงเช้าวันหยุด (06:00–09:00) เต็มถึง 94% สะท้อนดีมานด์เกินราคาปัจจุบัน สามารถขยับกรีนฟีขึ้นได้ ขณะที่ช่วงบ่ายวันหยุดและทั้งวันธรรมดายังว่างมาก การลดราคาแบบมีกรอบเวลาจะช่วยเติมช่องว่างและเพิ่มรายได้รวม",
    suggestions: [
      "ขึ้นกรีนฟีเช้าวันหยุดเป็น 2,800 ฿ (+12%) — ดีมานด์เต็ม 94% รองรับได้",
      "ตั้งราคา Twilight บ่ายวันหยุด 1,990 ฿ (−20%) เติมช่วงว่าง 12:00–15:00",
      "ดีลกรีนฟีวันธรรมดา 1,490 ฿ (−17%) ดึงคนวันจ–ศ ที่ใช้แค่ 46%",
      "ลดตะกร้าใหญ่ไดร์ฟช่วงเย็นเป็น 250 ฿ กระตุ้น bay ว่าง",
    ],
    confidence: 0.78,
    disclaimer: "คำแนะนำเชิงกลยุทธ์ — ทบทวนกับต้นทุน/นโยบายก่อนปรับใช้จริง",
  },
};
