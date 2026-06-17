'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { backendUrl } from '@/lib/backend';
import { Button } from '@/components/ui/button';
import { CustomSelect } from '@/components/ui/custom-select';
import { PageShell } from '@/components/ui/page-shell';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ThaiDatePicker } from '@/components/ui/thai-date-picker';
import {
  Table, TableHeader, TableBody, TableFooter, TableRow, TableHead, TableCell,
} from '@/components/ui/table';
import {
  Dialog, DialogContent, DialogHeader, DialogBody, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer, ReferenceLine,
} from 'recharts';
import {
  TrendingUp, TrendingDown, DollarSign, Building2,
  Landmark, ChevronDown, ChevronUp,
} from 'lucide-react';

const TMC_ORG_ID = '1f52618c-09c4-49c5-a929-ea5060f26e7d';

const TH_MONTHS = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.',
                   'ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];
function thMonth(ym: string) {
  const [y, m] = ym.split('-').map(Number);
  return `${TH_MONTHS[m - 1]} ${String(y + 543).slice(-2)}`;
}
function fmt(n: number) { return n.toLocaleString('th-TH', { minimumFractionDigits: 0, maximumFractionDigits: 0 }); }
function fmtK(n: number) {
  if (Math.abs(n) >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (Math.abs(n) >= 1_000)     return (n / 1_000).toFixed(0) + 'K';
  return n.toLocaleString('th-TH');
}

const PROPERTY_COLORS: Record<string, string> = {
  TMC1: '#3b82f6', TMC2: '#8b5cf6', 'TMC3-4': '#ec4899',
  TMC5: '#f59e0b', TMC6: '#14b8a6', TMC7: '#10b981',
};
function propColor(p: string) { return PROPERTY_COLORS[p] ?? '#6366f1'; }

const RANGE_OPTS = [
  { value: '6',  label: '6 เดือนล่าสุด' },
  { value: '12', label: '12 เดือนล่าสุด' },
  { value: '24', label: '24 เดือนล่าสุด' },
  { value: '36', label: '36 เดือนล่าสุด' },
];

function rangeFromMonths(n: number) {
  const to   = new Date();
  const from = new Date();
  from.setMonth(from.getMonth() - n + 1);
  from.setDate(1);
  return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) };
}

// ── Types ────────────────────────────────────────────────────────────
type PropRow = {
  code: string; investment: number; investor_cost: number;
  income: number; opex: number; petty: number; shared_alloc: number; net: number;
};
type MonthRow = {
  month: string;
  properties: PropRow[];
  totals: { income: number; opex: number; petty: number; investor_cost: number; shared_expense: number; net: number };
};
type InvestmentCfg = {
  id: string; property_code: string; investment_amount: number;
  annual_rate: number; starts_at: string; ends_at: string | null; note: string | null;
};
type CostData = {
  months: MonthRow[];
  grand: { income: number; opex: number; petty: number; investor_cost: number; shared_expense: number; net: number };
  byProperty: PropRow[];
  investments: InvestmentCfg[];
};

// ── SummaryCard ─────────────────────────────────────────────────────
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

