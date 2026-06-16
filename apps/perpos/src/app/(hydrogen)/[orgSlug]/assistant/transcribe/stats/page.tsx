'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { ArrowLeft, BarChart3, Clock, CheckCircle2, FileAudio, Loader2 } from 'lucide-react';
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
  const { orgSlug } = useParams<{ orgSlug: string }>();
  const supabase = createSupabaseBrowserClient();
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data: org } = await supabase.from('organizations').select('id').eq('slug', orgSlug).single();
      const { data: sess } = await supabase.auth.getSession();
      const token = sess.session?.access_token;
      if (!org || !token) return;
      const res = await fetch(`/api/assistant/transcribe/stats?orgId=${org.id}`, { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) setStats((await res.json()).data as Stats);
    } finally {
      setLoading(false);
    }
  }, [supabase, orgSlug]);

  useEffect(() => { load(); }, [load]);

  const remMin = stats ? Math.floor(stats.quota.remaining_seconds / 60) : 0;
  const limMin = stats ? Math.floor(stats.quota.limit_seconds / 60) : 0;

  return (
    <div className="mx-auto max-w-4xl px-4 py-6 sm:px-6">
      <div className="mb-6 flex items-center gap-3">
        <Link href={`/${orgSlug}/assistant/transcribe`}>
          <Button variant="ghost" size="icon" aria-label="ย้อนกลับ"><ArrowLeft className="h-5 w-5" /></Button>
        </Link>
        <h1 className="flex items-center gap-2 text-2xl font-semibold text-gray-900">
          <BarChart3 className="h-6 w-6 text-indigo-600" /> สถิติการใช้งานของฉัน
        </h1>
      </div>

      {loading ? (
        <div className="flex min-h-[40vh] items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-gray-400" /></div>
      ) : !stats ? (
        <p className="py-10 text-center text-sm text-gray-400">โหลดข้อมูลไม่สำเร็จ</p>
      ) : (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <Card icon={<Clock className="h-5 w-5" />} label="โควต้าคงเหลือ" value={`${remMin} นาที`} sub={`จาก ${limMin} นาที`} accent="bg-indigo-50 text-indigo-600" />
            <Card icon={<CheckCircle2 className="h-5 w-5" />} label="ประชุมที่ถอดสำเร็จ" value={String(stats.totals.completed)} accent="bg-green-50 text-green-600" />
            <Card icon={<Clock className="h-5 w-5" />} label="นาทีที่ใช้ไป" value={String(stats.totals.minutes)} accent="bg-amber-50 text-amber-600" />
            <Card icon={<FileAudio className="h-5 w-5" />} label="งานทั้งหมด" value={String(stats.totals.jobs)} sub={`ล้มเหลว ${stats.totals.failed}`} accent="bg-purple-50 text-purple-600" />
          </div>

          <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
            <h3 className="mb-4 text-sm font-semibold text-gray-700">นาทีที่ใช้ — 30 วันล่าสุด</h3>
            <ResponsiveContainer width="100%" height={240}>
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
            <div className="grid grid-cols-2 gap-4">
              {([['เว็บ', stats.by_source.web], ['LINE', stats.by_source.line]] as const).map(([label, s]) => (
                <div key={label} className="rounded-xl border border-gray-100 bg-gray-50 p-4">
                  <div className="text-sm text-gray-500">{label}</div>
                  <div className="mt-1 text-xl font-bold text-gray-900">{s.minutes} นาที</div>
                  <div className="text-xs text-gray-400">{s.jobs} งาน</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
