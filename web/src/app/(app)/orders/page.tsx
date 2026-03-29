"use client";

import React from "react";

import { cn } from "@/lib/cn";

type OrderRow = {
  id: string;
  customer: string;
  status: "draft" | "pending_approval" | "approved" | "in_progress" | "completed";
  total: number;
  updatedAt: string;
};

const sample: OrderRow[] = [
  { id: "ORD-2026-0012", customer: "บริษัท เอ บี ซี จำกัด", status: "pending_approval", total: 24500, updatedAt: "วันนี้" },
  { id: "ORD-2026-0011", customer: "นายจ้าง บี จำกัด", status: "approved", total: 18000, updatedAt: "เมื่อวาน" },
  { id: "ORD-2026-0010", customer: "บริษัท ซี ดี จำกัด", status: "in_progress", total: 9200, updatedAt: "2 วันก่อน" },
];

function statusLabel(s: OrderRow["status"]) {
  switch (s) {
    case "draft":
      return "ร่าง";
    case "pending_approval":
      return "รออนุมัติ";
    case "approved":
      return "อนุมัติแล้ว";
    case "in_progress":
      return "กำลังดำเนินงาน";
    case "completed":
      return "เสร็จสิ้น";
  }
}

function badgeClass(s: OrderRow["status"]) {
  if (s === "pending_approval") return "bg-amber-50 text-amber-700 border-amber-200";
  if (s === "approved") return "bg-emerald-50 text-emerald-700 border-emerald-200";
  if (s === "in_progress") return "bg-sky-50 text-sky-700 border-sky-200";
  if (s === "completed") return "bg-zinc-100 text-zinc-700 border-zinc-200";
  return "bg-zinc-50 text-zinc-700 border-zinc-200";
}

export default function OrdersPage() {
  return (
    <div>
      <div className="flex items-end justify-between gap-4">
        <div>
          <div className="text-lg font-semibold">คำสั่งซื้อ</div>
          <div className="mt-1 text-sm text-[color:var(--color-muted)]">สร้างใบเสนอราคา ส่งอนุมัติ และติดตามสถานะ</div>
        </div>
        <button
          type="button"
          className="h-9 rounded-md bg-[color:var(--color-primary)] px-3 text-sm font-medium text-[color:var(--color-primary-foreground)] hover:opacity-90 transition"
        >
          สร้างคำสั่งซื้อ
        </button>
      </div>

      <div className="mt-4 rounded-xl border bg-[color:var(--color-surface)]">
        <div className="p-4 flex items-center gap-3">
          <input
            className="h-9 w-full max-w-[420px] rounded-md border bg-[color:var(--color-surface-2)] px-3 text-sm"
            placeholder="ค้นหาเลขคำสั่งซื้อ/ชื่อลูกค้า"
          />
          <select className="h-9 rounded-md border bg-[color:var(--color-surface-2)] px-3 text-sm">
            <option>ทุกสถานะ</option>
            <option>ร่าง</option>
            <option>รออนุมัติ</option>
            <option>อนุมัติแล้ว</option>
            <option>กำลังดำเนินงาน</option>
            <option>เสร็จสิ้น</option>
          </select>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-[color:var(--color-muted)]">
              <tr className="border-t">
                <th className="px-4 py-3 font-medium">เลขที่</th>
                <th className="px-4 py-3 font-medium">นายจ้าง/ลูกค้า</th>
                <th className="px-4 py-3 font-medium">สถานะ</th>
                <th className="px-4 py-3 font-medium">ยอดรวม</th>
                <th className="px-4 py-3 font-medium">อัปเดตล่าสุด</th>
              </tr>
            </thead>
            <tbody>
              {sample.map((row) => (
                <tr key={row.id} className="border-t hover:bg-[color:var(--color-surface-2)] transition">
                  <td className="px-4 py-3 font-medium">{row.id}</td>
                  <td className="px-4 py-3">{row.customer}</td>
                  <td className="px-4 py-3">
                    <span className={cn("inline-flex items-center rounded-full border px-2 py-0.5 text-xs", badgeClass(row.status))}>
                      {statusLabel(row.status)}
                    </span>
                  </td>
                  <td className="px-4 py-3">{row.total.toLocaleString()} บาท</td>
                  <td className="px-4 py-3 text-[color:var(--color-muted)]">{row.updatedAt}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

