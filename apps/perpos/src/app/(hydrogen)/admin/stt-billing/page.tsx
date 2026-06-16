'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Coins, TrendingUp, Users, Receipt, RefreshCw, Loader2 } from 'lucide-react';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';

type Billing = {
  totals: { revenue_total: number; revenue_month: number; mrr: number; active_subscribers: number; payments_count: number };
  by_plan: { name: string; count: number; revenue: number }[];
  recent: { id: string; name: string; plan: string | null; kind: string; amount: number; currency: string; status: string; created_at: string }[];
};

async function authToken(): Promise<string> {
  const supabase = createSupabaseBrowserClient();
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? '';
}

const baht = (n: number, d = 0) => '฿' + new Intl.NumberFormat('th-TH', { minimumFractionDigits: d, maximumFractionDigits: d }).format(n);
const dt = (s: string) => new Date(s).toLocaleString('th-TH', { dateStyle: 'short', timeStyle: 'short' });

const STATUS: Record<string, string> = {
  succeeded: 'bg-green-50 text-green-700 border-green-200',
  pending: 'bg-amber-50 text-amber-700 border-amber-200',
  failed: 'bg-red-50 text-red-700 border-red-200',
  refunded: 'bg-gray-50 text-gray-500 border-gray-200',
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

export default function AdminSttBillingPage() {
  const [s, setS] = useState<Billing | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/stt-billing', { headers: { Authorization: `Bearer ${await authToken()}` } });
      if (res.ok) setS((await res.json()).data as Billing);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6">
      <div className="mb-6 flex items-center justify-between gap-3">
        <h1 className="flex items-center gap-2 text-2xl font-semibold text-gray-900">
          <Coins className="h-6 w-6 text-indigo-600" /> รายได้แกะเสียง (Billing)
        </h1>
        <div className="flex gap-2">
          <Link href="/admin/stt-stats"><Button variant="outline" size="sm">สถิติ</Button></Link>
          <Link href="/admin/stt-cost"><Button variant="outline" size="sm">ต้นทุน</Button></Link>
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
            <Card icon={<TrendingUp className="h-5 w-5" />} label="MRR (รายเดือนประจำ)" value={baht(s.totals.mrr)} sub={`${s.totals.active_subscribers} สมาชิก active`} accent="bg-indigo-50 text-indigo-600" />
            <Card icon={<Coins className="h-5 w-5" />} label="รายได้เดือนนี้" value={baht(s.totals.revenue_month)} accent="bg-green-50 text-green-600" />
            <Card icon={<Coins className="h-5 w-5" />} label="รายได้รวมทั้งหมด" value={baht(s.totals.revenue_total)} sub={`${s.totals.payments_count} รายการ`} accent="bg-blue-50 text-blue-600" />
            <Card icon={<Users className="h-5 w-5" />} label="สมาชิกรายเดือน" value={String(s.totals.active_subscribers)} accent="bg-purple-50 text-purple-600" />
          </div>

          <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
            <h3 className="mb-3 text-sm font-semibold text-gray-700">รายได้ตามแพ็ก</h3>
            {s.by_plan.length === 0 ? (
              <p className="py-6 text-center text-sm text-gray-400">ยังไม่มีรายการขาย</p>
            ) : (
              <div className="divide-y divide-gray-100">
                {s.by_plan.map((p) => (
                  <div key={p.name} className="flex items-center justify-between py-2.5 text-sm">
                    <span className="text-gray-800">{p.name}</span>
                    <span className="tabular-nums text-gray-500">{p.count} รายการ · <span className="font-medium text-gray-800">{baht(p.revenue)}</span></span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
            <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-gray-700"><Receipt className="h-4 w-4 text-gray-400" /> รายการชำระเงินล่าสุด</h3>
            {s.recent.length === 0 ? (
              <p className="py-6 text-center text-sm text-gray-400">ยังไม่มีรายการ</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 text-left text-xs font-medium uppercase tracking-wide text-gray-400">
                      <th className="px-2 py-2">ผู้ใช้</th>
                      <th className="px-2 py-2">แพ็ก</th>
                      <th className="px-2 py-2 text-right">จำนวนเงิน</th>
                      <th className="px-2 py-2 text-center">สถานะ</th>
                      <th className="px-2 py-2 text-right">เวลา</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {s.recent.map((p) => (
                      <tr key={p.id} className="hover:bg-gray-50">
                        <td className="px-2 py-2.5 text-gray-800">{p.name}</td>
                        <td className="px-2 py-2.5 text-gray-500">{p.plan ?? (p.kind === 'topup' ? 'เติมนาที' : '—')}</td>
                        <td className="px-2 py-2.5 text-right font-mono tabular-nums text-gray-800">{baht(p.amount, 2)}</td>
                        <td className="px-2 py-2.5 text-center">
                          <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-medium ${STATUS[p.status] ?? STATUS.refunded}`}>{p.status}</span>
                        </td>
                        <td className="px-2 py-2.5 text-right text-xs text-gray-400">{dt(p.created_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <p className="text-xs text-gray-400">* refund / dispute / log ดิบ ดูที่ Stripe Dashboard โดยตรง — หน้านี้สรุปจากฐานข้อมูลของเรา</p>
        </div>
      )}
    </div>
  );
}
