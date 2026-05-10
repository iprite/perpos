"use client";

import React, { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { PlusCircle } from "lucide-react";
import { toast } from "react-hot-toast";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { CustomSelect } from "@/components/ui/custom-select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import cn from "@core/utils/class-names";
import { withBasePath } from "@/utils/base-path";
import { createPP30, type PP30Row } from "@/lib/tax/actions";

const THAI_MONTHS_SHORT = [
  "ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.",
  "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค.",
];

const THAI_MONTHS_FULL = [
  "มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน",
  "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม",
];

function fmt(n: number) {
  return n.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const STATUS_CONFIG: Record<string, { label: string; cls: string }> = {
  draft:     { label: "ร่าง",       cls: "bg-slate-100 text-slate-600" },
  submitted: { label: "ยื่นแล้ว",   cls: "bg-blue-100 text-blue-700" },
  paid:      { label: "ชำระแล้ว",  cls: "bg-amber-100 text-amber-700" },
  received:  { label: "รับใบเสร็จ", cls: "bg-teal-100 text-teal-700" },
};

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status] ?? { label: status, cls: "bg-slate-100 text-slate-600" };
  return (
    <span className={cn("inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium", cfg.cls)}>
      {cfg.label}
    </span>
  );
}

const currentYear = new Date().getFullYear();
const YEAR_OPTIONS = Array.from({ length: 5 }, (_, i) => {
  const y = currentYear - 2 + i;
  return { value: String(y), label: `พ.ศ. ${y + 543}` };
});
const MONTH_OPTIONS = THAI_MONTHS_FULL.map((m, i) => ({
  value: String(i + 1),
  label: `${i + 1} - ${m}`,
}));

type Props = {
  organizationId: string;
  rows: PP30Row[];
};

export function PP30ListClient({ organizationId, rows: initialRows }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [year, setYear] = useState(String(currentYear));
  const [month, setMonth] = useState(String(new Date().getMonth() + 1));

  const handleCreate = () => {
    startTransition(async () => {
      const res = await createPP30({
        organizationId,
        period_year: Number(year),
        period_month: Number(month),
        output_vat_total: 0,
        input_vat_total: 0,
        net_vat: 0,
      });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      setOpen(false);
      toast.success("สร้างแบบ ภ.พ.30 เรียบร้อยแล้ว");
      router.push(withBasePath(`/tax/pp30/${res.id}`));
    });
  };

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="text-sm text-slate-600">{initialRows.length} รายการ</div>
        <Button
          className="flex items-center gap-2"
          onClick={() => setOpen(true)}
        >
          <PlusCircle className="h-4 w-4" />
          สร้างแบบ ภ.พ.30
        </Button>
      </div>

      {initialRows.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white p-12 text-center">
          <div className="text-4xl mb-3">📋</div>
          <div className="text-slate-600 font-medium">ยังไม่มีแบบ ภ.พ.30</div>
          <div className="text-sm text-slate-400 mt-1">กดปุ่ม &ldquo;สร้างแบบ ภ.พ.30&rdquo; เพื่อเริ่มต้น</div>
        </div>
      ) : (
        <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-slate-50">
                <TableHead>เลขที่แบบ</TableHead>
                <TableHead>งวดภาษี</TableHead>
                <TableHead className="text-right">ภาษีขาย</TableHead>
                <TableHead className="text-right">ภาษีซื้อ</TableHead>
                <TableHead className="text-right">ยอดสุทธิ</TableHead>
                <TableHead>สถานะ</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {initialRows.map((row) => (
                <TableRow
                  key={row.id}
                  className="cursor-pointer hover:bg-slate-50"
                  onClick={() => router.push(withBasePath(`/tax/pp30/${row.id}`))}
                >
                  <TableCell className="font-mono text-sm">{row.filing_number}</TableCell>
                  <TableCell>
                    {THAI_MONTHS_SHORT[row.period_month - 1]} {row.period_year + 543}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{fmt(row.output_vat_total)}</TableCell>
                  <TableCell className="text-right tabular-nums">{fmt(row.input_vat_total)}</TableCell>
                  <TableCell
                    className={cn(
                      "text-right tabular-nums font-medium",
                      row.net_vat > 0 ? "text-red-600" : "text-teal-600"
                    )}
                  >
                    {fmt(row.net_vat)}
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={row.status} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>สร้างแบบ ภ.พ.30</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>ปี (ค.ศ.)</Label>
              <CustomSelect
                value={year}
                onChange={setYear}
                options={YEAR_OPTIONS}
              />
            </div>
            <div className="space-y-1.5">
              <Label>เดือน</Label>
              <CustomSelect
                value={month}
                onChange={setMonth}
                options={MONTH_OPTIONS}
              />
            </div>
            <div className="text-sm text-slate-500">
              งวดภาษี: {THAI_MONTHS_FULL[Number(month) - 1]} พ.ศ. {Number(year) + 543}
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
              ยกเลิก
            </Button>
            <Button onClick={handleCreate} disabled={pending}>
              {pending ? "กำลังสร้าง..." : "สร้าง"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
