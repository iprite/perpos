// types.ts — hotel fixture types (6 entity + enums)
// ยึดตาม spec §5 Data Contract ตรงเป๊ะ

// ---- Enums (canonical — ทุกชั้นใช้ค่าเดียวกัน) ----

export type RoomType = "A" | "V" | "C";
// A = Standard, V = Deluxe, C = Suite

export type RoomStatus = "available" | "occupied" | "reserved" | "maintenance" | "out_of_service";

export type HousekeepingStatus = "clean" | "dirty" | "cleaning" | "inspected";

export type StayType = "daily" | "hourly";

export type BookingStatus = "reserved" | "checked_in" | "checked_out" | "cancelled" | "no_show";

export type BookingSource =
  | "walk_in"
  | "phone"
  | "line"
  | "website"
  | "agoda"
  | "booking_com"
  | "airbnb"
  | "traveloka"
  | "other";

export type PaymentMethod =
  | "cash"
  | "transfer"
  | "qr"
  | "credit_card"
  | "debit_card"
  | "ota"
  | "other";

export type PaymentKind = "deposit" | "balance" | "extra" | "refund";

export type GuestIdType = "national_id" | "passport" | "other";

// ---- Entity Interfaces ----

/**
 * 0) room_type_config — ตั้งค่าประเภทห้อง A/V/C (config 3 แถวคงที่ต่อ org)
 */
export interface RoomTypeConfig {
  id: string;
  org_id: string;
  room_type: RoomType;
  label: string;
  base_price_daily: number;
  base_price_hourly: number | null;
  capacity: number;
  bed_type: string | null;
  description: string | null;
  room_count: number; // สรุปจำนวนห้องของประเภทนี้ (read-only, คำนวณจาก rooms)
  created_at: string;
  updated_at: string;
}

/**
 * 1) rooms — ห้อง
 */
export interface Room {
  id: string;
  org_id: string;
  room_number: string;
  room_type: RoomType;
  floor: number | null;
  status: RoomStatus;
  housekeeping_status: HousekeepingStatus;
  price_override: number | null;
  note: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

/**
 * 2) guests — ทะเบียนแขก
 */
export interface Guest {
  id: string;
  org_id: string;
  full_name: string;
  nationality: string | null;
  phone: string | null;
  email: string | null;
  id_type: GuestIdType | null;
  id_number: string | null;
  address: string | null;
  note: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * 3) bookings — การจอง/การเข้าพัก
 */
export interface Booking {
  id: string;
  org_id: string;
  booking_code: string;
  room_id: string;
  guest_id: string | null;
  guest_name: string; // snapshot
  nationality: string | null;
  phone: string | null;
  stay_type: StayType;
  source: BookingSource;
  check_in_date: string; // ISO YYYY-MM-DD
  check_in_time: string | null;
  check_out_date: string | null;
  check_out_time: string | null;
  nights: number | null;
  hours: number | null;
  adults: number;
  children: number;
  room_rate: number;
  room_total: number;
  extra_charges: number;
  discount: number;
  grand_total: number;
  status: BookingStatus;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * 4) payments — การรับชำระ
 * IMPORTANT: amount เก็บค่าบวกเสมอทุก kind รวม refund
 * refund = เงินออก แสดง − ที่ UI layer เท่านั้น
 */
export interface Payment {
  id: string;
  org_id: string;
  booking_id: string;
  kind: PaymentKind;
  method: PaymentMethod;
  amount: number; // บวกเสมอ
  paid_at: string; // ISO timestamp
  reference: string | null;
  received_by: string | null;
  note: string | null;
  created_at: string;
}

/**
 * 5) housekeeping_tasks — งานทำความสะอาด
 */
export interface HousekeepingTask {
  id: string;
  org_id: string;
  room_id: string;
  task_date: string; // ISO YYYY-MM-DD
  status: HousekeepingStatus;
  assigned_to: string | null;
  started_at: string | null;
  completed_at: string | null;
  note: string | null;
  created_at: string;
  updated_at: string;
}
