// money.ts — สูตรเงินของ mattii_ops (Contract v3 §3.6/§3.8) — แหล่งเดียว ห้ามคิดสูตรซ้ำในหน้า
//
// กฎ (contract):
//   subtotal            = Σ line_total ของ order_items
//   total_amount        = subtotal − discount_amount + shipping_fee + rush_fee
//   outstanding_amount  = total_amount − paid_amount
//   gross_profit        = total_amount − ต้นทุน (🔒 owner-only — คิดที่ metrics.orderEconomics())
//   margin_percent      = gross_profit / total_amount × 100 (🔒 owner-only — ที่เดียวกัน)
//   ต้นทุนที่ใช้ = ต้นทุนจริงจาก order_costs · ถ้ายังไม่มี → ประมาณการ Σ(unit_cost × qty) ของรายการพรม

import type { MattiiOrder, MattiiOrderItem } from "../_fixtures/types";
import { fabricUsage as fabricUsageOf, money as round2 } from "../_fixtures/helpers";

// สูตรฐาน (ปัดเงิน / ผ้าที่ใช้ต่อผืน) อยู่ที่ _fixtures/helpers.ts ที่เดียว —
// ที่นี่ re-export ด้วยชื่อที่ฝั่ง UI ใช้ ห้าม define สูตรซ้ำ (module-reviewer P4a nice-1)
export { fabricUsageOf, round2 };

/** รวม line_total ของรายการพรม */
export function sumSubtotal(items: MattiiOrderItem[]): number {
  return round2(items.reduce((s, it) => s + it.line_total, 0));
}

/** ราคารวมของ 1 รายการ = qty × unit_price */
export function lineTotalOf(qty: number, unitPrice: number): number {
  return round2(qty * unitPrice);
}

/** ราคา custom_cut จาก ตร.ม. × ราคาต่อ ตร.ม. */
export function customCutPrice(widthCm: number, lengthCm: number, pricePerSqm: number): number {
  return round2(((widthCm * lengthCm) / 10000) * pricePerSqm);
}

export interface OrderTotals {
  subtotal: number;
  total_amount: number;
  outstanding_amount: number;
}

/** คำนวณยอดของออเดอร์ใหม่จากรายการปัจจุบัน (ใช้ตอน เพิ่ม/แก้/ลบ order_item) */
export function recalcOrderTotals(order: MattiiOrder, items: MattiiOrderItem[]): OrderTotals {
  const subtotal = sumSubtotal(items);
  const total = round2(subtotal - order.discount_amount + order.shipping_fee + order.rush_fee);
  return {
    subtotal,
    total_amount: total,
    outstanding_amount: round2(total - order.paid_amount),
  };
}

// 🔒 owner-only — ต้นทุน/กำไร/%กำไร ของออเดอร์: ใช้ `orderEconomics()` ใน _fixtures/metrics.ts
// เท่านั้น (รองรับต้นทุนประมาณการเมื่อยังไม่มีต้นทุนจริง) — เดิมมี profitOf() ที่นี่ แต่ทำให้ออเดอร์
// ก่อนเข้าสายผลิตโชว์ "%กำไร 100%" จึงถอดออก ห้ามเขียนสูตรกำไรซ้ำที่นี่อีก
