// badges.tsx — map enum → StatusBadge (tone + ป้ายไทย) สำหรับสถานะ hotel
// ทุก enum ยึดตาม _fixtures/types.ts · tone จาก @/components/ui/badge (neutral|info|success|warning|danger)
// shared foundation — import: import { BookingStatusBadge, RoomTypeBadge } from "../_components/badges";

import { StatusBadge, type BadgeTone } from "@/components/ui/badge";
import type {
  BookingStatus,
  RoomStatus,
  HousekeepingStatus,
  RoomType,
  BookingSource,
  PaymentKind,
  PaymentMethod,
} from "../_fixtures/types";

type Meta = { tone: BadgeTone; label: string };

// ─── booking_status ───
const BOOKING_STATUS: Record<BookingStatus, Meta> = {
  reserved: { tone: "warning", label: "จองแล้ว" },
  checked_in: { tone: "info", label: "เข้าพักอยู่" },
  checked_out: { tone: "neutral", label: "เช็คเอาท์แล้ว" },
  cancelled: { tone: "neutral", label: "ยกเลิก" },
  no_show: { tone: "danger", label: "ไม่มาเข้าพัก" },
};
export const bookingStatusMeta = (s: BookingStatus): Meta => BOOKING_STATUS[s];
export function BookingStatusBadge({ status }: { status: BookingStatus }) {
  const m = BOOKING_STATUS[status];
  return <StatusBadge tone={m.tone}>{m.label}</StatusBadge>;
}

// ─── room_status ───
const ROOM_STATUS: Record<RoomStatus, Meta> = {
  available: { tone: "success", label: "ว่าง" },
  occupied: { tone: "info", label: "มีแขกพัก" },
  reserved: { tone: "warning", label: "จองแล้ว" },
  maintenance: { tone: "neutral", label: "ปิดซ่อม" },
  out_of_service: { tone: "neutral", label: "หยุดขาย" },
};
export const roomStatusMeta = (s: RoomStatus): Meta => ROOM_STATUS[s];
export function RoomStatusBadge({ status }: { status: RoomStatus }) {
  const m = ROOM_STATUS[status];
  return <StatusBadge tone={m.tone}>{m.label}</StatusBadge>;
}

// ─── housekeeping_status ───
const HK_STATUS: Record<HousekeepingStatus, Meta> = {
  dirty: { tone: "danger", label: "รอทำความสะอาด" },
  cleaning: { tone: "warning", label: "กำลังทำ" },
  clean: { tone: "info", label: "สะอาด" },
  inspected: { tone: "success", label: "ตรวจแล้ว" },
};
export const hkStatusMeta = (s: HousekeepingStatus): Meta => HK_STATUS[s];
export function HkStatusBadge({ status }: { status: HousekeepingStatus }) {
  const m = HK_STATUS[status];
  return <StatusBadge tone={m.tone}>{m.label}</StatusBadge>;
}

// ─── room_type (A/V/C) ───
export const ROOM_TYPE_LABEL: Record<RoomType, string> = {
  A: "A (Standard)",
  V: "V (Deluxe)",
  C: "C (Suite)",
};
const ROOM_TYPE_TONE: Record<RoomType, BadgeTone> = {
  A: "neutral",
  V: "info",
  C: "warning",
};
export function RoomTypeBadge({ type }: { type: RoomType }) {
  return <StatusBadge tone={ROOM_TYPE_TONE[type]}>{ROOM_TYPE_LABEL[type]}</StatusBadge>;
}

// ─── booking_source (label ไทย/ช่องทาง) ───
export const SOURCE_LABEL: Record<BookingSource, string> = {
  walk_in: "Walk-in",
  phone: "โทรศัพท์",
  line: "LINE",
  website: "เว็บไซต์",
  agoda: "Agoda",
  booking_com: "Booking.com",
  airbnb: "Airbnb",
  traveloka: "Traveloka",
  other: "อื่นๆ",
};
export function SourceBadge({ source }: { source: BookingSource }) {
  return <StatusBadge tone="neutral">{SOURCE_LABEL[source]}</StatusBadge>;
}

// ─── payment_kind ───
export const PAYMENT_KIND_LABEL: Record<PaymentKind, string> = {
  deposit: "มัดจำ",
  balance: "ชำระส่วนที่เหลือ",
  extra: "ค่าใช้จ่ายเพิ่ม",
  refund: "คืนเงิน",
};
const PAYMENT_KIND_TONE: Record<PaymentKind, BadgeTone> = {
  deposit: "info",
  balance: "success",
  extra: "warning",
  refund: "danger",
};
export function PaymentKindBadge({ kind }: { kind: PaymentKind }) {
  return <StatusBadge tone={PAYMENT_KIND_TONE[kind]}>{PAYMENT_KIND_LABEL[kind]}</StatusBadge>;
}

// ─── payment_method (label ไทย) ───
export const PAYMENT_METHOD_LABEL: Record<PaymentMethod, string> = {
  cash: "เงินสด",
  transfer: "โอนเงิน",
  qr: "QR พร้อมเพย์",
  credit_card: "บัตรเครดิต",
  debit_card: "บัตรเดบิต",
  ota: "OTA",
  other: "อื่นๆ",
};
