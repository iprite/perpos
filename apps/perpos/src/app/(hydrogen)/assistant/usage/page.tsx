"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { StatCard } from "@/components/ui/stat-card";
import { Button } from "@/components/ui/button";
import {
  Wallet,
  CheckCircle2,
  FileAudio,
  Clock,
  Globe,
  MessageCircle,
  Sparkles,
  CalendarClock,
  AlertTriangle,
} from "lucide-react";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";

type Stats = {
  totals: { jobs: number; completed: number; failed: number; minutes: number };
  by_source: { web: { jobs: number; minutes: number }; line: { jobs: number; minutes: number } };
  daily: { date: string; jobs: number; minutes: number }[];
};
type Quota = {
  balance_tokens: number;
  balance_thb: number;
  earliest_expiry: string | null;
  expiring_30d_tokens: number;
  remaining: { stt_minutes: number; bot_minutes: number; pdf_pages: number };
};

const nf = (n: number) => new Intl.NumberFormat("th-TH").format(n);
const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "numeric" });

export default function MyStatsPage() {
  const supabase = createSupabaseBrowserClient();
  const [stats, setStats] = useState<Stats | null>(null);
  const [quota, setQuota] = useState<Quota | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data: sess } = await supabase.auth.getSession();
      const token = sess.session?.access_token;
      if (!token) return;
      const [statsRes, quotaRes] = await Promise.all([
        fetch(`/api/assistant/stats`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`/api/assistant/quota`, { headers: { Authorization: `Bearer ${token}` } }),
      ]);
      if (statsRes.ok) setStats((await statsRes.json()).data as Stats);
      if (quotaRes.ok) setQuota((await quotaRes.json()).data as Quota);
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-24 animate-pulse rounded-xl bg-gray-100" />
          ))}
        </div>
        <div className="h-40 animate-pulse rounded-xl bg-gray-100" />
        <div className="h-72 animate-pulse rounded-xl bg-gray-100" />
      </div>
    );
  }
  if (!stats || !quota)
    return <p className="py-10 text-center text-sm text-gray-400">โหลดข้อมูลไม่สำเร็จ</p>;

  const expiringSoon = quota.expiring_30d_tokens > 0 && quota.earliest_expiry;

  return (
    <div className="space-y-6">
      {/* KPI */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          icon={<Wallet className="h-4 w-4" />}
          label="เครดิตคงเหลือ"
          value={`${nf(quota.balance_tokens)}`}
          sub={`≈ ฿${nf(Math.floor(quota.balance_thb))}`}
          tone="info"
          valueColored
        />
        <StatCard
          icon={<CheckCircle2 className="h-4 w-4" />}
          label="ประชุมที่ถอดสำเร็จ"
          value={String(stats.totals.completed)}
          tone="positive"
        />
        <StatCard
          icon={<Clock className="h-4 w-4" />}
          label="นาทีที่ใช้ไป"
          value={String(stats.totals.minutes)}
          tone="warning"
        />
        <StatCard
          icon={<FileAudio className="h-4 w-4" />}
          label="งานทั้งหมด"
          value={String(stats.totals.jobs)}
          sub={`ล้มเหลว ${stats.totals.failed}`}
          tone="primary"
        />
      </div>

      {/* Token wallet — ยอด + วันหมดอายุ + พอใช้เท่าไรต่อ service */}
      <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 text-sm font-semibold text-gray-700">
              <Wallet className="text-primary h-4 w-4" /> กระเป๋าเครดิต
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-3xl font-bold tabular-nums text-gray-900">
                {nf(quota.balance_tokens)}
              </span>
              <span className="text-sm text-gray-400">
                เครดิต ≈ ฿{nf(Math.floor(quota.balance_thb))}
              </span>
            </div>
          </div>
          <Link href="/assistant/billing">
            <Button size="sm">
              <Sparkles className="mr-1 h-4 w-4" /> เติมเครดิต
            </Button>
          </Link>
        </div>

        {/* พอใช้ได้อีกเท่าไร (unified pool) */}
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
          {[
            ["🎙️ ถอดเสียง", `${nf(quota.remaining.stt_minutes)} นาที`],
            ["🤖 บอทประชุม", `${nf(quota.remaining.bot_minutes)} นาที`],
            ["📄 บีบ PDF", `${nf(quota.remaining.pdf_pages)} หน้า`],
          ].map(([label, val]) => (
            <div key={label} className="rounded-xl border border-gray-100 bg-gray-50 p-3">
              <div className="text-xs text-gray-400">{label}</div>
              <div className="mt-0.5 text-lg font-semibold tabular-nums text-gray-900">{val}</div>
            </div>
          ))}
        </div>
        <p className="mt-2 text-xs text-gray-400">
          * ทุกบริการหักจากเครดิตก้อนเดียวกัน — ตัวเลขคือปริมาณสูงสุดถ้าใช้บริการนั้นอย่างเดียว
        </p>

        {/* วันหมดอายุ / เตือนใกล้หมด */}
        {quota.earliest_expiry ? (
          <div
            className={`mt-3 flex items-center gap-2 rounded-xl border p-3 text-sm ${expiringSoon ? "border-amber-200 bg-amber-50 text-amber-700" : "border-gray-100 bg-gray-50 text-gray-600"}`}
          >
            {expiringSoon ? (
              <AlertTriangle className="h-4 w-4 shrink-0" />
            ) : (
              <CalendarClock className="h-4 w-4 shrink-0 text-gray-400" />
            )}
            <span>
              เครดิตหมดอายุ <span className="font-semibold">{fmtDate(quota.earliest_expiry)}</span>
              {expiringSoon
                ? ` · ${nf(quota.expiring_30d_tokens)} เครดิตจะหมดใน 30 วัน — เติมก่อนหมดเพื่อต่ออายุทั้งหมดอีก 1 ปี`
                : " · เติมก่อนหมดอายุ เครดิตเก่าจะถูกต่ออายุอีก 1 ปีอัตโนมัติ"}
            </span>
          </div>
        ) : null}
      </div>

      {/* Chart + ช่องทาง */}
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm lg:col-span-2">
          <h3 className="mb-4 text-sm font-semibold text-gray-700">นาทีที่ใช้ — 30 วันล่าสุด</h3>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={stats.daily} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E6E9EE" vertical={false} />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 10, fill: "#9ca3af" }}
                tickFormatter={(d) => String(d).slice(5)}
                interval={4}
              />
              <YAxis tick={{ fontSize: 10, fill: "#9ca3af" }} allowDecimals={false} />
              <Tooltip
                labelFormatter={(d) => `วันที่ ${d}`}
                formatter={(v: number) => [`${v} นาที`, "ใช้ไป"]}
              />
              <Bar dataKey="minutes" fill="#3C3B3D" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <h3 className="mb-3 text-sm font-semibold text-gray-700">แยกตามช่องทาง</h3>
          <div className="space-y-3">
            {(
              [
                [
                  "เว็บ",
                  <Globe key="w" className="h-4 w-4" />,
                  stats.by_source.web,
                  "bg-gray-100 text-gray-600",
                ],
                [
                  "LINE",
                  <MessageCircle key="l" className="h-4 w-4" />,
                  stats.by_source.line,
                  "bg-green-50 text-green-600",
                ],
              ] as const
            ).map(([label, icon, s, accent]) => (
              <div
                key={label}
                className="flex items-center gap-3 rounded-xl border border-gray-100 bg-gray-50 p-3"
              >
                <span className={`flex h-9 w-9 items-center justify-center rounded-lg ${accent}`}>
                  {icon}
                </span>
                <div className="min-w-0">
                  <div className="text-sm font-medium text-gray-900">{label}</div>
                  <div className="text-xs text-gray-500">
                    {s.minutes} นาที · {s.jobs} งาน
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
