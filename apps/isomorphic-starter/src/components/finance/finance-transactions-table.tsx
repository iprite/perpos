"use client";

import Link from "next/link";
import React from "react";

import type { PaymentTransactionRow } from "./transaction-modal";

type OrderMini = { id: string; display_id: string | null; customers?: { name: string | null } | null };

function money(n: number) {
  const x = Number.isFinite(n) ? n : 0;
  return x.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function typeLabel(v: string) {
  if (v === "INCOME") return "รายรับ";
  if (v === "EXPENSE") return "รายจ่าย";
  return v;
}

function sourceLabel(v: string) {
  if (v === "CUSTOMER") return "ลูกค้า";
  if (v === "AGENT_POA") return "POA ตัวแทน";
  if (v === "OPS") return "งานปฏิบัติการ";
  return v;
}

export function FinanceTransactionsTable({
  rows,
  ordersById,
  loading,
  onEdit,
  onDelete,
  onViewSlip,
}: {
  rows: PaymentTransactionRow[];
  ordersById: Record<string, OrderMini>;
  loading: boolean;
  onEdit: (row: PaymentTransactionRow) => void;
  onDelete: (row: PaymentTransactionRow) => void;
  onViewSlip: (row: PaymentTransactionRow) => void;
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
      <div className="grid grid-cols-[0.7fr_0.6fr_0.8fr_0.7fr_1fr_1fr_88px] gap-3 border-b border-gray-200 bg-gray-50 px-4 py-2 text-xs font-semibold text-gray-600">
        <div>วันที่</div>
        <div>ประเภท</div>
        <div>แหล่งที่มา</div>
        <div className="text-right">จำนวนเงิน</div>
        <div>ออเดอร์</div>
        <div>ชื่อรายจ่าย/หมายเหตุ</div>
        <div className="text-right">จัดการ</div>
      </div>
      {rows.length === 0 ? (
        <div className="px-4 py-8 text-sm text-gray-500">{loading ? "กำลังโหลด..." : "ยังไม่มีข้อมูล"}</div>
      ) : (
        rows.map((r) => {
          const order = r.order_id ? ordersById[String(r.order_id)] ?? null : null;
          const orderText = order ? [order.display_id || order.id, order.customers?.name].filter(Boolean).join(" • ") : r.order_id ? String(r.order_id) : "-";
          return (
            <div key={r.id} className="grid grid-cols-[0.7fr_0.6fr_0.8fr_0.7fr_1fr_1fr_88px] items-center gap-3 border-b border-gray-100 px-4 py-3 text-sm last:border-b-0">
              <div className="text-gray-900">{r.txn_date || "-"}</div>
              <div className={r.txn_type === "INCOME" ? "font-medium text-green-700" : "font-medium text-red-700"}>{typeLabel(r.txn_type)}</div>
              <div className="text-gray-700">{sourceLabel(r.source_type)}</div>
              <div className="text-right font-semibold tabular-nums text-gray-900">{money(Number(r.amount ?? 0))}</div>
              <div className="truncate text-gray-700">
                {r.order_id ? (
                  <Link className="text-gray-900 underline" href={`/manage-orders/${encodeURIComponent(String(r.order_id))}`}>
                    {orderText}
                  </Link>
                ) : (
                  <span>{orderText}</span>
                )}
              </div>
              <div className="truncate text-gray-700">{[r.expense_name, r.note].filter(Boolean).join(" • ") || "-"}</div>
              <div className="flex justify-end gap-2">
                {r.txn_type === "INCOME" ? (
                  <button
                    type="button"
                    className="text-sm font-medium text-gray-900 underline disabled:opacity-50"
                    onClick={() => onViewSlip(r)}
                    disabled={loading || !(r as any).source_table || !(r as any).source_id}
                  >
                    ดู slip
                  </button>
                ) : (
                  <>
                    <button
                      type="button"
                      className="text-sm font-medium text-gray-900 underline disabled:opacity-50"
                      onClick={() => onEdit(r)}
                      disabled={loading}
                    >
                      แก้ไข
                    </button>
                    <button
                      type="button"
                      className="text-sm font-medium text-red-700 underline disabled:opacity-50"
                      onClick={() => onDelete(r)}
                      disabled={loading}
                    >
                      ลบ
                    </button>
                  </>
                )}
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}
