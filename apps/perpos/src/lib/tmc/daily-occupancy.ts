/**
 * computeTmcDailyOccupancy — ยอดห้องพัก "ประจำวัน" ของ TMC (ปิดยอด 20:00)
 *
 * ใช้กับการ์ด LINE รายวัน (api/tmc/notify/daily-occupancy) — คิดจากตารางเดียวกับแดชบอร์ด
 * และยึด **นิยาม occupancy เดียวกับ [dashboard.ts]**: คืนที่ขายได้ / (ห้องที่เปิดขาย × จำนวนคืน)
 * โดย "ห้องที่เปิดขาย" = tmc_properties.is_active AND is_rentable เท่านั้น
 *
 * นิยามคืน: stay ครอบครองคืนของวันที่ D เมื่อ `check_in <= D < check_out`
 * (check_out = วันออก ไม่นับเป็นคืน · check_out ว่าง = พักคืนเดียว)
 *
 * รับ `db` = client ที่ caller เตรียมมา (cron ใช้ service-role + eq org_id ตรงเสมอ)
 */

import type { SupabaseClient } from "@supabase/supabase-js";

const DAY_MS = 86_400_000;

export type TmcDailyOccupancy = {
  /** วันที่ของรายงาน (YYYY-MM-DD, เวลาไทย) */
  date: string;
  /** ห้องที่เปิดขาย (is_active AND is_rentable) */
  rooms: number;
  /** ห้องที่มีคนพัก "คืนนี้" */
  occupied: number;
  /** ในห้องที่มีคนพักคืนนี้ เป็นการให้ห้องฟรีกี่ห้อง (อินฟลู/ผู้บริหาร/ฟรีอื่น ๆ) */
  freeOccupied: number;
  /** อัตราการเข้าพักที่ไม่เกิดรายได้ คืนนี้ (%) — ส่วนหนึ่งของ rate */
  freeRate: number | null;
  /** อัตราการเข้าพักคืนนี้ (%) — null เมื่อไม่มีห้องเปิดขาย */
  rate: number | null;
  /** รหัสห้องที่ว่างคืนนี้ (เรียงตาม sort_order/code) */
  vacantCodes: string[];
  checkIns: { rooms: number; guests: number };
  checkOuts: { rooms: number };
  /** ห้องที่พักต่อเนื่อง (พักคืนนี้ แต่ไม่ได้เช็คอินวันนี้) */
  stayThrough: number;
  /**
   * ยอดจองที่ "รับเข้ามาวันนี้" — ยึดเวลาที่บันทึกเข้าระบบ (created_at, เวลาไทย)
   * ไม่ใช่วันที่เข้าพัก · nights/value = ของทั้งใบจอง แม้จะไปพักเดือนหน้า
   */
  bookedToday: { bookings: number; rooms: number; nights: number; value: number };
  /**
   * ทั้งเดือน (วันที่ 1 ถึงสิ้นเดือน) — **ไม่ใช่แค่ถึงวันนี้** รวมคืนที่จองล่วงหน้าไว้แล้วด้วย
   * rate = อัตราเข้าพักทั้งเดือน
   * soldNights/availableNights = ห้อง×คืนที่ใช้จริง / ที่เปิดขาย (ตัวตั้ง-ตัวหารของ rate)
   * bookings/rooms/value = ยอดจองที่ "บันทึกเข้าระบบ" ตั้งแต่ต้นเดือนถึงวันนี้ (คนละฐานกับ rate)
   */
  mtd: {
    rate: number | null;
    soldNights: number;
    availableNights: number;
    /** ห้อง×คืนที่ให้ฟรี + อัตราส่วนต่อห้องที่เปิดขาย (%) */
    freeNights: number;
    freeRate: number | null;
    /** ค่าห้องของผู้ที่ "เข้าพัก" ในเดือนนี้ (ยึดวันเช็คอิน — ตรงกับ totals.stays.revenue บนแดชบอร์ด) */
    stayRevenue: number;
    bookings: number;
    rooms: number;
    value: number;
  };
};

