'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { backendUrl } from '@/lib/backend';
import { Button } from '@/components/ui/button';
import { CustomSelect } from '@/components/ui/custom-select';
import { PageShell } from '@/components/ui/page-shell';
import {
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell,
} from '@/components/ui/table';
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer, Cell,
} from 'recharts';
import {
  Landmark, Wallet, Building2, Package,
  TrendingUp, TrendingDown, AlertTriangle,
} from 'lucide-react';

const TMC_ORG_ID = '1f52618c-09c4-49c5-a929-ea5060f26e7d';

const TH_MONTHS = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.',
                   'ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];
function thMonth(ym: string) {
  const [y, m] = ym.split('-').map(Number);
  return `${TH_MONTHS[m - 1]} ${String(y + 543).slice(-2)}`;
}
function fmtK(n: number) {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000)     return (n / 1_000).toFixed(1) + 'K';
  return n.toLocaleString('th-TH');
}
function fmt(n: number) {
  return n.toLocaleString('th-TH', { minimumFractionDigits: 2 });
}

const PROPERTY_COLORS: Record<string, string> = {
  TMC1: '#3b82f6', TMC2: '#8b5cf6', 'TMC3-4': '#ec4899',
  TMC5: '#f59e0b', TMC6: '#14b8a6', TMC7: '#10b981',
  'ส่วนกลาง': '#94a3b8', '(ไม่ระบุ)': '#cbd5e1',
};
function propColor(p: string) { return PROPERTY_COLORS[p] ?? '#6366f1'; }

// Range options
const RANGE_OPTS = [
  { value: '1',  label: '1 เดือนล่าสุด' },
  { value: '3',  label: '3 เดือนล่าสุด' },
  { value: '6',  label: '6 เดือนล่าสุด' },
  { value: '12', label: '12 เดือนล่าสุด' },
];

function rangeFromMonths(n: number) {
  const to  = new Date();
  const from = new Date();
  from.setMonth(from.getMonth() - n + 1);
  from.setDate(1);
  return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) };
}

// ── Types ────────────────────────────────────────────────────────────
type Totals = {
  finance:      { income: number; expense: number };
  petty:        { top_up: number; expense: number };
  stays:        { count: number; nights: number; revenue: number };
  stock:        { items: number; low: number };
  staysAllTime: number;
};
type Monthly = { month: string; income?: number; expense?: number; top_up?: number; stays?: number; nights?: number; revenue?: number };
type PropRow = { property: string; finIncome: number; finExpense: number; pettyExpense: number; stays: number; stayRevenue: number };
type CatRow  = { category: string; income: number; expense: number };
type DashData = {
  totals: Totals;
  financeMonthly: Monthly[];
  pettyMonthly:   Monthly[];
  staysMonthly:   Monthly[];
  byProperty: PropRow[];
  byCategory: CatRow[];
  stockLow: { name: string; qty: number }[];
};

