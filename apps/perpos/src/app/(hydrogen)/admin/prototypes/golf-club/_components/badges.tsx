// badges.tsx — map enum → StatusBadge (tone + ป้ายไทย + icon) สำหรับ golf-club
// ทุก enum ยึด _fixtures/types.ts · a11y: สถานะไม่พึ่งสีเดียว → icon+label ควบเสมอ (§5c-grid / §4)

import type { ReactNode } from "react";
import {
  Clock,
  CheckCircle2,
  LogIn,
  Flag,
  Ban,
  UserX,
  Wallet,
  CircleDot,
  Users,
  Wrench,
  Plus,
  MessageCircle,
} from "lucide-react";
import { StatusBadge, type BadgeTone } from "@/components/ui/badge";
import type {
  GolfBookingStatus,
  GolfPaymentStatus,
  GolfMemberType,
  GolfBookingChannel,
  GolfTier,
  GolfSlotOccupancy,
} from "../_fixtures/types";

type Meta = { tone: BadgeTone; label: string; icon: ReactNode };

// ─── booking_status (§4 lifecycle) — no_show = danger + UserX (ไม่พึ่งแดงเปล่า) ───
const BOOKING_STATUS: Record<GolfBookingStatus, Meta> = {
  pending: { tone: "warning", label: "รอยืนยัน", icon: <Clock className="h-3 w-3" /> },
  confirmed: { tone: "info", label: "ยืนยันแล้ว", icon: <CheckCircle2 className="h-3 w-3" /> },
  checked_in: { tone: "success", label: "เช็คอินแล้ว", icon: <LogIn className="h-3 w-3" /> },
  completed: { tone: "success", label: "เล่นจบ", icon: <Flag className="h-3 w-3" /> },
  cancelled: { tone: "neutral", label: "ยกเลิก", icon: <Ban className="h-3 w-3" /> },
  no_show: { tone: "danger", label: "ไม่มาตามนัด", icon: <UserX className="h-3 w-3" /> },
};
export const bookingStatusMeta = (s: GolfBookingStatus): Meta => BOOKING_STATUS[s];
export function BookingStatusBadge({ status }: { status: GolfBookingStatus }) {
  const m = BOOKING_STATUS[status];
  return (
    <StatusBadge tone={m.tone} className="gap-1">
      {m.icon}
      {m.label}
    </StatusBadge>
  );
}

// ป้ายสั้นสำหรับเซลล์ในตารางจอง (grid) — เซลล์แคบ ใช้ label ย่อ + ขนาดกะทัดรัด (a11y: icon + title เต็ม)
const BOOKING_STATUS_SHORT: Record<GolfBookingStatus, string> = {
  pending: "รอยืนยัน",
  confirmed: "ยืนยัน",
  checked_in: "เช็คอิน",
  completed: "จบรอบ",
  cancelled: "ยกเลิก",
  no_show: "ไม่มา",
};
export function GridStatusBadge({ status }: { status: GolfBookingStatus }) {
  const m = BOOKING_STATUS[status];
  return (
    <StatusBadge
      tone={m.tone}
      title={m.label}
      className="max-w-full gap-0.5 px-1.5 py-0 text-[10px] leading-tight"
    >
      {m.icon}
      {BOOKING_STATUS_SHORT[status]}
    </StatusBadge>
  );
}

// ─── payment_status [D2] ───
const PAYMENT_STATUS: Record<GolfPaymentStatus, Meta> = {
  unpaid: { tone: "neutral", label: "ยังไม่ชำระ", icon: <Wallet className="h-3 w-3" /> },
  deposit_paid: { tone: "warning", label: "มัดจำแล้ว", icon: <Wallet className="h-3 w-3" /> },
  paid: { tone: "success", label: "ชำระเต็ม", icon: <CheckCircle2 className="h-3 w-3" /> },
  refunded: { tone: "neutral", label: "คืนเงินแล้ว", icon: <Wallet className="h-3 w-3" /> },
};
export const paymentStatusMeta = (s: GolfPaymentStatus): Meta => PAYMENT_STATUS[s];
export function PaymentStatusBadge({ status }: { status: GolfPaymentStatus }) {
  const m = PAYMENT_STATUS[status];
  return (
    <StatusBadge tone={m.tone} className="gap-1">
      {m.icon}
      {m.label}
    </StatusBadge>
  );
}

