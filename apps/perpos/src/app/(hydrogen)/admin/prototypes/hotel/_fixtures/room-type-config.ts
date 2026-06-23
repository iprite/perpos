// room-type-config.ts — 3 แถวคงที่ A/V/C สำหรับ "โรงแรมสุขใจ"
// ราคาสมเหตุผลโรงแรมเล็กไทย (ต่างจังหวัด/เมืองรอง)

import type { RoomTypeConfig } from "./types";

export const MOCK_ORG_ID = "org-hotel-sukjai-001";

export const roomTypeConfigs: RoomTypeConfig[] = [
  {
    id: "rtc-A",
    org_id: MOCK_ORG_ID,
    room_type: "A",
    label: "ห้อง A (Standard)",
    base_price_daily: 1200,
    base_price_hourly: 350,
    capacity: 2,
    bed_type: "เตียงเดี่ยว 2 เตียง",
    description:
      "ห้องมาตรฐาน พร้อมเครื่องปรับอากาศ TV Wi-Fi ตู้เย็น เหมาะสำหรับนักเดินทางคู่หรือเดี่ยว",
    room_count: 10, // A101–A110 (10 ห้อง)
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-06-01T00:00:00.000Z",
  },
  {
    id: "rtc-V",
    org_id: MOCK_ORG_ID,
    room_type: "V",
    label: "ห้อง V (Deluxe)",
    base_price_daily: 1800,
    base_price_hourly: 500,
    capacity: 3,
    bed_type: "เตียงคู่ Queen",
    description:
      "ห้องดีลักซ์ กว้างขวาง วิวสวน เตียงคู่ขนาดใหญ่ อ่างอาบน้ำแยก เหมาะสำหรับคู่รักและครอบครัวเล็ก",
    room_count: 8, // V201–V208 (8 ห้อง)
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-06-01T00:00:00.000Z",
  },
  {
    id: "rtc-C",
    org_id: MOCK_ORG_ID,
    room_type: "C",
    label: "ห้อง C (Suite)",
    base_price_daily: 3500,
    base_price_hourly: 900,
    capacity: 4,
    bed_type: "เตียงคู่ King",
    description:
      "สวีทห้องชุด ห้องนอน+ห้องนั่งเล่นแยก วิวสระน้ำ อ่างแช่ตัว เหมาะสำหรับฮันนีมูนและครอบครัว",
    room_count: 6, // C301–C306 (6 ห้อง) — รวม 24 ห้องทั้งหมด
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-06-01T00:00:00.000Z",
  },
];
