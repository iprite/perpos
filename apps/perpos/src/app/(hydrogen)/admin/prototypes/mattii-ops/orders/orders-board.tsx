"use client";

// orders-board.tsx — มุมมองบอร์ดของหน้าออเดอร์ (คอลัมน์ = 5 ช่วง order_stage · โหมดละเอียด = 14 สถานะ)
// §3.7 ข้อ 4: การ์ดต้องมีปุ่ม "ขั้นถัดไป" เสมอ (a11y — มือถือลากยาก/ไม่มี keyboard path)
//              ปุ่มเดียวบนการ์ด = การกระทำถัดไปตาม state machine · ห้าม dropdown เลือกสถานะ

import { AlertTriangle, ShoppingBag } from "lucide-react";
import cn from "@core/utils/class-names";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/badge";
import { Text } from "@/components/ui/typography";
import { ORDER_STAGE_OF } from "../_fixtures/helpers";
import { ORDER_STAGES, ORDER_STATUS_LABEL } from "../_fixtures/labels";
import type { MattiiOrder, OrderStatus } from "../_fixtures/types";
import {
  NEXT_ACTION,
  OrderStatusBadge,
  PriorityBadge,
  canAdvance,
  daysUntil,
  fmtDateTH,
  fmtMoney,
  useMattiiData,
  useMattiiRole,
} from "../_components";

/** ลำดับสถานะดิบสำหรับโหมด "ละเอียด" (เรียงตามเส้นงานจริง) */
const DETAILED_ORDER: OrderStatus[] = [
  "draft",
  "quoted",
  "confirmed",
  "designing",
  "awaiting_cf",
  "cf_approved",
  "printing",
  "qc",
  "packing",
  "ready_to_ship",
  "shipped",
  "delivered",
  "on_hold",
  "cancelled",
];

function OrderCard({
  order,
  onSelect,
  onAdvance,
}: {
  order: MattiiOrder;
  onSelect: (o: MattiiOrder) => void;
  onAdvance: (o: MattiiOrder) => void;
}) {
  const { role } = useMattiiRole();
  const { customerOf } = useMattiiData();
  const customer = customerOf(order.customer_id);
  const next = NEXT_ACTION[order.status];
  const left = daysUntil(order.due_date);
  const overdue = left !== null && left < 0;

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-3 shadow-sm">
      <div
        role="button"
        tabIndex={0}
        onClick={() => onSelect(order)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onSelect(order);
          }
        }}
        className="cursor-pointer rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-300"
      >
        <div className="flex items-start justify-between gap-2">
          <span className="font-mono text-sm font-semibold text-gray-900">{order.order_no}</span>
          <PriorityBadge priority={order.priority} />
        </div>
        <Text className="mt-0.5 truncate text-xs text-gray-500">
          {customer?.display_name ?? "ไม่ระบุลูกค้า"}
        </Text>
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <OrderStatusBadge status={order.status} />
          {overdue && (
            <StatusBadge tone="danger">
              <AlertTriangle className="mr-1 h-3 w-3" />
              เลยกำหนด {Math.abs(left as number)} วัน
            </StatusBadge>
          )}
        </div>
        <div className="mt-2 flex items-center justify-between text-xs">
          <span className={cn("tabular-nums", overdue ? "text-red-600" : "text-gray-500")}>
            ส่ง {fmtDateTH(order.due_date)}
          </span>
          <span className="font-mono tabular-nums text-gray-900">
            {fmtMoney(order.total_amount)}
          </span>
        </div>
      </div>

      {next && (
        <Button
          size="sm"
          // h-11 — เป้าแตะขนาดนิ้ว (Sale ใช้บอร์ดนี้บนมือถือเป็นหลัก)
          className="mt-3 h-11 w-full"
          disabled={!canAdvance(order.status, role)}
          title={canAdvance(order.status, role) ? undefined : "บทบาทของคุณไม่มีสิทธิ์กดขั้นตอนนี้"}
          onClick={() => onAdvance(order)}
        >
          {next.label}
        </Button>
      )}
    </div>
  );
}

export function OrdersBoard({
  orders,
  detailed,
  onSelect,
  onAdvance,
  onClearFilters,
  onCreate,
  filtered,
  canCreate,
}: {
  orders: MattiiOrder[];
  /** true = แตกคอลัมน์เป็น 14 สถานะดิบ */
  detailed: boolean;
  onSelect: (o: MattiiOrder) => void;
  onAdvance: (o: MattiiOrder) => void;
  onClearFilters: () => void;
  onCreate: () => void;
  /** true = ผลลัพธ์ว่างเพราะตัวกรอง (ไม่ใช่ไม่มีข้อมูลเลย) */
  filtered: boolean;
  canCreate: boolean;
}) {
  const columns = detailed
    ? DETAILED_ORDER.map((s) => ({
        key: s as string,
        label: ORDER_STATUS_LABEL[s],
        rows: orders.filter((o) => o.status === s),
      }))
    : ORDER_STAGES.map((s) => ({
        key: s.key as string,
        label: s.label,
        rows: orders.filter((o) => ORDER_STAGE_OF[o.status] === s.key),
      }));

  if (orders.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border border-gray-200 bg-white py-16 text-center">
        <div className="mb-4 rounded-full bg-gray-100 p-4">
          <ShoppingBag className="h-8 w-8 text-gray-400" />
        </div>
        <Text className="text-sm font-medium text-gray-900">
          {filtered ? "ไม่พบออเดอร์ตามเงื่อนไขที่เลือก" : "ยังไม่มีออเดอร์"}
        </Text>
        <Text className="mt-1 text-sm text-gray-500">
          {filtered ? "ลองล้างตัวกรองหรือเปลี่ยนช่วงวันที่" : "เริ่มจากสร้างออเดอร์แรกจากแชทลูกค้า"}
        </Text>
        {/* DESIGN §8: empty state ต้องมี CTA เสมอ */}
        {filtered ? (
          <Button size="sm" variant="outline" className="mt-4" onClick={onClearFilters}>
            ล้างตัวกรอง
          </Button>
        ) : (
          canCreate && (
            <Button size="sm" className="mt-4" onClick={onCreate}>
              สร้างออเดอร์แรก
            </Button>
          )
        )}
      </div>
    );
  }

  return (
    <div className="flex gap-3 overflow-x-auto pb-2 [scrollbar-width:thin]">
      {columns.map((col) => (
        <div key={col.key} className="w-72 shrink-0">
          <div className="mb-2 flex items-center justify-between px-1">
            <span className="text-sm font-semibold text-gray-900">{col.label}</span>
            <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium tabular-nums text-gray-600">
              {col.rows.length}
            </span>
          </div>
          <div className="space-y-2 rounded-xl bg-gray-50 p-2">
            {col.rows.length === 0 ? (
              <Text className="px-1 py-6 text-center text-xs text-gray-400">ไม่มีงานในช่วงนี้</Text>
            ) : (
              col.rows.map((o) => (
                <OrderCard key={o.id} order={o} onSelect={onSelect} onAdvance={onAdvance} />
              ))
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
