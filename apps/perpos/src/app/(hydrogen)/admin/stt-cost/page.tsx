'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { CustomSelect } from '@/components/ui/custom-select';
import { Coins, Clock, FileAudio, TrendingUp, RefreshCw, Loader2, Calculator } from 'lucide-react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';

type CostStats = {
  window_days: number;
  pricing: {
    model: string;
    audio_input_usd_per_m: number;
    text_input_usd_per_m: number;
    output_usd_per_m: number;
    audio_tokens_per_sec: number;
    output_tokens_per_job: number;
    usd_thb_rate: number;
  };
  accuracy: { exact_jobs: number; estimated_jobs: number; exact_ratio: number };
  tokens: { prompt: number; output: number; thoughts: number };
  totals: { minutes: number; jobs: number; cost_usd: number; cost_thb: number; cost_per_minute_thb: number };
  by_source: { web: { minutes: number; jobs: number; cost_thb: number }; line: { minutes: number; jobs: number; cost_thb: number } };
  daily: { date: string; minutes: number; cost_thb: number }[];
};

async function authToken(): Promise<string> {
  const supabase = createSupabaseBrowserClient();
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? '';
}

const thb = (n: number, d = 2) =>
  new Intl.NumberFormat('th-TH', { minimumFractionDigits: d, maximumFractionDigits: d }).format(n);
const intFmt = (n: number) => new Intl.NumberFormat('th-TH').format(Math.round(n));

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

