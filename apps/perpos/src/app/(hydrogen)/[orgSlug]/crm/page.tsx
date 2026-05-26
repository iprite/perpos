'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, LineChart, Line, Cell,
} from 'recharts';
import {
  Users, Briefcase, CheckCircle2, TrendingUp,
  LayoutDashboard, ArrowRight, DollarSign,
} from 'lucide-react';

type DashData = {
  totalClients: number;
  activeClients: number;
  prospectClients: number;
  totalSolutions: number;
  pipelineValue: number;
  completedValue: number;
  byStatus: Record<string, { count: number; value: number }>;
  monthly: { month: string; count: number }[];
};

const STATUS_CONFIG: Record<string, { label: string; color: string; bar: string }> = {
  lead:        { label: 'Lead',        color: 'bg-slate-100 text-slate-600',   bar: '#94a3b8' },
  proposal:    { label: 'Proposal',    color: 'bg-blue-100 text-blue-700',     bar: '#3b82f6' },
  in_progress: { label: 'In Progress', color: 'bg-amber-100 text-amber-700',   bar: '#f59e0b' },
  on_hold:     { label: 'On Hold',     color: 'bg-orange-100 text-orange-700', bar: '#f97316' },
  completed:   { label: 'Completed',   color: 'bg-green-100 text-green-700',   bar: '#22c55e' },
  cancelled:   { label: 'Cancelled',   color: 'bg-red-100 text-red-600',       bar: '#f87171' },
};

const TH_MONTHS = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];
function thMonth(ym: string) {
  const [, m] = ym.split('-').map(Number);
  return TH_MONTHS[m - 1] ?? ym;
}
function fmtK(n: number) {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000)     return (n / 1_000).toFixed(1) + 'K';
  return n.toLocaleString('th-TH');
}

