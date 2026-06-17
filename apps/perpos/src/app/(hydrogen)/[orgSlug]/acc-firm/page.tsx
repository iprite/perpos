'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { PageShell } from '@/components/ui/page-shell';
import {
  LayoutDashboard, Calculator, ArrowRight, ArrowUpRight,
  Building2, BookOpenText, Users, CheckCircle2, Clock,
  AlertTriangle, TrendingUp, TrendingDown, FileText,
} from 'lucide-react';

type InvoiceBucket = { count: number; amount: number };
type ClientSummary = {
  id: string;
  client_org: { id: string; name: string; slug: string };
  modules_managed: string[];
  status: string;
  invoices: {
    draft:    InvoiceBucket;
    overdue:  InvoiceBucket;
    due_soon: InvoiceBucket;
    open:     InvoiceBucket;
  };
  kpi: { revenue: number; expense: number };
};

function fmtK(n: number) {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000)     return (n / 1_000).toFixed(1) + 'K';
  return n.toLocaleString('th-TH');
}

function StatChip({
  icon, label, count, amount, variant = 'default',
}: {
  icon: React.ReactNode;
  label: string;
  count: number;
  amount: number;
  variant?: 'default' | 'danger' | 'warn' | 'muted';
}) {
  const cls = {
    default: 'bg-slate-50 text-slate-600 border-slate-100',
    danger:  'bg-red-50  text-red-700  border-red-100',
    warn:    'bg-amber-50 text-amber-700 border-amber-100',
    muted:   'bg-gray-50  text-gray-500  border-gray-100',
  }[variant];
  if (count === 0) return null;
  return (
    <div className={`flex items-center gap-1.5 text-xs px-2 py-1 rounded-lg border ${cls}`}>
      {icon}
      <span className="font-medium">{label}</span>
      <span className="font-bold">{count}</span>
      {amount > 0 && <span className="opacity-70">฿{fmtK(amount)}</span>}
    </div>
  );
}

