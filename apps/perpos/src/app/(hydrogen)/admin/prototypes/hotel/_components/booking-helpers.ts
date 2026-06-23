// booking-helpers.ts — pure helper: หา booking ที่เกี่ยวข้องกับห้อง/วัน (reuse board/calendar/daily)

import type { Booking } from "../_fixtures/types";

const ACTIVE_STATUSES: Booking["status"][] = ["reserved", "checked_in"];

/** วัน iso อยู่ในช่วงเข้าพักของ booking ไหม [check_in, check_out) — daily ไม่มี out ถือ 1 คืน */
export function bookingOnDate(b: Booking, isoDate: string): boolean {
  if (b.status === "cancelled" || b.status === "no_show") return false;
  const start = b.check_in_date;
  const end = b.check_out_date ?? addDayIso(b.check_in_date);
  return isoDate >= start && isoDate < end;
}

/** booking ที่ active (reserved/checked_in) ของห้องนี้ ณ วันนี้ (สำหรับ room board) */
export function activeBookingForRoom(
  roomId: string,
  bookings: Booking[],
  isoToday: string,
): Booking | null {
  const found = bookings.find(
    (b) =>
      b.room_id === roomId &&
      ACTIVE_STATUSES.includes(b.status) &&
      (b.status === "checked_in" || bookingOnDate(b, isoToday) || b.check_in_date === isoToday),
  );
  return found ?? null;
}

export function addDayIso(iso: string): string {
  const d = new Date(iso);
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}
