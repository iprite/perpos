"use client";

import React from "react";
import { Button } from "rizzui";
import { CalendarClock, ClipboardList, Timer } from "lucide-react";

import {
  asMoney,
  customerNameFromRel,
  formatDateTime,
  serviceNameFromRel,
  statusLabel,
  type EventRow,
  type OrderItemRow,
  type OrderRow,
} from "./_types";

function itemStatusLabel(s: OrderItemRow["ops_status"]) {
  if (s === "not_started") return "ยังไม่เริ่ม";
  if (s === "in_progress") return "กำลังดำเนินการ";
  return "เสร็จสิ้น";
}

function badgeClassForItemStatus(s: OrderItemRow["ops_status"]) {
  if (s === "done") return "border-green-200 bg-green-50 text-green-700";
  if (s === "in_progress") return "border-blue-200 bg-blue-50 text-blue-700";
  return "border-gray-200 bg-gray-50 text-gray-700";
}

export function ManageOrderSummaryCard({
  order,
  items,
  events,
  loading,
  onShowQuotation,
  isLocked,
  onOpenAddInstallment,
  incomeTotal,
  expenseTotal,
  netProfit,
  onCreateExpense,
}: {
  order: OrderRow | null;
  items: OrderItemRow[];
  events: EventRow[];
  loading: boolean;
  onShowQuotation: () => void;
  isLocked: boolean;
  onOpenAddInstallment: () => void;
  incomeTotal: number;
  expenseTotal: number;
  netProfit: number;
  onCreateExpense: () => void;
}) {
  const startedAt = (() => {
    const parse = (s: string | null | undefined) => {
      if (!s) return null;
      const d = new Date(s);
      return Number.isFinite(d.getTime()) ? d : null;
    };

    const eventStart = (() => {
      const startEvents = (events ?? []).filter((e) => e.event_type === "service_started").map((e) => parse(e.created_at)).filter(Boolean) as Date[];
      if (startEvents.length === 0) return null;
      return startEvents.reduce((min, d) => (d.getTime() < min.getTime() ? d : min), startEvents[0]);
    })();

    const itemStart = (() => {
      const starts = (items ?? []).map((it) => parse(it.ops_started_at)).filter(Boolean) as Date[];
      if (starts.length === 0) return null;
      return starts.reduce((min, d) => (d.getTime() < min.getTime() ? d : min), starts[0]);
    })();

    if (eventStart && itemStart) return eventStart.getTime() <= itemStart.getTime() ? eventStart : itemStart;
    return eventStart ?? itemStart ?? null;
  })();

  const startedDays = (() => {
    if (!startedAt) return null;
    const end = (() => {
      if (order?.closed_at) {
        const d = new Date(order.closed_at);
        if (Number.isFinite(d.getTime())) return d;
      }
      return new Date();
    })();

    const s = Date.UTC(startedAt.getFullYear(), startedAt.getMonth(), startedAt.getDate());
    const e = Date.UTC(end.getFullYear(), end.getMonth(), end.getDate());
    const diff = Math.floor((e - s) / (24 * 60 * 60 * 1000)) + 1;
    return Math.max(1, diff);
  })();

  const remaining = Number(order?.remaining_amount ?? 0);
  const hasOutstanding = Number.isFinite(remaining) ? remaining > 0 : false;
  const canAddInstallment = hasOutstanding && !isLocked && order?.status === "in_progress";

  const status = String(order?.status ?? "");
  const statusBadge = (() => {
    if (status === "in_progress") return "border-blue-200 bg-blue-50 text-blue-700";
    if (status === "completed") return "border-green-200 bg-green-50 text-green-700";
    if (status === "cancelled") return "border-red-200 bg-red-50 text-red-700";
    return "border-gray-200 bg-gray-50 text-gray-700";
  })();

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <div className="relative overflow-hidden rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <div className="absolute -right-16 -top-16 h-44 w-44 rounded-full bg-gradient-to-br from-indigo-50 to-cyan-50" />
        <div className="relative flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-600 to-cyan-600 text-white shadow-sm">
              <ClipboardList className="h-5 w-5" />
            </div>
            <div>
              <div className="text-sm font-semibold text-gray-900">ข้อมูลออเดอร์</div>
              <div className="mt-0.5 text-xs text-gray-500">{order?.display_id ?? order?.id ?? "-"}</div>
            </div>
          </div>
          <span className={`inline-flex items-center rounded-full border px-2 py-1 text-xs font-semibold ${statusBadge}`}>{statusLabel(status || "-")}</span>
        </div>

        <div className="relative mt-4">
          <div className="text-xs font-semibold text-gray-500">ลูกค้า</div>
          <div className="mt-1 text-lg font-semibold text-gray-900">{customerNameFromRel(order?.customers ?? null)}</div>

          <div className="mt-3 flex flex-wrap gap-2">
            <span className="inline-flex items-center gap-2 rounded-full border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700">
              <CalendarClock className="h-4 w-4 text-gray-500" />
              เริ่ม: {startedAt ? startedAt.toLocaleDateString("th-TH", { year: "numeric", month: "2-digit", day: "2-digit" }) : "-"}
            </span>
            <span className="inline-flex items-center gap-2 rounded-full border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700">
              <Timer className="h-4 w-4 text-gray-500" />
              {startedDays ? `เริ่มมาแล้ว ${startedDays} วัน` : "เริ่มมาแล้ว -"}
            </span>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-4">
        <div className="text-sm font-semibold text-gray-900">ข้อมูลการเงิน</div>
        <div className="mt-4 space-y-3">
          <div className="flex items-baseline justify-between gap-3">
            <div className="text-sm text-gray-600">ยอดสุทธิ</div>
            <div className="text-lg font-semibold tabular-nums text-gray-900">{asMoney(Number(order?.total ?? 0))}</div>
          </div>
          <div className="flex items-baseline justify-between gap-3">
            <div className="text-sm text-gray-600">ยอดชำระแล้ว</div>
            <div className="text-base tabular-nums text-gray-900">{asMoney(Number(order?.paid_amount ?? 0))}</div>
          </div>
          <div className="flex items-baseline justify-between gap-3">
            <div className="text-sm text-gray-600">ยอดคงเหลือ</div>
            <div className="text-base tabular-nums text-gray-900">{asMoney(Number(order?.remaining_amount ?? 0))}</div>
          </div>
          <div className="h-px bg-gray-100" />
          <div className="flex items-baseline justify-between gap-3">
            <div className="text-sm text-gray-600">รวมรายรับ</div>
            <div className="text-base tabular-nums text-green-700">{asMoney(Number(incomeTotal ?? 0))}</div>
          </div>
          <div className="flex items-baseline justify-between gap-3">
            <div className="text-sm text-gray-600">รวมรายจ่าย</div>
            <div className="text-base tabular-nums text-red-700">{asMoney(Number(expenseTotal ?? 0))}</div>
          </div>
          <div className="flex items-baseline justify-between gap-3">
            <div className="text-sm font-semibold text-gray-900">กำไรสุทธิ</div>
            <div className="text-lg font-semibold tabular-nums text-gray-900">{asMoney(Number(netProfit ?? 0))}</div>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap justify-end gap-2">
          <Button size="sm" variant="outline" onClick={onShowQuotation} disabled={loading || !order?.source_quote_id}>
            แสดงใบเสนอราคา
          </Button>
          <Button size="sm" variant="outline" onClick={onCreateExpense} disabled={loading}>
            บันทึกรายจ่าย
          </Button>
          {hasOutstanding ? (
            <Button size="sm" variant="outline" onClick={onOpenAddInstallment} disabled={loading || !canAddInstallment}>
              เพิ่มงวดชำระ
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export function ManageOrderServicesCard({
  items,
  orderStatus,
  isLocked,
  loading,
  onStart,
  onDone,
  onAddDocument,
}: {
  items: OrderItemRow[];
  orderStatus: string;
  isLocked: boolean;
  loading: boolean;
  onStart: (item: OrderItemRow) => void;
  onDone: (item: OrderItemRow) => void;
  onAddDocument?: (item: OrderItemRow) => void;
}) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white">
      <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
        <div className="text-sm font-semibold text-gray-900">งานบริการในออเดอร์</div>
        <div className="text-xs text-gray-500">คลิกเพื่อเริ่ม/ปิดงานรายบริการ</div>
      </div>
      {items.length === 0 ? (
        <div className="px-4 py-8 text-sm text-gray-500">{loading ? "กำลังโหลด..." : "ยังไม่มีบริการในออเดอร์"}</div>
      ) : (
        <div className="divide-y divide-gray-100">
          {items.map((it) => {
            const canStart = !isLocked && orderStatus === "in_progress" && it.ops_status === "not_started";
            const canDone = !isLocked && orderStatus === "in_progress" && it.ops_status === "in_progress";
            return (
              <div key={it.id} className="grid gap-2 px-4 py-3 md:grid-cols-[1.2fr_0.8fr_180px] md:items-center">
                <div>
                  <div className="text-sm font-semibold text-gray-900">{serviceNameFromRel(it.services ?? null)}</div>
                  <div className="mt-1 text-xs text-gray-500">เริ่ม: {formatDateTime(it.ops_started_at)} • เสร็จ: {formatDateTime(it.ops_completed_at)}</div>
                </div>
                <div>
                  <span className={`inline-flex items-center rounded-full border px-2 py-1 text-xs font-semibold ${badgeClassForItemStatus(it.ops_status)}`}>
                    {itemStatusLabel(it.ops_status)}
                  </span>
                </div>
                <div className="flex justify-end gap-2">
                  {canStart ? (
                    <Button size="sm" className="whitespace-nowrap" onClick={() => onStart(it)} disabled={loading}>
                      เริ่มดำเนินการ
                    </Button>
                  ) : null}
                  {canDone ? (
                    <Button size="sm" variant="outline" className="whitespace-nowrap" onClick={() => onDone(it)} disabled={loading}>
                      เสร็จสิ้น
                    </Button>
                  ) : null}
                  {onAddDocument ? (
                    <Button size="sm" variant="outline" className="whitespace-nowrap" onClick={() => onAddDocument(it)} disabled={loading}>
                      เพิ่มเอกสาร
                    </Button>
                  ) : null}
                  {!canStart && !canDone && !onAddDocument ? <span className="text-xs text-gray-400">-</span> : null}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function ManageOrderEventsCard({ events, loading }: { events: EventRow[]; loading: boolean }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white">
      <div className="border-b border-gray-200 px-4 py-3 text-sm font-semibold text-gray-900">ประวัติการทำรายการ</div>
      {events.length === 0 ? (
        <div className="px-4 py-8 text-sm text-gray-500">{loading ? "กำลังโหลด..." : "ยังไม่มีประวัติ"}</div>
      ) : (
        <div className="divide-y divide-gray-100">
          {events.map((ev) => (
            <div key={ev.id} className="px-4 py-3">
              <div className="text-sm text-gray-900">{ev.message}</div>
              <div className="mt-0.5 flex flex-wrap gap-x-2 gap-y-0.5 text-xs text-gray-500">
                <span>{formatDateTime(ev.created_at)}</span>
                {ev.created_by_email ? <span>• {ev.created_by_email}</span> : null}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
