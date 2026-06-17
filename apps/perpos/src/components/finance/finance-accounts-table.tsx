"use client";

import React, { useTransition, useState } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/badge";
import {
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell,
} from "@/components/ui/table";
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
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>ชื่อบัญชี</TableHead>
            <TableHead>ประเภท</TableHead>
            <TableHead>รายละเอียด</TableHead>
            <TableHead align="right">ยอดยกมา (฿)</TableHead>
            <TableHead align="center">สถานะ</TableHead>
            <TableHead></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {filtered.map((row) => (
            <TableRow key={row.id}>
              <TableCell className="font-medium text-slate-800">{row.name}</TableCell>
              <TableCell className="text-slate-600">{CATEGORY_TH[row.accountCategory]}</TableCell>
              <TableCell className="text-slate-500">
                {row.bankName && <span>{row.bankName}{row.accountNumber ? ` · ${row.accountNumber}` : ""}</span>}
                {row.channelType && <span className="capitalize">{row.channelType.replace("_", " ")}</span>}
                {row.custodianName && <span>ผู้รับผิดชอบ: {row.custodianName}</span>}
                {row.purpose && <span>{row.purpose}</span>}
              </TableCell>
              <TableCell align="right" tabular className="text-slate-700">
                {row.initialBalance.toLocaleString("th-TH", { minimumFractionDigits: 2 })}
              </TableCell>
              <TableCell align="center">
                <StatusBadge tone={row.isActive ? "success" : "neutral"}>{row.isActive ? "ใช้งาน" : "ปิดใช้งาน"}</StatusBadge>
              </TableCell>
              <TableCell align="right">
                <Button
                  variant="ghost" size="sm"
                  onClick={() => toggleActive(row)}
                  disabled={isPending}
                  className="h-7 px-2 text-xs text-blue-600 hover:bg-blue-50 hover:text-blue-700"
                >
                  {row.isActive ? "ปิดใช้งาน" : "เปิดใช้งาน"}
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
