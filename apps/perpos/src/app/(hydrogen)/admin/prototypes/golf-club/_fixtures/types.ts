// types.ts — golf_club fixture types (8 entity + enums)
// ยึด specs/golf_club.md §3 Data Contract ตรงเป๊ะ (canonical names)
// อย่าใส่ pure-derived fields (§3.10): tee_slots[]/slot_occupancy/utilization_pct/
// revenue_total/no_show_rate — คำนวณตอนแสดงผลเท่านั้น ไม่ stored ใน fixture

// ---- Enums (canonical — ทุกชั้นใช้ค่าเดียวกัน) ----

export type GolfMemberType = "member" | "guest" | "vip";
export type GolfMemberStatus = "active" | "inactive" | "blocked";
export type GolfTier = "none" | "silver" | "gold" | "platinum";

export type GolfResourceType = "course" | "bay";
export type GolfResourceStatus = "active" | "maintenance" | "inactive";

export type GolfPriceCategory = "green_fee" | "caddie" | "cart" | "range_bucket" | "other";
export type GolfPriceAppliesTo = "tee_time" | "driving_range" | "both";
export type GolfDayType = "weekday" | "weekend" | "all";
export type GolfPriceMemberType = "member" | "guest" | "vip" | "all";

export type GolfBookingType = "tee_time" | "driving_range";
export type GolfBookingStatus =
  | "pending"
  | "confirmed"
  | "checked_in"
  | "completed"
  | "cancelled"
  | "no_show";
export type GolfBookingChannel = "line" | "walk_in" | "web" | "phone";
export type GolfPaymentStatus = "unpaid" | "deposit_paid" | "paid" | "refunded";
export type GolfPaymentMethod = "promptpay" | "card" | "cash";

export type GolfPointTxnType = "earn" | "redeem" | "adjust";

// ---- Entity Interfaces ----

/**
 * 3.1) golf_member — ลูกค้า/สมาชิก (จาก LINE หรือ walk-in)
 */
export interface GolfMember {
  id: string;
  org_id: string;
  profile_id: string | null;
  line_user_id: string | null;
  display_name: string;
  full_name: string | null;
  phone: string | null;
  member_type: GolfMemberType;
  member_no: string | null;
  membership_plan_id: string | null;
  membership_expires_at: string | null; // ISO date (CE)
  tier: GolfTier;
  points_balance: number;
  status: GolfMemberStatus;
  no_show_count: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * 3.2) golf_resource — course (1 แถว 18 หลุม) + bay (หลายแถว)
 * หมายเหตุ: tee_slots[]/bay slots = derived — ไม่ stored (ดู §3.9)
 */
export interface GolfResource {
  id: string;
  org_id: string;
  resource_type: GolfResourceType;
  name: string;
  code: string | null;
  holes: number | null;
  tee_interval_min: number | null;
  open_time: string | null; // "HH:MM"
  close_time: string | null; // "HH:MM"
  max_party_size: number | null;
  status: GolfResourceStatus;
  sort_order: number | null;
  created_at: string;
  updated_at: string;
}

/**
 * 3.3) golf_price_item — ราคา/แพ็กเกจ (green fee/caddie/cart/ตะกร้าลูก)
 * PRICING RULE (LOCKED): ราคาฐาน = member_type='all' · ส่วนลดสมาชิกมาจาก plan.green_fee_discount_pct
 * เท่านั้น · catalog member_type='member'/'vip' = fallback เมื่อไม่มี plan active (ราคาตรง ไม่หัก %)
 */
