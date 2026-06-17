'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { Clock, CheckCircle2, FileAudio, Loader2, Globe, MessageCircle, Sparkles } from 'lucide-react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';

type Stats = {
  quota: { limit_seconds: number; used_seconds: number; remaining_seconds: number };
  totals: { jobs: number; completed: number; failed: number; minutes: number };
  by_source: { web: { jobs: number; minutes: number }; line: { jobs: number; minutes: number } };
  daily: { date: string; jobs: number; minutes: number }[];
};

function Card({ icon, label, value, sub, accent }: { icon: React.ReactNode; label: string; value: string; sub?: string; accent: string }) {
  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
      <div className={`mb-3 inline-flex h-10 w-10 items-center justify-center rounded-xl ${accent}`}>{icon}</div>
      <div className="text-2xl font-bold tabular-nums text-gray-900">{value}</div>
      <div className="text-sm text-gray-500">{label}</div>
      {sub ? <div className="mt-0.5 text-xs text-gray-400">{sub}</div> : null}
    </div>
  );
}

export default function MyStatsPage() {
  const supabase = createSupabaseBrowserClient();
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data: sess } = await supabase.auth.getSession();
      const token = sess.session?.access_token;
      if (!token) return;
      const res = await fetch(`/api/assistant/stats`, { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) setStats((await res.json()).data as Stats);
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  useEffect(() => { load(); }, [load]);

  const remMin = stats ? Math.floor(stats.quota.remaining_seconds / 60) : 0;
  const limMin = stats ? Math.floor(stats.quota.limit_seconds / 60) : 0;
  const usedPct = stats && stats.quota.limit_seconds
    ? Math.min(100, (stats.quota.used_seconds / stats.quota.limit_seconds) * 100) : 0;

  return (
    <>
      {loading ? (
        <div className="flex min-h-[40vh] items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-gray-400" /></div>
      ) : !stats ? (
        <p className="py-10 text-center text-sm text-gray-400">โหลดข้อมูลไม่สำเร็จ</p>
      ) : (
        <div className="space-y-6">
          {/* KPI */}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Card icon={<Clock className="h-5 w-5" />} label="โควต้าคงเหลือ" value={`${remMin} นาที`} sub={`จาก ${limMin} นาที`} accent="bg-indigo-50 text-indigo-600" />
            <Card icon={<CheckCircle2 className="h-5 w-5" />} label="ประชุมที่ถอดสำเร็จ" value={String(stats.totals.completed)} accent="bg-green-50 text-green-600" />
            <Card icon={<Clock className="h-5 w-5" />} label="นาทีที่ใช้ไป" value={String(stats.totals.minutes)} accent="bg-amber-50 text-amber-600" />
            <Card icon={<FileAudio className="h-5 w-5" />} label="งานทั้งหมด" value={String(stats.totals.jobs)} sub={`ล้มเหลว ${stats.totals.failed}`} accent="bg-purple-50 text-purple-600" />
          </div>

          {/* โควต้า progress */}
          <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-gray-700">โควต้าเดือนนี้</h3>
              <Link href="/assistant/billing" className="inline-flex items-center gap-1 text-xs font-medium text-indigo-600 hover:text-indigo-700">
                <Sparkles className="h-3.5 w-3.5" /> ซื้อนาทีเพิ่ม
              </Link>
            </div>
            <div className="mt-3 flex items-end justify-between text-sm">
              <span className="text-gray-500">ใช้ไป <span className="font-semibold tabular-nums text-gray-900">{Math.floor(stats.quota.used_seconds / 60)}</span> นาที</span>
              <span className={remMin <= 0 ? 'font-semibold text-red-600' : 'font-semibold text-gray-900'}>เหลือ {remMin} / {limMin} นาที</span>
            </div>
            <div className="mt-2 h-2.5 w-full overflow-hidden rounded-full bg-gray-100">
              <div className={`h-full rounded-full ${remMin <= 0 ? 'bg-red-500' : 'bg-indigo-500'}`} style={{ width: `${usedPct}%` }} />
            </div>
          </div>

          {/* Chart + ช่องทาง (desktop side-by-side) */}
          <div className="grid gap-6 lg:grid-cols-3">
            <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm lg:col-span-2">
              <h3 className="mb-4 text-sm font-semibold text-gray-700">นาทีที่ใช้ — 30 วันล่าสุด</h3>
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={stats.daily} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                  <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#9ca3af' }} tickFormatter={(d) => String(d).slice(5)} interval={4} />
                  <YAxis tick={{ fontSize: 10, fill: '#9ca3af' }} allowDecimals={false} />
                  <Tooltip labelFormatter={(d) => `วันที่ ${d}`} formatter={(v: number) => [`${v} นาที`, 'ใช้ไป']} />
                  <Bar dataKey="minutes" fill="#533afd" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
              <h3 className="mb-3 text-sm font-semibold text-gray-700">แยกตามช่องทาง</h3>
              <div className="space-y-3">
                {([['เว็บ', <Globe key="w" className="h-4 w-4" />, stats.by_source.web, 'bg-sky-50 text-sky-600'],
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
      )}
    </>
  );
}