// ── Edit Investment Dialog ────────────────────────────────────────────
function EditInvestmentDialog({
  cfg, onSave, onClose, saving,
}: {
  cfg: InvestmentCfg;
  onSave: (patch: Partial<InvestmentCfg>) => void;
  onClose: () => void;
  saving: boolean;
}) {
  const [form, setForm] = useState({
    investment_amount: String(cfg.investment_amount),
    annual_rate: String((cfg.annual_rate * 100).toFixed(2)),
    starts_at: cfg.starts_at,
    note: cfg.note ?? '',
  });

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle>แก้ไขต้นทุน {cfg.property_code}</DialogTitle>
        </DialogHeader>
        <DialogBody>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="inv-amount">เงินลงทุน (บาท)</Label>
            <Input
              id="inv-amount"
              type="number"
              value={form.investment_amount}
              onChange={e => setForm(f => ({ ...f, investment_amount: e.target.value }))}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="inv-rate">อัตราดอกเบี้ย (% ต่อปี)</Label>
            <Input
              id="inv-rate"
              type="number"
              step="0.01"
              value={form.annual_rate}
              onChange={e => setForm(f => ({ ...f, annual_rate: e.target.value }))}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="inv-start">วันเริ่มนับ</Label>
            <ThaiDatePicker
              value={form.starts_at}
              onChange={(v) => setForm(f => ({ ...f, starts_at: v }))}
              placeholder="เลือกวันที่เริ่มนับ"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="inv-note">หมายเหตุ</Label>
            <Input
              id="inv-note"
              value={form.note}
              onChange={e => setForm(f => ({ ...f, note: e.target.value }))}
            />
          </div>
        </div>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>ยกเลิก</Button>
          <Button
            disabled={saving}
            onClick={() => onSave({
              investment_amount: Number(form.investment_amount),
              annual_rate: Number(form.annual_rate) / 100,
              starts_at: form.starts_at,
              note: form.note || null,
            })}
          >
            {saving ? 'กำลังบันทึก…' : 'บันทึก'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Page ─────────────────────────────────────────────────────────────
export default function TmcCostsPage() {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [data, setData]       = useState<CostData | null>(null);
  const [loading, setLoading] = useState(true);
  const [range, setRange]     = useState('12');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<InvestmentCfg | null>(null);
  const [saving, setSaving]   = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data: sess } = await supabase.auth.getSession();
    const token = sess.session?.access_token ?? '';
    const { from, to } = rangeFromMonths(Number(range));
    const res = await fetch(
      backendUrl(`/tmc/costs?orgId=${TMC_ORG_ID}&from=${from}&to=${to}`),
      { headers: { Authorization: `Bearer ${token}` } },
    );
    setData(await res.json());
    setLoading(false);
  }, [supabase, range]);

  useEffect(() => { load(); }, [load]);

  const handleSave = async (patch: Partial<InvestmentCfg>) => {
    if (!editing) return;
    setSaving(true);
    const { data: sess } = await supabase.auth.getSession();
    const token = sess.session?.access_token ?? '';
    await fetch(backendUrl('/tmc/investments'), {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ orgId: TMC_ORG_ID, id: editing.id, ...patch }),
    });
    setSaving(false);
    setEditing(null);
    load();
  };

  const g = data?.grand;

  const netChartData = (data?.months ?? []).map(row => ({
    name: thMonth(row.month),
    รายรับ: row.totals.income,
    'ต้นทุนดำเนินการ': row.totals.opex + row.totals.petty,
    'ต้นทุนนักลงทุน': row.totals.investor_cost,
    'ส่วนกลาง': row.totals.shared_expense,
    กำไรสุทธิ: row.totals.net,
  }));

  const propChartData = (data?.byProperty ?? []).map(p => ({
    name: p.code,
    รายรับ: p.income,
    'ต้นทุนดำเนินการ': p.opex + p.petty,
    'ต้นทุนนักลงทุน': p.investor_cost,
    'ส่วนกลาง': p.shared_alloc,
    กำไรสุทธิ: p.net,
  }));

  return (
    <PageShell
      width="full"
      icon={<TrendingUp className="h-6 w-6" />}
      title="ต้นทุน & กำไรสุทธิ"
      description="TMC — ต้นทุนนักลงทุน 8%/ปี + ค่าใช้จ่ายส่วนกลาง"
      actions={
        <>
          <CustomSelect value={range} onChange={setRange} options={RANGE_OPTS} className="w-44" />
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            {loading ? 'กำลังโหลด…' : 'รีเฟรช'}
          </Button>
        </>
      }
    >
      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
        <SummaryCard
          icon={<TrendingUp className="w-5 h-5 text-green-500" />}
          label="รายรับรวม"
          value={g ? `฿${fmtK(g.income)}` : '—'}
          color="bg-green-50 border-green-100"
        />
        <SummaryCard
          icon={<TrendingDown className="w-5 h-5 text-red-500" />}
          label="ค่าดำเนินการ"
          value={g ? `฿${fmtK(g.opex + g.petty)}` : '—'}
          sub={g ? `บัญชี ${fmtK(g.opex)} + เงินสดย่อย ${fmtK(g.petty)}` : undefined}
          color="bg-red-50 border-red-100"
        />
        <SummaryCard
          icon={<Landmark className="w-5 h-5 text-violet-500" />}
          label="ต้นทุนนักลงทุน"
          value={g ? `฿${fmtK(g.investor_cost)}` : '—'}
          sub="8% ต่อปี"
          color="bg-violet-50 border-violet-100"
        />
        <SummaryCard
          icon={<Building2 className="w-5 h-5 text-amber-500" />}
          label="ค่าใช้จ่ายส่วนกลาง"
          value={g ? `฿${fmtK(g.shared_expense)}` : '—'}
          sub="แบ่งเฉลี่ยตามแปลงที่ active"
          color="bg-amber-50 border-amber-100"
        />
        <SummaryCard
          icon={<DollarSign className="w-5 h-5 text-blue-500" />}
          label="กำไรสุทธิรวม"
          value={g ? `฿${fmtK(g.net)}` : '—'}
          sub="หลังหักต้นทุนทั้งหมด"
          color={g && g.net >= 0 ? 'bg-blue-50 border-blue-100' : 'bg-orange-50 border-orange-100'}
        />
      </div>

      {/* Monthly Net Profit Chart */}
      <div className="bg-white rounded-xl border">
        <div className="px-4 py-3 border-b">
          <h2 className="text-sm font-semibold text-slate-700">กำไรสุทธิรายเดือน (รวมทุกแปลง)</h2>
        </div>
        <div className="p-4">
          {loading
            ? <div className="h-64 flex items-center justify-center text-slate-400 text-sm">กำลังโหลด…</div>
            : (
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={netChartData} barGap={2}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={v => fmtK(v)} />
                  <Tooltip {...TT} formatter={(v: number) => `฿${fmt(v)}`} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <ReferenceLine y={0} stroke="#94a3b8" strokeDasharray="4 2" />
                  <Bar dataKey="รายรับ"          fill="#22c55e" radius={[3,3,0,0]} maxBarSize={36} />
                  <Bar dataKey="ต้นทุนดำเนินการ"  fill="#f87171" radius={[3,3,0,0]} maxBarSize={36} />
                  <Bar dataKey="ต้นทุนนักลงทุน"  fill="#a78bfa" radius={[3,3,0,0]} maxBarSize={36} />
                  <Bar dataKey="ส่วนกลาง"         fill="#fbbf24" radius={[3,3,0,0]} maxBarSize={36} />
                  <Bar dataKey="กำไรสุทธิ"        fill="#3b82f6" radius={[3,3,0,0]} maxBarSize={36} />
                </BarChart>
              </ResponsiveContainer>
            )}
        </div>
      </div>

      {/* Per-property Summary */}
      {!loading && data?.byProperty && data.byProperty.length > 0 && (
        <div className="bg-white rounded-xl border">
          <div className="px-4 py-3 border-b">
            <h2 className="text-sm font-semibold text-slate-700">สรุปกำไรสุทธิแต่ละแปลง</h2>
          </div>
          <Table wrapperClassName="rounded-none border-0">
            <TableHeader>
              <TableRow>
                <TableHead>แปลง</TableHead>
                <TableHead align="right">เงินลงทุน</TableHead>
                <TableHead align="right">รายรับ</TableHead>
                <TableHead align="right">ค่าดำเนินการ</TableHead>
                <TableHead align="right">ต้นทุนนักลงทุน</TableHead>
                <TableHead align="right">ส่วนกลาง</TableHead>
                <TableHead align="right">กำไรสุทธิ</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.byProperty.map(r => (
                <TableRow key={r.code}>
                  <TableCell className="font-medium text-slate-700">
                    <span className="mr-2 inline-block h-2 w-2 rounded-full" style={{ backgroundColor: propColor(r.code) }} />
                    {r.code}
                  </TableCell>
                  <TableCell align="right" tabular className="text-slate-500">{fmt(r.investment)}</TableCell>
                  <TableCell align="right" tabular className="font-medium text-green-700">{fmt(r.income)}</TableCell>
                  <TableCell align="right" tabular className="text-red-600">{fmt(r.opex + r.petty)}</TableCell>
                  <TableCell align="right" tabular className="text-violet-700">{fmt(r.investor_cost)}</TableCell>
                  <TableCell align="right" tabular className="text-amber-700">{fmt(r.shared_alloc)}</TableCell>
                  <TableCell align="right" tabular className={`font-bold ${r.net >= 0 ? 'text-blue-700' : 'text-red-600'}`}>{fmt(r.net)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
            <TableFooter>
              <TableRow>
                <TableCell colSpan={2} className="font-bold text-slate-700">รวม</TableCell>
                <TableCell align="right" tabular className="font-bold text-green-700">{g ? fmt(g.income) : '—'}</TableCell>
                <TableCell align="right" tabular className="font-bold text-red-600">{g ? fmt(g.opex + g.petty) : '—'}</TableCell>
                <TableCell align="right" tabular className="font-bold text-violet-700">{g ? fmt(g.investor_cost) : '—'}</TableCell>
                <TableCell align="right" tabular className="font-bold text-amber-700">{g ? fmt(g.shared_expense) : '—'}</TableCell>
                <TableCell align="right" tabular className={`font-bold ${g && g.net >= 0 ? 'text-blue-700' : 'text-red-600'}`}>{g ? fmt(g.net) : '—'}</TableCell>
              </TableRow>
            </TableFooter>
          </Table>

          {/* Bar chart by property */}
          <div className="p-4 border-t">
            <p className="text-xs text-slate-500 mb-3">เปรียบเทียบแต่ละแปลง</p>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={propChartData} layout="vertical" margin={{ left: 8, right: 16 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={v => fmtK(v)} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={56} />
                <Tooltip {...TT} formatter={(v: number) => `฿${fmt(v)}`} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <ReferenceLine x={0} stroke="#94a3b8" strokeDasharray="4 2" />
                <Bar dataKey="รายรับ"          fill="#22c55e" radius={[0,3,3,0]} maxBarSize={20} />
                <Bar dataKey="ต้นทุนดำเนินการ"  fill="#f87171" radius={[0,3,3,0]} maxBarSize={20} />
                <Bar dataKey="ต้นทุนนักลงทุน"  fill="#a78bfa" radius={[0,3,3,0]} maxBarSize={20} />
                <Bar dataKey="กำไรสุทธิ"        fill="#3b82f6" radius={[0,3,3,0]} maxBarSize={20} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Monthly Breakdown Table (collapsible) */}
      {!loading && data?.months && (
        <div className="bg-white rounded-xl border">
          <div className="px-4 py-3 border-b">
            <h2 className="text-sm font-semibold text-slate-700">รายละเอียดรายเดือน แยกแปลง</h2>
          </div>
          <div className="divide-y">
            {data.months.filter(m => m.properties.length > 0).map(row => {
              const isOpen = expanded.has(row.month);
              return (
                <div key={row.month}>
                  {/* Month header row */}
                  <button
                    className="w-full flex items-center justify-between px-4 py-3 hover:bg-slate-50 text-left"
                    onClick={() => setExpanded(prev => {
                      const next = new Set(prev);
                      isOpen ? next.delete(row.month) : next.add(row.month);
                      return next;
                    })}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="text-sm font-semibold text-slate-700 w-16 shrink-0">{thMonth(row.month)}</span>
                      <div className="flex items-center gap-3 text-xs flex-wrap">
                        <span className="text-green-700">รายรับ ฿{fmtK(row.totals.income)}</span>
                        <span className="text-violet-700">นักลงทุน ฿{fmtK(row.totals.investor_cost)}</span>
                        <span className="text-amber-700">ส่วนกลาง ฿{fmtK(row.totals.shared_expense)}</span>
                        <span className={`font-bold ${row.totals.net >= 0 ? 'text-blue-700' : 'text-red-600'}`}>
                          กำไร ฿{fmtK(row.totals.net)}
                        </span>
                      </div>
                    </div>
                    {isOpen ? <ChevronUp className="w-4 h-4 text-slate-400 shrink-0" /> : <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />}
                  </button>

                  {/* Expanded per-property rows */}
                  {isOpen && (
                    <div className="border-t bg-slate-50">
                      <Table wrapperClassName="rounded-none border-0 bg-transparent">
                        <TableHeader>
                          <TableRow>
                            <TableHead>แปลง</TableHead>
                            <TableHead align="right">รายรับ</TableHead>
                            <TableHead align="right">ค่าดำเนินการ</TableHead>
                            <TableHead align="right">ต้นทุนนักลงทุน/เดือน</TableHead>
                            <TableHead align="right">ส่วนกลางจัดสรร</TableHead>
                            <TableHead align="right">กำไรสุทธิ</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {row.properties.map(pr => (
                            <TableRow key={pr.code}>
                              <TableCell className="font-medium text-slate-700">
                                <span className="mr-2 inline-block h-2 w-2 rounded-full" style={{ backgroundColor: propColor(pr.code) }} />
                                {pr.code}
                              </TableCell>
                              <TableCell align="right" tabular className="text-green-700">{fmt(pr.income)}</TableCell>
                              <TableCell align="right" tabular className="text-red-600">{fmt(pr.opex + pr.petty)}</TableCell>
                              <TableCell align="right" tabular className="text-violet-700">{fmt(pr.investor_cost)}</TableCell>
                              <TableCell align="right" tabular className="text-amber-700">{fmt(pr.shared_alloc)}</TableCell>
                              <TableCell align="right" tabular className={`font-bold ${pr.net >= 0 ? 'text-blue-700' : 'text-red-600'}`}>{fmt(pr.net)}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Investment Config Section */}
      {!loading && data?.investments && data.investments.length > 0 && (
        <div className="bg-white rounded-xl border">
          <div className="px-4 py-3 border-b">
            <h2 className="text-sm font-semibold text-slate-700">ตั้งค่าเงินลงทุน</h2>
            <p className="text-xs text-slate-400 mt-0.5">ต้นทุนนักลงทุนรายเดือน = เงินลงทุน × อัตรา / 12</p>
          </div>
          <Table wrapperClassName="rounded-none border-0">
            <TableHeader>
              <TableRow>
                <TableHead>แปลง</TableHead>
                <TableHead align="right">เงินลงทุน</TableHead>
                <TableHead align="right">อัตรา</TableHead>
                <TableHead align="right">ต้นทุน/เดือน</TableHead>
                <TableHead>เริ่มจ่าย</TableHead>
                <TableHead>หมายเหตุ</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.investments.map(inv => {
                const monthly = (inv.investment_amount * inv.annual_rate) / 12;
                return (
                  <TableRow key={inv.id} clickable onClick={() => setEditing(inv)}>
                    <TableCell className="font-medium text-slate-700">
                      <span className="mr-2 inline-block h-2 w-2 rounded-full" style={{ backgroundColor: propColor(inv.property_code) }} />
                      {inv.property_code}
                    </TableCell>
                    <TableCell align="right" tabular className="text-slate-700">{fmt(inv.investment_amount)}</TableCell>
                    <TableCell align="right" tabular className="text-slate-500">{(inv.annual_rate * 100).toFixed(1)}%</TableCell>
                    <TableCell align="right" tabular className="font-medium text-violet-700">{fmt(monthly)}</TableCell>
                    <TableCell className="text-slate-600">{inv.starts_at}</TableCell>
                    <TableCell className="text-slate-400">{inv.note ?? '—'}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {editing && (
        <EditInvestmentDialog
          cfg={editing}
          onSave={handleSave}
          onClose={() => setEditing(null)}
          saving={saving}
        />
      )}
    </PageShell>
  );
}
