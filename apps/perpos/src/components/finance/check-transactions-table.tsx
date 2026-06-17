"use client";

import React, { useTransition, useState } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { StatusBadge, type BadgeTone } from "@/components/ui/badge";
import {
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell,
} from "@/components/ui/table";
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

const STATUS_TONE: Record<CheckTransactionRow["status"], BadgeTone> = {
  pending: "warning",
  cleared: "success",
  bounced: "danger",
  voided:  "neutral",
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
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>เลขที่เช็ค</TableHead>
            <TableHead>ธนาคาร</TableHead>
            <TableHead>วันที่เช็ค</TableHead>
            <TableHead>วันครบกำหนด</TableHead>
            <TableHead>คู่ค้า</TableHead>
            <TableHead align="right">จำนวนเงิน (฿)</TableHead>
            <TableHead align="center">สถานะ</TableHead>
            <TableHead></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {filtered.map((row) => (
            <TableRow key={row.id}>
              <TableCell className="font-medium text-slate-800">{row.checkNumber}</TableCell>
              <TableCell className="text-slate-600">{row.bankName ?? "—"}</TableCell>
              <TableCell className="text-slate-600">{row.checkDate}</TableCell>
              <TableCell className="text-slate-600">{row.dueDate ?? "—"}</TableCell>
              <TableCell className="text-slate-600">{row.contactName ?? "—"}</TableCell>
              <TableCell align="right" tabular className="text-slate-700">
                {row.amount.toLocaleString("th-TH", { minimumFractionDigits: 2 })}
              </TableCell>
              <TableCell align="center">
                <StatusBadge tone={STATUS_TONE[row.status]}>{STATUS_LABELS[row.status]}</StatusBadge>
              </TableCell>
              <TableCell align="right">
                {row.status === "pending" && (
                  <div className="flex justify-end gap-1">
                    <Button variant="ghost" size="sm" onClick={() => changeStatus(row, "cleared")} disabled={isPending}
                      className="h-7 px-2 text-xs text-green-600 hover:bg-green-50 hover:text-green-700">ผ่าน</Button>
                    <Button variant="ghost" size="sm" onClick={() => changeStatus(row, "bounced")} disabled={isPending}
                      className="h-7 px-2 text-xs text-red-600 hover:bg-red-50 hover:text-red-700">คืน</Button>
                    <Button variant="ghost" size="sm" onClick={() => changeStatus(row, "voided")} disabled={isPending}
                      className="h-7 px-2 text-xs text-slate-500 hover:bg-slate-50">ยกเลิก</Button>
                  </div>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