// ─── member_type ───
export const MEMBER_TYPE_LABEL: Record<GolfMemberType, string> = {
  member: "สมาชิก",
  guest: "บุคคลทั่วไป",
  vip: "VIP",
};
const MEMBER_TYPE_TONE: Record<GolfMemberType, BadgeTone> = {
  member: "info",
  guest: "neutral",
  vip: "warning",
};
export function MemberTypeBadge({ type }: { type: GolfMemberType }) {
  return <StatusBadge tone={MEMBER_TYPE_TONE[type]}>{MEMBER_TYPE_LABEL[type]}</StatusBadge>;
}

// ─── tier ───
export const TIER_LABEL: Record<GolfTier, string> = {
  none: "—",
  silver: "Silver",
  gold: "Gold",
  platinum: "Platinum",
};

// ─── channel (ช่องทางจอง) ───
export const CHANNEL_LABEL: Record<GolfBookingChannel, string> = {
  line: "LINE",
  walk_in: "หน้าเคาน์เตอร์",
  web: "เว็บไซต์",
  phone: "โทรศัพท์",
};
// LINE = ช่องทาง self-service เด่นของ module → icon + tone info ให้สแกนตาเร็ว · ช่องทางอื่น neutral
const CHANNEL_META: Record<GolfBookingChannel, { tone: BadgeTone; icon?: ReactNode }> = {
  line: { tone: "info", icon: <MessageCircle className="h-3 w-3" /> },
  walk_in: { tone: "neutral" },
  web: { tone: "neutral" },
  phone: { tone: "neutral" },
};
export function ChannelBadge({ channel }: { channel: GolfBookingChannel }) {
  const m = CHANNEL_META[channel];
  return (
    <StatusBadge tone={m.tone} className={m.icon ? "gap-1" : undefined}>
      {m.icon}
      {CHANNEL_LABEL[channel]}
    </StatusBadge>
  );
}

// ─── slot state (grid cell + legend) — §5c-grid token map (ห้าม hex, เต็ม≠แดง) ───
export interface SlotStateMeta {
  label: string;
  icon: ReactNode;
  /** class สำหรับเซลล์ในตาราง (border + bg + text) */
  cell: string;
  /** class สำหรับ swatch ใน legend */
  swatch: string;
}
export const SLOT_STATE_META: Record<GolfSlotOccupancy, SlotStateMeta> = {
  ว่าง: {
    label: "ว่าง",
    icon: <CircleDot className="h-3.5 w-3.5" />,
    cell: "border-gray-200 bg-white hover:bg-gray-50 text-gray-500",
    swatch: "border-gray-200 bg-white",
  },
  บางส่วน: {
    label: "บางส่วน",
    icon: <Users className="h-3.5 w-3.5" />,
    cell: "border-blue-200 bg-blue-50 text-blue-700",
    swatch: "border-blue-200 bg-blue-50",
  },
  เต็ม: {
    label: "เต็ม",
    icon: <Ban className="h-3.5 w-3.5" />,
    cell: "border-gray-300 bg-gray-100 text-gray-400",
    swatch: "border-gray-300 bg-gray-100",
  },
  ปิดซ่อม: {
    label: "ปิดซ่อม",
    icon: <Wrench className="h-3.5 w-3.5" />,
    cell: "border-amber-200 bg-amber-50 text-amber-700",
    swatch: "border-amber-200 bg-amber-50",
  },
};

/** ไอคอน "เพิ่มจอง" สำหรับ hover เซลล์ว่าง */
export const AddSlotIcon = Plus;

/** Legend bar เหนือ grid (a11y — ไม่พึ่งสีเดียว) */
export function SlotLegend({
  states = ["ว่าง", "บางส่วน", "เต็ม"],
  className,
}: {
  states?: GolfSlotOccupancy[];
  className?: string;
}) {
  return (
    <div
      className={`flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11px] text-gray-500 ${className ?? ""}`}
    >
      {states.map((s) => {
        const m = SLOT_STATE_META[s];
        return (
          <span key={s} className="flex items-center gap-1.5">
            <span className={`flex h-4 w-4 items-center justify-center rounded border ${m.swatch}`}>
              {m.icon}
            </span>
            {m.label}
          </span>
        );
      })}
    </div>
  );
}
