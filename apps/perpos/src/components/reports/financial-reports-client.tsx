"use client";

import React, { useMemo, useState, useTransition } from "react";
import { Download, Printer, RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ThaiDatePicker } from "@/components/ui/thai-date-picker";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  getPnlAction,
  getTrialBalanceAction,
  type PnlRow,
  type TrialBalanceRow,
} from "@/lib/reports/actions";
import { AccountDrilldownDialog } from "@/components/reports/account-drilldown-dialog";
import { downloadCsv, toCsv } from "@/components/reports/csv";
import cn from "@core/utils/class-names";

function fmt(n: number) {
  return n.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function FinancialReportsClient(props: {
  organizationId: string;
  initialStartDate: string;
  initialEndDate: string;
  initialTrialBalance: TrialBalanceRow[];
  initialPnl: PnlRow[];
  initialTab?: "trial" | "pnl";
}) {
  const [tab, setTab] = useState<"trial" | "pnl">(props.initialTab ?? "trial");
  const [startDate, setStartDate] = useState(props.initialStartDate);
  const [endDate, setEndDate] = useState(props.initialEndDate);
  const [postedOnly, setPostedOnly] = useState(true);
  const [includeClosing, setIncludeClosing] = useState(true);

  const [trialBalance, setTrialBalance] = useState<TrialBalanceRow[]>(props.initialTrialBalance);
  const [pnl, setPnl] = useState<PnlRow[]>(props.initialPnl);

  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const trialTotals = useMemo(() => {
    const dr = trialBalance.reduce((s, r) => s + (r.periodDebit ?? 0), 0);
    const cr = trialBalance.reduce((s, r) => s + (r.periodCredit ?? 0), 0);
    return { dr, cr, balanced: Math.round(dr * 100) === Math.round(cr * 100) };
  }, [trialBalance]);

  const pnlTotals = useMemo(() => {
    const revenue = pnl.filter((r) => r.section === "revenue").reduce((s, r) => s + (r.amount ?? 0), 0);
    const expense = pnl.filter((r) => r.section === "expense").reduce((s, r) => s + (r.amount ?? 0), 0);
    return { revenue, expense, net: revenue - expense };
  }, [pnl]);

  const refresh = () => {
    setError(null);
    startTransition(async () => {
      const [tb, pl] = await Promise.all([
        getTrialBalanceAction({
          organizationId: props.organizationId,
          startDate,
          endDate,
          postedOnly,
          includeClosing,
        }),
        getPnlAction({
          organizationId: props.organizationId,
          startDate,
          endDate,
          postedOnly,
          includeClosing,
        }),
      ]);
      if (!tb.ok) {
        setError(tb.error);
        return;
      }
      if (!pl.ok) {
        setError(pl.error);
        return;
      }
      setTrialBalance(tb.rows);
      setPnl(pl.rows);
    });
  };

  const [drillOpen, setDrillOpen] = useState(false);
  const [drillTitle, setDrillTitle] = useState<string>("");
  const [drillAccountId, setDrillAccountId] = useState<string | null>(null);

  const openDrilldown = (r: TrialBalanceRow) => {
    setError(null);
    setDrillTitle(`${r.accountCode} ${r.accountName}`);
    setDrillAccountId(r.accountId);
    setDrillOpen(true);
  };

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="grid gap-1">
            <div className="text-xs text-slate-600">ช่วงวันที่</div>
            <div className="flex items-center gap-2">
              <ThaiDatePicker value={startDate} onChange={(v) => setStartDate(v)} className="w-[160px]" />
              <div className="text-sm text-slate-500">–</div>
              <ThaiDatePicker value={endDate} onChange={(v) => setEndDate(v)} className="w-[160px]" />
            </div>
          </div>

          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" checked={postedOnly} onChange={(e) => setPostedOnly(e.target.checked)} />
            เฉพาะโพสต์แล้ว
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" checked={includeClosing} onChange={(e) => setIncludeClosing(e.target.checked)} />
            รวมรายการปิดงบ
          </label>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" className="gap-2" disabled={pending} onClick={refresh}>
            <RefreshCw className={cn("h-4 w-4", pending ? "animate-spin" : undefined)} />
            Refresh
          </Button>
          <Button
            variant="outline"
            className="gap-2"
            onClick={() => {
              const data = tab === "trial" ? trialBalance : pnl;
              const csv = toCsv(data as any);
              downloadCsv(tab === "trial" ? "trial-balance.csv" : "pnl.csv", csv);
            }}
          >
            <Download className="h-4 w-4" />
            Export CSV
          </Button>
          <Button variant="outline" className="gap-2" onClick={() => window.print()}>
            <Printer className="h-4 w-4" />
            Print
          </Button>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <button
          className={cn(
            "rounded-md px-3 py-1.5 text-sm",
            tab === "trial" ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-800 hover:bg-slate-200",
          )}
          onClick={() => setTab("trial")}
          type="button"
        >
          Trial Balance
        </button>
        <button
          className={cn(
            "rounded-md px-3 py-1.5 text-sm",
            tab === "pnl" ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-800 hover:bg-slate-200",
          )}
          onClick={() => setTab("pnl")}
          type="button"
        >
          Profit & Loss
        </button>
      </div>

      {error ? <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div> : null}

      {tab === "trial" ? (
        <div className="rounded-xl border border-slate-200 bg-white">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>บัญชี</TableHead>
                <TableHead className="text-right">ยกมา Dr</TableHead>
                <TableHead className="text-right">ยกมา Cr</TableHead>
                <TableHead className="text-right">งวดนี้ Dr</TableHead>
                <TableHead className="text-right">งวดนี้ Cr</TableHead>
                <TableHead className="text-right">ยกไป Dr</TableHead>
                <TableHead className="text-right">ยกไป Cr</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {trialBalance.map((r) => (
                <TableRow key={r.accountId}>
                  <TableCell>
                    <button
                      type="button"
                      className="text-left"
                      onClick={() => openDrilldown(r)}
                      title="ดูรายละเอียด"
                    >
                      <div className="flex items-center gap-2">
                        <div className="font-mono text-xs text-slate-600">{r.accountCode}</div>
                        <div className="text-sm text-slate-900" style={{ paddingLeft: r.level * 12 }}>
                          {r.accountName}
                        </div>
                      </div>
                    </button>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{fmt(r.openingDebit)}</TableCell>
                  <TableCell className="text-right tabular-nums">{fmt(r.openingCredit)}</TableCell>
                  <TableCell className="text-right tabular-nums">{fmt(r.periodDebit)}</TableCell>
                  <TableCell className="text-right tabular-nums">{fmt(r.periodCredit)}</TableCell>
                  <TableCell className="text-right tabular-nums">{fmt(r.closingDebit)}</TableCell>
                  <TableCell className="text-right tabular-nums">{fmt(r.closingCredit)}</TableCell>
                </TableRow>
              ))}

              <TableRow>
                <TableCell className="font-semibold">รวมงวดนี้</TableCell>
                <TableCell />
                <TableCell />
                <TableCell className="text-right font-semibold tabular-nums">{fmt(trialTotals.dr)}</TableCell>
                <TableCell className="text-right font-semibold tabular-nums">{fmt(trialTotals.cr)}</TableCell>
                <TableCell />
                <TableCell />
              </TableRow>
            </TableBody>
          </Table>

          <div className="flex items-center justify-between border-t border-slate-200 px-4 py-3 text-sm">
            <div className="text-slate-600">สถานะ</div>
            <div className={cn("font-semibold", trialTotals.balanced ? "text-emerald-700" : "text-red-700")}
            >
              {trialTotals.balanced ? "สมดุล" : "ไม่สมดุล"}
            </div>
          </div>
        </div>
      ) : (
        <div className="rounded-xl border border-slate-200 bg-white">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>หมวด/บัญชี</TableHead>
                <TableHead className="text-right">จำนวนเงิน</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow>
                <TableCell className="font-semibold text-slate-900">รายได้</TableCell>
                <TableCell className="text-right font-semibold tabular-nums">{fmt(pnlTotals.revenue)}</TableCell>
              </TableRow>
              {pnl
                .filter((r) => r.section === "revenue")
                .map((r) => (
                  <TableRow key={r.accountId}>
                    <TableCell>
                      <div className="flex items-center gap-2" style={{ paddingLeft: r.level * 12 }}>
                        <div className="font-mono text-xs text-slate-600">{r.accountCode}</div>
                        <div className="text-sm text-slate-900">{r.accountName}</div>
                      </div>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{fmt(r.amount)}</TableCell>
                  </TableRow>
                ))}

              <TableRow>
                <TableCell className="font-semibold text-slate-900">ค่าใช้จ่าย</TableCell>
                <TableCell className="text-right font-semibold tabular-nums">{fmt(pnlTotals.expense)}</TableCell>
              </TableRow>
              {pnl
                .filter((r) => r.section === "expense")
                .map((r) => (
                  <TableRow key={r.accountId}>
                    <TableCell>
                      <div className="flex items-center gap-2" style={{ paddingLeft: r.level * 12 }}>
                        <div className="font-mono text-xs text-slate-600">{r.accountCode}</div>
                        <div className="text-sm text-slate-900">{r.accountName}</div>
                      </div>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{fmt(r.amount)}</TableCell>
                  </TableRow>
                ))}

              <TableRow>
                <TableCell className="text-lg font-semibold">กำไร(ขาดทุน)สุทธิ</TableCell>
                <TableCell className={cn("text-right text-lg font-semibold tabular-nums", pnlTotals.net >= 0 ? "text-emerald-700" : "text-red-700")}>
                  {fmt(pnlTotals.net)}
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>
      )}

      <AccountDrilldownDialog
        open={drillOpen}
        onOpenChange={setDrillOpen}
        title={drillTitle}
        organizationId={props.organizationId}
        accountId={drillAccountId}
        startDate={startDate}
        endDate={endDate}
        onError={(msg) => setError(msg)}
      />
    </div>
  );
}
