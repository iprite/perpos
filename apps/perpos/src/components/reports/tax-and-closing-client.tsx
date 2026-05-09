"use client";

import React, { useMemo, useState, useTransition } from "react";
import { Download, RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { downloadCsv, toCsv } from "@/components/reports/csv";
import { getOutputVatReportAction, getWhtSummaryAction, type OutputVatRow } from "@/lib/reports/actions";
import cn from "@core/utils/class-names";

function fmt(n: number) {
  return n.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function TaxAndClosingClient(props: {
  organizationId: string;
  initialStartDate: string;
  initialEndDate: string;
  initialRows: OutputVatRow[];
  initialWht: { count: number; totalWithholding: number };
}) {
  const [pending, startTransition] = useTransition();
  const [startDate, setStartDate] = useState(props.initialStartDate);
  const [endDate, setEndDate] = useState(props.initialEndDate);
  const [rows, setRows] = useState<OutputVatRow[]>(props.initialRows);
  const [wht, setWht] = useState(props.initialWht);
  const [error, setError] = useState<string | null>(null);

  const totals = useMemo(() => {
    const amount = rows.reduce((s, r) => s + (r.amount ?? 0), 0);
    const vat = rows.reduce((s, r) => s + (r.vatAmount ?? 0), 0);
    return { amount, vat };
  }, [rows]);

  const refresh = () => {
    setError(null);
    startTransition(async () => {
      const [vatRes, whtRes] = await Promise.all([
        getOutputVatReportAction({ organizationId: props.organizationId, startDate, endDate }),
        getWhtSummaryAction({ organizationId: props.organizationId, startDate, endDate }),
      ]);
      if (!vatRes.ok) {
        setError(vatRes.error);
        return;
      }
      if (!whtRes.ok) {
        setError(whtRes.error);
        return;
      }
      setRows(vatRes.rows);
      setWht({ count: whtRes.count, totalWithholding: whtRes.totalWithholding });
    });
  };

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="grid gap-1">
            <div className="text-xs text-slate-600">ช่วงวันที่</div>
            <div className="flex items-center gap-2">
              <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="w-[160px]" />
              <div className="text-sm text-slate-500">–</div>
              <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="w-[160px]" />
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" className="gap-2" onClick={refresh} disabled={pending}>
            <RefreshCw className={cn("h-4 w-4", pending ? "animate-spin" : undefined)} />
            Refresh
          </Button>
          <Button
            variant="outline"
            className="gap-2"
            onClick={() => {
              const csv = toCsv(
                rows.map((r) => ({
                  issue_date: r.issueDate,
                  invoice_number: r.invoiceNumber ?? "",
                  customer_name: r.customerName,
                  customer_tax_id: r.customerTaxId ?? "",
                  amount: r.amount,
                  vat_amount: r.vatAmount,
                })),
              );
              downloadCsv("output-vat.csv", csv);
            }}
          >
            <Download className="h-4 w-4" />
            Export CSV
          </Button>
        </div>
      </div>

      {error ? <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div> : null}

      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="text-xs text-slate-600">ยอดขายฐานภาษี (VAT)</div>
          <div className="mt-1 text-2xl font-semibold tabular-nums text-slate-900">{fmt(totals.amount)}</div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="text-xs text-slate-600">ภาษีขาย</div>
          <div className="mt-1 text-2xl font-semibold tabular-nums text-slate-900">{fmt(totals.vat)}</div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="text-xs text-slate-600">สรุป WHT (หัก ณ ที่จ่าย)</div>
          <div className="mt-1 text-2xl font-semibold tabular-nums text-slate-900">{fmt(wht.totalWithholding)}</div>
          <div className="mt-1 text-xs text-slate-600">จำนวนเอกสาร {wht.count}</div>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white">
        <div className="border-b border-slate-200 px-5 py-4">
          <div className="text-sm font-semibold text-slate-900">รายงานภาษีขาย (Output VAT)</div>
          <div className="mt-0.5 text-xs text-slate-600">อิงจากใบแจ้งหนี้ที่มี VAT และไม่ถูก void</div>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[120px]">วันที่</TableHead>
              <TableHead className="w-[180px]">เลขที่</TableHead>
              <TableHead>ลูกค้า</TableHead>
              <TableHead className="w-[160px]">เลขผู้เสียภาษี</TableHead>
              <TableHead className="w-[140px] text-right">มูลค่า</TableHead>
              <TableHead className="w-[140px] text-right">VAT</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length ? (
              rows.map((r) => (
                <TableRow key={`${r.issueDate}-${r.invoiceNumber ?? ""}-${r.customerName}`}>
                  <TableCell>{r.issueDate}</TableCell>
                  <TableCell className="font-mono text-sm">{r.invoiceNumber ?? "-"}</TableCell>
                  <TableCell className="text-sm text-slate-900">{r.customerName}</TableCell>
                  <TableCell className="font-mono text-sm">{r.customerTaxId ?? "-"}</TableCell>
                  <TableCell className="text-right tabular-nums">{fmt(r.amount)}</TableCell>
                  <TableCell className="text-right tabular-nums">{fmt(r.vatAmount)}</TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={6} className="py-10 text-center text-sm text-slate-600">
                  ไม่มีรายการภาษีขายในช่วงที่เลือก
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <div className="text-sm font-semibold text-slate-900">ปิดงบสิ้นปี (แนวคิด)</div>
        <div className="mt-2 text-sm text-slate-600">
          Phase 3 จะเตรียม workflow และ RPC สำหรับปิดงบแบบ transaction (สร้างรายการปิดบัญชี + ล็อกงวด + เตรียมยอดยกมา)
          โดยในรอบนี้ยังไม่ได้เปิดใช้งาน UI ปิดงบเต็มรูปแบบ
        </div>
      </div>
    </div>
  );
}

