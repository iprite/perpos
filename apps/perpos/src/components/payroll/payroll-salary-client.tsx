"use client";

import React, { useState } from "react";
import cn from "@core/utils/class-names";
import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
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

const STATUS_COLORS: Record<string, string> = {
  draft:            "bg-slate-100 text-slate-600",
  pending_approval: "bg-amber-50 text-amber-700",
  approved:         "bg-blue-50 text-blue-700",
  paid:             "bg-teal-50 text-teal-700",
  cancelled:        "bg-red-50 text-red-600",
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
            <TableRow className="bg-slate-50">
              <TableHead>รอบ</TableHead>
              <TableHead>ปี / เดือน</TableHead>
              <TableHead className="text-right">รายได้รวม</TableHead>
              <TableHead className="text-right">รายหักรวม</TableHead>
              <TableHead className="text-right">ยอดสุทธิ</TableHead>
              <TableHead className="w-36 text-center">สถานะ</TableHead>
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
                <TableRow key={row.id} className="hover:bg-slate-50">
                  <TableCell className="font-mono text-sm">{row.run_number}</TableCell>
                  <TableCell className="text-sm text-slate-700">
                    {MONTHS_TH[row.period_month] ?? row.period_month} {row.period_year + 543}
                  </TableCell>
                  <TableCell className="text-right text-sm text-slate-700">
                    {row.total_earnings.toLocaleString("th-TH", { minimumFractionDigits: 2 })}
                  </TableCell>
                  <TableCell className="text-right text-sm text-slate-700">
                    {row.total_deductions.toLocaleString("th-TH", { minimumFractionDigits: 2 })}
                  </TableCell>
                  <TableCell className="text-right text-sm font-semibold text-slate-900">
                    {row.total_net.toLocaleString("th-TH", { minimumFractionDigits: 2 })}
                  </TableCell>
                  <TableCell className="text-center">
                    <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-medium", STATUS_COLORS[row.status] ?? "bg-slate-100 text-slate-600")}>
                      {STATUS_LABELS[row.status] ?? row.status}
                    </span>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Stub dialog */}
      <Dialog open={stubOpen} onOpenChange={(v) => { if (!v) setStubOpen(false); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>สร้างรอบเงินเดือน</DialogTitle>
          </DialogHeader>
          <div className="py-4 text-center text-sm text-slate-500">
            ฟีเจอร์สร้างรอบเงินเดือนอยู่ระหว่างพัฒนา
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setStubOpen(false)}>ปิด</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
