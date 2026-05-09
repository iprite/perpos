"use client";

import React, { useState, useTransition } from "react";
import { getBalanceSheetAction, type BalanceSheetRow } from "@/lib/finance/report-actions";

type Props = {
  organizationId: string;
  initialDate: string;
  initialRows: BalanceSheetRow[];
};

const SECTION_TH: Record<string, string> = {
  asset:     "สินทรัพย์",
  liability: "หนี้สิน",
  equity:    "ส่วนของผู้ถือหุ้น",
};

const SECTION_ORDER = ["asset", "liability", "equity"];

export function BalanceSheetClient({ organizationId, initialDate, initialRows }: Props) {
  const [asOfDate, setAsOfDate] = useState(initialDate);
  const [rows, setRows] = useState<BalanceSheetRow[]>(initialRows);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function reload(date: string) {
    startTransition(async () => {
      setError(null);
      const result = await getBalanceSheetAction(organizationId, date);
      if (result.error) { setError(result.error); return; }
      setRows(result.rows);
    });
  }

  const sections = SECTION_ORDER.filter((s) => rows.some((r) => r.section === s));

  const sectionTotals: Record<string, number> = {};
  for (const s of sections) {
    sectionTotals[s] = rows
      .filter((r) => r.section === s && r.parent_account_id === null)
      .reduce((sum, r) => sum + r.balance, 0);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <label className="text-sm font-medium text-slate-700">ณ วันที่</label>
          <input
            type="date"
            value={asOfDate}
            onChange={(e) => { setAsOfDate(e.target.value); reload(e.target.value); }}
            className="rounded-md border border-slate-200 px-3 py-1.5 text-sm focus:outline-none"
          />
        </div>
        {isPending && <span className="text-sm text-slate-400">กำลังโหลด...</span>}
      </div>

      {error && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}

      {rows.length === 0 && !isPending && (
        <div className="rounded-lg border border-dashed border-slate-200 py-12 text-center text-sm text-slate-500">ไม่มีข้อมูล</div>
      )}

      {sections.map((section) => {
        const sectionRows = rows.filter((r) => r.section === section);
        return (
          <div key={section} className="overflow-hidden rounded-lg border border-slate-200">
            <div className="bg-slate-50 px-4 py-2.5 font-semibold text-slate-700">{SECTION_TH[section] ?? section}</div>
            <table className="min-w-full text-sm">
              <tbody className="divide-y divide-slate-100 bg-white">
                {sectionRows.map((row) => (
                  <tr key={row.account_id} className="hover:bg-slate-50">
                    <td
                      className="px-4 py-2 text-slate-700"
                      style={{ paddingLeft: `${(row.level + 1) * 16}px` }}
                    >
                      <span className="mr-2 font-mono text-xs text-slate-400">{row.account_code}</span>
                      {row.account_name}
                    </td>
                    <td className={`px-4 py-2 text-right font-mono ${row.balance === 0 ? "text-slate-400" : "text-slate-800"}`}>
                      {row.balance.toLocaleString("th-TH", { minimumFractionDigits: 2 })}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-slate-50 font-semibold">
                  <td className="px-4 py-2.5 text-slate-700">รวม{SECTION_TH[section] ?? section}</td>
                  <td className="px-4 py-2.5 text-right font-mono text-slate-800">
                    {(sectionTotals[section] ?? 0).toLocaleString("th-TH", { minimumFractionDigits: 2 })}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        );
      })}
    </div>
  );
}