// ── Small components ─────────────────────────────────────────────────
function SummaryCard({ icon, label, value, sub, color }: {
  icon: React.ReactNode; label: string; value: string; sub?: string; color: string;
}) {
  return (
    <div className={`rounded-xl border p-4 flex gap-3 items-start ${color}`}>
      <div className="mt-0.5 shrink-0">{icon}</div>
      <div className="min-w-0">
        <p className="text-xs text-slate-500 font-medium">{label}</p>
        <p className="text-base font-bold text-slate-800 truncate">{value}</p>
        {sub && <p className="text-xs text-slate-400 mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

const TT = { contentStyle: { fontSize: 12, borderRadius: 8, border: '1px solid #e2e8f0' } };

// ── Page ─────────────────────────────────────────────────────────────
export default function TmcDashboardPage() {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [data, setData]       = useState<DashData | null>(null);
  const [loading, setLoading] = useState(true);
  const [range, setRange]     = useState('6');
  const [graphTab, setGraphTab] = useState<'finance' | 'petty' | 'stays'>('finance');

  const load = useCallback(async () => {
    setLoading(true);
    const { data: sess } = await supabase.auth.getSession();
    const token = sess.session?.access_token ?? '';
    const { from, to } = rangeFromMonths(Number(range));
    const res = await fetch(
      backendUrl(`/tmc/dashboard?orgId=${TMC_ORG_ID}&from=${from}&to=${to}`),
      { headers: { Authorization: `Bearer ${token}` } },
    );
    setData(await res.json());
    setLoading(false);
  }, [supabase, range]);

  useEffect(() => { load(); }, [load]);

  const t = data?.totals;

  const finChart = (data?.financeMonthly ?? []).map(r => ({
    name: thMonth(r.month),
    รายรับ:  r.income  ?? 0,
    รายจ่าย: r.expense ?? 0,
    คงเหลือ: (r.income ?? 0) - (r.expense ?? 0),
  }));
  const pettyChart = (data?.pettyMonthly ?? []).map(r => ({
    name:    thMonth(r.month),
    รับเงิน: r.top_up  ?? 0,
    รายจ่าย: r.expense ?? 0,
  }));
  const staysChart = (data?.staysMonthly ?? []).map(r => ({
    name:        thMonth(r.month),
    การเข้าพัก: r.stays   ?? 0,
    คืน:         r.nights  ?? 0,
    รายรับห้อง:  r.revenue ?? 0,
  }));

  return (
    <PageShell
      width="full"
      icon={<Building2 className="h-6 w-6" />}
      title="Dashboard"
      description="TMC Management — ภาพรวมธุรกิจ"
      actions={
        <>
          <CustomSelect
            value={range}
            onChange={setRange}
            options={RANGE_OPTS}
            className="w-44"
          />
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            {loading ? 'กำลังโหลด…' : 'รีเฟรช'}
          </Button>
        </>
      }
    >

      {/* ── Summary Cards ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <SummaryCard
          icon={<Landmark className="w-5 h-5 text-blue-500" />}
          label="รายรับสุทธิ (บัญชี)"
          value={t ? `฿${fmtK(t.finance.income - t.finance.expense)}` : '—'}
          sub={t ? `รับ ${fmtK(t.finance.income)} / จ่าย ${fmtK(t.finance.expense)}` : undefined}
          color="bg-blue-50 border-blue-100"
        />
        <SummaryCard
          icon={<Wallet className="w-5 h-5 text-violet-500" />}
          label="เงินสดย่อยคงเหลือ"
          value={t ? `฿${fmtK(t.petty.top_up - t.petty.expense)}` : '—'}
          sub={t ? `รับ ${fmtK(t.petty.top_up)} / จ่าย ${fmtK(t.petty.expense)}` : undefined}
          color="bg-violet-50 border-violet-100"
        />
        <SummaryCard
          icon={<Building2 className="w-5 h-5 text-emerald-500" />}
          label="การเข้าพัก (ทั้งหมด)"
          value={t ? `${t.staysAllTime} ครั้ง` : '—'}
          sub={t ? `ช่วงนี้ ${t.stays.count} ครั้ง · ${t.stays.nights} คืน · ฿${fmtK(t.stays.revenue)}` : undefined}
          color="bg-emerald-50 border-emerald-100"
        />
        <SummaryCard
          icon={t && t.stock.low > 0
            ? <AlertTriangle className="w-5 h-5 text-amber-500" />
            : <Package className="w-5 h-5 text-slate-400" />}
          label="Stock คลัง"
          value={t ? `${t.stock.items} รายการ` : '—'}
          sub={t && t.stock.low > 0 ? `ใกล้หมด ${t.stock.low} รายการ` : 'ปกติ'}
          color={t && t.stock.low > 0 ? 'bg-amber-50 border-amber-100' : 'bg-slate-50 border-slate-100'}
        />
      </div>

      {/* ── Quick totals row ── */}
      {t && (
        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-xl border bg-green-50 border-green-100 p-3 text-center">
            <p className="text-xs text-green-600 font-medium flex items-center justify-center gap-1">
              <TrendingUp className="w-3 h-3" /> รายรับรวม
            </p>
            <p className="text-sm font-bold text-green-700 mt-0.5">฿{fmt(t.finance.income)}</p>
          </div>
          <div className="rounded-xl border bg-red-50 border-red-100 p-3 text-center">
            <p className="text-xs text-red-600 font-medium flex items-center justify-center gap-1">
              <TrendingDown className="w-3 h-3" /> รายจ่ายรวม
            </p>
            <p className="text-sm font-bold text-red-700 mt-0.5">฿{fmt(t.finance.expense)}</p>
          </div>
          <div className="rounded-xl border bg-orange-50 border-orange-100 p-3 text-center">
            <p className="text-xs text-orange-600 font-medium flex items-center justify-center gap-1">
              <Wallet className="w-3 h-3" /> เงินสดย่อย รายจ่าย
            </p>
            <p className="text-sm font-bold text-orange-700 mt-0.5">฿{fmt(t.petty.expense)}</p>
          </div>
        </div>
      )}

      {/* ── Graph section ── */}
      <div className="bg-white rounded-xl border">
        <div className="flex items-center gap-1 border-b px-4 pt-3">
          {([
            { key: 'finance', label: 'บัญชีการเงิน', icon: <Landmark className="w-3.5 h-3.5" /> },
            { key: 'petty',   label: 'เงินสดย่อย',   icon: <Wallet   className="w-3.5 h-3.5" /> },
            { key: 'stays',   label: 'การเข้าพัก',   icon: <Building2 className="w-3.5 h-3.5" /> },
          ] as const).map(tab => (
            <button
              key={tab.key}
              onClick={() => setGraphTab(tab.key)}
              className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-t border-b-2 transition-colors ${
                graphTab === tab.key
                  ? 'border-blue-500 text-blue-600 bg-blue-50'
                  : 'border-transparent text-slate-500 hover:text-slate-700'
              }`}
            >
              {tab.icon} {tab.label}
            </button>
          ))}
        </div>
        <div className="p-4">
          {loading
            ? <div className="h-64 flex items-center justify-center text-slate-400 text-sm">กำลังโหลด…</div>
            : graphTab === 'finance' ? <FinanceChart data={finChart} />
            : graphTab === 'petty'   ? <PettyChart   data={pettyChart} />
            :                          <StaysChart    data={staysChart} />}
        </div>
      </div>

      {/* ── By Property ── */}
      {!loading && data?.byProperty && data.byProperty.length > 0 && (
        <div className="bg-white rounded-xl border">
          <div className="px-4 py-3 border-b">
            <h2 className="text-sm font-semibold text-slate-700">สรุปตามแปลง</h2>
          </div>
          <Table wrapperClassName="rounded-none border-0">
            <TableHeader>
              <TableRow>
                <TableHead>แปลง</TableHead>
                <TableHead align="right">รายรับ (บัญชี)</TableHead>
                <TableHead align="right">รายจ่าย (บัญชี)</TableHead>
                <TableHead align="right">เงินสดย่อย</TableHead>
                <TableHead align="right">รายรับห้อง</TableHead>
                <TableHead align="right">เข้าพัก</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.byProperty.map(r => (
                <TableRow key={r.property}>
                  <TableCell className="font-medium text-slate-700">
                    <span className="mr-2 inline-block h-2 w-2 rounded-full" style={{ backgroundColor: propColor(r.property) }} />
                    {r.property}
                  </TableCell>
                  <TableCell align="right" tabular className="font-medium text-green-700">{r.finIncome > 0 ? fmt(r.finIncome) : '—'}</TableCell>
                  <TableCell align="right" tabular className="text-red-600">{r.finExpense > 0 ? fmt(r.finExpense) : '—'}</TableCell>
                  <TableCell align="right" tabular className="text-violet-700">{r.pettyExpense > 0 ? fmt(r.pettyExpense) : '—'}</TableCell>
                  <TableCell align="right" tabular className="font-medium text-emerald-700">{r.stayRevenue > 0 ? fmt(r.stayRevenue) : '—'}</TableCell>
                  <TableCell align="right" tabular className="text-slate-500">{r.stays > 0 ? `${r.stays} ครั้ง` : '—'}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {/* Property bar chart */}
          <div className="p-4 border-t">
            <p className="text-xs text-slate-500 mb-3">รายรับ / รายจ่าย แยกแปลง</p>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart
                data={data.byProperty.filter(r => r.finIncome > 0 || r.finExpense > 0)}
                layout="vertical"
                margin={{ left: 16, right: 16 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={v => fmtK(v)} />
                <YAxis type="category" dataKey="property" tick={{ fontSize: 11 }} width={56} />
                <Tooltip {...TT} formatter={(v: number) => `฿${fmt(v)}`} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="finIncome"  name="รายรับ"  fill="#22c55e" radius={[0, 3, 3, 0]} maxBarSize={20}>
                  {data.byProperty.map(r => (
                    <Cell key={r.property} fill={propColor(r.property)} />
                  ))}
                </Bar>
                <Bar dataKey="finExpense" name="รายจ่าย" fill="#f87171" radius={[0, 3, 3, 0]} maxBarSize={20} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* ── By Category ── */}
      {!loading && data?.byCategory && data.byCategory.length > 0 && (
        <div className="bg-white rounded-xl border">
          <div className="px-4 py-3 border-b">
            <h2 className="text-sm font-semibold text-slate-700">สรุปตามหมวด (บัญชีการเงิน)</h2>
          </div>
          <Table wrapperClassName="rounded-none border-0">
            <TableHeader>
              <TableRow>
                <TableHead>หมวด</TableHead>
                <TableHead align="right">รายรับ</TableHead>
                <TableHead align="right">รายจ่าย</TableHead>
                <TableHead align="right">สุทธิ</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.byCategory.slice(0, 15).map(r => {
                const net = r.income - r.expense;
                return (
                  <TableRow key={r.category}>
                    <TableCell className="font-medium text-slate-700">{r.category}</TableCell>
                    <TableCell align="right" tabular className="text-green-700">{r.income > 0 ? fmt(r.income) : '—'}</TableCell>
                    <TableCell align="right" tabular className="text-red-600">{r.expense > 0 ? fmt(r.expense) : '—'}</TableCell>
                    <TableCell align="right" tabular className={`font-medium ${net >= 0 ? 'text-blue-700' : 'text-orange-600'}`}>{fmt(net)}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
          {/* Category bar chart — expense only */}
          {data.byCategory.some(r => r.expense > 0) && (
            <div className="p-4 border-t">
              <p className="text-xs text-slate-500 mb-3">รายจ่ายตามหมวด (บาท)</p>
              <ResponsiveContainer width="100%" height={Math.max(180, data.byCategory.filter(r => r.expense > 0).length * 28)}>
                <BarChart
                  data={data.byCategory.filter(r => r.expense > 0).slice(0, 12)}
                  layout="vertical"
                  margin={{ left: 8, right: 16 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={v => fmtK(v)} />
                  <YAxis type="category" dataKey="category" tick={{ fontSize: 11 }} width={130} />
                  <Tooltip {...TT} formatter={(v: number) => `฿${fmt(v)}`} />
                  <Bar dataKey="expense" name="รายจ่าย" fill="#f87171" radius={[0, 3, 3, 0]} maxBarSize={20} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      )}

      {/* ── Stock low ── */}
      {data?.stockLow && data.stockLow.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
          <p className="text-sm font-semibold text-amber-700 mb-2 flex items-center gap-1.5">
            <AlertTriangle className="w-4 h-4" /> Stock ใกล้หมด
          </p>
          <div className="flex flex-wrap gap-2">
            {data.stockLow.map(item => (
              <span key={item.name} className="inline-flex items-center gap-1 bg-white border border-amber-200 rounded-full px-3 py-1 text-xs text-amber-800">
                {item.name}
                <span className="font-bold text-red-500 ml-1">{item.qty}</span>
              </span>
            ))}
          </div>
        </div>
      )}
    </PageShell>
  );
}

// ── Graph components ──────────────────────────────────────────────────

function FinanceChart({ data }: { data: { name: string; รายรับ: number; รายจ่าย: number; คงเหลือ: number }[] }) {
  return (
    <div className="space-y-4">
      <div>
        <p className="text-xs text-slate-500 mb-2">รายรับ / รายจ่าย บัญชีธนาคาร (บาท)</p>
        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={data} barGap={4}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
            <XAxis dataKey="name" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} tickFormatter={v => fmtK(v)} />
            <Tooltip {...TT} formatter={(v: number) => `฿${fmt(v)}`} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Bar dataKey="รายรับ"  fill="#22c55e" radius={[3, 3, 0, 0]} maxBarSize={44} />
            <Bar dataKey="รายจ่าย" fill="#f87171" radius={[3, 3, 0, 0]} maxBarSize={44} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div>
        <p className="text-xs text-slate-500 mb-2">คงเหลือสุทธิ (บาท)</p>
        <ResponsiveContainer width="100%" height={150}>
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
            <XAxis dataKey="name" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} tickFormatter={v => fmtK(v)} />
            <Tooltip {...TT} formatter={(v: number) => `฿${fmt(v)}`} />
            <Line dataKey="คงเหลือ" stroke="#3b82f6" strokeWidth={2} dot={{ r: 4, fill: '#3b82f6' }} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function PettyChart({ data }: { data: { name: string; รับเงิน: number; รายจ่าย: number }[] }) {
  return (
    <div>
      <p className="text-xs text-slate-500 mb-2">เงินสดย่อย รับ / จ่าย (บาท)</p>
      <ResponsiveContainer width="100%" height={260}>
        <BarChart data={data} barGap={4}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
          <XAxis dataKey="name" tick={{ fontSize: 11 }} />
          <YAxis tick={{ fontSize: 11 }} tickFormatter={v => fmtK(v)} />
          <Tooltip {...TT} formatter={(v: number) => `฿${fmt(v)}`} />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Bar dataKey="รับเงิน"  fill="#a78bfa" radius={[3, 3, 0, 0]} maxBarSize={44} />
          <Bar dataKey="รายจ่าย" fill="#fb923c" radius={[3, 3, 0, 0]} maxBarSize={44} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function StaysChart({ data }: { data: { name: string; การเข้าพัก: number; คืน: number; รายรับห้อง: number }[] }) {
  return (
    <div className="space-y-4">
      <div>
        <p className="text-xs text-slate-500 mb-2">การเข้าพัก — ครั้ง / คืน</p>
        <ResponsiveContainer width="100%" height={190}>
          <BarChart data={data} barGap={4}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
            <XAxis dataKey="name" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} />
            <Tooltip {...TT} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Bar dataKey="การเข้าพัก" fill="#34d399" radius={[3, 3, 0, 0]} maxBarSize={44} />
            <Bar dataKey="คืน"         fill="#6ee7b7" radius={[3, 3, 0, 0]} maxBarSize={44} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div>
        <p className="text-xs text-slate-500 mb-2">รายรับห้องพัก (บาท)</p>
        <ResponsiveContainer width="100%" height={150}>
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
            <XAxis dataKey="name" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} tickFormatter={v => fmtK(v)} />
            <Tooltip {...TT} formatter={(v: number) => `฿${fmt(v)}`} />
            <Line dataKey="รายรับห้อง" stroke="#10b981" strokeWidth={2} dot={{ r: 4, fill: '#10b981' }} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