/** ชนิดการเข้าพักที่ "ไม่เกิดรายได้ค่าห้อง" — ให้ห้องฟรี (อินฟลู/ผู้บริหาร/อื่น ๆ) */
const NON_REVENUE_STAY_TYPES = new Set(["influencer", "management", "free"]);

type StayRow = {
  stay_type: string | null;
  property_code: string | null;
  check_in: string;
  check_out: string | null;
  group_size: number | null;
  room_rate: number | null;
};

/** แถวที่ใช้นับ "ยอดจองที่รับเข้ามา" — ยึด created_at ไม่ใช่วันเข้าพัก */
type BookingRow = {
  booking_group_id: string | null;
  nights: number | null;
  room_rate: number | null;
  created_at: string;
};

/** วันที่ปัจจุบันตามเวลาไทย (UTC+7) — cron รันบนเครื่อง UTC */
export function bangkokToday(now: Date = new Date()): string {
  return new Date(now.getTime() + 7 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

const addDays = (iso: string, n: number) =>
  new Date(new Date(iso).getTime() + n * DAY_MS).toISOString().slice(0, 10);

export async function computeTmcDailyOccupancy(
  db: SupabaseClient,
  orgId: string,
  date: string,
): Promise<TmcDailyOccupancy> {
  const monthStart = `${date.slice(0, 7)}-01`;
  const from = monthStart;
  // ตัวเลข "เดือนนี้" คิดทั้งเดือน (รวมคืนที่จองล่วงหน้าไว้แล้ว) ไม่ใช่แค่ถึงวันนี้
  // monthEndEx = วันแรกของเดือนถัดไป (ขอบขวาแบบไม่รวม)
  const monthEndEx = new Date(
    Date.UTC(Number(monthStart.slice(0, 4)), Number(monthStart.slice(5, 7)), 1),
  )
    .toISOString()
    .slice(0, 10);
  const monthEnd = addDays(monthEndEx, -1);
  const daysInMonth = Math.round(
    (new Date(monthEndEx).getTime() - new Date(monthStart).getTime()) / DAY_MS,
  );

  const [propRes, stayRes, bookRes] = await Promise.all([
    db
      .from("tmc_properties")
      .select("code, sort_order")
      .eq("org_id", orgId)
      .eq("is_active", true)
      .eq("is_rentable", true)
      .order("sort_order", { ascending: true })
      .order("code", { ascending: true }),
    db
      .from("tmc_stays")
      .select("stay_type, property_code, check_in, check_out, group_size, room_rate")
      .eq("org_id", orgId)
      .lte("check_in", monthEnd)
      .or(`check_out.is.null,check_out.gt.${from}`),
    // ใบจองที่ "เข้ามา" ตั้งแต่ต้นเดือน — ช่วงเวลาไทย (created_at เป็น timestamptz)
    db
      .from("tmc_stays")
      .select("booking_group_id, nights, room_rate, created_at")
      .eq("org_id", orgId)
      .gte("created_at", `${monthStart}T00:00:00+07:00`)
      .lt("created_at", `${addDays(date, 1)}T00:00:00+07:00`),
  ]);

  if (propRes.error) throw new Error(propRes.error.message);
  if (stayRes.error) throw new Error(stayRes.error.message);
  if (bookRes.error) throw new Error(bookRes.error.message);

  const rentable = (propRes.data ?? []).map((p) => p.code as string);
  const rentableSet = new Set(rentable);
  const rooms = rentable.length;
  const stays = (stayRes.data ?? []) as StayRow[];
  const bookings = (bookRes.data ?? []) as BookingRow[];
  // นับเฉพาะ stay ของห้องที่เปิดขาย — ให้ตรงกับตัวหารของ occupancy
  const sellable = stays.filter((s) => rentableSet.has(s.property_code ?? ""));

  const rateOf = (n: number) => (rooms > 0 ? +((n / rooms) * 100).toFixed(1) : null);

  const checkInSellable = sellable.filter((s) => s.check_in === date);

  // ยอดจอง = นับตามวันที่บันทึกเข้าระบบ (created_at) แปลงเป็นวันไทยก่อนเทียบ
  const bookedOn = (b: BookingRow) => bangkokToday(new Date(b.created_at));
  const sumBookings = (rows: BookingRow[]) => ({
    bookings: new Set(rows.map((b, i) => b.booking_group_id ?? `row-${i}`)).size,
    rooms: rows.length,
    nights: rows.reduce((s, b) => s + Number(b.nights ?? 0), 0),
    value: +rows.reduce((s, b) => s + Number(b.room_rate ?? 0), 0).toFixed(2),
  });
  const todayBookings = sumBookings(bookings.filter((b) => bookedOn(b) === date));
  const mtdBookings = sumBookings(bookings);

  // ทั้งเดือน — คืนที่ขายได้ในช่วง [monthStart, monthEnd] / (ห้องเปิดขาย × จำนวนวันทั้งเดือน)
  // เก็บเป็นแผนที่ "ห้อง|คืน" → ฟรีหรือไม่ · ถ้ามี stay ซ้อนทับห้องเดียวกันคืนเดียวกัน
  // (จองคาบเกี่ยว/บันทึกซ้ำ) ต้องนับครั้งเดียว ไม่งั้นอัตราการเข้าพักทะลุ 100%
  // และคืนที่มีทั้งแบบมีรายได้กับให้ฟรี ให้ถือเป็น "มีรายได้" (ไม่ตีเป็นฟรี)
  const nightMap = new Map<string, boolean>();
  for (const s of sellable) {
    const isFree = NON_REVENUE_STAY_TYPES.has(s.stay_type ?? "");
    const end = s.check_out ?? addDays(s.check_in, 1);
    const startMs = Math.max(new Date(s.check_in).getTime(), new Date(monthStart).getTime());
    const endMs = Math.min(new Date(end).getTime(), new Date(monthEndEx).getTime());
    for (let t = startMs; t < endMs; t += DAY_MS) {
      const key = `${s.property_code}|${new Date(t).toISOString().slice(0, 10)}`;
      nightMap.set(key, (nightMap.get(key) ?? true) && isFree);
    }
  }
  const soldNights = nightMap.size;
  const freeNights = Array.from(nightMap.values()).filter(Boolean).length;

  // คืนนี้ = ชุดย่อยของแผนที่เดียวกัน (วันที่ = date) — นิยาม "ฟรี" จึงตรงกันทั้งการ์ด
  const tonight = Array.from(nightMap.entries()).filter(([k]) => k.endsWith(`|${date}`));
  const occupiedCodes = new Set(tonight.map(([k]) => k.split("|")[0]));
  const occupied = occupiedCodes.size;
  const freeOccupied = tonight.filter(([, isFree]) => isFree).length;
  const availableNights = rooms * daysInMonth;
  return {
    date,
    rooms,
    occupied,
    rate: rateOf(occupied),
    freeOccupied,
    freeRate: rateOf(freeOccupied),
    vacantCodes: rentable.filter((c) => !occupiedCodes.has(c)),
    checkIns: {
      rooms: stays.filter((s) => s.check_in === date).length,
      guests: stays
        .filter((s) => s.check_in === date)
        .reduce((s, r) => s + Number(r.group_size ?? 0), 0),
    },
    checkOuts: { rooms: stays.filter((s) => s.check_out === date).length },
    stayThrough: Math.max(0, occupied - checkInSellable.length),
    bookedToday: todayBookings,
    mtd: {
      rate: availableNights > 0 ? +((soldNights / availableNights) * 100).toFixed(1) : null,
      soldNights,
      availableNights,
      freeNights,
      freeRate: availableNights > 0 ? +((freeNights / availableNights) * 100).toFixed(1) : null,
      stayRevenue: +stays
        .filter((s) => s.check_in >= monthStart && s.check_in <= monthEnd)
        .reduce((sum, r) => sum + Number(r.room_rate ?? 0), 0)
        .toFixed(2),
      bookings: mtdBookings.bookings,
      rooms: mtdBookings.rooms,
      value: mtdBookings.value,
    },
  };
}
