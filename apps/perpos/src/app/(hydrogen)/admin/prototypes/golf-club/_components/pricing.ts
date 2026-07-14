// pricing.ts — auto price resolver (§3.9 member_price LOCKED) — pure functions, ไม่มี JSX
// owner: ui Group A · reuse โดย booking-form-dialog / line-preview (relative import)
//
// resolve order (LOCKED §3.3/§3.9):
//   (1) member มี plan active → ราคาฐาน (member_type='all') − plan.green_fee_discount_pct
//   (2) ไม่มี plan แต่ member_type member/vip → ใช้ราคา catalog member/vip row ตรง (ไม่หัก %)
//   (3) guest/ไม่เข้าเงื่อนไข → ราคาฐาน · ห้ามหักซ้อน

import type {
  GolfBookingItem,
  GolfMember,
  GolfMembershipPlan,
  GolfPriceItem,
  GolfPriceMemberType,
} from "../_fixtures/types";
import { TODAY_ISO } from "./format";
import { fmtNum } from "./money";
import { TIER_LABEL } from "./badges";

/** วันหยุด = เสาร์(6)/อาทิตย์(0) */
export function isWeekend(dateISO: string): boolean {
  const d = new Date(dateISO);
  const dow = d.getUTCDay();
  return dow === 0 || dow === 6;
}

/** สมาชิกภาพ active = มี plan + ยังไม่หมดอายุ */
export function membershipActive(m: GolfMember | null | undefined): boolean {
  return (
    !!m &&
    !!m.membership_plan_id &&
    !!m.membership_expires_at &&
    m.membership_expires_at >= TODAY_ISO
  );
}

function findGreenFee(
  priceItems: GolfPriceItem[],
  dayType: "weekday" | "weekend",
  memberType: GolfPriceMemberType,
): GolfPriceItem | undefined {
  return priceItems.find(
    (p) =>
      p.category === "green_fee" &&
      p.is_active &&
      p.member_type === memberType &&
      (p.day_type === dayType || p.day_type === "all"),
  );
}

export interface GreenFeeQuote {
  base: number;
  unit: number;
  /** ที่มาราคา — "กรีนฟี 2,500 − Gold 15% = 2,125 ฿" */
  source: string;
}

/** ราคากรีนฟีต่อคน + ที่มา (โชว์ให้ตรวจ) */
export function quoteGreenFee(
  dateISO: string,
  member: GolfMember | null,
  priceItems: GolfPriceItem[],
  plans: GolfMembershipPlan[],
): GreenFeeQuote {
  const dayType = isWeekend(dateISO) ? "weekend" : "weekday";
  const baseItem = findGreenFee(priceItems, dayType, "all");
  const base = baseItem?.price ?? 0;

  // (1) plan active → หัก %
  if (member && membershipActive(member)) {
    const plan = plans.find((p) => p.id === member.membership_plan_id);
    const disc = plan?.green_fee_discount_pct ?? 0;
    const unit = Math.round(base * (1 - disc / 100));
    return {
      base,
      unit,
      source: `กรีนฟี ${fmtNum(base)} − ${TIER_LABEL[plan?.tier ?? "none"]} ${disc}% = ${fmtNum(unit)} ฿`,
    };
  }

  // (2) member/vip catalog row (ไม่หัก %)
  if (member && (member.member_type === "member" || member.member_type === "vip")) {
    const row = findGreenFee(priceItems, dayType, member.member_type);
    if (row) {
      return {
        base,
        unit: row.price,
        source: `ราคา${member.member_type === "vip" ? "VIP" : "สมาชิก"} ${fmtNum(row.price)} ฿ (ไม่มีแพ็กเกจ)`,
      };
    }
  }

  // (3) ราคาปกติ
  return { base, unit: base, source: `กรีนฟี ${fmtNum(base)} ฿ (ราคาปกติ)` };
}

function activePrice(priceItems: GolfPriceItem[], category: string): GolfPriceItem | undefined {
  return priceItems.find((p) => p.category === category && p.is_active);
}

export interface QuoteInput {
  booking_type: "tee_time" | "driving_range";
  booking_date: string;
  member: GolfMember | null;
  party_size: number;
  caddie_count: number;
  cart_count: number;
  bucket_price_item_id: string | null;
  bucket_qty: number;
}

export interface BookingQuote {
  items: GolfBookingItem[];
  total: number;
  /** ที่มาราคากรีนฟี (tee) — null สำหรับไดร์ฟ */
  greenFeeSource: string | null;
}

let itemSeq = 1;
const itemId = () => `qitem-${itemSeq++}`;

/** คิดยอดอัตโนมัติ + breakdown (green fee = member_price §3.9) */
export function quoteBooking(input: QuoteInput, priceItems: GolfPriceItem[], plans: GolfMembershipPlan[]): BookingQuote {
  const items: GolfBookingItem[] = [];
  let greenFeeSource: string | null = null;

  if (input.booking_type === "tee_time") {
    const gf = quoteGreenFee(input.booking_date, input.member, priceItems, plans);
    greenFeeSource = gf.source;
    const party = Math.max(1, input.party_size);
    items.push({
      id: itemId(),
      price_item_id: null,
      category: "green_fee",
      description: `กรีนฟี 18 หลุม ×${party}`,
      qty: party,
      unit_price: gf.unit,
      line_total: gf.unit * party,
    });
    if (input.caddie_count > 0) {
      const c = activePrice(priceItems, "caddie");
      const up = c?.price ?? 300;
      items.push({
        id: itemId(),
        price_item_id: c?.id ?? null,
        category: "caddie",
        description: `แคดดี้ ×${input.caddie_count}`,
        qty: input.caddie_count,
        unit_price: up,
        line_total: up * input.caddie_count,
      });
    }
    if (input.cart_count > 0) {
      const c = activePrice(priceItems, "cart");
      const up = c?.price ?? 800;
      items.push({
        id: itemId(),
        price_item_id: c?.id ?? null,
        category: "cart",
        description: `รถกอล์ฟ ×${input.cart_count}`,
        qty: input.cart_count,
        unit_price: up,
        line_total: up * input.cart_count,
      });
    }
  } else {
    const bucket = priceItems.find((p) => p.id === input.bucket_price_item_id) ?? null;
    const up = bucket?.price ?? 0;
    const qty = Math.max(1, input.bucket_qty);
    items.push({
      id: itemId(),
      price_item_id: bucket?.id ?? null,
      category: "range_bucket",
      description: `${bucket?.name ?? "ตะกร้าลูก"} ×${qty}`,
      qty,
      unit_price: up,
      line_total: up * qty,
    });
  }

  const total = items.reduce((s, it) => s + it.line_total, 0);
  return { items, total, greenFeeSource };
}
