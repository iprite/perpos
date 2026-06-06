"use client";

import React, { useTransition, useState } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
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
    return (
      <div className="rounded-lg border border-dashed border-slate-200 py-12 text-center text-sm text-slate-500">
        ยังไม่มีบัญชี
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <Input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="ค้นหาบัญชี..."
        className="sm:max-w-xs"
      />
      <div className="overflow-x-auto rounded-lg border border-slate-200">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">ชื่อบัญชี</th>
              <th className="px-4 py-3">ประเภท</th>
              <th className="px-4 py-3">รายละเอียด</th>
              <th className="px-4 py-3 text-right">ยอดยกมา (฿)</th>
              <th className="px-4 py-3 text-center">สถานะ</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 bg-white">
            {filtered.map((row) => (
              <tr key={row.id} className="hover:bg-slate-50 transition-colors duration-150">
                <td className="px-4 py-3 font-medium text-slate-800">{row.name}</td>
                <td className="px-4 py-3 text-slate-600">{CATEGORY_TH[row.accountCategory]}</td>
                <td className="px-4 py-3 text-slate-500">
                  {row.bankName && <span>{row.bankName}{row.accountNumber ? ` · ${row.accountNumber}` : ""}</span>}
                  {row.channelType && <span className="capitalize">{row.channelType.replace("_", " ")}</span>}
                  {row.custodianName && <span>ผู้รับผิดชอบ: {row.custodianName}</span>}
                  {row.purpose && <span>{row.purpose}</span>}
                </td>
                <td className="px-4 py-3 text-right font-mono tabular-nums text-slate-700">
                  {row.initialBalance.toLocaleString("th-TH", { minimumFractionDigits: 2 })}
                </td>
                <td className="px-4 py-3 text-center">
                  <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                    row.isActive
                      ? "bg-green-50 border border-green-200 text-green-700"
                      : "bg-slate-50 border border-slate-200 text-slate-500"
                  }`}>
                    {row.isActive ? "ใช้งาน" : "ปิดใช้งาน"}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => toggleActive(row)}
                    disabled={isPending}
                    className="h-7 px-2 text-xs text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                  >
                    {row.isActive ? "ปิดใช้งาน" : "เปิดใช้งาน"}
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
