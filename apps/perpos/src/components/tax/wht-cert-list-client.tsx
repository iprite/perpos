"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import cn from "@core/utils/class-names";
import { withBasePath } from "@/utils/base-path";
import type { WHTCertRow } from "@/lib/tax/actions";

function fmt(n: number) {
  return n.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const STATUS_MAP: Record<string, { label: string; cls: string }> = {
  draft:  { label: "ร่าง",     cls: "bg-slate-100 text-slate-600" },
  issued: { label: "ออกแล้ว", cls: "bg-teal-100 text-teal-700" },
  void:   { label: "ยกเลิก",  cls: "bg-red-100 text-red-700" },
};

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_MAP[status] ?? { label: status, cls: "bg-slate-100 text-slate-600" };
  return (
    <span className={cn("inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium", cfg.cls)}>
      {cfg.label}
    </span>
  );
}

type Props = {
  rows: WHTCertRow[];
};

export function WhtCertListClient({ rows }: Props) {
  const router = useRouter();

  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-12 text-center">
        <div className="text-4xl mb-3">🧾</div>
        <div className="text-slate-600 font-medium">ยังไม่มีหนังสือรับรองการหัก ณ ที่จ่าย</div>
        <div className="text-sm text-slate-400 mt-1">สร้างได้จากเมนู WHT + เอกสาร</div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow className="bg-slate-50">
            <TableHead>เลขที่ใบรับรอง</TableHead>
            <TableHead>วันที่</TableHead>
            <TableHead>ผู้ถูกหักภาษี</TableHead>
            <TableHead>ประเภท</TableHead>
            <TableHead className="text-right">ฐานภาษี</TableHead>
            <TableHead className="text-right">ภาษีที่หัก</TableHead>
            <TableHead>สถานะ</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow
              key={row.id}
              className="cursor-pointer hover:bg-slate-50"
              onClick={() => router.push(withBasePath(`/tax/wht-certificates/${row.id}`))}
            >
              <TableCell className="font-mono text-sm">{row.certificate_no ?? "-"}</TableCell>
              <TableCell className="text-sm">
                {row.wht_date
                  ? new Date(row.wht_date).toLocaleDateString("th-TH", { day: "2-digit", month: "short", year: "numeric" })
                  : "-"}
              </TableCell>
              <TableCell className="text-sm">{row.receiver_name}</TableCell>
              <TableCell className="text-sm text-slate-600">{row.wht_category}</TableCell>
              <TableCell className="text-right tabular-nums text-sm">{fmt(row.base_amount)}</TableCell>
              <TableCell className="text-right tabular-nums text-sm font-medium">{fmt(row.wht_amount)}</TableCell>
              <TableCell>
                <StatusBadge status={row.status} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
