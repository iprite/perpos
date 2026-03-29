"use client";

import React from "react";

type CustomerRow = {
  name: string;
  contact: string;
  phone: string;
  email: string;
};

const sample: CustomerRow[] = [
  { name: "บริษัท เอ บี ซี จำกัด", contact: "คุณธนา", phone: "08x-xxx-xxxx", email: "contact@abc.co" },
  { name: "นายจ้าง บี จำกัด", contact: "คุณวิภา", phone: "08x-xxx-xxxx", email: "hr@b.co" },
];

export default function CustomersPage() {
  return (
    <div>
      <div className="flex items-end justify-between gap-4">
        <div>
          <div className="text-lg font-semibold">นายจ้าง/ลูกค้า</div>
          <div className="mt-1 text-sm text-[color:var(--color-muted)]">จัดการข้อมูลนายจ้าง (ลูกค้า) ที่ซื้อบริการเอกสารแรงงาน</div>
        </div>
        <button
          type="button"
          className="h-9 rounded-md bg-[color:var(--color-primary)] px-3 text-sm font-medium text-[color:var(--color-primary-foreground)] hover:opacity-90 transition"
        >
          เพิ่มนายจ้าง/ลูกค้า
        </button>
      </div>

      <div className="mt-4 rounded-xl border bg-[color:var(--color-surface)]">
        <div className="p-4 flex items-center gap-3">
          <input
            className="h-9 w-full max-w-[420px] rounded-md border bg-[color:var(--color-surface-2)] px-3 text-sm"
            placeholder="ค้นหาชื่อบริษัท/ผู้ติดต่อ"
          />
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-[color:var(--color-muted)]">
              <tr className="border-t">
                <th className="px-4 py-3 font-medium">ชื่อบริษัท</th>
                <th className="px-4 py-3 font-medium">ผู้ติดต่อ</th>
                <th className="px-4 py-3 font-medium">เบอร์</th>
                <th className="px-4 py-3 font-medium">อีเมล</th>
              </tr>
            </thead>
            <tbody>
              {sample.map((row) => (
                <tr key={row.email} className="border-t hover:bg-[color:var(--color-surface-2)] transition">
                  <td className="px-4 py-3 font-medium">{row.name}</td>
                  <td className="px-4 py-3">{row.contact}</td>
                  <td className="px-4 py-3">{row.phone}</td>
                  <td className="px-4 py-3">{row.email}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

