// filters.ts — ตัวกรองชุดเดียวที่ใช้ร่วมกันทั้ง "มุมมองตาราง" และ "มุมมองบอร์ด"
// (contract §4 หน้า 3: สองมุมมองต้องใช้ filter ชุดเดียวกัน ตัวเลขจึงตรงกันเสมอ)

import { ORDER_STAGE_OF } from "../_fixtures/helpers";
import {
  CHAT_CHANNEL_LABEL,
  ORDER_PRIORITY_LABEL,
  ORDER_STAGES,
  ORDER_STATUS_LABEL,
} from "../_fixtures/labels";
import { overdueOrders, staleAwaitingCfOrders } from "../_fixtures/metrics";
import type {
  ChatChannel,
  MattiiCustomer,
  MattiiOrder,
  OrderPriority,
  OrderStage,
  OrderStatus,
} from "../_fixtures/types";

export interface OrderFilters {
  search: string;
  /** ช่วง 5 stage (โหมดปกติ) */
  stage: OrderStage | "";
  /** สถานะดิบ 14 ค่า (โหมด "ละเอียด") */
  status: OrderStatus | "";
  channel: ChatChannel | "";
  priority: OrderPriority | "";
  from: string;
  to: string;
  /** ตัวกรองด่วนจากหน้าภาพรวม (`?filter=`) — เลยกำหนดส่ง / ค้างรอลูกค้ายืนยันลาย ≥2 วัน */
  flag: "" | "overdue" | "stale_cf";
}

export const EMPTY_FILTERS: OrderFilters = {
  search: "",
  stage: "",
  status: "",
  channel: "",
  priority: "",
  from: "",
  to: "",
  flag: "",
};

/** ป้ายของตัวกรองด่วน (โชว์ให้รู้ว่ากำลังกรองอะไรอยู่เมื่อมาจากหน้าภาพรวม) */
export const FLAG_LABEL: Record<Exclude<OrderFilters["flag"], "">, string> = {
  overdue: "เฉพาะที่เลยกำหนดส่ง",
  stale_cf: "เฉพาะที่ค้างรอลูกค้ายืนยันลาย ≥ 2 วัน",
};

export function hasActiveFilter(f: OrderFilters): boolean {
  return (
    f.search.trim() !== "" ||
    f.stage !== "" ||
    f.status !== "" ||
    f.channel !== "" ||
    f.priority !== "" ||
    f.from !== "" ||
    f.to !== "" ||
    f.flag !== ""
  );
}

export const STAGE_OPTIONS = [
  { value: "", label: "ทุกช่วงงาน" },
  ...ORDER_STAGES.map((s) => ({ value: s.key as string, label: s.label })),
];

export const STATUS_OPTIONS = [
  { value: "", label: "ทุกสถานะ" },
  ...(Object.keys(ORDER_STATUS_LABEL) as OrderStatus[]).map((s) => ({
    value: s as string,
    label: ORDER_STATUS_LABEL[s],
  })),
];

export const CHANNEL_OPTIONS = [
  { value: "", label: "ทุกช่องทาง" },
  ...(Object.keys(CHAT_CHANNEL_LABEL) as ChatChannel[]).map((c) => ({
    value: c as string,
    label: CHAT_CHANNEL_LABEL[c],
  })),
];

export const PRIORITY_OPTIONS = [
  { value: "", label: "ทุกความเร่งด่วน" },
  ...(Object.keys(ORDER_PRIORITY_LABEL) as OrderPriority[]).map((p) => ({
    value: p as string,
    label: ORDER_PRIORITY_LABEL[p],
  })),
];

/** กรองออเดอร์ตามตัวกรอง (ค้นหาจากเลขที่ออเดอร์ / ชื่อลูกค้า / รหัสลูกค้า) */
export function filterOrders(
  orders: MattiiOrder[],
  f: OrderFilters,
  customers: MattiiCustomer[],
): MattiiOrder[] {
  const q = f.search.trim().toLowerCase();
  // ตัวกรองด่วนใช้เกณฑ์เดียวกับ metrics.ts (แหล่งเดียว) — ตัวเลขบนการ์ดหน้าภาพรวมกับจำนวนแถวที่นี่จึงตรงกันเสมอ
  const flagged =
    f.flag === "overdue"
      ? new Set(overdueOrders(orders).map((o) => o.id))
      : f.flag === "stale_cf"
        ? new Set(staleAwaitingCfOrders(2, orders).map((o) => o.id))
        : null;
  return orders.filter((o) => {
    if (flagged && !flagged.has(o.id)) return false;
    if (f.stage && ORDER_STAGE_OF[o.status] !== f.stage) return false;
    if (f.status && o.status !== f.status) return false;
    if (f.channel && o.source_channel !== f.channel) return false;
    if (f.priority && o.priority !== f.priority) return false;
    if (f.from && o.created_at.slice(0, 10) < f.from) return false;
    if (f.to && o.created_at.slice(0, 10) > f.to) return false;
    if (q) {
      const c = customers.find((x) => x.id === o.customer_id);
      const hay = `${o.order_no} ${c?.display_name ?? ""} ${c?.code ?? ""}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

/** เรียงล่าสุดก่อน (ตามวันที่สร้าง) */
export function sortByNewest(orders: MattiiOrder[]): MattiiOrder[] {
  return [...orders].sort((a, b) => b.created_at.localeCompare(a.created_at));
}
