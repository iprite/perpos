"use client";

import React, { useTransition, useState } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import type { FinanceAccountRow } from "@/lib/finance/queries";
import { toggleFinanceAccountActiveAction } from "@/lib/finance/actions";

type Props = {
  rows: FinanceAccountRow[];
  organizationId: string;
};

const CATEGORY_TH: Record<FinanceAccountRow["accountCategory"], string> = {
  petty_cash:      "เงินสดย่อย",
  bank:            "ธนาคาร",
  payment_channel: "ช่องทางรับเงิน",
  reserve:         "สำรอง",
};

export function FinanceAccountsTable({ rows, organizationId }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [search, setSearch] = useState("");

  const filtered = rows.filter((r) =>
    r.name.toLowerCase().includes(search.toLowerCase()) ||
    (r.bankName ?? "").toLowerCase().includes(search.toLowerCase()) ||
    (r.accountNumber ?? "").toLowerCase().includes(search.toLowerCase()),
  );

  function toggleActive(row: FinanceAccountRow) {
    startTransition(async () => {
      const result = await toggleFinanceAccountActiveAction(row.id, organizationId, !row.isActive);
      if (!result.ok) {
        toast.error(result.error ?? "เกิดข้อผิดพลาด");
        return;
      }
      toast.success(row.isActive ? "ปิดใช้งานสำเร็จ" : "เปิดใช้งานสำเร็จ");
      router.refresh();
    });
  }

  if (rows.length === 0) {
    return <div className="rounded-lg border border-dashed border-slate-300 py-12 text-center text-sm text-slate-500">ยังไม่มีบัญชี</div>;
  }

  return (
    <div className="space-y-3">
      <input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="ค้นหาบัญชี..."
        className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 sm:max-w-xs"
      />
      <div className="overflow-x-auto rounded-lg border border-slate-200">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">
            <tr>
              <th className="px-4 py-3">ชื่อบัญชี</th>
              <th className="px-4 py-3">ประเภท</th>
              <th className="px-4 py-3">รายละเอียด</th>
              <th className="px-4 py-3 text-right">ยอดยกมา</th>
              <th className="px-4 py-3 text-center">สถานะ</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 bg-white">
            {filtered.map((row) => (
              <tr key={row.id} className="hover:bg-slate-50">
                <td className="px-4 py-3 font-medium text-slate-800">{row.name}</td>
                <td className="px-4 py-3 text-slate-600">{CATEGORY_TH[row.accountCategory]}</td>
                <td className="px-4 py-3 text-slate-500">
                  {row.bankName && <span>{row.bankName}{row.accountNumber ? ` · ${row.accountNumber}` : ""}</span>}
                  {row.channelType && <span className="capitalize">{row.channelType.replace("_", " ")}</span>}
                  {row.custodianName && <span>ผู้รับผิดชอบ: {row.custodianName}</span>}
                  {row.purpose && <span>{row.purpose}</span>}
                </td>
                <td className="px-4 py-3 text-right font-mono text-slate-700">
                  {row.initialBalance.toLocaleString("th-TH", { minimumFractionDigits: 2 })}
                </td>
                <td className="px-4 py-3 text-center">
                  <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${row.isActive ? "bg-green-100 text-green-700" : "bg-slate-100 text-slate-500"}`}>
                    {row.isActive ? "ใช้งาน" : "ปิดใช้งาน"}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  <button
                    onClick={() => toggleActive(row)}
                    disabled={isPending}
                    className="text-xs text-blue-600 hover:underline disabled:opacity-50"
                  >
                    {row.isActive ? "ปิดใช้งาน" : "เปิดใช้งาน"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
