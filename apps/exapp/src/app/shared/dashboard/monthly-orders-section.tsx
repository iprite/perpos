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
import AppSelect from "@core/ui/app-select";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

type OrderAggRow = {
  total: number | null;
  created_at: string;
  status: string;
};

type SeriesRow = { bucket_key: string; total: number | string | null };

const OPEN_STATUSES = new Set(["pending_approval", "approved", "in_progress"]);
const CLOSED_STATUSES = new Set(["completed", "cancelled"]);
const CHART_STATUSES = new Set(["pending_approval", "approved", "in_progress", "completed"]);

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

function weekStartMonday(d: Date) {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
  const dow = x.getDay();
  const delta = (dow + 6) % 7;
  x.setDate(x.getDate() - delta);
  return x;
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

function StatCard({ title, value, hint, loading }: { title: string; value: string; hint?: string; loading: boolean }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <div className="text-sm text-gray-500">{title}</div>
      <div className="mt-2 text-2xl font-semibold text-gray-900">{value}</div>
      {hint ? <div className="mt-1 text-xs text-gray-500">{hint}</div> : null}
      {loading ? <div className="mt-3 h-3 w-24 animate-pulse rounded bg-gray-100" /> : null}
    </div>
  );
}

function SelectCard({
  title,
  value,
  hint,
  loading,
  selectValue,
  onSelect,
  options,
}: {
  title: string;
  value: string;
  hint?: string;
  loading: boolean;
  selectValue: string;
  onSelect: (v: string) => void;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="text-sm text-gray-500">{title}</div>
        <div className="w-32">
          <AppSelect
            options={options}
            value={selectValue}
            onChange={(v: string) => onSelect(v)}
            getOptionValue={(o) => o.value}
            displayValue={(selected) => options.find((o) => o.value === selected)?.label ?? ""}
            selectClassName="h-8 px-3 text-xs"
            inPortal
            disabled={loading}
          />
        </div>
      </div>
      <div className="mt-2 text-2xl font-semibold text-gray-900">{value}</div>
      {hint ? <div className="mt-1 text-xs text-gray-500">{hint}</div> : null}
      {loading ? <div className="mt-3 h-3 w-24 animate-pulse rounded bg-gray-100" /> : null}
    </div>
  );
}

