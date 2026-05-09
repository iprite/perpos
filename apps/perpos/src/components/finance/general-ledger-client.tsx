"use client";

import React, { useState, useTransition } from "react";
import { getGeneralLedgerAction, type LedgerRow } from "@/lib/finance/report-actions";

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
          <label className="text-sm font-medium text-slate-700">บัญชี</label>
          <select
            value={accountId}
            onChange={(e) => { setAccountId(e.target.value); reload(e.target.value, startDate, endDate); }}
            className="min-w-[240px] rounded-md border border-slate-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">เลือกบัญชี</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>{a.label}</option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-sm font-medium text-slate-700">ตั้งแต่</label>
          <input
            type="date"
            value={startDate}
            onChange={(e) => { setStartDate(e.target.value); reload(accountId, e.target.value, endDate); }}
            className="rounded-md border border-slate-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div className="flex items-center gap-2">
          <label className="text-sm font-medium text-slate-700">ถึง</label>
          <input
            type="date"
            value={endDate}
            onChange={(e) => { setEndDate(e.target.value); reload(accountId, startDate, e.target.value); }}
            className="rounded-md border border-slate-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        {isPending && <span className="text-sm text-slate-400">กำลังโหลด...</span>}
      </div>

      {error && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}

      {!accountId && (
        <div className="rounded-lg border border-dashed border-slate-300 py-12 text-center text-sm text-slate-500">กรุณาเลือกบัญชี</div>
      )}

      {accountId && rows.length === 0 && !isPending && (
        <div className="rounded-lg border border-dashed border-slate-300 py-12 text-center text-sm text-slate-500">ไม่มีรายการในช่วงเวลานี้</div>
      )}

      {accountId && rows.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-slate-200">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">
              <tr>
                <th className="px-4 py-3">วันที่</th>
                <th className="px-4 py-3">เลขที่</th>
                <th className="px-4 py-3">คำอธิบาย</th>
                <th className="px-4 py-3 text-right">เดบิต</th>
                <th className="px-4 py-3 text-right">เครดิต</th>
                <th className="px-4 py-3 text-right">ยอดคงเหลือ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {rows.map((row, i) => (
                <tr key={`${row.journal_entry_id}-${i}`} className="hover:bg-slate-50">
                  <td className="px-4 py-2 text-slate-600">{row.entry_date}</td>
                  <td className="px-4 py-2 font-mono text-xs text-slate-600">{row.reference_number ?? "-"}</td>
                  <td className="px-4 py-2 text-slate-700">{row.description ?? row.memo ?? "-"}</td>
                  <td className="px-4 py-2 text-right font-mono text-slate-700">
                    {row.debit > 0 ? row.debit.toLocaleString("th-TH", { minimumFractionDigits: 2 }) : ""}
                  </td>
                  <td className="px-4 py-2 text-right font-mono text-slate-700">
                    {row.credit > 0 ? row.credit.toLocaleString("th-TH", { minimumFractionDigits: 2 }) : ""}
                  </td>
                  <td className={`px-4 py-2 text-right font-mono font-medium ${row.running_balance >= 0 ? "text-slate-800" : "text-red-600"}`}>
                    {row.running_balance.toLocaleString("th-TH", { minimumFractionDigits: 2 })}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-slate-50 font-semibold">
                <td colSpan={3} className="px-4 py-2.5 text-slate-700">รวม</td>
                <td className="px-4 py-2.5 text-right font-mono text-slate-800">
                  {totalDebit.toLocaleString("th-TH", { minimumFractionDigits: 2 })}
                </td>
                <td className="px-4 py-2.5 text-right font-mono text-slate-800">
                  {totalCredit.toLocaleString("th-TH", { minimumFractionDigits: 2 })}
                </td>
                <td className="px-4 py-2.5"></td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}
