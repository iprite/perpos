"use client";

import React, { useState, useTransition } from "react";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ThaiDatePicker } from "@/components/ui/thai-date-picker";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getWhtReceivedAction, type WhtReceivedRow } from "@/lib/finance/report-actions";
import cn from "@core/utils/class-names";

function fmt(n: number) {
  return n.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const DOC_TYPE_LABELS: Record<string, string> = {
  quotation: "ใบเสนอราคา",
  deposit:   "ใบรับมัดจำ",
  invoice:   "ใบแจ้งหนี้",
  receipt:   "ใบเสร็จรับเงิน",
  tax_invoice: "ใบกำกับภาษีขาย",
  credit_note: "ใบลดหนี้",
  debit_note:  "ใบเพิ่มหนี้",
  billing_note: "ใบวางบิล",
};

export function WhtReceivedClient(props: {
  organizationId: string;
  initialStartDate: string;
  initialEndDate: string;
  initialRows: WhtReceivedRow[];
}) {
  const [startDate, setStartDate] = useState(props.initialStartDate);
  const [endDate, setEndDate]     = useState(props.initialEndDate);
  const [rows, setRows]           = useState<WhtReceivedRow[]>(props.initialRows);
  const [error, setError]         = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const refresh = () => {
    setError(null);
    startTransition(async () => {
      const res = await getWhtReceivedAction(props.organizationId, startDate, endDate);
      if (!res.error) setRows(res.rows);
      else setError(res.error);
    });
  };

  const totalWht = rows.reduce((s, r) => s + r.withholdingTax, 0);

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="grid gap-1">
          <div className="text-xs text-slate-500">ตั้งแต่วันที่</div>
          <ThaiDatePicker value={startDate} onChange={(v) => setStartDate(v)} className="h-9 w-40" />
        </div>
        <div className="grid gap-1">
          <div className="text-xs text-slate-500">ถึงวันที่</div>
          <ThaiDatePicker value={endDate} onChange={(v) => setEndDate(v)} className="h-9 w-40" />
        </div>
        <Button variant="secondary" className="gap-2 h-9" onClick={refresh} disabled={pending}>
          <RefreshCw className={cn("h-4 w-4", pending && "animate-spin")} />
          แสดงรายงาน
        </Button>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>
      )}

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>วันที่</TableHead>
              <TableHead>เลขที่เอกสาร</TableHead>
              <TableHead>ประเภท</TableHead>
              <TableHead>ลูกค้า</TableHead>
              <TableHead className="text-right">ยอดรวม</TableHead>
              <TableHead className="text-right">ถูกหัก ณ ที่จ่าย</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="py-10 text-center text-sm text-slate-500">ไม่มีรายการ</TableCell>
              </TableRow>
            ) : (
              rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="text-sm">{row.issueDate}</TableCell>
                  <TableCell className="font-mono text-sm">{row.docNumber}</TableCell>
                  <TableCell className="text-sm">{DOC_TYPE_LABELS[row.docType] ?? row.docType}</TableCell>
                  <TableCell className="text-sm">{row.contactName || "-"}</TableCell>
                  <TableCell className="text-right tabular-nums text-sm">{fmt(row.totalAmount)}</TableCell>
                  <TableCell className="text-right tabular-nums text-sm font-medium text-red-600">{fmt(row.withholdingTax)}</TableCell>
                </TableRow>
              ))
            )}
            {rows.length > 0 && (
              <TableRow className="bg-slate-50 font-semibold">
                <TableCell colSpan={5} className="text-right text-sm">รวมภาษีถูกหัก ณ ที่จ่าย</TableCell>
                <TableCell className="text-right tabular-nums text-sm text-red-700">{fmt(totalWht)}</TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
