"use client";

import React from "react";
import { Button } from "rizzui";

import type { WorkerOrderDocumentRow } from "./worker-edit-types";

function formatDateOnly(s: string | null | undefined) {
  if (!s) return "-";
  const d = new Date(s);
  if (!Number.isFinite(d.getTime())) return "-";
  const parts = new Intl.DateTimeFormat("en-US", { day: "numeric", month: "short", year: "numeric" }).formatToParts(d);
  const day = parts.find((p) => p.type === "day")?.value ?? "";
  const month = parts.find((p) => p.type === "month")?.value ?? "";
  const year = parts.find((p) => p.type === "year")?.value ?? "";
  if (!day || !month || !year) return "-";
  return `${day}-${month}-${year}`;
}

export function WorkerOrderDocumentsPanel({
  loading,
  orders,
  docs,
  onOpenOrder,
  onOpenDoc,
}: {
  loading: boolean;
  orders: { id: string; display_id: string | null }[];
  docs: WorkerOrderDocumentRow[];
  onOpenOrder: (orderId: string) => void;
  onOpenDoc: (d: WorkerOrderDocumentRow) => void;
}) {
  const ordersById = React.useMemo(() => new Map(orders.map((o) => [o.id, o])), [orders]);

  return (
    <div className="mt-5 overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
      <div className="flex items-center justify-between gap-2 bg-white px-4 py-3">
        <div className="text-sm font-semibold text-gray-900">เอกสารจากออเดอร์</div>
        {orders.length === 1 ? (
          <Button size="sm" variant="outline" onClick={() => onOpenOrder(orders[0].id)} disabled={loading}>
            เปิดออเดอร์ {orders[0].display_id ?? ""}
          </Button>
        ) : null}
      </div>

      <div className="p-3">
        {orders.length === 0 ? (
          <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50 p-3 text-sm text-gray-600">แรงงานนี้ยังไม่ถูกผูกกับออเดอร์</div>
        ) : docs.length === 0 ? (
          <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50 p-3 text-sm text-gray-600">ยังไม่มีเอกสารในออเดอร์ที่ผูกกับแรงงานนี้</div>
        ) : (
          <div className="space-y-2">
            {docs.map((d) => {
              const title = d.doc_type || d.file_name || "เอกสาร";
              const orderId = String((d as any).order_id ?? "");
              const orderDisplay = (d as any)?.orders?.display_id
                ? String((d as any).orders.display_id)
                : ordersById.get(orderId)?.display_id ?? null;
              const serviceName = (d as any)?.order_items?.services?.name ? String((d as any).order_items.services.name) : null;
              return (
                <div
                  key={d.id}
                  className="flex w-full flex-wrap items-center justify-between gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2 text-left transition-colors hover:bg-gray-50"
                  role="button"
                  tabIndex={loading ? -1 : 0}
                  aria-disabled={loading}
                  onClick={() => {
                    if (loading) return;
                    onOpenDoc(d);
                  }}
                  onKeyDown={(e) => {
                    if (loading) return;
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      onOpenDoc(d);
                    }
                  }}
                >
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-gray-900">{title}</div>
                    <div className="mt-0.5 flex flex-wrap gap-x-2 gap-y-1 text-xs text-gray-600">
                      {orderId ? (
                        <button
                          type="button"
                          className="underline underline-offset-2"
                          onClick={(e) => {
                            e.stopPropagation();
                            onOpenOrder(orderId);
                          }}
                          disabled={loading}
                        >
                          ออเดอร์: {orderDisplay ?? orderId}
                        </button>
                      ) : null}
                      {serviceName ? <span>บริการ: {serviceName}</span> : null}
                    </div>
                  </div>
                  <span className="inline-flex items-center rounded-full border border-gray-200 bg-gray-100 px-2 py-0.5 text-xs font-semibold text-gray-700">
                    {formatDateOnly(d.created_at)}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