export interface GolfPriceItem {
  id: string;
  org_id: string;
  category: GolfPriceCategory;
  name: string;
  applies_to: GolfPriceAppliesTo;
  day_type: GolfDayType;
  member_type: GolfPriceMemberType;
  price: number;
  unit: string | null;
  bucket_size: number | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

/**
 * 3.5) golf_booking_item — breakdown ค่าบริการต่อ booking
 * prototype = mock array ฝังใน GolfBooking.items (ไม่แยกตาราง — ตาม contract §3.5)
 */
export interface GolfBookingItem {
  id: string;
  price_item_id: string | null;
  category: GolfPriceCategory;
  description: string;
  qty: number;
  unit_price: number;
  line_total: number;
}

/**
 * 3.4) golf_booking — การจอง (แกนของ module)
 */
export interface GolfBooking {
  id: string;
  org_id: string;
  booking_ref: string | null; // prototype nullable; production NOT NULL
  booking_type: GolfBookingType;
  resource_id: string;
  member_id: string | null;
  contact_name: string | null;
  contact_phone: string | null;
  booking_date: string; // ISO YYYY-MM-DD (CE)
  start_time: string; // "HH:MM"
  end_time: string | null;
  party_size: number;
  status: GolfBookingStatus;
  channel: GolfBookingChannel;
  caddie_count: number | null;
  cart_count: number | null;
  bucket_qty: number | null;
  bucket_price_item_id: string | null;
  total_amount: number | null; // stored + auto-suggest (§3.9)
  deposit_amount: number | null;
  paid_amount: number | null;
  payment_status: GolfPaymentStatus;
  payment_method: GolfPaymentMethod | null;
  notes: string | null;
  created_by: string | null;
  checked_in_at: string | null;
  cancelled_at: string | null;
  cancel_reason: string | null;
  created_at: string;
  updated_at: string;
  items: GolfBookingItem[]; // prototype: mock array ใน booking object (§3.5)
}

/**
 * 3.6) golf_settings — ตั้งค่าต่อ org (1 row/org) — prototype = client state, ไม่ persist
 */
export interface GolfSettings {
  org_id: string;
  course_open_time: string | null;
  course_close_time: string | null;
  default_tee_interval_min: number;
  range_open_time: string | null;
  range_close_time: string | null;
  allow_overbooking: boolean; // reserved-for-future — v1 = false เสมอ (D4 ห้าม overbook)
  require_deposit: boolean;
  deposit_amount_default: number | null;
  reminder_hours_before: number;
  line_booking_enabled: boolean;
  line_confirm_enabled: boolean;
  line_reminder_enabled: boolean;
  line_owner_report_enabled: boolean;
  line_recipients: { owner: boolean; manager: boolean } | null;
  created_at: string;
  updated_at: string;
}

/**
 * 3.7) golf_membership_plan — แพ็กเกจสมาชิกรายปี — [D3]
 */
export interface GolfMembershipPlan {
  id: string;
  org_id: string;
  name: string;
  tier: GolfTier; // เฉพาะ silver|gold|platinum ตอนใช้จริง (none = ไม่มีแพ็กเกจ)
  price_per_year: number;
  duration_months: number;
  green_fee_discount_pct: number | null;
  free_buckets_per_month: number | null;
  points_multiplier: number | null;
  perks: Record<string, unknown> | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

/**
 * 3.8) golf_point_transaction — ledger แต้มสะสม (append-only) — [D3]
 */
export interface GolfPointTransaction {
  id: string;
  org_id: string;
  member_id: string;
  txn_type: GolfPointTxnType;
  points: number; // +earn / −redeem (เก็บเครื่องหมายตาม type)
  booking_id: string | null;
  description: string;
  created_by: string | null;
  created_at: string;
}

// ---- Derived helper types (§3.9 — ไม่ stored, ใช้เฉพาะ UI/หน้าเว็บคำนวณเอง) ----

export type GolfSlotOccupancy = "ว่าง" | "บางส่วน" | "เต็ม" | "ปิดซ่อม";

export interface GolfTeeSlot {
  time: string; // "HH:MM"
  bookings: GolfBooking[];
  occupancy: GolfSlotOccupancy;
}

export interface GolfBandUtil {
  label: string;
  start: string;
  end: string;
  slots: number;
  booked: number;
  util_pct: number;
}
