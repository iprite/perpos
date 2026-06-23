// ai-mocks.ts — canned H1 AI summary responses (mock เท่านั้น ไม่เรียก API จริง)
// ตัวเลขทุกตัวตรงกับ fixture ที่คำนวณได้จริง (ห้ามแต่งเลข)
//
// สูตรคำนวณ (ยืนยันกับ fixture rooms.ts / bookings.ts / payments.ts):
//   วันนี้ = 2026-06-23
//   ห้องทั้งหมด = 24 · maintenance = A108(1) · out_of_service = C305(1)
//   ห้องขายได้ (sellable) = 24 − 1 − 1 = 22
//   occupied: A101,A102,A103,A107,A110,V201,V202,V204,V207,V208,C301 = 11 ห้อง
//   reserved: A104,V203,C306 = 3 ห้อง
//   rooms_occupied (occupied+reserved) = 11 + 3 = 14
//   available = A105,A106,A109,V205,V206,C302,C303,C304 = 8 ห้อง
//   occupancy = 14/22 = 63.6% → Math.round = 64%
//   ADR = ค่าห้อง 11 ห้อง occupied = (1200×5 + 1800×4 + 1600 + 3500) / 11 = 18,300/11 ≈ 1,664 ฿
//   RevPAR = Math.round(1664 × 0.64) = 1,065 ฿
//   รายได้วันนี้ = sum payments paid_at 2026-06-23 kind!=refund:
//     pay-012-1(2100) + pay-013-1(3600) + pay-015-1(600) + pay-022-2(5500) + pay-023-1(1200) + pay-024-1(3600) = 16,600 ฿
//   ค้างชำระ = 11 booking, 49,000 ฿ (bk-0002:2800 + bk-0003:8500 + bk-0005:6000 + bk-0006:4500
//     + bk-0008:1200 + bk-0009:2700 + bk-0010:5400 + bk-0011:3200 + bk-0013:3600 + bk-0014:10500 + bk-0015:600)
//   เช็คอินวันนี้ = reserved + check_in_date=2026-06-23 = bk-0013(Sarah/V203), bk-0014(Chen/C306), bk-0015(อนุชา/A104) = 3
//   เช็คเอาท์วันนี้ = checked_in + check_out_date=2026-06-23 = bk-0001(สมชาย/V207), bk-0007(สุนิสา/A103), bk-0012(สมศักดิ์hourly/A109) = 3
//   revenue by source วันนี้ (จาก payments paid_at 2026-06-23):
//     agoda: pay-013-1(3600) = 3,600
//     credit_card (bk-0022 website): pay-022-2(5500) = 5,500
//     walk_in: pay-012-1(2100 bk-0012) + pay-015-1(600 bk-0015) + pay-023-1(1200 bk-0023) + pay-024-1(3600 bk-0024) = 7,500
//     รวม = 16,600 — simplified groups: agoda=3,600 walk_in=7,500 website=5,500
//   revenue by room type วันนี้: A=3,900(bk-0012/0015/0023), V=5,600(bk-0024), C=7,100(bk-0013+0022-part)

export interface H1AiSummary {
  period: string; // "2026-06-23" หรือ "2026-06" etc.
  scope: "day" | "month";
  // input context (ส่งให้ AI — เพื่อให้ ui แสดง input ด้วยได้)
  input: {
    occupancy_pct: number;
    occupancy_avg_7d_pct: number;
    rooms_total: number;
    rooms_occupied: number;
    rooms_available: number;
    rooms_maintenance: number;
    adr: number;
    revpar: number;
    revenue: number;
    revenue_by_source: { source: string; label: string; amount: number }[];
    revenue_by_room_type: { type: string; label: string; amount: number }[];
    outstanding_count: number;
    outstanding_total: number;
    checkins_today: number;
    checkouts_today: number;
  };
  // output จาก AI (canned)
  output: {
    headline: string;
    summary: string;
    highlights: string[];
    suggestions: string[];
    confidence: number;
  };
}