export default function AccFirmDashboardPage() {
  const { orgSlug } = useParams<{ orgSlug: string }>();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);

  const [orgId, setOrgId]         = useState('');
  const [token, setToken]         = useState('');
  const [summaries, setSummaries] = useState<ClientSummary[]>([]);
  const [asOf, setAsOf]           = useState('');
  const [loading, setLoading]     = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data: org }, { data: sess }] = await Promise.all([
      supabase.from('organizations').select('id').eq('slug', orgSlug).single(),
      supabase.auth.getSession(),
    ]);
    if (!org || !sess.session) { setLoading(false); return; }
    const tok = sess.session.access_token;
    setOrgId(org.id);
    setToken(tok);

    const res = await fetch(`/api/acc-firm/dashboard?orgId=${org.id}`, {
      headers: { Authorization: `Bearer ${tok}` },
    });
    if (res.ok) {
      const json = await res.json();
      setSummaries(json.summaries ?? []);
      setAsOf(json.asOf ?? '');
    }
    setLoading(false);
  }, [supabase, orgSlug]);

  useEffect(() => { load(); }, [load]);

  // ── Aggregate totals ───────────────────────────────────────────────────────
  const totals = useMemo(() => summaries.reduce(
    (acc, s) => ({
      clients:       acc.clients + 1,
      totalRevenue:  acc.totalRevenue  + s.kpi.revenue,
      totalExpense:  acc.totalExpense  + s.kpi.expense,
      draftCount:    acc.draftCount    + s.invoices.draft.count,
      overdueCount:  acc.overdueCount  + s.invoices.overdue.count,
      overdueAmount: acc.overdueAmount + s.invoices.overdue.amount,
    }),
    { clients: 0, totalRevenue: 0, totalExpense: 0, draftCount: 0, overdueCount: 0, overdueAmount: 0 },
  ), [summaries]);

  const thMonth = useMemo(() => {
    if (!asOf) return '';
    const [y, m] = asOf.split('-').map(Number);
    const TH = ['','ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];
    return `${TH[m]} ${y + 543}`;
  }, [asOf]);

  return (
    <PageShell
      width="full"
      icon={<LayoutDashboard className="h-6 w-6" />}
      title="Dashboard"
      description={`สำนักงานบัญชี — ภาพรวม client orgs${thMonth ? ` · ${thMonth}` : ''}`}
      actions={
        <>
          <Link href={`/${orgSlug}/acc-firm/ocr`}>
            <Button size="sm" variant="outline" className="gap-1.5 text-teal-700 border-teal-200 hover:bg-teal-50">
              <FileText className="w-3.5 h-3.5" /> ตรวจทานบิล AI (OCR)
            </Button>
          </Link>
          <Link href={`/${orgSlug}/acc-firm/clients`}>
            <Button size="sm" className="gap-1.5">
              <Calculator className="w-3.5 h-3.5" /> จัดการ Clients
            </Button>
          </Link>
        </>
      }
    >

      {/* ── Summary stat cards ────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="rounded-xl border bg-teal-50 border-teal-100 p-4 flex gap-3 items-start">
          <Building2 className="w-5 h-5 text-teal-500 mt-0.5 shrink-0" />
          <div>
            <p className="text-xs text-slate-500 font-medium">Client ทั้งหมด</p>
            <p className="text-2xl font-bold text-slate-800">{loading ? '…' : totals.clients}</p>
            <p className="text-xs text-slate-400 mt-0.5">active orgs</p>
          </div>
        </div>

        <div className="rounded-xl border bg-green-50 border-green-100 p-4 flex gap-3 items-start">
          <TrendingUp className="w-5 h-5 text-green-500 mt-0.5 shrink-0" />
          <div>
            <p className="text-xs text-slate-500 font-medium">รายได้รวม (เดือนนี้)</p>
            <p className="text-2xl font-bold text-slate-800">
              {loading ? '…' : `฿${fmtK(totals.totalRevenue)}`}
            </p>
            <p className="text-xs text-slate-400 mt-0.5">ทุก client</p>
          </div>
        </div>

        <div className="rounded-xl border bg-amber-50 border-amber-100 p-4 flex gap-3 items-start">
          <TrendingDown className="w-5 h-5 text-amber-500 mt-0.5 shrink-0" />
          <div>
            <p className="text-xs text-slate-500 font-medium">ค่าใช้จ่ายรวม (เดือนนี้)</p>
            <p className="text-2xl font-bold text-slate-800">
              {loading ? '…' : `฿${fmtK(totals.totalExpense)}`}
            </p>
            <p className="text-xs text-slate-400 mt-0.5">ทุก client</p>
          </div>
        </div>

        <div className="rounded-xl border bg-red-50 border-red-100 p-4 flex gap-3 items-start">
          <AlertTriangle className="w-5 h-5 text-red-500 mt-0.5 shrink-0" />
          <div>
            <p className="text-xs text-slate-500 font-medium">Invoice เกินกำหนด</p>
            <p className="text-2xl font-bold text-slate-800">
              {loading ? '…' : totals.overdueCount}
            </p>
            <p className="text-xs text-slate-400 mt-0.5">
              {totals.overdueAmount > 0 ? `฿${fmtK(totals.overdueAmount)}` : 'ไม่มี'}
            </p>
          </div>
        </div>
      </div>

      {/* ── Per-client cards ──────────────────────────────────────────────── */}
      <div>
        <h2 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
          <Calculator className="w-4 h-4 text-slate-400" />
          รายละเอียดต่อ Client
        </h2>

        {loading ? (
          <div className="bg-white rounded-xl border p-8 text-center text-slate-400 text-sm">
            กำลังโหลด…
          </div>
        ) : summaries.length === 0 ? (
          <div className="bg-white rounded-xl border p-8 text-center text-slate-300 text-sm space-y-2">
            <Building2 className="w-8 h-8 mx-auto text-slate-200" />
            <p>ยังไม่มี active client org</p>
            <Link href={`/${orgSlug}/acc-firm/clients`}>
              <Button size="sm" variant="outline" className="mt-2">เพิ่ม Client Org</Button>
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            {summaries.map(s => {
              const hasOverdue  = s.invoices.overdue.count > 0;
              const hasDueSoon  = s.invoices.due_soon.count > 0;
              const netProfit   = s.kpi.revenue - s.kpi.expense;
              const netPositive = netProfit >= 0;

              return (
                <div
                  key={s.id}
                  className={`bg-white rounded-xl border p-4 space-y-3 transition-shadow hover:shadow-sm ${
                    hasOverdue ? 'border-red-200' : ''
                  }`}
                >
                  {/* Card header */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-9 h-9 rounded-lg bg-teal-50 border border-teal-100 flex items-center justify-center shrink-0">
                        <Building2 className="w-4 h-4 text-teal-500" />
                      </div>
                      <div className="min-w-0">
                        <p className="font-semibold text-slate-800 truncate">{s.client_org.name}</p>
                        <p className="text-xs text-slate-400">{s.client_org.slug}</p>
                      </div>
                    </div>

                    {/* Quick-open links */}
                    <div className="flex gap-1 shrink-0">
                      {s.modules_managed.includes('accounting') && (
                        <Link href={`/${s.client_org.slug}/accounting`} target="_blank">
                          <Button size="sm" variant="outline" className="text-xs gap-1 h-7 px-2">
                            <BookOpenText className="w-3.5 h-3.5" />
                            บัญชี
                            <ArrowUpRight className="w-3 h-3" />
                          </Button>
                        </Link>
                      )}
                      {s.modules_managed.includes('payroll') && (
                        <Link href={`/${s.client_org.slug}/payroll`} target="_blank">
                          <Button size="sm" variant="outline" className="text-xs gap-1 h-7 px-2">
                            <Users className="w-3.5 h-3.5" />
                            Payroll
                            <ArrowUpRight className="w-3 h-3" />
                          </Button>
                        </Link>
                      )}
                    </div>
                  </div>

                  {/* KPI row */}
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div className="rounded-lg bg-green-50 px-2 py-1.5">
                      <p className="text-xs text-slate-500">รายได้</p>
                      <p className="text-sm font-bold text-green-700">฿{fmtK(s.kpi.revenue)}</p>
                    </div>
                    <div className="rounded-lg bg-amber-50 px-2 py-1.5">
                      <p className="text-xs text-slate-500">ค่าใช้จ่าย</p>
                      <p className="text-sm font-bold text-amber-700">฿{fmtK(s.kpi.expense)}</p>
                    </div>
                    <div className={`rounded-lg px-2 py-1.5 ${netPositive ? 'bg-blue-50' : 'bg-red-50'}`}>
                      <p className="text-xs text-slate-500">กำไร</p>
                      <p className={`text-sm font-bold ${netPositive ? 'text-blue-700' : 'text-red-600'}`}>
                        {netPositive ? '' : '-'}฿{fmtK(Math.abs(netProfit))}
                      </p>
                    </div>
                  </div>

                  {/* Invoice status chips */}
                  <div className="flex gap-1.5 flex-wrap">
                    <StatChip
                      icon={<AlertTriangle className="w-3 h-3" />}
                      label="เกินกำหนด"
                      count={s.invoices.overdue.count}
                      amount={s.invoices.overdue.amount}
                      variant="danger"
                    />
                    <StatChip
                      icon={<Clock className="w-3 h-3" />}
                      label="ใกล้ครบกำหนด"
                      count={s.invoices.due_soon.count}
                      amount={s.invoices.due_soon.amount}
                      variant="warn"
                    />
                    <StatChip
                      icon={<FileText className="w-3 h-3" />}
                      label="Draft"
                      count={s.invoices.draft.count}
                      amount={s.invoices.draft.amount}
                      variant="muted"
                    />
                    <StatChip
                      icon={<CheckCircle2 className="w-3 h-3" />}
                      label="Open"
                      count={s.invoices.open.count}
                      amount={s.invoices.open.amount}
                      variant="default"
                    />
                    {s.invoices.overdue.count === 0 &&
                     s.invoices.due_soon.count === 0 &&
                     s.invoices.draft.count === 0 &&
                     s.invoices.open.count === 0 && (
                      <span className="text-xs text-slate-300 italic">ไม่มี invoice ค้างอยู่</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Bottom quick links ────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Link
          href={`/${orgSlug}/acc-firm/ocr`}
          className="bg-white rounded-xl border p-4 flex items-center justify-between hover:border-teal-300 hover:shadow-sm transition-all group"
        >
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-teal-50 border border-teal-100 flex items-center justify-center">
              <FileText className="w-5 h-5 text-teal-600" />
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-800">ระบบบันทึกบัญชีอัจฉริยะ (OCR)</p>
              <p className="text-xs text-slate-400">ตรวจทาน ตรวจสอบคู่บัญชี และอนุมัติเอกสาร AI</p>
            </div>
          </div>
          <ArrowRight className="w-4 h-4 text-slate-300 group-hover:text-teal-400 transition-colors" />
        </Link>

        <Link
          href={`/${orgSlug}/acc-firm/clients`}
          className="bg-white rounded-xl border p-4 flex items-center justify-between hover:border-teal-300 hover:shadow-sm transition-all group"
        >
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-teal-100 flex items-center justify-center">
              <Calculator className="w-5 h-5 text-teal-600" />
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-800">จัดการ Client Orgs</p>
              <p className="text-xs text-slate-400">เพิ่ม / แก้ไข / ดูรายละเอียด engagement</p>
            </div>
          </div>
          <ArrowRight className="w-4 h-4 text-slate-300 group-hover:text-teal-400 transition-colors" />
        </Link>
      </div>
    </PageShell>
  );
}
