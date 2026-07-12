// slot-grid.ts — derived helpers (§3.9): tee_slots / slot_occupancy / bands / utilization
// ทั้งหมดคำนวณจาก resource config + bookings (ไม่ stored) — pure functions, ไม่มี JSX

import type {
  GolfBooking,
  GolfResource,
  GolfSlotOccupancy,
  GolfTeeSlot,
  GolfBandUtil,
} from "../_fixtures/types";

/** "HH:MM" → นาทีจากเที่ยงคืน */
export function parseTime(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + (m || 0);
}

/** นาที → "HH:MM" */
export function toTimeStr(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** สร้าง array ช่วงเวลา [open, close) ทีละ interval นาที */
export function generateSlots(open: string, close: string, intervalMin: number): string[] {
  const start = parseTime(open);
  const end = parseTime(close);
  const step = intervalMin > 0 ? intervalMin : 10;
  const out: string[] = [];
  for (let t = start; t < end; t += step) out.push(toTimeStr(t));
  return out;
}

/** booking ที่ครอบ slot (resource + date + start_time) — ไม่นับ cancelled */
export function slotBookings(
  bookings: GolfBooking[],
  resourceId: string,
  date: string,
  time: string,
): GolfBooking[] {
  return bookings.filter(
    (b) =>
      b.resource_id === resourceId &&
      b.booking_date === date &&
      b.start_time === time &&
      b.status !== "cancelled",
  );
}

/** ที่นั่งที่ใช้ไปแล้วใน slot (Σ party_size ของ booking ที่ไม่ยกเลิก) */
export function seatsUsed(bs: GolfBooking[]): number {
  return bs.reduce((s, b) => s + (b.party_size || 0), 0);
}

/** สถานะช่อง: ว่าง / บางส่วน / เต็ม (course) — maintenance → ปิดซ่อม */
export function computeOccupancy(
  bs: GolfBooking[],
  maxParty: number,
  resourceStatus?: GolfResource["status"],
): GolfSlotOccupancy {
  if (resourceStatus === "maintenance") return "ปิดซ่อม";
  const used = seatsUsed(bs);
  if (used <= 0) return "ว่าง";
  if (used >= maxParty) return "เต็ม";
  return "บางส่วน";
}

/** ที่นั่งคงเหลือใน slot (course flight) */
export function remainingSeats(bs: GolfBooking[], maxParty: number): number {
  return Math.max(0, maxParty - seatsUsed(bs));
}

/** tee_slots ของ course ในวันหนึ่ง (derived) */
export function buildTeeSlots(
  course: GolfResource,
  bookings: GolfBooking[],
  date: string,
): GolfTeeSlot[] {
  const open = course.open_time ?? "06:00";
  const close = course.close_time ?? "16:00";
  const interval = course.tee_interval_min ?? 10;
  const max = course.max_party_size ?? 4;
  return generateSlots(open, close, interval).map((time) => {
    const bs = slotBookings(bookings, course.id, date, time);
    return { time, bookings: bs, occupancy: computeOccupancy(bs, max, course.status) };
  });
}

/** ช่วงพีคมาตรฐาน (เช้า/สาย/บ่าย/เย็น) — align กับ ai-mocks bands */
export const TEE_BANDS: { label: string; start: string; end: string }[] = [
  { label: "เช้า 06:00–09:00", start: "06:00", end: "09:00" },
  { label: "สาย 09:00–12:00", start: "09:00", end: "12:00" },
  { label: "บ่าย 12:00–15:00", start: "12:00", end: "15:00" },
  { label: "เย็น 15:00–16:00", start: "15:00", end: "16:00" },
];

/** utilization ต่อ band (booked slot / slot ทั้งหมด) จาก tee_slots ที่ derived มา */
export function computeBands(slots: GolfTeeSlot[]): GolfBandUtil[] {
  return TEE_BANDS.map((band) => {
    const s = parseTime(band.start);
    const e = parseTime(band.end);
    const inBand = slots.filter((sl) => {
      const t = parseTime(sl.time);
      return t >= s && t < e;
    });
    const booked = inBand.filter((sl) => sl.occupancy !== "ว่าง").length;
    const total = inBand.length;
    return {
      label: band.label,
      start: band.start,
      end: band.end,
      slots: total,
      booked,
      util_pct: total > 0 ? Math.round((booked / total) * 100) : 0,
    };
  });
}

/** utilization รวมของวัน = booked slot / slot ทั้งหมด */
export function computeUtilization(slots: GolfTeeSlot[]): { booked: number; total: number; pct: number } {
  const total = slots.length;
  const booked = slots.filter((s) => s.occupancy !== "ว่าง").length;
  return { booked, total, pct: total > 0 ? Math.round((booked / total) * 100) : 0 };
}
