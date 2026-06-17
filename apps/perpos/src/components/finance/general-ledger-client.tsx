"use client";

import React, { useState, useTransition } from "react";
import { CustomSelect } from "@/components/ui/custom-select";
import { Label } from "@/components/ui/label";
import { getGeneralLedgerAction, type LedgerRow } from "@/lib/finance/report-actions";
import { ThaiDatePicker } from "@/components/ui/thai-date-picker";
import {
  Table, TableHeader, TableBody, TableFooter, TableRow, TableHead, TableCell,
} from "@/components/ui/table";

type AccountOption = { id: string; label: string };

type Props = {
  organizationId: string;
  accounts: AccountOption[];
  initialAccountId: string | null;
  initialStartDate: string;
  initialEndDate: string;
  initialRows: LedgerRow[];
};

export function GeneralLedgerClient({
  organizationId, accounts, initialAccountId, initialStartDate, initialEndDate, initialRows,
}: Props) {
  const [accountId, setAccountId]    = useState(initialAccountId ?? "");
  const [startDate, setStartDate]    = useState(initialStartDate);
  const [endDate, setEndDate]        = useState(initialEndDate);
  const [rows, setRows]              = useState<LedgerRow[]>(initialRows);
  const [error, setError]            = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function reload(aid: string, sd: string, ed: string) {
    if (!aid) return;
    startTransition(async () => {
      setError(null);
      const result = await getGeneralLedgerAction(organizationId, aid, sd, ed);
      if (result.error) { setError(result.error); return; }
      setRows(result.rows);
    });
  }

  const totalDebit  = rows.reduce((s, r) => s + r.debit,  0);
  const totalCredit = rows.reduce((s, r) => s + r.credit, 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <Label>บัญชี</Label>
          <CustomSelect
            value={accountId}
            onChange={(v) => { setAccountId(v); reload(v, startDate, endDate); }}
            options={[
              { value: "", label: "เลือกบัญชี" },
              ...accounts.map((a) => ({ value: a.id, label: a.label })),
            ]}
            className="min-w-[240px]"
          />
        </div>
        <div className="flex items-center gap-2">
          <Label>ตั้งแต่</Label>
          <ThaiDatePicker
            value={startDate}
            onChange={(v) => { setStartDate(v); reload(accountId, v, endDate); }}
          />
        </div>
        <div className="flex items-center gap-2">
          <Label>ถึง</Label>
          <ThaiDatePicker
            value={endDate}
            onChange={(v) => { setEndDate(v); reload(accountId, startDate, v); }}
          />
        </div>
        {isPending && <span className="text-sm text-slate-400">กำลังโหลด...</span>}
      </div>

      {error && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}

      {!accountId && (
        <div className="rounded-lg border border-dashed border-slate-200 py-12 text-center text-sm text-slate-500">กรุณาเลือกบัญชี</div>
      )}

      {accountId && rows.length === 0 && !isPending && (
        <div className="rounded-lg border border-dashed border-slate-200 py-12 text-center text-sm text-slate-500">ไม่มีรายการในช่วงเวลานี้</div>
      )}

      {accountId && rows.length > 0 && (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>วันที่</TableHead>
              <TableHead>เลขที่</TableHead>
              <TableHead>คำอธิบาย</TableHead>
              <TableHead align="right">เดบิต</TableHead>
              <TableHead align="right">เครดิต</TableHead>
              <TableHead align="right">ยอดคงเหลือ</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row, i) => (
              <TableRow key={`${row.journal_entry_id}-${i}`}>
                <TableCell className="text-slate-600">{row.entry_date}</TableCell>
                <TableCell className="font-mono text-xs text-slate-600">{row.reference_number ?? "-"}</TableCell>
                <TableCell className="text-slate-700">{row.description ?? row.memo ?? "-"}</TableCell>
                <TableCell align="right" tabular className="text-slate-700">
                  {row.debit > 0 ? row.debit.toLocaleString("th-TH", { minimumFractionDigits: 2 }) : ""}
                </TableCell>
                <TableCell align="right" tabular className="text-slate-700">
                  {row.credit > 0 ? row.credit.toLocaleString("th-TH", { minimumFractionDigits: 2 }) : ""}
                </TableCell>
                <TableCell align="right" tabular className={`font-medium ${row.running_balance >= 0 ? "text-slate-800" : "text-red-600"}`}>
                  {row.running_balance.toLocaleString("th-TH", { minimumFractionDigits: 2 })}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
          <TableFooter>
            <TableRow>
              <TableCell colSpan={3} className="text-slate-700">รวม</TableCell>
              <TableCell align="right" tabular className="text-slate-800">{totalDebit.toLocaleString("th-TH", { minimumFractionDigits: 2 })}</TableCell>
              <TableCell align="right" tabular className="text-slate-800">{totalCredit.toLocaleString("th-TH", { minimumFractionDigits: 2 })}</TableCell>
              <TableCell></TableCell>
            </TableRow>
          </TableFooter>
        </Table>
      )}
    </div>
  );
}
