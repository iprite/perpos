'use client';

/**
 * /admin/payments — Payments & Subscriptions console (super admin)
 * ภาพรวมรายได้รวม แยก 2 สาย: ผู้ช่วย AI (B2C) + ERP (B2B)
 * กิน GET /api/admin/payments/metrics · tab อื่นลิงก์ไปหน้า detail เดิม
 */

import { useEffect, useState, useCallback, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { StatCard } from '@/components/ui/stat-card';
import { PageShell, PageCard } from '@/components/ui/page-shell';
import {
  RefreshCw, TrendingUp, CalendarClock, Wallet, UserMinus, Bot, Building2,
} from 'lucide-react';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { PaymentsTabs } from './_tabs';

type StreamMetrics = {
  mrr: number; arr: number; revenue_total: number; revenue_month: number;
  active_subscribers: number; arpu: number; churned_30d: number;
};
type Metrics = {
  computed_at: string;
  combined: StreamMetrics;
  streams: { assistant: StreamMetrics; erp: StreamMetrics };
};

const baht = (n: number, d = 0) =>
  '฿' + new Intl.NumberFormat('th-TH', { minimumFractionDigits: d, maximumFractionDigits: d }).format(n);

function StreamCard({
  icon, title, tagline, m,
}: { icon: React.ReactNode; title: string; tagline: string; m: StreamMetrics }) {
  return (
    <PageCard>
      <div className="flex items-center gap-3">
        <div className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-gray-100 text-gray-600">{icon}</div>
        <div>
          <div className="text-base font-semibold text-gray-900">{title}</div>
          <div className="text-xs text-gray-500">{tagline}</div>
        </div>
        <div className="ml-auto text-right">
          <div className="text-xs text-gray-500">MRR</div>
          <div className="text-2xl font-bold tabular-nums text-gray-900">{baht(m.mrr)}</div>
        </div>
      </div>
      <div className="mt-4 grid grid-cols-3 gap-3 border-t border-gray-100 pt-4 text-center">
        <div>
          <div className="text-lg font-semibold tabular-nums text-gray-900">{m.active_subscribers.toLocaleString()}</div>
          <div className="text-xs text-gray-500">สมาชิก active</div>
        </div>
        <div>
          <div className="text-lg font-semibold tabular-nums text-gray-900">{baht(m.arpu, 0)}</div>
          <div className="text-xs text-gray-500">ARPU</div>
        </div>
        <div>
          <div className="text-lg font-semibold tabular-nums text-gray-900">{baht(m.revenue_month)}</div>
          <div className="text-xs text-gray-500">รายได้เดือนนี้</div>
        </div>
      </div>
    </PageCard>
  );
}

export default function PaymentsConsolePage() {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [data, setData] = useState<Metrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch('/api/admin/payments/metrics', {
        headers: { Authorization: `Bearer ${session?.access_token ?? ''}` },
      });
      const json = await res.json() as { ok?: boolean; data?: Metrics; error?: { message?: string } };
      if (!res.ok || !json.data) { setError(json.error?.message ?? 'Error'); return; }
      setData(json.data);
    } catch { setError('Network error'); }
    finally { setLoading(false); }
  }, [supabase]);

  useEffect(() => { void load(); }, [load]);

  return (
    <PageShell
      title="Payments & Subscriptions"
      icon={<Wallet className="h-6 w-6" />}
      description={data ? `อัปเดต ${new Date(data.computed_at).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })}` : 'รายได้รวมทั้งระบบ'}
      actions={
        <Button variant="outline" onClick={load} disabled={loading}>
          <RefreshCw className={`mr-1.5 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          รีเฟรช
        </Button>
      }
      tabs={<PaymentsTabs />}
    >
      {error && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

      {loading && !data ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
          {[...Array(4)].map((_, i) => <div key={i} className="h-24 animate-pulse rounded-xl bg-gray-100" />)}
        </div>
      ) : data ? (
        <>
          {/* รายได้รวมทั้งระบบ */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard icon={<TrendingUp className="h-4 w-4" />}   label="MRR รวม"        value={baht(data.combined.mrr)}  sub={`ARR ${baht(data.combined.arr)}`} tone="info" valueColored />
            <StatCard icon={<Wallet className="h-4 w-4" />}       label="รายได้เดือนนี้"  value={baht(data.combined.revenue_month)} sub={`รวมสะสม ${baht(data.combined.revenue_total)}`} tone="positive" valueColored />
            <StatCard icon={<CalendarClock className="h-4 w-4" />} label="สมาชิก active"  value={data.combined.active_subscribers.toLocaleString()} sub={`ARPU ${baht(data.combined.arpu)}`} tone="primary" />
            <StatCard icon={<UserMinus className="h-4 w-4" />}    label="ยกเลิก 30 วัน"   value={data.combined.churned_30d.toLocaleString()} sub="churn (ประมาณ)" tone="warning" />
          </div>

          {/* แยก 2 สาย */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <StreamCard icon={<Bot className="h-5 w-5" />}       title="ผู้ช่วย AI"  tagline="B2C · รายคน (per-profile)"   m={data.streams.assistant} />
            <StreamCard icon={<Building2 className="h-5 w-5" />} title="ERP"          tagline="B2B · ต่อองค์กร (per-org)"   m={data.streams.erp} />
          </div>
        </>
      ) : null}
    </PageShell>
  );
}
