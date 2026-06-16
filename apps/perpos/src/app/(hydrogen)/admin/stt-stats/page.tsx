'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { BarChart3, Users, Clock, FileAudio, RefreshCw, Loader2 } from 'lucide-react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';

type AdminStats = {
  users: { total: number; active: number; claimed: number };
  totals: { jobs: number; completed: number; failed: number; minutes: number };
  by_source: { web: { jobs: number; minutes: number }; line: { jobs: number; minutes: number } };
  daily: { date: string; jobs: number; minutes: number }[];
  top_users: { display_name: string; minutes: number; jobs: number }[];
};

function getToken(): string {
  if (typeof window === 'undefined') return '';
  try {
    const raw = Object.entries(localStorage).find(([k]) => k.includes('supabase') && k.includes('auth'));
    if (!raw) return '';
    return JSON.parse(raw[1])?.access_token ?? '';
  } catch { return ''; }
}

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

export default function AdminSttStatsPage() {
  const [s, setS] = useState<AdminStats | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/stt-stats', { headers: { Authorization: `Bearer ${getToken()}` } });
      if (res.ok) setS((await res.json()).data as AdminStats);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6">
      <div className="mb-6 flex items-center justify-between gap-3">
        <h1 className="flex items-center gap-2 text-2xl font-semibold text-gray-900">
          <BarChart3 className="h-6 w-6 text-indigo-600" /> สถิติแกะเสียง (ภาพรวม)
        </h1>
        <div className="flex gap-2">
          <Link href="/admin/stt-users"><Button variant="outline" size="sm">จัดการผู้ใช้</Button></Link>
          <Button variant="outline" size="sm" onClick={load} disabled={loading}><RefreshCw className="mr-2 h-4 w-4" /> รีเฟรช</Button>
        </div>
      </div>

      {loading ? (
        <div className="flex min-h-[40vh] items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-gray-400" /></div>
      ) : !s ? (
        <p className="py-10 text-center text-sm text-gray-400">โหลดข้อมูลไม่สำเร็จ</p>
      ) : (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <Card icon={<Users className="h-5 w-5" />} label="ผู้ใช้ LINE" value={String(s.users.total)} sub={`${s.users.active} ใช้งาน · ${s.users.claimed} เคลมแล้ว`} accent="bg-blue-50 text-blue-600" />
            <Card icon={<FileAudio className="h-5 w-5" />} label="งานทั้งหมด (30 วัน)" value={String(s.totals.jobs)} sub={`สำเร็จ ${s.totals.completed} · ล้ม ${s.totals.failed}`} accent="bg-purple-50 text-purple-600" />
            <Card icon={<Clock className="h-5 w-5" />} label="นาทีที่ประมวลผล" value={String(s.totals.minutes)} accent="bg-amber-50 text-amber-600" />
            <Card icon={<BarChart3 className="h-5 w-5" />} label="เว็บ / LINE (นาที)" value={`${s.by_source.web.minutes} / ${s.by_source.line.minutes}`} accent="bg-green-50 text-green-600" />
          </div>

          <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
            <h3 className="mb-4 text-sm font-semibold text-gray-700">นาทีที่ประมวลผล — 30 วันล่าสุด</h3>
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={s.daily} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#9ca3af' }} tickFormatter={(d) => String(d).slice(5)} interval={4} />
                <YAxis tick={{ fontSize: 10, fill: '#9ca3af' }} allowDecimals={false} />
                <Tooltip labelFormatter={(d) => `วันที่ ${d}`} formatter={(v: number) => [`${v} นาที`, 'ประมวลผล']} />
                <Bar dataKey="minutes" fill="#533afd" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
            <h3 className="mb-3 text-sm font-semibold text-gray-700">ผู้ใช้ที่ใช้งานสูงสุด (Top 10)</h3>
            {s.top_users.length === 0 ? (
              <p className="py-6 text-center text-sm text-gray-400">ยังไม่มีข้อมูล</p>
            ) : (
              <div className="divide-y divide-gray-100">
                {s.top_users.map((u, i) => (
                  <div key={i} className="flex items-center justify-between py-2.5 text-sm">
                    <div className="flex items-center gap-3">
                      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-indigo-50 text-xs font-bold text-indigo-600">{i + 1}</span>
                      <span className="text-gray-800">{u.display_name}</span>
                    </div>
                    <span className="tabular-nums text-gray-500">{u.minutes} นาที · {u.jobs} งาน</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
