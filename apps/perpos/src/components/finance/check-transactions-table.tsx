"use client";

import React, { useTransition, useState } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import type { CheckTransactionRow } from "@/lib/finance/queries";
import { updateCheckTransactionStatusAction } from "@/lib/finance/actions";

type Props = {
  rows: CheckTransactionRow[];
  organizationId: string;
};

const STATUS_LABELS: Record<CheckTransactionRow["status"], string> = {
  pending: "รอดำเนินการ",
  cleared: "ผ่านแล้ว",
  bounced: "เช็คคืน",
  voided:  "ยกเลิก",
};

const STATUS_COLORS: Record<CheckTransactionRow["status"], string> = {
  pending: "bg-amber-50 border border-amber-200 text-amber-700",
  cleared: "bg-green-50 border border-green-200 text-green-700",
  bounced: "bg-red-50 border border-red-200 text-red-700",
  voided:  "bg-slate-50 border border-slate-200 text-slate-500",
};

export function CheckTransactionsTable({ rows, organizationId }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [search, setSearch] = useState("");

  const filtered = rows.filter((r) =>
    r.checkNumber.toLowerCase().includes(search.toLowerCase()) ||
    (r.bankName ?? "").toLowerCase().includes(search.toLowerCase()) ||
    (r.contactName ?? "").toLowerCase().includes(search.toLowerCase()),
  );

  function changeStatus(row: CheckTransactionRow, status: CheckTransactionRow["status"]) {
    startTransition(async () => {
      const result = await updateCheckTransactionStatusAction(row.id, organizationId, status);
      if (!result.ok) {
        toast.error(result.error ?? "เกิดข้อผิดพลาด");
        return;
      }
      toast.success("อัปเดตสถานะสำเร็จ");
      router.refresh();
    });
  }

  if (rows.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-slate-200 py-12 text-center text-sm text-slate-500">
        ยังไม่มีรายการ
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <Input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="ค้นหาเช็ค..."
        className="sm:max-w-xs"
      />
      <div className="overflow-x-auto rounded-lg border border-slate-200">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">เลขที่เช็ค</th>
              <th className="px-4 py-3">ธนาคาร</th>
              <th className="px-4 py-3">วันที่เช็ค</th>
              <th className="px-4 py-3">วันครบกำหนด</th>
              <th className="px-4 py-3">คู่ค้า</th>
              <th className="px-4 py-3 text-right">จำนวนเงิน (฿)</th>
              <th className="px-4 py-3 text-center">สถานะ</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 bg-white">
            {filtered.map((row) => (
              <tr key={row.id} className="hover:bg-slate-50 transition-colors duration-150">
                <td className="px-4 py-3 font-medium text-slate-800">{row.checkNumber}</td>
                <td className="px-4 py-3 text-slate-600">{row.bankName ?? "—"}</td>
                <td className="px-4 py-3 text-slate-600">{row.checkDate}</td>
                <td className="px-4 py-3 text-slate-600">{row.dueDate ?? "—"}</td>
                <td className="px-4 py-3 text-slate-600">{row.contactName ?? "—"}</td>
                <td className="px-4 py-3 text-right font-mono tabular-nums text-slate-700">
                  {row.amount.toLocaleString("th-TH", { minimumFractionDigits: 2 })}
                </td>
                <td className="px-4 py-3 text-center">
                  <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_COLORS[row.status]}`}>
                    {STATUS_LABELS[row.status]}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  {row.status === "pending" && (
                    <div className="flex justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => changeStatus(row, "cleared")}
                        disabled={isPending}
                        className="h-7 px-2 text-xs text-green-600 hover:text-green-700 hover:bg-green-50"
                      >
                        ผ่าน
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => changeStatus(row, "bounced")}
                        disabled={isPending}
                        className="h-7 px-2 text-xs text-red-600 hover:text-red-700 hover:bg-red-50"
                      >
                        คืน
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => changeStatus(row, "voided")}
                        disabled={isPending}
                        className="h-7 px-2 text-xs text-slate-500 hover:bg-slate-50"
                      >
                        ยกเลิก
                      </Button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