export function MonthlyOrdersSection({
  poaReceivedThisMonth,
}: {
  poaReceivedThisMonth?: number;
}) {
  const { envError, userId } = useAuth();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ordersMonthTotalOpen, setOrdersMonthTotalOpen] = useState(0);
  const [ordersMonthCountTotal, setOrdersMonthCountTotal] = useState(0);
  const [ordersMonthCountClosed, setOrdersMonthCountClosed] = useState(0);
  const [ordersMonthCountOpen, setOrdersMonthCountOpen] = useState(0);
  const [series, setSeries] = useState<Array<{ label: string; total: number }>>([]);

  const [countMode, setCountMode] = useState<"open" | "total" | "closed">("open");
  const [moneyMode, setMoneyMode] = useState<"orders" | "poa">("orders");
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

      const seriesStartDate = points[0]?.start?.toISOString().slice(0, 10) ?? "1970-01-01";
      const startThisMonthIso = startThisMonth.toISOString();
      const startNextMonthIso = addMonths(startThisMonth, 1).toISOString();

      const [seriesRes, monthRes] = await Promise.all([
        supabase.rpc("dashboard_orders_series", { mode: chartMode, start_date: seriesStartDate }),
        supabase
          .from("orders")
          .select("total,created_at,status")
          .gte("created_at", startThisMonthIso)
          .lt("created_at", startNextMonthIso)
          .in("status", ["pending_approval", "approved", "in_progress", "completed", "cancelled"]),
      ]);

      if (seriesRes.error ?? monthRes.error) {
        setError((seriesRes.error ?? monthRes.error)?.message ?? "โหลดข้อมูลไม่สำเร็จ");
        setOrdersMonthTotalOpen(0);
        setOrdersMonthCountTotal(0);
        setOrdersMonthCountClosed(0);
        setOrdersMonthCountOpen(0);
        setSeries(Array.from(base.values()).map((p) => ({ label: p.label, total: p.total })));
        setLoading(false);
        return;
      }

      let mtOpen = 0;
      let mcTotal = 0;
      let mcClosed = 0;
      let mcOpen = 0;

      for (const row of (seriesRes.data ?? []) as SeriesRow[]) {
        const k = row.bucket_key;
        const amt = round2(Number(row.total ?? 0));
        const p = base.get(k);
        if (p) p.total = round2(p.total + amt);
      }

      for (const row of (monthRes.data ?? []) as OrderAggRow[]) {
        const dt = new Date(row.created_at);
        if (!Number.isFinite(dt.getTime())) continue;
        const amt = round2(Number(row.total ?? 0));

        if (OPEN_STATUSES.has(row.status)) {
          mtOpen = round2(mtOpen + amt);
          mcOpen += 1;
        }
        if (CLOSED_STATUSES.has(row.status)) {
          mcClosed += 1;
        }
        if (OPEN_STATUSES.has(row.status) || CLOSED_STATUSES.has(row.status)) {
          mcTotal += 1;
        }
      }

      setOrdersMonthTotalOpen(mtOpen);
      setOrdersMonthCountTotal(mcTotal);
      setOrdersMonthCountClosed(mcClosed);
      setOrdersMonthCountOpen(mcOpen);
      setSeries(Array.from(base.values()).map((p) => ({ label: p.label, total: p.total })));
      setLoading(false);
    };

    load();
  }, [chartMode, envError, supabase, userId]);

  return (
    <div className="mt-5">
      <div className="flex flex-col justify-between gap-2 md:flex-row md:items-end">
        <div>
          <div className="text-base font-semibold text-gray-900">ออเดอร์ประจำเดือน</div>
          <div className="mt-1 text-sm text-gray-600">สรุปยอดและจำนวนออเดอร์ของเดือนปัจจุบัน พร้อมกราฟ 12 เดือนล่าสุด</div>
        </div>
      </div>

      {error ? <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div> : null}

      <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
        <SelectCard
          title="ยอดเดือนนี้"
          selectValue={moneyMode}
          onSelect={(v) => setMoneyMode(v === "poa" ? "poa" : "orders")}
          options={[
            { value: "orders", label: "ยอดออเดอร์" },
            { value: "poa", label: "ยอด POA" },
          ]}
          value={
            loading
              ? "-"
              : moneyMode === "poa"
                ? poaReceivedThisMonth == null
                  ? "-"
                  : `${asMoney(poaReceivedThisMonth)} บาท`
                : `${asMoney(ordersMonthTotalOpen)} บาท`
          }
          hint={moneyMode === "orders" ? "รวมเฉพาะสถานะที่ดำเนินการ" : "รับเงิน POA เฉพาะสถานะ confirmed"}
          loading={loading}
        />

        <SelectCard
          title="จำนวนออเดอร์เดือนนี้"
          selectValue={countMode}
          onSelect={(v) => setCountMode(v === "total" ? "total" : v === "closed" ? "closed" : "open")}
          options={[
            { value: "open", label: "ดำเนินการ" },
            { value: "total", label: "ทั้งหมด" },
            { value: "closed", label: "ปิดแล้ว" },
          ]}
          value={
            loading
              ? "-"
              : `${(
                  countMode === "total" ? ordersMonthCountTotal : countMode === "closed" ? ordersMonthCountClosed : ordersMonthCountOpen
                ).toLocaleString()} ออเดอร์`
          }
          hint={countMode === "open" ? "นับเฉพาะสถานะที่ดำเนินการ" : countMode === "closed" ? "completed/cancelled" : "รวม open + closed"}
          loading={loading}
        />
      </div>

      <div className="mt-4 rounded-xl border border-gray-200 bg-white p-4">
        <div className="flex flex-col justify-between gap-2 md:flex-row md:items-center">
          <div className="text-sm font-semibold text-gray-900">กราฟยอดออเดอร์</div>
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
