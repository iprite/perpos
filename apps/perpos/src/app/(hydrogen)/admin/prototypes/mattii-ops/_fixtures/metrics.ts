// metrics.ts — แหล่งคำนวณ KPI/ตัวเลขสรุปเดียวของ prototype (Contract v3, binding)
// บทเรียนรอบก่อน: metric เดียวกันโผล่คนละค่าในหลายหน้า → ทุกหน้า/ทุก component ต้องเรียกจากไฟล์นี้
// ห้ามคำนวณ KPI ซ้ำเองในหน้า/component อื่น
import { ORDER_STAGE_LIST, ORDER_STAGE_OF, money } from "./helpers";
import { materials as materialsData } from "./materials";
import { orderItems as orderItemsData } from "./order-items";
import { orders as ordersData } from "./orders";
import { printJobs as printJobsData } from "./print-jobs";
import { shipments as shipmentsData } from "./shipments";
import type {
  MattiiMaterial,
  MattiiOrder,
  MattiiOrderItem,
  MattiiPrintJob,
  MattiiShipment,
  OrderStage,
  OrderStatus,
} from "./types";

// วันนี้แบบตัดเวลา (เที่ยงคืน) — ใช้เทียบ due_date (date-only) สม่ำเสมอทั้งไฟล์
function today0(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function daysBetween(fromIso: string, toIso: string): number {
  return (new Date(toIso).getTime() - new Date(fromIso).getTime()) / (1000 * 60 * 60 * 24);
}

/** สถานะที่ถือว่า "จบงานแล้ว" — ไม่นับเป็นเสี่ยงเลยกำหนดอีกต่อไป */
const CLOSED_STATUSES: OrderStatus[] = ["shipped", "delivered", "cancelled"];

// ---- 1) จำนวนออเดอร์ต่อ stage (5 ช่วง) / ต่อสถานะดิบ (14 ค่า) ----
//
// หมายเหตุ (ui-designer P4a): ทุกฟังก์ชันรับ `src` (ชุดออเดอร์) เป็น optional param — default = fixture
// เพื่อให้หน้า prototype ที่ mutate state ในหน่วยความจำส่งข้อมูล "สด" เข้ามาคิดด้วยสูตรเดียวกันได้
// (ยังเป็นแหล่งคำนวณเดียว — ห้ามไป copy สูตรไปคิดเองในหน้า)

export function countByStage(src: MattiiOrder[] = ordersData): Record<OrderStage, number> {
  const counts = Object.fromEntries(ORDER_STAGE_LIST.map((s) => [s, 0])) as Record<
    OrderStage,
    number
  >;
  for (const o of src) counts[ORDER_STAGE_OF[o.status]] += 1;
  return counts;
}

export function countByStatus(src: MattiiOrder[] = ordersData): Record<OrderStatus, number> {
  const counts: Partial<Record<OrderStatus, number>> = {};
  for (const o of src) counts[o.status] = (counts[o.status] ?? 0) + 1;
  return counts as Record<OrderStatus, number>;
}

// ---- 2) ออเดอร์เสี่ยง/เลยกำหนดส่ง ----

/** เลยกำหนดส่งแล้ว: มี due_date, ยังไม่จบงาน (ไม่ใช่ shipped/delivered/cancelled), due_date < วันนี้ */
export function overdueOrders(src: MattiiOrder[] = ordersData): MattiiOrder[] {
  const t = today0();
  return src.filter(
    (o) => !!o.due_date && !CLOSED_STATUSES.includes(o.status) && new Date(o.due_date) < t,
  );
}
export function overdueOrdersCount(src: MattiiOrder[] = ordersData): number {
  return overdueOrders(src).length;
}

/** ใกล้เลยกำหนด (due_date ภายใน n วันข้างหน้า แต่ยังไม่เลย) — default 2 วัน ใช้กับ "เสี่ยงเลยกำหนด" บน dashboard */
export function atRiskOrders(withinDays = 2, src: MattiiOrder[] = ordersData): MattiiOrder[] {
  const t = today0();
  const horizon = new Date(t);
  horizon.setDate(horizon.getDate() + withinDays);
  return src.filter(
    (o) =>
      !!o.due_date &&
      !CLOSED_STATUSES.includes(o.status) &&
      new Date(o.due_date) >= t &&
      new Date(o.due_date) <= horizon,
  );
}
export function atRiskOrdersCount(withinDays = 2, src: MattiiOrder[] = ordersData): number {
  return atRiskOrders(withinDays, src).length;
}

// ---- 3) ค้างรอ CF เกิน n วัน (default 2 วัน ตามที่ coordinator สั่ง) ----

export function staleAwaitingCfOrders(minDays = 2, src: MattiiOrder[] = ordersData): MattiiOrder[] {
  const now = Date.now();
  return src.filter(
    (o) =>
      o.status === "awaiting_cf" &&
      (now - new Date(o.created_at).getTime()) / (1000 * 60 * 60 * 24) >= minDays,
  );
}
export function staleAwaitingCfCount(minDays = 2, src: MattiiOrder[] = ordersData): number {
  return staleAwaitingCfOrders(minDays, src).length;
}

// ---- 4) วัสดุต่ำกว่า reorder point ----

/** เกณฑ์ "ใกล้หมด" ของวัสดุ 1 รายการ — แหล่งเดียวของกฎนี้ (ตาราง/การ์ด/ dashboard ใช้ตัวนี้) */
export function isLowStockMaterial(m: MattiiMaterial): boolean {
  return m.qty_on_hand < m.reorder_point;
}

export function lowStockMaterials(src: MattiiMaterial[] = materialsData) {
  return src.filter(isLowStockMaterial);
}
export function lowStockMaterialsCount(src: MattiiMaterial[] = materialsData): number {
  return lowStockMaterials(src).length;
}

// ---- 5) COD ค้างเก็บ ----

export function codPendingShipments(src: MattiiShipment[] = shipmentsData) {
  return src.filter((s) => s.cod_amount > 0 && !s.cod_collected);
}
export function codPendingCount(src: MattiiShipment[] = shipmentsData): number {
  return codPendingShipments(src).length;
}
export function codPendingAmount(src: MattiiShipment[] = shipmentsData): number {
  return money(codPendingShipments(src).reduce((sum, s) => sum + s.cod_amount, 0));
}

// ---- 6) ต้นทุน/กำไรต่อออเดอร์ + ยอดรวม (owner-only surface — UI ต้องซ่อนเองตาม §2.3) ----
//
// ปัญหาที่แก้ (QA b7): ต้นทุนจริง (order_costs) เกิดเฉพาะออเดอร์ที่เข้าสายผลิตแล้ว → ออเดอร์ต้นทาง
// total_cost = 0 → กำไร = ยอดขายเต็ม → "%กำไร 100.0%" เรียงกันทั้งตาราง (เจ้าของเลิกเชื่อระบบทันที)
//
// กติกาเดียวของทั้งโมดูล (ห้ามหน้าไหนคิดเอง):
//   basis "actual"    — มีต้นทุนจริงแล้ว (Σ order_costs = orders.total_cost > 0)
//   basis "estimated" — ยังไม่มีต้นทุนจริง → ประมาณการจากรายการพรม Σ(unit_cost × qty)
//                       (unit_cost = base_cost ของขนาด = ค่าวัสดุมาตรฐาน · ยังไม่รวมค่าแรง/ค่าเครื่อง/
//                       ค่าส่ง ที่จะบันทึกจริงตอนเริ่มผลิต → ตัวเลขนี้เป็นเพดานบนของกำไร)
//   basis "none"      — ยกเลิกแล้ว หรือยังไม่มีทั้งต้นทุนจริงและรายการพรม → UI แสดง "—"
//                       และ **ไม่นับ** เข้ายอดรวม/อัตรากำไรเฉลี่ย (ออเดอร์ยกเลิกไม่ควรดันค่าเฉลี่ย)

export type CostBasis = "actual" | "estimated" | "none";

/** ข้อความกำกับความหมายของ "ต้นทุนประมาณการ" — ใช้ร่วมทุกหน้า (เขียนที่เดียว) */
export const ESTIMATED_COST_HINT =
  "ต้นทุนประมาณการจากรายการพรม (ค่าวัสดุมาตรฐาน) — ต้นทุนจริงจะบันทึกเมื่อเริ่มผลิต (ตัดสต๊อก + ค่าแรง + ค่าเครื่อง + ค่าส่ง)";

export interface OrderEconomics {
  totalCost: number;
  grossProfit: number;
  marginPercent: number;
  basis: CostBasis;
}

/** ต้นทุนประมาณการของออเดอร์ = Σ(unit_cost × qty) ของรายการพรมในออเดอร์นั้น */
export function estimatedOrderCost(
  orderId: string,
  itemsSrc: MattiiOrderItem[] = orderItemsData,
): number {
  return money(
    itemsSrc
      .filter((it) => it.order_id === orderId)
      .reduce((s, it) => s + it.unit_cost * it.qty, 0),
  );
}

/** 🔒 owner-only — ต้นทุน/กำไร/%กำไร ของออเดอร์ 1 ใบ พร้อมบอกว่าเป็นต้นทุนจริงหรือประมาณการ */
export function orderEconomics(
  order: MattiiOrder,
  itemsSrc: MattiiOrderItem[] = orderItemsData,
): OrderEconomics {
  const withCost = (totalCost: number, basis: CostBasis): OrderEconomics => {
    const grossProfit = money(order.total_amount - totalCost);
    return {
      totalCost,
      grossProfit,
      marginPercent: order.total_amount > 0 ? money((grossProfit / order.total_amount) * 100) : 0,
      basis,
    };
  };
  const none: OrderEconomics = {
    totalCost: 0,
    grossProfit: 0,
    marginPercent: 0,
    basis: "none",
  };
  if (order.status === "cancelled") return none;
  if (order.total_cost > 0) return withCost(money(order.total_cost), "actual");
  const estimated = estimatedOrderCost(order.id, itemsSrc);
  return estimated > 0 ? withCost(estimated, "estimated") : none;
}

export interface SalesCostProfitTotals {
  totalSales: number;
  totalCost: number;
  grossProfit: number;
  marginPercent: number;
  /** จำนวนออเดอร์ที่ถูกนับในยอดรวม (ไม่รวมยกเลิก/ไม่มีฐานต้นทุน) */
  countedOrders: number;
  /** ในจำนวนที่นับ มีกี่ใบที่ยังใช้ต้นทุนประมาณการ */
  estimatedOrders: number;
  /** ถูกตัดออกจากยอดรวม (ยกเลิก หรือยังไม่มีรายการพรม) */
  excludedOrders: number;
}

export function salesCostProfitTotals(
  src: MattiiOrder[] = ordersData,
  itemsSrc: MattiiOrderItem[] = orderItemsData,
): SalesCostProfitTotals {
  let totalSales = 0;
  let totalCost = 0;
  let countedOrders = 0;
  let estimatedOrders = 0;
  for (const o of src) {
    const e = orderEconomics(o, itemsSrc);
    if (e.basis === "none") continue;
    totalSales += o.total_amount;
    totalCost += e.totalCost;
    countedOrders += 1;
    if (e.basis === "estimated") estimatedOrders += 1;
  }
  totalSales = money(totalSales);
  totalCost = money(totalCost);
  const grossProfit = money(totalSales - totalCost);
  return {
    totalSales,
    totalCost,
    grossProfit,
    marginPercent: totalSales > 0 ? money((grossProfit / totalSales) * 100) : 0,
    countedOrders,
    estimatedOrders,
    excludedOrders: src.length - countedOrders,
  };
}

// ---- 7) lead time เฉลี่ย (รับออเดอร์ → ส่งถึง) — คำนวณจาก orders ที่ delivered_at จริง ----

export function avgLeadTimeDays(src: MattiiOrder[] = ordersData): number {
  const done = src.filter((o) => !!o.delivered_at);
  if (done.length === 0) return 0;
  const total = done.reduce(
    (sum, o) => sum + daysBetween(o.created_at, o.delivered_at as string),
    0,
  );
  return Math.round((total / done.length) * 10) / 10;
}

// ---- 8) อัตราพิมพ์ซ้ำจาก QC ไม่ผ่าน ----

/** % ของออเดอร์ที่เข้าสู่สายผลิตแล้ว (>= printing) ที่มี print_job อย่างน้อย 1 รอบเป็น reprint */
export function reprintRatePercent(
  src: MattiiOrder[] = ordersData,
  printJobsSrc: MattiiPrintJob[] = printJobsData,
): number {
  const inProduction = src.filter((o) =>
    (
      ["printing", "qc", "packing", "ready_to_ship", "shipped", "delivered"] as OrderStatus[]
    ).includes(o.status),
  );
  if (inProduction.length === 0) return 0;
  const reprintOrderIds = new Set(printJobsSrc.filter((p) => p.is_reprint).map((p) => p.order_id));
  const reprintCount = inProduction.filter((o) => reprintOrderIds.has(o.id)).length;
  return Math.round((reprintCount / inProduction.length) * 1000) / 10;
}

// ---- 9) ออเดอร์ "หลุด/มีปัญหา" ต่อเดือน (proxy สำหรับเทียบ baseline.ts — ค้าง CF นานผิดปกติ + ยกเลิก) ----

export function problemOrdersCount(src: MattiiOrder[] = ordersData): number {
  return staleAwaitingCfOrders(5, src).length + src.filter((o) => o.status === "cancelled").length;
}

// ---- 10) อัตราส่งช้า (late rate) — เทียบ benchmarks.ts late_rate_baseline ----
//
// นับเป็น "ช้า" 2 กรณี: (ก) ปิดงานแล้ว (shipped/delivered) แต่ shipped_at/delivered_at อยู่หลัง due_date จริง
// (ข) ยังไม่ส่ง (สถานะ < shipped) แต่ due_date ผ่านไปแล้ว (= overdueOrders) — ตัวหารคือออเดอร์ที่มี due_date
// ทั้งหมด (ไม่รวม cancelled ที่ไม่มีความหมายเรื่องกำหนดส่งอีกต่อไป)

function isHistoricallyLate(o: MattiiOrder): boolean {
  if (!o.due_date) return false;
  const shipRef = o.delivered_at ?? o.shipped_at;
  if (!shipRef) return false;
  return new Date(shipRef) > new Date(`${o.due_date}T23:59:59`);
}

export function lateOrders(src: MattiiOrder[] = ordersData): MattiiOrder[] {
  const overdueIds = new Set(overdueOrders(src).map((o) => o.id));
  return src.filter(
    (o) =>
      !!o.due_date && o.status !== "cancelled" && (isHistoricallyLate(o) || overdueIds.has(o.id)),
  );
}

export function lateRatePercent(src: MattiiOrder[] = ordersData): number {
  const withDue = src.filter((o) => !!o.due_date && o.status !== "cancelled");
  if (withDue.length === 0) return 0;
  return Math.round((lateOrders(src).length / withDue.length) * 1000) / 10;
}

// ---- 11) เวลาเฉลี่ยรอ CF (proxy: confirmed_at → cf_approved_at) — เทียบ benchmarks.ts cf_wait_baseline_days ----

export function avgCfWaitDays(src: MattiiOrder[] = ordersData): number {
  const done = src.filter((o) => !!o.confirmed_at && !!o.cf_approved_at);
  if (done.length === 0) return 0;
  const total = done.reduce(
    (sum, o) => sum + daysBetween(o.confirmed_at as string, o.cf_approved_at as string),
    0,
  );
  return Math.round((total / done.length) * 10) / 10;
}

// ---- ตัวช่วยรวม (ให้หน้า dashboard ดึงครั้งเดียวได้ทุกก้อน) ----

/** ชุดข้อมูลสดอื่น ๆ ที่หน้า dashboard ส่งเข้ามาได้ (ไม่ส่ง = ใช้ fixture ตั้งต้น) */
export interface DashboardSources {
  materials?: MattiiMaterial[];
  shipments?: MattiiShipment[];
  printJobs?: MattiiPrintJob[];
  orderItems?: MattiiOrderItem[];
}

export function dashboardMetrics(src: MattiiOrder[] = ordersData, extra: DashboardSources = {}) {
  const materialsSrc = extra.materials ?? materialsData;
  const shipmentsSrc = extra.shipments ?? shipmentsData;
  const printJobsSrc = extra.printJobs ?? printJobsData;
  const itemsSrc = extra.orderItems ?? orderItemsData;
  return {
    byStage: countByStage(src),
    byStatus: countByStatus(src),
    overdueCount: overdueOrdersCount(src),
    atRiskCount: atRiskOrdersCount(2, src),
    staleAwaitingCfCount: staleAwaitingCfCount(2, src),
    lowStockMaterialsCount: lowStockMaterialsCount(materialsSrc),
    codPendingCount: codPendingCount(shipmentsSrc),
    codPendingAmount: codPendingAmount(shipmentsSrc),
    ...salesCostProfitTotals(src, itemsSrc),
    avgLeadTimeDays: avgLeadTimeDays(src),
    reprintRatePercent: reprintRatePercent(src, printJobsSrc),
    lateRatePercent: lateRatePercent(src),
    avgCfWaitDays: avgCfWaitDays(src),
  };
}
