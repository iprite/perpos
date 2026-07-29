"use client";

import React, { useState } from "react";
import { PlusCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogBody,
  DialogFooter,
  DialogTitle,
} from "@/components/ui/dialog";
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
import type { PNDRow } from "@/lib/tax/actions";

const THAI_MONTHS_SHORT = [
  "ม.ค.",
  "ก.พ.",
  "มี.ค.",
  "เม.ย.",
  "พ.ค.",
  "มิ.ย.",
  "ก.ค.",
  "ส.ค.",
  "ก.ย.",
  "ต.ค.",
  "พ.ย.",
  "ธ.ค.",
];

function fmt(n: number) {
  return n.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const STATUS_CONFIG: Record<string, { label: string; tone: BadgeTone }> = {
  draft: { label: "ร่าง", tone: "neutral" },
  submitted: { label: "ยื่นแล้ว", tone: "info" },
  paid: { label: "ชำระแล้ว", tone: "warning" },
};

function PNDStatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status] ?? { label: status, tone: "neutral" as BadgeTone };
  return <StatusBadge tone={cfg.tone}>{cfg.label}</StatusBadge>;
}

type Props = {
  pndType: string;
  rows: PNDRow[];
};

export function PNDListClient({ pndType, rows }: Props) {
  const pager = usePagination(rows);
  const [stubOpen, setStubOpen] = useState(false);

  const title = `ภ.ง.ด.${pndType}`;

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="text-sm text-slate-600">{rows.length} รายการ</div>
        <Button className="flex items-center gap-2" onClick={() => setStubOpen(true)}>
          <PlusCircle className="h-4 w-4" />
          สร้างแบบ {title}
        </Button>
      </div>

      {rows.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white p-12 text-center">
          <div className="mb-3 text-4xl">📄</div>
          <div className="font-medium text-slate-600">ยังไม่มีแบบ {title}</div>
          <div className="mt-1 text-sm text-slate-400">กดปุ่มด้านบนเพื่อสร้างแบบใหม่</div>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>เลขที่แบบ</TableHead>
                <TableHead>งวดภาษี</TableHead>
                <TableHead align="right">ยอดรวม (ฐาน)</TableHead>
                <TableHead align="right">ภาษีที่หัก</TableHead>
                <TableHead>สถานะ</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pager.rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="font-mono text-sm">{row.filing_number}</TableCell>
                  <TableCell>
                    {THAI_MONTHS_SHORT[row.period_month - 1]} {row.period_year + 543}
                  </TableCell>
                  <TableCell align="right" tabular>
                    {fmt(row.total_base_amount)}
                  </TableCell>
                  <TableCell align="right" tabular className="font-medium">
                    {fmt(row.total_wht_amount)}
                  </TableCell>
                  <TableCell>
                    <PNDStatusBadge status={row.status} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <TablePager pager={pager} />
        </div>
      )}

      {/* Stub dialog */}
      <Dialog open={stubOpen} onOpenChange={setStubOpen}>
        <DialogContent size="sm">
          <DialogHeader>
            <DialogTitle>สร้างแบบ {title}</DialogTitle>
          </DialogHeader>
          <DialogBody>
            <div className="space-y-3 py-2 text-center">
              <div className="text-4xl">🚧</div>
              <div className="font-medium text-slate-700">อยู่ระหว่างพัฒนา</div>
              <div className="text-sm leading-relaxed text-slate-500">
                ฟีเจอร์การสร้างแบบ {title} กำลังอยู่ในระหว่างการพัฒนา โปรดติดตามการอัปเดตในเร็วๆ นี้
              </div>
            </div>
          </DialogBody>
          <DialogFooter className="justify-center">
            <Button variant="outline" onClick={() => setStubOpen(false)}>
              ปิด
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
