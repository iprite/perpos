'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { StatusBadge, type BadgeTone } from '@/components/ui/badge';
import {
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell,
} from '@/components/ui/table';
import { Coins, TrendingUp, Users, Receipt, Loader2 } from 'lucide-react';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { AdminPage } from '../_components/admin-page';

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

const STATUS_TONE: Record<string, BadgeTone> = {
  succeeded: 'success',
  pending: 'warning',
  failed: 'danger',
  refunded: 'neutral',
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
    <AdminPage
      title="รายได้แกะเสียง (Billing)"
      icon={<Coins className="h-6 w-6" />}
      actions={
        <>
          <Link href="/admin/stt-stats"><Button variant="outline" size="sm">สถิติ</Button></Link>
          <Link href="/admin/stt-cost"><Button variant="outline" size="sm">ต้นทุน</Button></Link>
        </>
      }
    >
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
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>ผู้ใช้</TableHead>
                    <TableHead>แพ็ก</TableHead>
                    <TableHead align="right">จำนวนเงิน</TableHead>
                    <TableHead align="center">สถานะ</TableHead>
                    <TableHead align="right">เวลา</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {s.recent.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell className="text-gray-800">{p.name}</TableCell>
                      <TableCell className="text-gray-500">{p.plan ?? (p.kind === 'topup' ? 'เติมนาที' : '—')}</TableCell>
                      <TableCell align="right" tabular className="text-gray-800">{baht(p.amount, 2)}</TableCell>
                      <TableCell align="center">
                        <StatusBadge tone={STATUS_TONE[p.status] ?? 'neutral'}>{p.status}</StatusBadge>
                      </TableCell>
                      <TableCell align="right" className="text-xs text-gray-400">{dt(p.created_at)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>

          <p className="text-xs text-gray-400">* refund / dispute / log ดิบ ดูที่ Stripe Dashboard โดยตรง — หน้านี้สรุปจากฐานข้อมูลของเรา</p>
        </div>
      )}
    </AdminPage>
  );
}
