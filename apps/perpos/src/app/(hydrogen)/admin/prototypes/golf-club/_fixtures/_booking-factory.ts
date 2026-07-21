// _booking-factory.ts — internal helper (ไม่ export ผ่าน index.ts) ใช้สร้าง GolfBooking แบบย่อ
// ให้ bookings.ts / bookings-history.ts เรียกใช้ ลดโค้ดซ้ำ + กันพิมพ์ field ตกหล่น
import type {
  GolfBooking,
  GolfBookingChannel,
  GolfBookingItem,
  GolfBookingStatus,
  GolfBookingType,
  GolfPaymentMethod,
  GolfPaymentStatus,
  GolfPriceCategory,
} from "./types";

export const ORG = "org-golf-greenvalley";

export interface BookingItemSpec {
  priceId: string | null;
  category: GolfPriceCategory;
  label: string;
  qty: number;
  unitPrice: number;
}

export interface BookingSpec {
  id: string;
  ref: string | null;
  type: GolfBookingType;
  resource: string;
  date: string; // ISO YYYY-MM-DD
  time: string; // HH:MM
  endTime?: string | null;
  party?: number;
  status: GolfBookingStatus;
  channel: GolfBookingChannel;
  member?: string | null;
  contact?: string | null;
  phone?: string | null;
  caddie?: number;
  cart?: number;
  bucketQty?: number | null;
  bucketPriceId?: string | null;
  amount: number;
  deposit?: number;
  paid?: number;
  payStatus: GolfPaymentStatus;
  payMethod?: GolfPaymentMethod | null;
  items?: BookingItemSpec[]; // ถ้าไม่ระบุ → สร้าง item เดียวจาก simpleItem
  simpleItem?: { priceId: string; category: GolfPriceCategory; label: string };
  checkedInAt?: string | null;
  cancelledAt?: string | null;
  cancelReason?: string | null;
  notes?: string | null;
  createdAt: string;
}

export function mkBooking(p: BookingSpec): GolfBooking {
  let items: GolfBookingItem[];
  if (p.items) {
    items = p.items.map((it, idx) => ({
      id: `${p.id}-i${idx + 1}`,
      price_item_id: it.priceId,
      category: it.category,
      description: it.label,
      qty: it.qty,
      unit_price: it.unitPrice,
      line_total: Math.round(it.qty * it.unitPrice * 100) / 100,
    }));
  } else {
    const si = p.simpleItem ?? {
      priceId: "gf-we-morning",
      category: "green_fee" as GolfPriceCategory,
      label: "ค่าบริการ",
    };
    items = [
      {
        id: `${p.id}-i1`,
        price_item_id: si.priceId,
        category: si.category,
        description: si.label,
        qty: 1,
        unit_price: p.amount,
        line_total: p.amount,
      },
    ];
  }
  return {
    id: p.id,
    org_id: ORG,
    booking_ref: p.ref,
    booking_type: p.type,
    resource_id: p.resource,
    member_id: p.member ?? null,
    contact_name: p.contact ?? null,
    contact_phone: p.phone ?? null,
    booking_date: p.date,
    start_time: p.time,
    end_time: p.endTime ?? null,
    party_size: p.party ?? 1,
    status: p.status,
    channel: p.channel,
    caddie_count: p.caddie ?? 0,
    cart_count: p.cart ?? 0,
    bucket_qty: p.bucketQty ?? null,
    bucket_price_item_id: p.bucketPriceId ?? null,
    total_amount: p.amount,
    deposit_amount: p.deposit ?? 0,
    paid_amount: p.paid ?? 0,
    payment_status: p.payStatus,
    payment_method: p.payMethod ?? null,
    notes: p.notes ?? null,
    created_by: null,
    checked_in_at: p.checkedInAt ?? null,
    cancelled_at: p.cancelledAt ?? null,
    cancel_reason: p.cancelReason ?? null,
    created_at: p.createdAt,
    updated_at: p.createdAt,
    items,
  };
}
