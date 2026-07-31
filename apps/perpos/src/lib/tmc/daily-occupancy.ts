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
  /** อัตราการเข้าพักคืนนี้ (%) — null เมื่อไม่มีห้องเปิดขาย */
  rate: number | null;
  /** รหัสห้องที่ว่างคืนนี้ (เรียงตาม sort_order/code) */
  vacantCodes: string[];
  checkIns: { rooms: number; guests: number };
  checkOuts: { rooms: number };
  /** ห้องที่พักต่อเนื่อง (พักคืนนี้ แต่ไม่ได้เช็คอินวันนี้) */
  stayThrough: number;
  /** รายได้ค่าห้องของ stay ที่เช็คอินวันนี้ (นิยามเดียวกับ totals.stays.revenue) */
  roomRevenue: number;
  /** อาหาร+เครื่องดื่ม+หมูกระทะ+BBQ ของ stay ที่เช็คอินวันนี้ */
  foodRevenue: number;
  /** สะสมตั้งแต่ต้นเดือนถึงวันนี้ */
  mtd: { rate: number | null; roomRevenue: number; foodRevenue: number };
  /** อัตราการเข้าพักของคืนวันเดียวกันเมื่อ 7 วันก่อน (%) — ใช้เทียบ */
  lastWeekRate: number | null;
};

type StayRow = {
  property_code: string | null;
  check_in: string;
  check_out: string | null;
  group_size: number | null;
  room_rate: number | null;
  food_amount: number | null;
  drink_amount: number | null;
  mookata_amount: number | null;
  bbq_amount: number | null;
};

/** วันที่ปัจจุบันตามเวลาไทย (UTC+7) — cron รันบนเครื่อง UTC */
export function bangkokToday(now: Date = new Date()): string {
  return new Date(now.getTime() + 7 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

const addDays = (iso: string, n: number) =>
  new Date(new Date(iso).getTime() + n * DAY_MS).toISOString().slice(0, 10);

/** stay ครอบครองคืนของวันที่ night หรือไม่ (check_out ว่าง = พักคืนเดียว) */
function occupiesNight(s: StayRow, night: string): boolean {
  const end = s.check_out ?? addDays(s.check_in, 1);
  return s.check_in <= night && night < end;
}

const extras = (s: StayRow) =>
  Number(s.food_amount ?? 0) +
  Number(s.drink_amount ?? 0) +
  Number(s.mookata_amount ?? 0) +
  Number(s.bbq_amount ?? 0);

export async function computeTmcDailyOccupancy(
  db: SupabaseClient,
  orgId: string,
  date: string,
): Promise<TmcDailyOccupancy> {
  const monthStart = `${date.slice(0, 7)}-01`;
  const lastWeek = addDays(date, -7);
  // ต้องครอบคลุมทั้ง MTD และคืนเมื่อ 7 วันก่อน (ต้นเดือนอาจอยู่หลัง lastWeek)
  const from = monthStart < lastWeek ? monthStart : lastWeek;

  const [propRes, stayRes] = await Promise.all([
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
      .select(
        "property_code, check_in, check_out, group_size, room_rate, food_amount, drink_amount, mookata_amount, bbq_amount",
      )
      .eq("org_id", orgId)
      .lte("check_in", date)
      .or(`check_out.is.null,check_out.gt.${from}`),
  ]);

  if (propRes.error) throw new Error(propRes.error.message);
  if (stayRes.error) throw new Error(stayRes.error.message);

  const rentable = (propRes.data ?? []).map((p) => p.code as string);
  const rentableSet = new Set(rentable);
  const rooms = rentable.length;
  const stays = (stayRes.data ?? []) as StayRow[];
  // นับเฉพาะ stay ของห้องที่เปิดขาย — ให้ตรงกับตัวหารของ occupancy
  const sellable = stays.filter((s) => rentableSet.has(s.property_code ?? ""));

  const occupiedCodes = new Set(
    sellable.filter((s) => occupiesNight(s, date)).map((s) => s.property_code as string),
  );
  const occupied = occupiedCodes.size;
  const rateOf = (n: number) => (rooms > 0 ? +((n / rooms) * 100).toFixed(1) : null);

  const checkInRows = stays.filter((s) => s.check_in === date);
  const checkInSellable = sellable.filter((s) => s.check_in === date);

  // MTD — คืนที่ขายได้ในช่วง [monthStart, date] / (ห้องเปิดขาย × วันที่ผ่านมา)
  // นับเป็น "ห้อง×คืน" ที่ไม่ซ้ำ — ถ้ามี stay ซ้อนทับห้องเดียวกันคืนเดียวกัน (จองคาบเกี่ยว/บันทึกซ้ำ)
  // ต้องนับครั้งเดียว ไม่งั้นอัตราการเข้าพักทะลุ 100% และขัดกับตัวเลข "คืนนี้" ที่นับ distinct ห้อง
  const soldSet = new Set<string>();
  for (const s of sellable) {
    const end = s.check_out ?? addDays(s.check_in, 1);
    const startMs = Math.max(new Date(s.check_in).getTime(), new Date(monthStart).getTime());
    const endMs = Math.min(new Date(end).getTime(), new Date(date).getTime() + DAY_MS);
    for (let t = startMs; t < endMs; t += DAY_MS) {
      soldSet.add(`${s.property_code}|${new Date(t).toISOString().slice(0, 10)}`);
    }
  }
  const soldNights = soldSet.size;
  const daysElapsed = Math.round(
    (new Date(date).getTime() + DAY_MS - new Date(monthStart).getTime()) / DAY_MS,
  );
  const availableNights = rooms * daysElapsed;
  const mtdRows = stays.filter((s) => s.check_in >= monthStart && s.check_in <= date);

  const lastWeekOccupied = new Set(
    sellable.filter((s) => occupiesNight(s, lastWeek)).map((s) => s.property_code as string),
  ).size;

  return {
    date,
    rooms,
    occupied,
    rate: rateOf(occupied),
    vacantCodes: rentable.filter((c) => !occupiedCodes.has(c)),
    checkIns: {
      rooms: checkInRows.length,
      guests: checkInRows.reduce((s, r) => s + Number(r.group_size ?? 0), 0),
    },
    checkOuts: { rooms: stays.filter((s) => s.check_out === date).length },
    stayThrough: Math.max(0, occupied - checkInSellable.length),
    roomRevenue: +checkInRows.reduce((s, r) => s + Number(r.room_rate ?? 0), 0).toFixed(2),
    foodRevenue: +checkInRows.reduce((s, r) => s + extras(r), 0).toFixed(2),
    mtd: {
      rate: availableNights > 0 ? +((soldNights / availableNights) * 100).toFixed(1) : null,
      roomRevenue: +mtdRows.reduce((s, r) => s + Number(r.room_rate ?? 0), 0).toFixed(2),
      foodRevenue: +mtdRows.reduce((s, r) => s + extras(r), 0).toFixed(2),
    },
    lastWeekRate: rateOf(lastWeekOccupied),
  };
}
