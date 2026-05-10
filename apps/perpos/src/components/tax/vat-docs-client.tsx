"use client";

import React, { useMemo, useState } from "react";
import { CustomSelect } from "@/components/ui/custom-select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import cn from "@core/utils/class-names";
import type { VatDocRow } from "@/lib/tax/actions";

const THAI_MONTHS = [
  "มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน",
  "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม",
];

function fmt(n: number) {
  return n.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const currentYear = new Date().getFullYear();
const YEAR_OPTIONS = Array.from({ length: 5 }, (_, i) => {
  const y = currentYear - 2 + i;
  return { value: String(y), label: `พ.ศ. ${y + 543}` };
});
const MONTH_OPTIONS = [
  { value: "all", label: "ทุกเดือน" },
  ...THAI_MONTHS.map((m, i) => ({ value: String(i + 1), label: `${i + 1} - ${m}` })),
];

type Props = {
  rows: VatDocRow[];
  title: string;
  subtitle?: string;
};

export function VatDocsClient({ rows, title, subtitle }: Props) {
  const [year, setYear] = useState(String(currentYear));
  const [month, setMonth] = useState("all");

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (!r.issue_date) return false;
      const d = new Date(r.issue_date);
      if (String(d.getFullYear()) !== year) return false;
      if (month !== "all" && String(d.getMonth() + 1) !== month) return false;
      return true;
    });
  }, [rows, year, month]);

  const totalVat = filtered.reduce((s, r) => s + r.vat_amount, 0);
  const totalBase = filtered.reduce((s, r) => s + r.sub_total, 0);

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="flex items-center gap-2">
          <span className="text-sm text-slate-600">ปี</span>
          <CustomSelect value={year} onChange={setYear} options={YEAR_OPTIONS} className="w-36" />
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-slate-600">เดือน</span>
          <CustomSelect value={month} onChange={setMonth} options={MONTH_OPTIONS} className="w-44" />
        </div>
        <div className="ml-auto text-sm text-slate-500">{filtered.length} รายการ</div>
      </div>

      {/* Summary bar */}
      {filtered.length > 0 && (
        <div className="flex gap-6 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 mb-4">
          <div>
            <div className="text-xs text-slate-500">ยอดรวมก่อน VAT</div>
            <div className="font-semibold text-slate-800">{fmt(totalBase)} บาท</div>
          </div>
          <div>
            <div className="text-xs text-slate-500">VAT รวม</div>
            <div className="font-semibold text-teal-700">{fmt(totalVat)} บาท</div>
          </div>
        </div>
      )}

      {filtered.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-500">
          ไม่พบเอกสารในช่วงเวลาที่เลือก
        </div>
      ) : (
        <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-slate-50">
                <TableHead>เลขที่เอกสาร</TableHead>
                <TableHead>วันที่</TableHead>
                <TableHead>คู่ค้า</TableHead>
                <TableHead className="text-right">ยอดก่อน VAT</TableHead>
                <TableHead className="text-right">VAT (7%)</TableHead>
                <TableHead>สถานะ</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="font-mono text-sm">{row.doc_number ?? "-"}</TableCell>
                  <TableCell className="text-sm">
                    {row.issue_date
                      ? new Date(row.issue_date).toLocaleDateString("th-TH", {
                          day: "2-digit",
                          month: "short",
                          year: "numeric",
                        })
                      : "-"}
                  </TableCell>
                  <TableCell className="text-sm">{row.contact_name ?? "-"}</TableCell>
                  <TableCell className="text-right tabular-nums text-sm">{fmt(row.sub_total)}</TableCell>
                  <TableCell className="text-right tabular-nums text-sm font-medium text-teal-700">
                    {fmt(row.vat_amount)}
                  </TableCell>
                  <TableCell>
                    <span className="text-xs bg-slate-100 text-slate-600 rounded-full px-2 py-0.5">
                      {row.status}
                    </span>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
