"use client";

import React, { useMemo, useTransition } from "react";
import { Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ThaiDatePicker } from "@/components/ui/thai-date-picker";
import cn from "@core/utils/class-names";
import {
  getExecutiveDashboardAction,
  type AgingRow,
  type ExecKpis,
  type ExecTrendRow,
  type TopExpenseRow,
} from "@/lib/reports/actions";

function fmt(n: number) {
  return n.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const pieColors = ["#10B981", "#34D399", "#6EE7B7", "#A7F3D0", "#D1FAE5"];

export function ExecutiveDashboardClient(props: {
  organizationId: string;
  initialEndMonth: string;
  initialKpis: ExecKpis;
  initialTrends: ExecTrendRow[];
  initialTopExpenses: TopExpenseRow[];
  initialReceivableAging: AgingRow[];
}) {
  const [pending, startTransition] = useTransition();
  const [endMonth, setEndMonth] = React.useState(props.initialEndMonth);
  const [kpis, setKpis] = React.useState(props.initialKpis);
  const [trends, setTrends] = React.useState(props.initialTrends);
  const [topExpenses, setTopExpenses] = React.useState(props.initialTopExpenses);
  const [aging, setAging] = React.useState(props.initialReceivableAging);
  const [error, setError] = React.useState<string | null>(null);

  const refresh = () => {
    setError(null);
    startTransition(async () => {
      const res = await getExecutiveDashboardAction({ organizationId: props.organizationId, endMonth });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setKpis(res.kpis);
      setTrends(res.trends);
      setTopExpenses(res.topExpenses);
      setAging(res.receivableAging);
    });
  };

  const pieData = useMemo(() => {
    return topExpenses.map((x) => ({ name: x.label, value: x.amount }));
  }, [topExpenses]);

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex items-end gap-3">
          <div className="grid gap-1">
            <div className="text-xs text-slate-600">สิ้นงวด (ใช้เป็นวันอ้างอิง)</div>
            <ThaiDatePicker value={endMonth} onChange={(v) => setEndMonth(v)} className="w-[180px]" />
          </div>
        </div>
        <Button variant="outline" className="gap-2" onClick={refresh} disabled={pending}>
          <RefreshCw className={cn("h-4 w-4", pending ? "animate-spin" : undefined)} />
          Refresh
        </Button>
      </div>

      {error ? <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div> : null}

      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="text-xs text-slate-600">รายได้ (เดือนนี้)</div>
          <div className="mt-1 text-2xl font-semibold tabular-nums text-slate-900">{fmt(kpis.revenue)}</div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="text-xs text-slate-600">ค่าใช้จ่าย (เดือนนี้)</div>
          <div className="mt-1 text-2xl font-semibold tabular-nums text-slate-900">{fmt(kpis.expense)}</div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="text-xs text-slate-600">กำไรสุทธิ (เดือนนี้)</div>
          <div className={cn("mt-1 text-2xl font-semibold tabular-nums", kpis.netProfit >= 0 ? "text-emerald-700" : "text-red-700")}>
            {fmt(kpis.netProfit)}
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-12">
        <div className="rounded-xl border border-slate-200 bg-white p-4 lg:col-span-8">
          <div className="text-sm font-semibold text-slate-900">กระแสรายได้/ค่าใช้จ่าย 6 เดือนล่าสุด</div>
          <div className="mt-4 h-[320px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={trends} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" />
                <YAxis />
                <Tooltip formatter={(v: any) => fmt(Number(v))} />
                <Legend />
                <Bar dataKey="revenue" name="Revenue" fill="#10B981" radius={[4, 4, 0, 0]} />
                <Bar dataKey="expense" name="Expense" fill="#64748B" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-6 h-[220px]">
            <div className="text-sm font-semibold text-slate-900">กำไรสุทธิรายเดือน</div>
            <div className="mt-3 h-[180px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={trends} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="month" />
                  <YAxis />
                  <Tooltip formatter={(v: any) => fmt(Number(v))} />
                  <Line type="monotone" dataKey="netProfit" name="Net Profit" stroke="#2563EB" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        <div className="grid gap-6 lg:col-span-4">
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="text-sm font-semibold text-slate-900">Top 5 ค่าใช้จ่าย</div>
            <div className="mt-4 h-[280px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Tooltip formatter={(v: any) => fmt(Number(v))} />
                  <Pie data={pieData} dataKey="value" nameKey="name" outerRadius={95}>
                    {pieData.map((_, i) => (
                      <Cell key={i} fill={pieColors[i % pieColors.length]} />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-3 grid gap-1 text-xs text-slate-600">
              {topExpenses.map((x) => (
                <div key={x.label} className="flex items-center justify-between gap-2">
                  <div className="truncate">{x.label}</div>
                  <div className="tabular-nums text-slate-900">{fmt(x.amount)}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="text-sm font-semibold text-slate-900">ลูกหนี้คงค้าง (Aging)</div>
            <div className="mt-3 grid gap-2 text-sm">
              {aging.map((a) => (
                <div key={a.bucket} className="flex items-center justify-between">
                  <div className="text-slate-700">{labelBucket(a.bucket)}</div>
                  <div className="tabular-nums text-slate-900">{fmt(a.amount)} ({a.count})</div>
                </div>
              ))}
              {!aging.length ? <div className="text-sm text-slate-600">ไม่มีข้อมูล</div> : null}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function labelBucket(b: string) {
  if (b === "overdue") return "Overdue";
  if (b === "due_soon") return "Due Soon";
  if (b === "draft") return "Draft";
  if (b === "open") return "Open";
  return b;
}
