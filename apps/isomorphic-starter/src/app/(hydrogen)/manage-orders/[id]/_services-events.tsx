"use client";

import React from "react";
import { Button } from "rizzui";

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

function customerFromRel(rel: any) {
  if (!rel) return null;
  if (Array.isArray(rel)) return rel[0] ?? null;
  return rel;
}

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
  isLocked,
  onOpenAddInstallment,
  unpaidBilledTotal,
  incomeTotal,
  expenseTotal,
  netProfit,
  onCreateExpense,
}: {
  order: OrderRow | null;
  items: OrderItemRow[];
  events: EventRow[];
  loading: boolean;
  isLocked: boolean;
  onOpenAddInstallment: () => void;
  unpaidBilledTotal: number;
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
  const unpaidBilled = Number(unpaidBilledTotal ?? 0);
  const hasUnpaidBilled = Number.isFinite(unpaidBilled) ? unpaidBilled > 0 : false;

  const customer = customerFromRel((order as any)?.customers ?? null) as
    | { name?: string | null; tax_id?: string | null; address?: string | null; contact_name?: string | null; phone?: string | null }
    | null;
  const customerName = customerNameFromRel((order as any)?.customers ?? null);
  const customerTaxId = String(customer?.tax_id ?? "").trim();
  const customerAddress = String(customer?.address ?? "").trim();
  const customerContact = String(customer?.contact_name ?? "").trim();
  const customerPhone = String(customer?.phone ?? "").trim();

  const status = String(order?.status ?? "");

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <div className="rounded-xl border border-gray-200 bg-white p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-sm font-semibold text-gray-900">ข้อมูลออเดอร์</div>
            <div className="mt-0.5 text-xs text-gray-500">{order?.display_id ?? order?.id ?? "-"}</div>
          </div>
          <span className="inline-flex items-center rounded-full border border-gray-200 bg-gray-50 px-2 py-1 text-xs font-semibold text-gray-700">
            {statusLabel(status || "-")}
          </span>
        </div>

        <div className="mt-4 grid gap-4">
          <div>
            <div className="text-xs font-semibold text-gray-500">ลูกค้า</div>
            <div className="mt-1 text-sm font-semibold text-gray-900">{customerName}</div>
            <div className="mt-3 grid gap-1 text-sm text-gray-700">
              <div className="flex items-start justify-between gap-3">
                <div className="shrink-0 text-gray-600">เลขผู้เสียภาษี</div>
                <div className="min-w-0 text-right font-medium text-gray-900">{customerTaxId || "-"}</div>
              </div>
              <div className="flex items-start justify-between gap-3">
                <div className="shrink-0 text-gray-600">ที่อยู่</div>
                <div className="min-w-0 text-right font-medium text-gray-900">{customerAddress || "-"}</div>
              </div>
              <div className="flex items-start justify-between gap-3">
                <div className="shrink-0 text-gray-600">ผู้ติดต่อ</div>
                <div className="min-w-0 text-right font-medium text-gray-900">{customerContact || "-"}</div>
              </div>
              <div className="flex items-start justify-between gap-3">
                <div className="shrink-0 text-gray-600">เบอร์ผู้ติดต่อ</div>
                <div className="min-w-0 text-right font-medium text-gray-900">{customerPhone || "-"}</div>
              </div>
            </div>
          </div>

          <div className="grid gap-1 text-sm text-gray-700">
            <div className="flex items-center justify-between gap-3">
              <div className="text-gray-600">เริ่มดำเนินการ</div>
              <div className="font-medium text-gray-900">
                {startedAt ? startedAt.toLocaleDateString("th-TH", { year: "numeric", month: "2-digit", day: "2-digit" }) : "-"}
              </div>
            </div>
            <div className="flex items-center justify-between gap-3">
              <div className="text-gray-600">ระยะเวลาดำเนินการ</div>
              <div className="font-medium text-gray-900">{startedDays ? `${startedDays} วัน` : "-"}</div>
            </div>
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
          {hasUnpaidBilled ? (
            <div className="flex items-baseline justify-between gap-3">
              <div className="text-sm text-gray-600">ยอดวางบิลค้างชำระ</div>
              <div className="text-base tabular-nums text-amber-700">{asMoney(unpaidBilled)}</div>
            </div>
          ) : null}
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
          <Button size="sm" variant="outline" onClick={onCreateExpense} disabled={loading}>
            บันทึกรายจ่าย
          </Button>
          {hasOutstanding ? (
            <Button size="sm" variant="outline" onClick={onOpenAddInstallment} disabled={loading || !canAddInstallment}>
              วางบิลงวดถัดไป
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
  onEditNote,
}: {
  items: OrderItemRow[];
  orderStatus: string;
  isLocked: boolean;
  loading: boolean;
  onStart: (item: OrderItemRow) => void;
  onDone: (item: OrderItemRow) => void;
  onEditNote?: (item: OrderItemRow) => void;
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
            const canOperate = orderStatus === "in_progress";
            const canStart = !isLocked && canOperate && it.ops_status === "not_started";
            const canDone = !isLocked && canOperate && it.ops_status === "in_progress";
            const canEditNote = !isLocked && canOperate && it.ops_status !== "not_started";
            const noteText = String((it as any)?.ops_note ?? "").trim();
            return (
              <div key={it.id} className="grid gap-2 px-4 py-3 md:grid-cols-[1.2fr_0.8fr_180px] md:items-center">
                <div>
                  <div className="text-sm font-semibold text-gray-900">{serviceNameFromRel(it.services ?? null)}</div>
                  <div className="mt-1 text-xs text-gray-500">เริ่ม: {formatDateTime(it.ops_started_at)} • เสร็จ: {formatDateTime(it.ops_completed_at)}</div>
                  {noteText ? <div className="mt-1 text-xs text-gray-700">หมายเหตุ: {noteText}</div> : null}
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
                  {onEditNote && canEditNote ? (
                    <Button size="sm" variant="outline" className="whitespace-nowrap" onClick={() => onEditNote(it)} disabled={loading}>
                      อัปเดทหมายเหตุ
                    </Button>
                  ) : null}
                  {!canStart && !canDone && !(onEditNote && canEditNote) ? <span className="text-xs text-gray-400">-</span> : null}
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