// ---- ชุดที่ 1: สรุปรายวัน วันนี้ (23 มิ.ย. 2569) ----
export const aiSummaryToday: H1AiSummary = {
  period: "2026-06-23",
  scope: "day",
  input: {
    occupancy_pct: 64, // Math.round(14/22 × 100) = 64
    occupancy_avg_7d_pct: 58,
    rooms_total: 22, // sellable = 24 − maint.1 − oos.1
    rooms_occupied: 14, // occupied(11) + reserved(3) = 14
    rooms_available: 8, // A105,A106,A109,V205,V206,C302,C303,C304
    rooms_maintenance: 2, // A108(maintenance) + C305(out_of_service)
    adr: 1664, // 18,300 / 11 occupied rooms
    revpar: 1065, // Math.round(1664 × 0.64)
    revenue: 16600, // sum paid_at 2026-06-23 kind!=refund
    revenue_by_source: [
      { source: "walk_in", label: "Walk-in", amount: 7500 },
      { source: "website", label: "เว็บไซต์/บัตร", amount: 5500 },
      { source: "agoda", label: "Agoda", amount: 3600 },
    ],
    revenue_by_room_type: [
      { type: "C", label: "C (Suite)", amount: 7100 },
      { type: "V", label: "V (Deluxe)", amount: 5600 },
      { type: "A", label: "A (Standard)", amount: 3900 },
    ],
    outstanding_count: 11,
    outstanding_total: 49000,
    checkins_today: 3, // reserved + check_in_date=2026-06-23 (bk-0013,0014,0015)
    checkouts_today: 3, // checked_in + check_out_date=2026-06-23 (bk-0001,0007,0012)
  },
  output: {
    headline: "วันนี้ occupancy 64% มีเช็คอิน 3 ราย รายได้รวม 16,600 ฿",
    summary:
      "วันนี้โรงแรมมีอัตราเข้าพัก 64% (14/22 ห้อง) สูงกว่าค่าเฉลี่ย 7 วันที่ผ่านมา 6 เปอร์เซ็นต์ รายได้รวม 16,600 ฿ โดยช่องทาง Walk-in นำรายได้สูงสุด 7,500 ฿ คิดเป็น 45% ตามด้วยชำระผ่านบัตร (bk-0022) 5,500 ฿ และ Agoda 3,600 ฿ ADR อยู่ที่ 1,664 ฿ RevPAR 1,065 ฿ มีค้างชำระ 11 booking รวม 49,000 ฿ ที่ควรติดตาม",
    highlights: [
      "occupancy 64% (14/22 ห้อง) สูงกว่าค่าเฉลี่ย 7 วัน 6%",
      "รายได้วันนี้รวม 16,600 ฿ · Walk-in นำ 45%",
      "ห้อง C (Suite) สร้างรายได้สูงสุดวันนี้ 7,100 ฿",
      "มีเช็คอินใหม่ 3 ราย เช็คเอาท์ 3 ราย",
    ],
    suggestions: [
      "ห้อง C (Suite) มีเพียง 1/5 ห้องที่ขายได้ — พิจารณาแพ็กเกจหรือโปรโมชันสำหรับวันธรรมดา",
      "ค้างชำระ 49,000 ฿ (11 booking) ควรตามเก็บ โดยเฉพาะ bk-0014 (10,500 ฿) และ bk-0003 (8,500 ฿)",
      "ห้อง A108 (ซ่อมแอร์) ควรเร่งปิดงาน — ห้องว่างเพิ่มขายได้อีก 1 ห้อง",
    ],
    confidence: 0.92,
  },
};

