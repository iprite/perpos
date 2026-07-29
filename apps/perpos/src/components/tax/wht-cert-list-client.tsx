"use client";

import React from "react";
import { useRouter } from "next/navigation";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { TablePager, usePagination } from "@/components/ui/table-pager";
import { StatusBadge, type BadgeTone } from "@/components/ui/badge";
import { withBasePath } from "@/utils/base-path";
import type { WHTCertRow } from "@/lib/tax/actions";

function fmt(n: number) {
  return n.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const STATUS_MAP: Record<string, { label: string; tone: BadgeTone }> = {
  draft: { label: "ร่าง", tone: "neutral" },
  issued: { label: "ออกแล้ว", tone: "success" },
  void: { label: "ยกเลิก", tone: "danger" },
};

function WhtStatusBadge({ status }: { status: string }) {
  const cfg = STATUS_MAP[status] ?? { label: status, tone: "neutral" as BadgeTone };
  return <StatusBadge tone={cfg.tone}>{cfg.label}</StatusBadge>;
}

type Props = {
  rows: WHTCertRow[];
};

export function WhtCertListClient({ rows }: Props) {
  const pager = usePagination(rows);
  const router = useRouter();

  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-12 text-center">
        <div className="mb-3 text-4xl">🧾</div>
        <div className="font-medium text-slate-600">ยังไม่มีหนังสือรับรองการหัก ณ ที่จ่าย</div>
        <div className="mt-1 text-sm text-slate-400">สร้างได้จากเมนู WHT + เอกสาร</div>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>เลขที่ใบรับรอง</TableHead>
            <TableHead>วันที่</TableHead>
            <TableHead>ผู้ถูกหักภาษี</TableHead>
            <TableHead>ประเภท</TableHead>
            <TableHead align="right">ฐานภาษี</TableHead>
            <TableHead align="right">ภาษีที่หัก</TableHead>
            <TableHead>สถานะ</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {pager.rows.map((row) => (
            <TableRow
              key={row.id}
              clickable
              onClick={() => router.push(withBasePath(`/tax/wht-certificates/${row.id}`))}
            >
              <TableCell className="font-mono text-sm">{row.certificate_no ?? "-"}</TableCell>
              <TableCell className="text-sm">
                {row.wht_date
                  ? new Date(row.wht_date).toLocaleDateString("th-TH", {
                      day: "2-digit",
                      month: "short",
                      year: "numeric",
                    })
                  : "-"}
              </TableCell>
              <TableCell className="text-sm">{row.receiver_name}</TableCell>
              <TableCell className="text-sm text-slate-600">{row.wht_category}</TableCell>
              <TableCell align="right" tabular className="text-sm">
                {fmt(row.base_amount)}
              </TableCell>
              <TableCell align="right" tabular className="text-sm font-medium">
                {fmt(row.wht_amount)}
              </TableCell>
              <TableCell>
                <WhtStatusBadge status={row.status} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <TablePager pager={pager} />
    </div>
  );
}
