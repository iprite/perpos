'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { PageShell } from '@/components/ui/page-shell';
import {
  BarChart3, AlertTriangle, Clock, FileText,
  Building2, ArrowUpRight, RefreshCw, CalendarDays,
  CheckSquare, BookOpenText,
} from 'lucide-react';
import type { ActionableInvoice, ClientSummaryRow } from '@/app/api/acc-firm/reports/route';

// ── Helpers ────────────────────────────────────────────────────────────────────
function fmtK(n: number) {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000)     return (n / 1_000).toFixed(1) + 'K';
  return n.toLocaleString('th-TH');
}

function fmtDate(d: string | null) {
  if (!d) return '—';
  const [y, m, day] = d.split('-').map(Number);
  const TH = ['','ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];
  return `${day} ${TH[m]} ${y + 543}`;
}

const BUCKET_CONFIG = {
  overdue:  { label: 'เกินกำหนด',     cls: 'bg-red-100 text-red-700',   icon: <AlertTriangle className="w-3 h-3" /> },
  due_soon: { label: 'ใกล้ครบกำหนด', cls: 'bg-amber-100 text-amber-700', icon: <Clock className="w-3 h-3" /> },
  draft:    { label: 'Draft',          cls: 'bg-gray-100 text-gray-600',  icon: <FileText className="w-3 h-3" /> },
  open:     { label: 'Open',           cls: 'bg-blue-100 text-blue-700',  icon: <CheckSquare className="w-3 h-3" /> },
};

// ── Tax calendar helpers ───────────────────────────────────────────────────────
type TaxDeadline = {
  orgName:  string;
  orgSlug:  string;
  type:     string;
  label:    string;
  dueDate:  string;   // YYYY-MM-DD
  daysLeft: number;
};

function calcTaxDeadlines(orgs: ClientSummaryRow[], today: string): TaxDeadline[] {
  const result: TaxDeadline[] = [];
  const todayDate = new Date(today);

  // Generate deadlines for current + next 2 months
  for (let monthOffset = 0; monthOffset <= 2; monthOffset++) {
    const ref = new Date(todayDate);
    ref.setDate(1);
    ref.setMonth(ref.getMonth() + monthOffset);

    // PP30 (VAT) due: 23rd of month following the tax month
    // PND1 (WHT payroll) due: 7th of following month
    // PND3/53 (WHT service) due: 7th of following month
    const pp30Due = new Date(ref);
    pp30Due.setMonth(pp30Due.getMonth() + 1);
    pp30Due.setDate(23);

    const whtDue = new Date(ref);
    whtDue.setMonth(whtDue.getMonth() + 1);
    whtDue.setDate(7);

    const pp30Str = pp30Due.toISOString().slice(0, 10);
    const whtStr  = whtDue.toISOString().slice(0, 10);
    const taxMonth = ref.toLocaleDateString('th-TH', { month: 'long', year: 'numeric' });

    for (const org of orgs) {
      const pp30Days = Math.ceil((pp30Due.getTime() - todayDate.getTime()) / 86400_000);
      const whtDays  = Math.ceil((whtDue.getTime()  - todayDate.getTime()) / 86400_000);

      if (pp30Days >= -3) {
        result.push({ orgName: org.orgName, orgSlug: org.orgSlug, type: 'pp30',   label: `ภ.พ.30 (${taxMonth})`,      dueDate: pp30Str, daysLeft: pp30Days });
      }
      if (whtDays >= -3) {
        result.push({ orgName: org.orgName, orgSlug: org.orgSlug, type: 'pnd',    label: `ภ.ง.ด. (${taxMonth})`,       dueDate: whtStr,  daysLeft: whtDays  });
      }
    }
  }

  // Sort by due date
  result.sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  // Deduplicate (same org + type + month)
  const seen = new Set<string>();
  return result.filter(d => {
    const key = `${d.orgSlug}|${d.type}|${d.dueDate}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function deadlineColor(daysLeft: number) {
  if (daysLeft < 0)  return 'border-red-200 bg-red-50 text-red-700';
  if (daysLeft <= 7) return 'border-amber-200 bg-amber-50 text-amber-700';
  return 'border-slate-100 bg-white text-slate-600';
}

// ── Main page ──────────────────────────────────────────────────────────────────
export default function AccFirmReportsPage() {
  const { orgSlug } = useParams<{ orgSlug: string }>();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);

  const [orgId, setOrgId]                   = useState('');
  const [loading, setLoading]               = useState(true);
  const [actionable, setActionable]         = useState<ActionableInvoice[]>([]);
  const [clientSummary, setClientSummary]   = useState<ClientSummaryRow[]>([]);
  const [asOf, setAsOf]                     = useState('');
  const [tab, setTab]                       = useState<'pending' | 'calendar' | 'summary'>('pending');
  const [filterBucket, setFilterBucket]     = useState<string>('');
  const [filterOrg, setFilterOrg]           = useState<string>('');

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data: org }, { data: sess }] = await Promise.all([
      supabase.from('organizations').select('id').eq('slug', orgSlug).single(),
      supabase.auth.getSession(),
    ]);
    if (!org || !sess.session) { setLoading(false); return; }
    setOrgId(org.id);
    const tok = sess.session.access_token;

    const res = await fetch(`/api/acc-firm/reports?orgId=${org.id}`, {
      headers: { Authorization: `Bearer ${tok}` },
    });
    if (res.ok) {
      const json = await res.json();
      setActionable(json.actionableInvoices ?? []);
      setClientSummary(json.clientSummary ?? []);
      setAsOf(json.asOf ?? '');
    }
    setLoading(false);
  }, [supabase, orgSlug]);

  useEffect(() => { load(); }, [load]);

  // Tax deadlines (calculated client-side)
  const taxDeadlines = useMemo(() =>
    asOf ? calcTaxDeadlines(clientSummary, asOf) : [],
  [clientSummary, asOf]);

  // Filtered actionable invoices
  const filteredActionable = useMemo(() => {
    let list = actionable;
    if (filterBucket) list = list.filter(i => i.bucket === filterBucket);
    if (filterOrg)    list = list.filter(i => i.orgId === filterOrg);
    return list;
  }, [actionable, filterBucket, filterOrg]);

  // Totals
  const totals = useMemo(() => ({
    overdue:       actionable.filter(i => i.bucket === 'overdue').length,
    overdueAmount: actionable.filter(i => i.bucket === 'overdue').reduce((s, i) => s + i.totalAmount, 0),
    due_soon:      actionable.filter(i => i.bucket === 'due_soon').length,
    draft:         actionable.filter(i => i.bucket === 'draft').length,
    upcoming:      taxDeadlines.filter(d => d.daysLeft >= 0 && d.daysLeft <= 14).length,
  }), [actionable, taxDeadlines]);

  const thMonth = useMemo(() => {
    if (!asOf) return '';
    const [y, m] = asOf.split('-').map(Number);
    const TH = ['','ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];
    return `${TH[m]} ${y + 543}`;
  }, [asOf]);

  const orgOptions = useMemo(() =>
    clientSummary.map(c => ({ value: c.orgId, label: c.orgName })),
  [clientSummary]);

  return (
    <PageShell
      width="full"
      icon={<BarChart3 className="h-6 w-6" />}
      title="รายงานรวม"
      description={`ภาพรวมงานค้างและ deadline ภาษีข้าม client orgs${thMonth ? ` · ${thMonth}` : ''}`}
      actions={
        <Button variant="outline" size="sm" onClick={load} disabled={loading} className="gap-1.5">
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          {loading ? 'กำลังโหลด…' : 'รีเฟรช'}
        </Button>
      }
    >

      {/* KPI strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { icon: <AlertTriangle className="w-4 h-4 text-red-500" />,   bg: 'bg-red-50 border-red-100',     label: 'Invoice เกินกำหนด', val: loading ? '…' : `${totals.overdue} (฿${fmtK(totals.overdueAmount)})` },
          { icon: <Clock className="w-4 h-4 text-amber-500" />,          bg: 'bg-amber-50 border-amber-100', label: 'ใกล้ครบกำหนด',     val: loading ? '…' : String(totals.due_soon) },
          { icon: <FileText className="w-4 h-4 text-gray-400" />,        bg: 'bg-gray-50 border-gray-100',   label: 'Draft invoices',    val: loading ? '…' : String(totals.draft)    },
          { icon: <CalendarDays className="w-4 h-4 text-teal-500" />,    bg: 'bg-teal-50 border-teal-100',   label: 'Tax deadline 14 วัน',val: loading ? '…' : String(totals.upcoming) },
        ].map((c, i) => (
          <div key={i} className={`rounded-xl border p-3 flex gap-2.5 items-start ${c.bg}`}>
            <div className="mt-0.5 shrink-0">{c.icon}</div>
            <div>
              <p className="text-xs text-slate-500 font-medium">{c.label}</p>
              <p className="text-base font-bold text-slate-800">{c.val}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b">
        {([
          { key: 'pending',  label: 'งานค้าง',        icon: <AlertTriangle className="w-4 h-4" /> },
          { key: 'calendar', label: 'ปฏิทินภาษี',    icon: <CalendarDays className="w-4 h-4" /> },
          { key: 'summary',  label: 'สรุปต่อ Client', icon: <Building2 className="w-4 h-4" /> },
        ] as const).map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              tab === t.key
                ? 'border-teal-500 text-teal-700'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {/* ── Tab: งานค้าง ─────────────────────────────────────────────────────── */}
      {tab === 'pending' && (
        <div className="space-y-3">
          {/* Filters */}
          <div className="flex gap-2 flex-wrap items-center">
            <span className="text-xs text-slate-400">กรอง:</span>
            {(['', 'overdue', 'due_soon', 'draft'] as const).map(b => (
              <button
                key={b}
                onClick={() => setFilterBucket(b)}
                className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                  filterBucket === b
                    ? 'bg-teal-600 text-white border-teal-600'
                    : 'border-slate-200 text-slate-500 hover:border-slate-300'
                }`}
              >
                {b === '' ? 'ทั้งหมด' : BUCKET_CONFIG[b].label}
              </button>
            ))}
            <span className="w-px h-4 bg-slate-200" />
            <select
              value={filterOrg}
              onChange={e => setFilterOrg(e.target.value)}
              className="text-xs border border-slate-200 rounded-lg px-2 py-1 text-slate-600 focus:outline-none focus:border-teal-400"
            >
              <option value="">ทุก Client</option>
              {orgOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>

          <div className="bg-white rounded-xl border overflow-hidden">
            {loading ? (
              <div className="p-8 text-center text-slate-400 text-sm">กำลังโหลด…</div>
            ) : filteredActionable.length === 0 ? (
              <div className="p-8 text-center space-y-1">
                <CheckSquare className="w-8 h-8 mx-auto text-green-200" />
                <p className="text-slate-300 text-sm">ไม่มีงานค้างในขณะนี้ 🎉</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 border-b text-xs text-slate-500">
                    <tr>
                      <th className="text-left px-4 py-2.5 font-medium">สถานะ</th>
                      <th className="text-left px-4 py-2.5 font-medium">Client</th>
                      <th className="text-left px-4 py-2.5 font-medium">เลขที่</th>
                      <th className="text-left px-4 py-2.5 font-medium">ลูกค้า</th>
                      <th className="text-left px-4 py-2.5 font-medium">วันที่ออก</th>
                      <th className="text-left px-4 py-2.5 font-medium">ครบกำหนด</th>
                      <th className="text-right px-4 py-2.5 font-medium">จำนวนเงิน</th>
                      <th className="px-4 py-2.5" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {filteredActionable.map(inv => {
                      const bCfg = BUCKET_CONFIG[inv.bucket];
                      return (
                        <tr key={inv.id} className="hover:bg-slate-50">
                          <td className="px-4 py-2.5">
                            <span className={`flex items-center gap-1 w-fit text-xs px-2 py-0.5 rounded-full font-medium ${bCfg.cls}`}>
                              {bCfg.icon} {bCfg.label}
                            </span>
                          </td>
                          <td className="px-4 py-2.5">
                            <p className="font-medium text-slate-700 text-xs">{inv.orgName}</p>
                          </td>
                          <td className="px-4 py-2.5 text-slate-500 text-xs font-mono">{inv.invoiceNo ?? '—'}</td>
                          <td className="px-4 py-2.5 text-slate-700 text-xs max-w-[140px] truncate">{inv.contactName}</td>
                          <td className="px-4 py-2.5 text-slate-400 text-xs">{fmtDate(inv.issueDate)}</td>
                          <td className={`px-4 py-2.5 text-xs font-medium ${inv.bucket === 'overdue' ? 'text-red-600' : inv.bucket === 'due_soon' ? 'text-amber-600' : 'text-slate-400'}`}>
                            {fmtDate(inv.dueDate)}
                          </td>
                          <td className="px-4 py-2.5 text-right font-semibold text-slate-800 text-xs">
                            ฿{inv.totalAmount.toLocaleString('th-TH', { minimumFractionDigits: 2 })}
                          </td>
                          <td className="px-4 py-2.5">
                            <Link href={`/${inv.orgSlug}/accounting/invoices`} target="_blank">
                              <Button size="sm" variant="ghost" className="h-6 w-6 p-0">
                                <ArrowUpRight className="w-3.5 h-3.5 text-slate-400" />
                              </Button>
                            </Link>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Tab: ปฏิทินภาษี ──────────────────────────────────────────────────── */}
      {tab === 'calendar' && (
        <div className="space-y-2">
          <p className="text-xs text-slate-400">แสดง deadline ภ.พ.30 และ ภ.ง.ด. ของทุก client org ในช่วง 3 เดือนข้างหน้า</p>
          {loading ? (
            <div className="p-8 text-center text-slate-400 text-sm">กำลังโหลด…</div>
          ) : taxDeadlines.length === 0 ? (
            <div className="p-8 text-center text-slate-300 text-sm">ไม่มี client orgs</div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {taxDeadlines.map((d, i) => (
                <div key={i} className={`rounded-xl border px-4 py-3 flex items-center gap-3 ${deadlineColor(d.daysLeft)}`}>
                  <CalendarDays className="w-5 h-5 shrink-0 opacity-60" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold truncate">{d.orgName}</p>
                    <p className="text-xs opacity-80 truncate">{d.label}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-xs font-bold">{fmtDate(d.dueDate)}</p>
                    <p className="text-xs opacity-70">
                      {d.daysLeft < 0  ? `เกินแล้ว ${Math.abs(d.daysLeft)} วัน` :
                       d.daysLeft === 0 ? 'วันนี้!' :
                       `อีก ${d.daysLeft} วัน`}
                    </p>
                  </div>
                  <Link href={`/${d.orgSlug}/accounting`} target="_blank">
                    <BookOpenText className="w-4 h-4 opacity-40 hover:opacity-80 transition-opacity" />
                  </Link>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Tab: สรุปต่อ Client ───────────────────────────────────────────────── */}
      {tab === 'summary' && (
        <div className="bg-white rounded-xl border overflow-hidden">
          {loading ? (
            <div className="p-8 text-center text-slate-400 text-sm">กำลังโหลด…</div>
          ) : clientSummary.length === 0 ? (
            <div className="p-8 text-center text-slate-300 text-sm">ไม่มี client orgs</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 border-b text-xs text-slate-500">
                  <tr>
                    <th className="text-left px-4 py-2.5 font-medium">Client</th>
                    <th className="text-center px-3 py-2.5 font-medium text-red-500">เกินกำหนด</th>
                    <th className="text-center px-3 py-2.5 font-medium text-amber-500">ใกล้ครบ</th>
                    <th className="text-center px-3 py-2.5 font-medium text-gray-500">Draft</th>
                    <th className="text-center px-3 py-2.5 font-medium text-blue-500">Open</th>
                    <th className="text-right px-4 py-2.5 font-medium text-red-500">ยอดค้างชำระ</th>
                    <th className="px-4 py-2.5" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {clientSummary.map(c => (
                    <tr key={c.orgId} className={`hover:bg-slate-50 ${c.overdue > 0 ? 'bg-red-50/30' : ''}`}>
                      <td className="px-4 py-3">
                        <p className="font-semibold text-slate-800">{c.orgName}</p>
                        <p className="text-xs text-slate-400">{c.orgSlug}</p>
                      </td>
                      <td className="px-3 py-3 text-center">
                        {c.overdue > 0
                          ? <span className="text-sm font-bold text-red-600">{c.overdue}</span>
                          : <span className="text-slate-200">—</span>}
                      </td>
                      <td className="px-3 py-3 text-center">
                        {c.due_soon > 0
                          ? <span className="text-sm font-bold text-amber-600">{c.due_soon}</span>
                          : <span className="text-slate-200">—</span>}
                      </td>
                      <td className="px-3 py-3 text-center">
                        {c.draft > 0
                          ? <span className="text-sm text-gray-500">{c.draft}</span>
                          : <span className="text-slate-200">—</span>}
                      </td>
                      <td className="px-3 py-3 text-center">
                        {c.open > 0
                          ? <span className="text-sm text-blue-600">{c.open}</span>
                          : <span className="text-slate-200">—</span>}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {c.totalOverdue > 0
                          ? <span className="text-sm font-bold text-red-600">฿{fmtK(c.totalOverdue)}</span>
                          : <span className="text-slate-200">—</span>}
                      </td>
                      <td className="px-4 py-3">
                        <Link href={`/${c.orgSlug}/accounting`} target="_blank">
                          <Button size="sm" variant="ghost" className="h-7 w-7 p-0">
                            <ArrowUpRight className="w-3.5 h-3.5 text-slate-400" />
                          </Button>
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </PageShell>
  );
}
