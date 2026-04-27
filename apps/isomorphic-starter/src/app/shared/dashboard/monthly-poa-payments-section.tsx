"use client";

import React, { useEffect, useMemo, useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { useAuth } from "@/app/shared/auth-provider";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

type PoaPaymentRow = {
  amount: number | string | null;
  txn_date: string;
};

type MonthlyPoint = {
  monthKey: string;
  monthLabel: string;
  total: number;
};

function weekStartMonday(d: Date) {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
  const dow = x.getDay();
  const delta = (dow + 6) % 7;
  x.setDate(x.getDate() - delta);
  return x;
}

function round2(n: number) {
  return Math.round((Number.isFinite(n) ? n : 0) * 100) / 100;
}

function asMoney(n: number) {
  const x = Number.isFinite(n) ? n : 0;
  return x.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function monthKey(d: Date) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${yyyy}${mm}`;
}

function monthLabel(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), 1).toLocaleString("th-TH", { month: "short", year: "numeric" });
}

function monthStart(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), 1, 0, 0, 0, 0);
}

function addMonths(d: Date, delta: number) {
  return new Date(d.getFullYear(), d.getMonth() + delta, 1, 0, 0, 0, 0);
}

function addDays(d: Date, delta: number) {
  const x = new Date(d);
  x.setDate(x.getDate() + delta);
  return x;
}

function dateLabel(d: Date) {
  return d.toLocaleString("th-TH", { day: "2-digit", month: "short" });
}

export function MonthlyPoaPaymentsSection() {
  const { envError, userId } = useAuth();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [series, setSeries] = useState<Array<{ label: string; total: number }>>([]);
  const [chartMode, setChartMode] = useState<"monthly" | "weekly">("monthly");

  useEffect(() => {
    if (envError) {
      setError(envError);
      return;
    }
    if (!userId) return;

    const load = async () => {
      setLoading(true);
      setError(null);

      const now = new Date();
      const startThisMonth = monthStart(now);
      const startThisWeek = weekStartMonday(now);

      const points: Array<{ key: string; label: string; start: Date; end: Date }> =
        chartMode === "weekly"
          ? Array.from({ length: 12 }, (_, i) => {
              const s = addDays(startThisWeek, (i - 11) * 7);
              const e = addDays(s, 6);
              return {
                key: s.toISOString().slice(0, 10),
                label: `${dateLabel(s)}-${dateLabel(e)}`,
                start: s,
                end: e,
              };
            })
          : Array.from({ length: 12 }, (_, i) => {
              const s = addMonths(startThisMonth, i - 11);
              const next = addMonths(s, 1);
              return {
                key: monthKey(s),
                label: monthLabel(s),
                start: s,
                end: addDays(next, -1),
              };
            });

      const base = new Map<string, { label: string; total: number }>();
      for (const p of points) base.set(p.key, { label: p.label, total: 0 });

      const startRangeStr = points[0]?.start?.toISOString().slice(0, 10) ?? "1970-01-01";

      const { data, error: qErr } = await supabase
        .from("payment_transactions")
        .select("amount,txn_date")
        .eq("txn_type", "INCOME")
        .eq("source_type", "AGENT_POA")
        .gte("txn_date", startRangeStr);

      if (qErr) {
        setError(qErr.message);
        setSeries(Array.from(base.values()).map((p) => ({ label: p.label, total: p.total })));
        setLoading(false);
        return;
      }

      for (const row of (data ?? []) as PoaPaymentRow[]) {
        const dt = new Date(row.txn_date);
        if (!Number.isFinite(dt.getTime())) continue;

        const n = Number(row.amount ?? 0);
        const amt = round2(Number.isFinite(n) ? n : 0);

        const k = chartMode === "weekly" ? weekStartMonday(dt).toISOString().slice(0, 10) : monthKey(dt);
        const p = base.get(k);
        if (p) p.total = round2(p.total + amt);
      }

      setSeries(Array.from(base.values()).map((p) => ({ label: p.label, total: p.total })));
      setLoading(false);
    };

    load();
  }, [chartMode, envError, supabase, userId]);

  return (
    <div className="mt-5">
      <div className="flex flex-col justify-between gap-2 md:flex-row md:items-end">
        <div>
          <div className="text-base font-semibold text-gray-900">ยอดเงิน POA รายเดือน</div>
          <div className="mt-1 text-sm text-gray-600">สรุปยอดรับเงินจาก POA (เฉพาะสถานะ confirmed) พร้อมกราฟ 12 เดือนล่าสุด</div>
        </div>
      </div>

      {error ? <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div> : null}

      <div className="mt-4 rounded-xl border border-gray-200 bg-white p-4">
        <div className="flex flex-col justify-between gap-2 md:flex-row md:items-center">
          <div className="text-sm font-semibold text-gray-900">กราฟยอดรับเงิน POA</div>
          <div className="flex w-fit items-center gap-1 rounded-full border border-gray-200 bg-white p-1">
            <button
              type="button"
              className={
                chartMode === "monthly"
                  ? "h-8 rounded-full bg-gray-900 px-3 text-xs font-semibold text-white"
                  : "h-8 rounded-full px-3 text-xs font-semibold text-gray-700 hover:bg-gray-50"
              }
              onClick={() => setChartMode("monthly")}
              disabled={loading}
            >
              รายเดือน
            </button>
            <button
              type="button"
              className={
                chartMode === "weekly"
                  ? "h-8 rounded-full bg-gray-900 px-3 text-xs font-semibold text-white"
                  : "h-8 rounded-full px-3 text-xs font-semibold text-gray-700 hover:bg-gray-50"
              }
              onClick={() => setChartMode("weekly")}
              disabled={loading}
            >
              รายสัปดาห์
            </button>
          </div>
        </div>
        <div className="mt-3 h-[280px]">
          {loading ? (
            <div className="h-full w-full animate-pulse rounded-lg bg-gray-100" />
          ) : series.length === 0 ? (
            <div className="flex h-full items-center justify-center text-sm text-gray-500">ไม่มีข้อมูลสำหรับช่วงเดือนนี้</div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={series} margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                <XAxis dataKey="label" tick={{ fontSize: 12, fill: "#6B7280" }} interval={1} />
                <YAxis tick={{ fontSize: 12, fill: "#6B7280" }} tickFormatter={(v) => `${Number(v).toLocaleString()}`} width={56} />
                <Tooltip
                  formatter={(v: any) => [`${asMoney(Number(v ?? 0))} บาท`, "ยอดรวม"]}
                  labelFormatter={(l) => (chartMode === "weekly" ? `สัปดาห์ ${l}` : `เดือน ${l}`)}
                  contentStyle={{ borderRadius: 12, borderColor: "#E5E7EB" }}
                />
                <Line type="monotone" dataKey="total" stroke="#111827" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>
    </div>
  );
}