export default function AdminSttCostPage() {
  const [s, setS] = useState<CostStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState('30');
  const [markup, setMarkup] = useState('4');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/stt-cost?days=${days}`, { headers: { Authorization: `Bearer ${await authToken()}` } });
      if (res.ok) setS((await res.json()).data as CostStats);
    } finally {
      setLoading(false);
    }
  }, [days]);
  useEffect(() => { load(); }, [load]);

  const suggested = useMemo(() => {
    const m = parseFloat(markup);
    if (!s || isNaN(m) || m <= 0) return null;
    return s.totals.cost_per_minute_thb * m;
  }, [s, markup]);

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="flex items-center gap-2 text-2xl font-semibold text-gray-900">
          <Coins className="h-6 w-6 text-indigo-600" /> ต้นทุน Gemini (แกะเสียง)
        </h1>
        <div className="flex items-center gap-2">
          <CustomSelect
            value={days}
            onChange={setDays}
            className="w-32"
            options={[
              { value: '7', label: '7 วัน' },
              { value: '30', label: '30 วัน' },
              { value: '90', label: '90 วัน' },
              { value: '365', label: '1 ปี' },
            ]}
          />
          <Link href="/admin/stt-stats"><Button variant="outline" size="sm">สถิติ</Button></Link>
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
            <Card icon={<Coins className="h-5 w-5" />} label={`ต้นทุนรวม (${s.window_days} วัน)`} value={`฿${thb(s.totals.cost_thb)}`} sub={`≈ $${thb(s.totals.cost_usd, 4)} · ${s.accuracy.exact_jobs}/${s.totals.jobs} งานเป๊ะ`} accent="bg-red-50 text-red-600" />
            <Card icon={<TrendingUp className="h-5 w-5" />} label="ต้นทุนต่อนาที" value={`฿${thb(s.totals.cost_per_minute_thb, 3)}`} sub="ฐานตั้งราคาขาย" accent="bg-amber-50 text-amber-600" />
            <Card icon={<Clock className="h-5 w-5" />} label="นาทีที่ประมวลผล" value={thb(s.totals.minutes, 0)} accent="bg-blue-50 text-blue-600" />
            <Card icon={<FileAudio className="h-5 w-5" />} label="จำนวนงาน" value={thb(s.totals.jobs, 0)} sub={`เว็บ ${s.by_source.web.jobs} · LINE ${s.by_source.line.jobs}`} accent="bg-purple-50 text-purple-600" />
          </div>

          {/* ตัวช่วยตั้งราคาขาย */}
          <div className="rounded-2xl border border-indigo-100 bg-indigo-50/40 p-5 shadow-sm">
            <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-gray-700"><Calculator className="h-4 w-4 text-indigo-500" /> ตัวช่วยตั้งราคาขาย</h3>
            <div className="flex flex-wrap items-end gap-4">
              <div>
                <Label htmlFor="markup">ตัวคูณกำไร (เท่า)</Label>
                <Input id="markup" type="number" value={markup} onChange={(e) => setMarkup(e.target.value)} className="mt-1 w-28" />
              </div>
              <div className="text-sm">
                <div className="text-gray-500">ต้นทุน/นาที</div>
                <div className="text-lg font-semibold tabular-nums text-gray-900">฿{thb(s.totals.cost_per_minute_thb, 3)}</div>
              </div>
              <div className="text-2xl text-gray-300">→</div>
              <div className="text-sm">
                <div className="text-gray-500">ราคาขายแนะนำ/นาที</div>
                <div className="text-lg font-semibold tabular-nums text-green-600">{suggested != null ? `฿${thb(suggested, 2)}` : '—'}</div>
              </div>
              <div className="text-sm">
                <div className="text-gray-500">เช่น แพ็ก 300 นาที ขายที่</div>
                <div className="text-lg font-semibold tabular-nums text-green-600">{suggested != null ? `฿${thb(suggested * 300, 0)}` : '—'}</div>
              </div>
            </div>
            <p className="mt-3 text-xs text-gray-500">
              * ราคาขายแนะนำคือ <b>ต้นทุน × ตัวคูณ</b> ยังไม่รวมค่า infra (Cloud Run, Supabase, แบนด์วิดท์), ค่าธรรมเนียม payment gateway, ภาษี และของฟรีที่แจก
            </p>
          </div>

          <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
            <h3 className="mb-4 text-sm font-semibold text-gray-700">ต้นทุนรายวัน (฿) — {s.window_days} วันล่าสุด</h3>
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={s.daily} margin={{ top: 4, right: 4, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#9ca3af' }} tickFormatter={(d) => String(d).slice(5)} interval={Math.max(0, Math.floor(s.daily.length / 8))} />
                <YAxis tick={{ fontSize: 10, fill: '#9ca3af' }} />
                <Tooltip labelFormatter={(d) => `วันที่ ${d}`} formatter={(v: number) => [`฿${thb(Number(v))}`, 'ต้นทุน']} />
                <Bar dataKey="cost_thb" fill="#dc2626" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
              <h3 className="mb-3 text-sm font-semibold text-gray-700">แยกตามช่องทาง</h3>
              <div className="divide-y divide-gray-100 text-sm">
                {(['web', 'line'] as const).map((k) => (
                  <div key={k} className="flex items-center justify-between py-2.5">
                    <span className="text-gray-800">{k === 'web' ? 'เว็บ' : 'LINE'}</span>
                    <span className="tabular-nums text-gray-500">{thb(s.by_source[k].minutes, 0)} นาที · ฿{thb(s.by_source[k].cost_thb)}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
              <h3 className="mb-3 text-sm font-semibold text-gray-700">สมมติฐานราคา (Gemini)</h3>
              <dl className="space-y-1.5 text-xs text-gray-600">
                <div className="flex justify-between"><dt>โมเดล</dt><dd className="font-medium text-gray-800">{s.pricing.model}</dd></div>
                <div className="flex justify-between"><dt>Audio input</dt><dd className="tabular-nums">${thb(s.pricing.audio_input_usd_per_m, 2)} / 1M tok</dd></div>
                <div className="flex justify-between"><dt>Text input</dt><dd className="tabular-nums">${thb(s.pricing.text_input_usd_per_m, 2)} / 1M tok</dd></div>
                <div className="flex justify-between"><dt>Output</dt><dd className="tabular-nums">${thb(s.pricing.output_usd_per_m, 2)} / 1M tok</dd></div>
                <div className="flex justify-between"><dt>อัตราแลก USD→THB</dt><dd className="tabular-nums">{s.pricing.usd_thb_rate}</dd></div>
                <div className="my-1.5 border-t border-gray-100" />
                <div className="flex justify-between"><dt>Input tokens จริง</dt><dd className="tabular-nums">{intFmt(s.tokens.prompt)}</dd></div>
                <div className="flex justify-between"><dt>Output tokens จริง</dt><dd className="tabular-nums">{intFmt(s.tokens.output)}</dd></div>
                <div className="flex justify-between"><dt>— thinking tokens</dt><dd className="tabular-nums">{intFmt(s.tokens.thoughts)}</dd></div>
                <div className="flex justify-between"><dt>งานที่คิดเป๊ะ</dt><dd className="tabular-nums">{s.accuracy.exact_jobs} / {s.totals.jobs} ({Math.round(s.accuracy.exact_ratio * 100)}%)</dd></div>
              </dl>
              <p className="mt-3 text-[11px] leading-relaxed text-gray-400">
                {s.accuracy.estimated_jobs > 0
                  ? `${s.accuracy.estimated_jobs} งานเก่ายังไม่มี token (ประมาณจากความยาว) — งานใหม่จะคิดจาก token จริง · `
                  : 'ทุกงานคิดจาก token จริงของ Gemini · '}
                fallback tokens/งาน: {s.pricing.output_tokens_per_job} · {s.pricing.audio_tokens_per_sec} tok/วินาที. ปรับราคาผ่าน env (STT_GEMINI_*)
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