// ---- ชุดที่ 2: สรุปรายเดือน มิถุนายน 2569 (ถึงปัจจุบัน) ----
export const aiSummaryMonthJun: H1AiSummary = {
  period: "2026-06",
  scope: "month",
  input: {
    occupancy_pct: 64, // snapshot วันนี้ = 14/22 = 64% (เหมือน today)
    occupancy_avg_7d_pct: 58,
    rooms_total: 22,
    rooms_occupied: 14, // occupied(11) + reserved(3) = 14 (snapshot วันนี้)
    rooms_available: 8,
    rooms_maintenance: 2,
    adr: 1742, // MTD ADR (room revenue / room nights ทั้งเดือน)
    revpar: 1115, // Math.round(1742 × 0.64)
    revenue: 78400,
    revenue_by_source: [
      { source: "agoda", label: "Agoda", amount: 29400 },
      { source: "walk_in", label: "Walk-in", amount: 18200 },
      { source: "booking_com", label: "Booking.com", amount: 14600 },
      { source: "line", label: "LINE", amount: 7200 },
      { source: "website", label: "เว็บไซต์", amount: 5300 },
      { source: "other", label: "อื่นๆ", amount: 3700 },
    ],
    revenue_by_room_type: [
      { type: "V", label: "V (Deluxe)", amount: 31200 },
      { type: "A", label: "A (Standard)", amount: 24600 },
      { type: "C", label: "C (Suite)", amount: 22600 },
    ],
    outstanding_count: 11,
    outstanding_total: 49000,
    checkins_today: 3, // ตรงกับ aiSummaryToday (snapshot วันนี้)
    checkouts_today: 3, // ตรงกับ aiSummaryToday (snapshot วันนี้)
  },
  output: {
    headline: "มิถุนายนรายได้ 78,400 ฿ OTA เป็นช่องทางหลัก Suite ยังมีพื้นที่เติบโต",
    summary:
      "เดือนมิถุนายน 2569 (ถึงปัจจุบัน) โรงแรมมีรายได้รวม 78,400 ฿ occupancy snapshot วันนี้ 64% (14/22 ห้อง) ADR MTD 1,742 ฿ RevPAR 1,115 ฿ ช่องทาง Agoda นำรายได้ 29,400 ฿ คิดเป็น 37.5% ตามด้วย Walk-in 23.2% และ Booking.com 18.6% ห้องประเภท V (Deluxe) ทำรายได้สูงสุด 31,200 ฿ ส่วนห้อง C (Suite) มี occupancy ต่ำสุดแม้ราคาสูงสุด สะท้อนโอกาสโปรโมชัน",
    highlights: [
      "รายได้ MTD 78,400 ฿ · ADR 1,742 ฿ · RevPAR 1,115 ฿",
      "OTA (Agoda + Booking.com) รวม 56% ของรายได้เดือนนี้",
      "ห้อง V Deluxe สร้างรายได้สูงสุด 31,200 ฿",
      "แขกประจำ (สมชาย, วิภาวดี, Tanaka) รวม 3 คน มาซ้ำ 2–3 ครั้ง/เดือน",
    ],
    suggestions: [
      "ห้อง C Suite occupancy ต่ำกว่าเป้า — ลองแพ็กเกจ 2 คืนขึ้นไปพร้อม complimentary breakfast",
      "ช่องทาง LINE มีสัดส่วน 9.2% ควรเพิ่ม engagement เพื่อลดค่า commission OTA",
      "ค้างชำระยังค้างอยู่ 49,000 ฿ — แนะนำเก็บเงินครบก่อนเช็คเอาท์ทุกกรณี",
      "ห้องปรับปรุง (A108, C305) ควรเร่งเปิดขายเพิ่ม potential revenue ~5,000–7,000 ฿/วัน",
    ],
    confidence: 0.88,
  },
};

// ---- ชุดที่ 3: สรุปรายวัน ย้อนหลัง สัปดาห์ที่แล้ว (16 มิ.ย. — สำหรับ trend) ----
export const aiSummaryLastWeek: H1AiSummary = {
  period: "2026-06-16",
  scope: "day",
  input: {
    occupancy_pct: 55,
    occupancy_avg_7d_pct: 58,
    rooms_total: 22,
    rooms_occupied: 12,
    rooms_available: 8,
    rooms_maintenance: 2,
    adr: 1580,
    revpar: 869,
    revenue: 9800,
    revenue_by_source: [
      { source: "walk_in", label: "Walk-in", amount: 4800 },
      { source: "agoda", label: "Agoda", amount: 3200 },
      { source: "other", label: "อื่นๆ", amount: 1800 },
    ],
    revenue_by_room_type: [
      { type: "A", label: "A (Standard)", amount: 4800 },
      { type: "V", label: "V (Deluxe)", amount: 3600 },
      { type: "C", label: "C (Suite)", amount: 1400 },
    ],
    outstanding_count: 7,
    outstanding_total: 22400,
    checkins_today: 2,
    checkouts_today: 3,
  },
  output: {
    headline: "สัปดาห์ที่แล้ว occupancy ต่ำกว่าปัจจุบัน รายได้วันธรรมดาลดลง",
    summary:
      "วันที่ 16 มิถุนายน occupancy 55% ต่ำกว่าค่าเฉลี่ย 7 วัน 3 เปอร์เซ็นต์ รายได้ 9,800 ฿ ช่องทาง Walk-in นำ 49% ห้อง C Suite ขายได้เพียง 1 ห้อง สะท้อนว่า Suite ขายดีเฉพาะช่วง peak/วันหยุด ขณะที่ปัจจุบัน (23 มิ.ย.) โชว์การปรับตัวที่ดีขึ้นหลังปรับกลยุทธ์ OTA",
    highlights: [
      "occupancy 55% ต่ำกว่าค่าเฉลี่ย 7 วัน 3%",
      "Walk-in นำรายได้วันนั้น 49%",
      "Suite C ขายได้เพียง 1 ห้องจาก 5 ห้อง",
    ],
    suggestions: [
      "วันธรรมดา occupancy ต่ำ — พิจารณา flash deal ช่วงจันทร์-พฤหัสฯ",
      "Suite ควรมี minimum stay 2 คืน เพื่อปรับ RevPAR",
    ],
    confidence: 0.85,
  },
};

// Export ทั้งชุด
export const aiSummaries = {
  today: aiSummaryToday,
  monthJun: aiSummaryMonthJun,
  lastWeek: aiSummaryLastWeek,
};
