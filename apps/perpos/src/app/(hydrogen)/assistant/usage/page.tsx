'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { StatCard } from '@/components/ui/stat-card';
import { Clock, CheckCircle2, FileAudio, Loader2, Globe, MessageCircle, Sparkles } from 'lucide-react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';

type Stats = {
  quota: { limit_seconds: number; used_seconds: number; remaining_seconds: number };
  totals: { jobs: number; completed: number; failed: number; minutes: number };
  by_source: { web: { jobs: number; minutes: number }; line: { jobs: number; minutes: number } };
  daily: { date: string; jobs: number; minutes: number }[];
};
type BotQuota = { limit_seconds: number; used_seconds: number };

function QuotaBar({ title, used, limit, buyLabel }: { title: string; used: number; limit: number; buyLabel: string }) {
  const usedMin = Math.floor(used / 60);
  const limMin = Math.floor(limit / 60);
  const remMin = Math.max(0, Math.floor((limit - used) / 60));
  const pct = limit ? Math.min(100, (used / limit) * 100) : 0;
  const empty = remMin <= 0;
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-gray-700">{title}</h3>
        <Link href="/assistant/billing" className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:text-primary/80">
          <Sparkles className="h-3.5 w-3.5" /> {buyLabel}
        </Link>
      </div>
      <div className="mt-3 flex items-end justify-between text-sm">
        <span className="text-gray-500">ใช้ไป <span className="font-semibold tabular-nums text-gray-900">{usedMin}</span> นาที</span>
        <span className={empty ? 'font-semibold text-red-600' : 'font-semibold text-gray-900'}>เหลือ {remMin} / {limMin} นาที</span>
      </div>
      <div className="mt-2 h-2.5 w-full overflow-hidden rounded-full bg-gray-100">
        <div className={`h-full rounded-full ${empty ? 'bg-red-600' : 'bg-primary'}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export default function MyStatsPage() {
  const supabase = createSupabaseBrowserClient();
  const [stats, setStats] = useState<Stats | null>(null);
  const [bot, setBot] = useState<BotQuota | null>(null);
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
      if (quotaRes.ok) { const d = (await quotaRes.json()).data; if (d?.bot) setBot({ limit_seconds: d.bot.limit_seconds, used_seconds: d.bot.used_seconds }); }
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  useEffect(() => { load(); }, [load]);

  const remMin = stats ? Math.floor(stats.quota.remaining_seconds / 60) : 0;
  const limMin = stats ? Math.floor(stats.quota.limit_seconds / 60) : 0;

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => <div key={i} className="h-24 animate-pulse rounded-xl bg-gray-100" />)}
        </div>
        <div className="h-72 animate-pulse rounded-xl bg-gray-100" />
      </div>
    );
  }
  if (!stats) return <p className="py-10 text-center text-sm text-gray-400">โหลดข้อมูลไม่สำเร็จ</p>;

  return (
    <div className="space-y-6">
      {/* KPI */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard icon={<Clock className="h-4 w-4" />} label="โควต้าถอดเสียงคงเหลือ" value={`${remMin} นาที`} sub={`จาก ${limMin} นาที`} tone="info" valueColored />
        <StatCard icon={<CheckCircle2 className="h-4 w-4" />} label="ประชุมที่ถอดสำเร็จ" value={String(stats.totals.completed)} tone="positive" />
        <StatCard icon={<Clock className="h-4 w-4" />} label="นาทีที่ใช้ไป" value={String(stats.totals.minutes)} tone="warning" />
        <StatCard icon={<FileAudio className="h-4 w-4" />} label="งานทั้งหมด" value={String(stats.totals.jobs)} sub={`ล้มเหลว ${stats.totals.failed}`} tone="primary" />
      </div>

      {/* โควต้า — ถอดเสียง + บอทประชุม (มิเตอร์แยกกัน) */}
      <div className="grid gap-3 lg:grid-cols-2">
        <QuotaBar title="โควต้าถอดเสียง (อัปไฟล์เอง)" used={stats.quota.used_seconds} limit={stats.quota.limit_seconds} buyLabel="ซื้อนาทีเพิ่ม" />
        {bot && <QuotaBar title="โควต้าบอทประชุม (Recall)" used={bot.used_seconds} limit={bot.limit_seconds} buyLabel="ซื้อแพ็กบอท" />}
      </div>

      {/* Chart + ช่องทาง */}
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm lg:col-span-2">
          <h3 className="mb-4 text-sm font-semibold text-gray-700">นาทีที่ใช้ — 30 วันล่าสุด</h3>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={stats.daily} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E6E9EE" vertical={false} />
              <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#9ca3af' }} tickFormatter={(d) => String(d).slice(5)} interval={4} />
              <YAxis tick={{ fontSize: 10, fill: '#9ca3af' }} allowDecimals={false} />
              <Tooltip labelFormatter={(d) => `วันที่ ${d}`} formatter={(v: number) => [`${v} นาที`, 'ใช้ไป']} />
              <Bar dataKey="minutes" fill="#3C3B3D" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <h3 className="mb-3 text-sm font-semibold text-gray-700">แยกตามช่องทาง</h3>
          <div className="space-y-3">
            {([['เว็บ', <Globe key="w" className="h-4 w-4" />, stats.by_source.web, 'bg-gray-100 text-gray-600'],
               ['LINE', <MessageCircle key="l" className="h-4 w-4" />, stats.by_source.line, 'bg-green-50 text-green-600']] as const).map(([label, icon, s, accent]) => (
              <div key={label} className="flex items-center gap-3 rounded-xl border border-gray-100 bg-gray-50 p-3">
                <span className={`flex h-9 w-9 items-center justify-center rounded-lg ${accent}`}>{icon}</span>
                <div className="min-w-0">
                  <div className="text-sm font-medium text-gray-900">{label}</div>
                  <div className="text-xs text-gray-500">{s.minutes} นาที · {s.jobs} งาน</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
