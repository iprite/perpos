"use client";

import React, { useState } from "react";
import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { StatusBadge, type BadgeTone } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogBody,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import type { RunRow } from "@/lib/payroll/actions";

const STATUS_LABELS: Record<string, string> = {
  draft:            "ร่าง",
  pending_approval: "รออนุมัติ",
  approved:         "อนุมัติแล้ว",
  paid:             "จ่ายแล้ว",
  cancelled:        "ยกเลิก",
};

const STATUS_TONE: Record<string, BadgeTone> = {
  draft:            "neutral",
  pending_approval: "warning",
  approved:         "info",
  paid:             "success",
  cancelled:        "danger",
};

const MONTHS_TH = [
  "", "มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน",
  "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม",
];

export function PayrollSalaryClient({
  organizationId,
  initialRows,
}: {
  organizationId: string;
  initialRows: RunRow[];
}) {
  const [rows] = useState<RunRow[]>(initialRows);
  const [stubOpen, setStubOpen] = useState(false);

  return (
    <div>
      <div className="mb-4 flex justify-end">
        <Button onClick={() => setStubOpen(true)} size="sm">
          <Plus className="mr-1 h-4 w-4" /> สร้างรอบเงินเดือน
        </Button>
      </div>

      <div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>รอบ</TableHead>
              <TableHead>ปี / เดือน</TableHead>
              <TableHead align="right">รายได้รวม</TableHead>
              <TableHead align="right">รายหักรวม</TableHead>
              <TableHead align="right">ยอดสุทธิ</TableHead>
              <TableHead align="center">สถานะ</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="py-10 text-center text-sm text-slate-400">
                  ยังไม่มีรอบเงินเดือน — กดปุ่ม &ldquo;สร้างรอบเงินเดือน&rdquo; เพื่อเริ่มต้น
                </TableCell>
              </TableRow>
            ) : (
              rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="font-mono text-sm">{row.run_number}</TableCell>
                  <TableCell className="text-sm text-slate-700">
                    {MONTHS_TH[row.period_month] ?? row.period_month} {row.period_year + 543}
                  </TableCell>
                  <TableCell align="right" tabular className="text-sm text-slate-700">
                    {row.total_earnings.toLocaleString("th-TH", { minimumFractionDigits: 2 })}
                  </TableCell>
                  <TableCell align="right" tabular className="text-sm text-slate-700">
                    {row.total_deductions.toLocaleString("th-TH", { minimumFractionDigits: 2 })}
                  </TableCell>
                  <TableCell align="right" tabular className="text-sm font-semibold text-slate-900">
                    {row.total_net.toLocaleString("th-TH", { minimumFractionDigits: 2 })}
                  </TableCell>
                  <TableCell align="center">
                    <StatusBadge tone={STATUS_TONE[row.status] ?? "neutral"}>{STATUS_LABELS[row.status] ?? row.status}</StatusBadge>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Stub dialog */}
      <Dialog open={stubOpen} onOpenChange={(v) => { if (!v) setStubOpen(false); }}>
        <DialogContent size="sm">
          <DialogHeader>
            <DialogTitle>สร้างรอบเงินเดือน</DialogTitle>
          </DialogHeader>
          <DialogBody>
          <div className="py-2 text-center text-sm text-slate-500">
            ฟีเจอร์สร้างรอบเงินเดือนอยู่ระหว่างพัฒนา
          </div>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => setStubOpen(false)}>ปิด</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