function StatCard({ icon, label, value, sub, color }: {
  icon: React.ReactNode; label: string; value: string | number; sub?: string; color: string;
}) {
  return (
    <div className={`rounded-xl border p-4 flex gap-3 items-start ${color}`}>
      <div className="mt-0.5 shrink-0">{icon}</div>
      <div>
        <p className="text-xs text-slate-500 font-medium">{label}</p>
        <p className="text-xl font-bold text-slate-800">{value}</p>
        {sub && <p className="text-xs text-slate-400 mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

const TT = { contentStyle: { fontSize: 12, borderRadius: 8, border: '1px solid #e2e8f0' } };

export default function CrmDashboardPage() {
  const { orgSlug } = useParams<{ orgSlug: string }>();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [orgId, setOrgId]     = useState('');
  const [data, setData]       = useState<DashData | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const { data: orgs } = await supabase.from('organizations').select('id').eq('slug', orgSlug).single();
    const { data: sess } = await supabase.auth.getSession();
    if (!orgs || !sess.session) { setLoading(false); return; }
    const oid = orgs.id;
    const tok = sess.session.access_token;
    setOrgId(oid);
    const res = await fetch(`/api/crm/dashboard?orgId=${oid}`, { headers: { Authorization: `Bearer ${tok}` } });
    if (res.ok) setData(await res.json());
    setLoading(false);
  }, [supabase, orgSlug]);

  useEffect(() => { load(); }, [load]);

  const statusChartData = useMemo(() => {
    if (!data) return [];
    return Object.entries(STATUS_CONFIG).map(([key, cfg]) => ({
      name: cfg.label,
      count: data.byStatus[key]?.count ?? 0,
      value: data.byStatus[key]?.value ?? 0,
      fill: cfg.bar,
    })).filter(d => d.count > 0);
  }, [data]);

  const monthlyChart = useMemo(() =>
    (data?.monthly ?? []).map(m => ({ name: thMonth(m.month), solutions: m.count })),
  [data]);

  const activeSolutions = (data?.byStatus['in_progress']?.count ?? 0) + (data?.byStatus['proposal']?.count ?? 0);

  return (
    <div className="p-4 md:p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <LayoutDashboard className="w-5 h-5 text-indigo-500" /> Dashboard
          </h1>
          <p className="text-sm text-slate-500">CRM & Solution Tracking — P2P Solutions</p>
        </div>
        <Button variant="outline" size="sm" onClick={load} disabled={loading}>
          {loading ? 'กำลังโหลด…' : 'รีเฟรช'}
        </Button>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard
          icon={<Users className="w-5 h-5 text-indigo-500" />}
          label="ลูกค้าทั้งหมด"
          value={loading ? '…' : data?.totalClients ?? 0}
          sub={`Active ${data?.activeClients ?? 0} · Prospect ${data?.prospectClients ?? 0}`}
          color="bg-indigo-50 border-indigo-100"
        />
        <StatCard
          icon={<Briefcase className="w-5 h-5 text-blue-500" />}
          label="Solutions ทั้งหมด"
          value={loading ? '…' : data?.totalSolutions ?? 0}
          sub={`Active ${activeSolutions}`}
          color="bg-blue-50 border-blue-100"
        />
        <StatCard
          icon={<TrendingUp className="w-5 h-5 text-amber-500" />}
          label="Pipeline Value"
          value={loading ? '…' : `฿${fmtK(data?.pipelineValue ?? 0)}`}
          sub="Lead + Proposal + In Progress"
          color="bg-amber-50 border-amber-100"
        />
        <StatCard
          icon={<CheckCircle2 className="w-5 h-5 text-green-500" />}
          label="Completed Value"
          value={loading ? '…' : `฿${fmtK(data?.completedValue ?? 0)}`}
          sub={`${data?.byStatus['completed']?.count ?? 0} solutions`}
          color="bg-green-50 border-green-100"
        />
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Solutions by status */}
        <div className="bg-white rounded-xl border p-4">
          <p className="text-sm font-semibold text-slate-700 mb-3">Solutions แยกตาม Status</p>
          {loading ? (
            <div className="h-48 flex items-center justify-center text-slate-400 text-sm">กำลังโหลด…</div>
          ) : statusChartData.length === 0 ? (
            <div className="h-48 flex items-center justify-center text-slate-300 text-sm">ยังไม่มีข้อมูล</div>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={statusChartData} barSize={32}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                <Tooltip {...TT} formatter={(v: number) => [v, 'จำนวน']} />
                <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                  {statusChartData.map((entry, i) => (
                    <Cell key={i} fill={entry.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Monthly new solutions */}
        <div className="bg-white rounded-xl border p-4">
          <p className="text-sm font-semibold text-slate-700 mb-3">Solutions ใหม่รายเดือน</p>
          {loading ? (
            <div className="h-48 flex items-center justify-center text-slate-400 text-sm">กำลังโหลด…</div>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={monthlyChart}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                <Tooltip {...TT} formatter={(v: number) => [v, 'solutions']} />
                <Line dataKey="solutions" stroke="#6366f1" strokeWidth={2} dot={{ r: 4, fill: '#6366f1' }} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Pipeline value by status table */}
      {data && Object.keys(data.byStatus).length > 0 && (
        <div className="bg-white rounded-xl border">
          <div className="px-4 py-3 border-b flex items-center gap-2">
            <DollarSign className="w-4 h-4 text-slate-400" />
            <h2 className="text-sm font-semibold text-slate-700">มูลค่าแยกตาม Status</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b text-xs text-slate-500">
                <tr>
                  <th className="text-left px-4 py-2.5 font-medium">Status</th>
                  <th className="text-right px-4 py-2.5 font-medium">จำนวน</th>
                  <th className="text-right px-4 py-2.5 font-medium">มูลค่ารวม</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {Object.entries(STATUS_CONFIG).map(([key, cfg]) => {
                  const row = data.byStatus[key];
                  if (!row) return null;
                  return (
                    <tr key={key} className="hover:bg-slate-50">
                      <td className="px-4 py-2.5">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${cfg.color}`}>
                          {cfg.label}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-right text-slate-600">{row.count}</td>
                      <td className="px-4 py-2.5 text-right font-medium text-slate-800">
                        {row.value > 0 ? `฿${row.value.toLocaleString('th-TH', { minimumFractionDigits: 0 })}` : '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Quick links */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {[
          { href: `/${orgSlug}/crm/clients`,   icon: <Users className="w-5 h-5 text-indigo-600" />,   bg: 'bg-indigo-100', title: 'จัดการลูกค้า',      sub: 'เพิ่ม / แก้ไข / ดูรายละเอียด', hover: 'hover:border-indigo-300' },
          { href: `/${orgSlug}/crm/solutions`, icon: <Briefcase className="w-5 h-5 text-blue-600" />, bg: 'bg-blue-100',   title: 'Solution Tracking', sub: 'Kanban board + List view',      hover: 'hover:border-blue-300'   },
        ].map(item => (
          <Link
            key={item.href}
            href={item.href}
            className={`bg-white rounded-xl border p-4 flex items-center justify-between ${item.hover} hover:shadow-sm transition-all group`}
          >
            <div className="flex items-center gap-3">
              <div className={`w-9 h-9 rounded-lg ${item.bg} flex items-center justify-center`}>{item.icon}</div>
              <div>
                <p className="text-sm font-semibold text-slate-800">{item.title}</p>
                <p className="text-xs text-slate-400">{item.sub}</p>
              </div>
            </div>
            <ArrowRight className="w-4 h-4 text-slate-300 group-hover:text-indigo-400 transition-colors" />
          </Link>
        ))}
      </div>
    </div>
  );
}
