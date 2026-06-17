'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { useParams } from 'next/navigation';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { backendUrl } from '@/lib/backend';
import { Button } from '@/components/ui/button';
import { PageShell } from '@/components/ui/page-shell';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { CustomSelect } from '@/components/ui/custom-select';
import { ThaiDatePicker } from '@/components/ui/thai-date-picker';
import {
  Dialog, DialogContent, DialogHeader, DialogBody, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { StatusBadge, type BadgeTone } from '@/components/ui/badge';
import {
  Table, TableHeader, TableBody, TableFooter, TableRow, TableHead, TableCell, TableEmpty,
} from '@/components/ui/table';
import {
  Building2, TrendingUp, Loader2, AlertCircle, Plus,
  Trash2, ClipboardList, BadgeCheck, Clock,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────
type B2gOrder = {
  id: string;
  seq_no: number | null;
  customer_name: string;
  department: string | null;
  company: string | null;
  qt_reference: string | null;
  product_description: string | null;
  start_date: string | null;
  price_incl_vat: number | null;
  price_excl_vat: number | null;
  withholding_tax: number | null;
  net_receivable: number | null;
  cost_price: number | null;
  gross_profit: number | null;
  security_deposit: number | null;
  transfer_date: string | null;
  transfer_round1: string | null;
  transfer_round2: string | null;
  customer_change: number | null;
  customer_change_slip: string | null;
  petty_cash: number | null;
  petty_cash_slip: string | null;
  transport_buy: number | null;
  transport_sell: number | null;
  transport_other: number | null;
  operate_89: number | null;
  total_cost_89: number | null;
  net_profit_89: number | null;
  profit_pct: number | null;
  contract_date: string | null;
  payment_order_date: string | null;
  delivery_date: string | null;
  receipt_date: string | null;
  duration_days: number | null;
  job_status: string | null;
  finance_payment_date: string | null;
  support_payment_date: string | null;
  commission_payment_date: string | null;
  notes: string | null;
  created_at: string;
};

type FormData = Omit<B2gOrder, 'id' | 'created_at'>;

const EMPTY_FORM: FormData = {
  seq_no: null, customer_name: '', department: null, company: null,
  qt_reference: null, product_description: null, start_date: null,
  price_incl_vat: null, price_excl_vat: null, withholding_tax: null,
  net_receivable: null, cost_price: null, gross_profit: null, security_deposit: null,
  transfer_date: null, transfer_round1: null, transfer_round2: null,
  customer_change: null, customer_change_slip: null, petty_cash: null,
  petty_cash_slip: null, transport_buy: null, transport_sell: null,
  transport_other: null, operate_89: null, total_cost_89: null,
  net_profit_89: null, profit_pct: null, contract_date: null,
  payment_order_date: null, delivery_date: null, receipt_date: null,
  duration_days: null, job_status: null, finance_payment_date: null,
  support_payment_date: null, commission_payment_date: null, notes: null,
};

// ─── Constants ────────────────────────────────────────────────────────────────
const STATUS_OPTS = [
  { value: '', label: 'ทุกสถานะ' },
  { value: 'รับเช็คแล้ว', label: 'รับเช็คแล้ว' },
  { value: 'ส่งสินค้าแล้ว รอรับเช็ค', label: 'ส่งสินค้าแล้ว รอรับเช็ค' },
  { value: 'เซ็นสัญญาแล้ว รอส่งของ', label: 'เซ็นสัญญาแล้ว รอส่งของ' },
  { value: '_empty_', label: 'ยังไม่ระบุ' },
];
const COMPANY_OPTS = [
  { value: '', label: 'ทุกบริษัท' },
  { value: '89 Global Work', label: '89 Global Work' },
  { value: 'P2P Supply', label: 'P2P Supply' },
];
const COMPANY_FORM_OPTS = [
  { value: '', label: '— เลือกบริษัท —' },
  { value: '89 Global Work', label: '89 Global Work' },
  { value: 'P2P Supply', label: 'P2P Supply' },
];
const STATUS_FORM_OPTS = [
  { value: '', label: '— เลือกสถานะ —' },
  { value: 'เซ็นสัญญาแล้ว รอส่งของ', label: 'เซ็นสัญญาแล้ว รอส่งของ' },
  { value: 'ส่งสินค้าแล้ว รอรับเช็ค', label: 'ส่งสินค้าแล้ว รอรับเช็ค' },
  { value: 'รับเช็คแล้ว', label: 'รับเช็คแล้ว' },
];
const SLIP_FORM_OPTS = [
  { value: '', label: '— ยังไม่ดำเนินการ —' },
  { value: 'Done', label: 'Done ✓' },
  { value: '-', label: '- (ไม่มี)' },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────
function fmt(n: number | null | undefined, decimals = 2) {
  if (n == null) return '—';
  return n.toLocaleString('th-TH', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}
function fmtDate(s: string | null | undefined) {
  if (!s) return '—';
  const d = new Date(s);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('th-TH', { year: '2-digit', month: 'short', day: 'numeric' });
}
function n(v: number | null) { return v ?? 0; }

function JobStatusBadge({ status }: { status: string | null }) {
  if (!status) return <span className="text-slate-300 text-xs">ยังไม่ระบุ</span>;
  const map: Record<string, BadgeTone> = {
    'รับเช็คแล้ว': 'success',
    'ส่งสินค้าแล้ว รอรับเช็ค': 'warning',
    'เซ็นสัญญาแล้ว รอส่งของ': 'info',
  };
  return <StatusBadge tone={map[status] ?? 'neutral'}>{status}</StatusBadge>;
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function B2gOrdersPage() {
  const { orgSlug } = useParams<{ orgSlug: string }>();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);

  const [orgId,   setOrgId]   = useState<string | null>(null);
  const [orders,  setOrders]  = useState<B2gOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);
  const [token,   setToken]   = useState<string | null>(null);

  // Filters
  const [filterStatus,  setFilterStatus]  = useState('');
  const [filterCompany, setFilterCompany] = useState('');
  const [search,        setSearch]        = useState('');

  // Dialog
  const [dlgOpen,  setDlgOpen]  = useState(false);
  const [editing,  setEditing]  = useState<B2gOrder | null>(null);
  const [form,     setForm]     = useState<FormData>(EMPTY_FORM);
  const [saving,   setSaving]   = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  // Active tab in dialog
  const [activeTab, setActiveTab] = useState<'basic' | 'finance' | 'timeline' | 'internal'>('basic');

  // ─── Load ──────────────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    try {
      setLoading(true); setError(null);

      const { data: org, error: orgErr } = await supabase
        .from('organizations').select('id').eq('slug', orgSlug).single();
      if (orgErr) throw new Error('ไม่พบข้อมูลองค์กร');

      const { data: sess } = await supabase.auth.getSession();
      const tok = sess.session?.access_token;
      if (!tok) throw new Error('กรุณาเข้าสู่ระบบใหม่');

      setOrgId(org.id); setToken(tok);

      const res = await fetch(backendUrl(`/b2g/orders?orgId=${org.id}`), {
        headers: { Authorization: `Bearer ${tok}` },
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || 'เกิดข้อผิดพลาด');
      }
      const json = await res.json();
      setOrders(json.orders ?? []);
    } catch (e: unknown) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [supabase, orgSlug]);

  useEffect(() => { void load(); }, [load]);

  // ─── Filtered orders ───────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    return orders.filter(o => {
      if (filterStatus === '_empty_' && o.job_status) return false;
      if (filterStatus && filterStatus !== '_empty_' && o.job_status !== filterStatus) return false;
      if (filterCompany && o.company !== filterCompany) return false;
      if (search) {
        const q = search.toLowerCase();
        return (
          o.customer_name?.toLowerCase().includes(q) ||
          o.department?.toLowerCase().includes(q) ||
          o.qt_reference?.toLowerCase().includes(q) ||
          o.product_description?.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [orders, filterStatus, filterCompany, search]);

  // ─── Summary stats ─────────────────────────────────────────────────────────
  const stats = useMemo(() => {
    const total      = filtered.reduce((s, o) => s + n(o.price_incl_vat), 0);
    const profit     = filtered.reduce((s, o) => s + n(o.net_profit_89), 0);
    const done       = filtered.filter(o => o.job_status === 'รับเช็คแล้ว').length;
    const waiting    = filtered.filter(o => o.job_status === 'ส่งสินค้าแล้ว รอรับเช็ค').length;
    const processing = filtered.filter(o => o.job_status === 'เซ็นสัญญาแล้ว รอส่งของ').length;
    return { total, profit, done, waiting, processing };
  }, [filtered]);

  // ─── Dialog helpers ────────────────────────────────────────────────────────
  function openAdd() {
    setEditing(null);
    setForm({ ...EMPTY_FORM });
    setActiveTab('basic');
    setDlgOpen(true);
  }
  function openEdit(o: B2gOrder) {
    setEditing(o);
    const { id: _id, created_at: _ca, ...rest } = o;
    setForm(rest as FormData);
    setActiveTab('basic');
    setDlgOpen(true);
  }
  function setF<K extends keyof FormData>(key: K, val: FormData[K]) {
    setForm(prev => ({ ...prev, [key]: val }));
  }
  function numF(key: keyof FormData, raw: string) {
    const v = raw === '' ? null : parseFloat(raw);
    setForm(prev => ({ ...prev, [key]: isNaN(v as number) ? null : v }));
  }

  async function handleSave() {
    if (!orgId || !token) return;
    if (!form.customer_name?.trim()) { alert('กรุณาระบุชื่อลูกค้า'); return; }
    setSaving(true);
    try {
      const url = editing
        ? backendUrl(`/b2g/orders/${editing.id}?orgId=${orgId}`)
        : backendUrl(`/b2g/orders?orgId=${orgId}`);
      const method = editing ? 'PUT' : 'POST';
      const res = await fetch(url, {
        method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || 'บันทึกไม่สำเร็จ');
      }
      setDlgOpen(false);
      await load();
    } catch (e: unknown) {
      alert((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!orgId || !token) return;
    if (!confirm('ยืนยันลบรายการนี้?')) return;
    setDeleting(id);
    try {
      const res = await fetch(backendUrl(`/b2g/orders/${id}?orgId=${orgId}`), {
        method: 'DELETE', headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) { const j = await res.json().catch(() => ({})); throw new Error(j.error || 'ลบไม่สำเร็จ'); }
      await load();
    } catch (e: unknown) {
      alert((e as Error).message);
    } finally {
      setDeleting(null);
    }
  }

  // ─── Render ────────────────────────────────────────────────────────────────
  return (
    <PageShell
      width="wide"
      icon={<Building2 className="h-6 w-6" />}
      title="B2G — คำสั่งซื้อภาครัฐ"
      description="ติดตามคำสั่งซื้อและผลกำไร Business-to-Government"
      actions={
        <>
          <Button size="sm" onClick={openAdd}>
            <Plus className="w-3.5 h-3.5 mr-1.5" />
            เพิ่มรายการ
          </Button>
        </>
      }
    >

      {loading ? (
        <div className="flex h-48 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
        </div>
      ) : error ? (
        <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          <AlertCircle className="h-4 w-4 shrink-0" /><span>{error}</span>
        </div>
      ) : (
        <>
          {/* Summary Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
            <SummaryCard
              icon={<ClipboardList className="w-4 h-4 text-slate-500" />}
              label="รายการทั้งหมด"
              value={`${filtered.length} รายการ`}
              sub={`จาก ${orders.length} รายการ`}
              bg="bg-slate-50"
            />
            <SummaryCard
              icon={<TrendingUp className="w-4 h-4 text-indigo-500" />}
              label="ยอดรวม (incl.VAT)"
              value={`฿${fmt(stats.total, 0)}`}
              bg="bg-indigo-50"
            />
            <SummaryCard
              icon={<TrendingUp className="w-4 h-4 text-emerald-500" />}
              label="กำไรสุทธิ 89"
              value={`฿${fmt(stats.profit, 0)}`}
              bg="bg-emerald-50"
            />
            <SummaryCard
              icon={<BadgeCheck className="w-4 h-4 text-green-500" />}
              label="รับเช็คแล้ว"
              value={`${stats.done} รายการ`}
              bg="bg-green-50"
            />
            <SummaryCard
              icon={<Clock className="w-4 h-4 text-yellow-500" />}
              label="รอดำเนินการ"
              value={`${stats.waiting + stats.processing} รายการ`}
              sub={`ส่งของแล้ว ${stats.waiting} | รอส่ง ${stats.processing}`}
              bg="bg-yellow-50"
            />
          </div>

          {/* Filters */}
          <div className="flex flex-wrap items-center gap-2">
            <Input
              placeholder="ค้นหา QT, สินค้า, แผนก…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-52 h-8 text-sm"
            />
            <CustomSelect
              value={filterStatus}
              onChange={setFilterStatus}
              options={STATUS_OPTS}
              className="w-44"
            />
            <CustomSelect
              value={filterCompany}
              onChange={setFilterCompany}
              options={COMPANY_OPTS}
              className="w-36"
            />
          </div>

          {/* Table */}
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead align="center">#</TableHead>
                <TableHead>QT / สินค้า</TableHead>
                <TableHead>แผนก</TableHead>
                <TableHead>บริษัท</TableHead>
                <TableHead align="right">ยอดเสนอ</TableHead>
                <TableHead align="right">ทุน</TableHead>
                <TableHead align="right">กำไร 89</TableHead>
                <TableHead align="right">%</TableHead>
                <TableHead align="center">สัญญา</TableHead>
                <TableHead align="center">รับเงิน</TableHead>
                <TableHead align="center">สถานะ</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableEmpty colSpan={11}>ไม่มีรายการ</TableEmpty>
              ) : filtered.map((o) => (
                <TableRow key={o.id} clickable onClick={() => openEdit(o)}>
                  <TableCell align="center" tabular className="text-xs text-slate-400">{o.seq_no ?? '—'}</TableCell>
                  <TableCell>
                    <div className="text-xs font-medium text-slate-800">{o.qt_reference ?? '—'}</div>
                    <div className="mt-0.5 line-clamp-1 text-xs text-slate-500">{o.product_description ?? '—'}</div>
                  </TableCell>
                  <TableCell className="text-xs text-slate-600">{o.department ?? '—'}</TableCell>
                  <TableCell>
                    <span className={`whitespace-nowrap rounded px-1.5 py-0.5 text-xs font-medium ${
                      o.company === '89 Global Work' ? 'bg-indigo-100 text-indigo-700' : 'bg-orange-100 text-orange-700'
                    }`}>{o.company ?? '—'}</span>
                  </TableCell>
                  <TableCell align="right" tabular className="text-xs text-slate-700">{o.price_incl_vat ? `฿${fmt(o.price_incl_vat, 0)}` : '—'}</TableCell>
                  <TableCell align="right" tabular className="text-xs text-slate-600">{o.total_cost_89 ? `฿${fmt(o.total_cost_89, 0)}` : '—'}</TableCell>
                  <TableCell align="right" tabular className="text-xs">
                    {o.net_profit_89 != null ? (
                      <span className={o.net_profit_89 < 0 ? 'text-red-600' : 'text-emerald-600'}>
                        {o.net_profit_89 < 0 ? '' : '+'}฿{fmt(o.net_profit_89, 0)}
                      </span>
                    ) : '—'}
                  </TableCell>
                  <TableCell align="right" tabular className="text-xs">
                    {o.profit_pct != null ? (
                      <span className={o.profit_pct < 0 ? 'text-red-500' : 'text-slate-600'}>{o.profit_pct.toFixed(1)}%</span>
                    ) : '—'}
                  </TableCell>
                  <TableCell align="center" className="text-xs text-slate-500">{fmtDate(o.contract_date)}</TableCell>
                  <TableCell align="center" className="text-xs text-slate-500">{fmtDate(o.receipt_date)}</TableCell>
                  <TableCell align="center"><JobStatusBadge status={o.job_status} /></TableCell>
                </TableRow>
              ))}
            </TableBody>
            {filtered.length > 0 && (
              <TableFooter>
                <TableRow>
                  <TableCell colSpan={4} align="right" className="text-xs text-slate-500">รวม {filtered.length} รายการ</TableCell>
                  <TableCell align="right" tabular className="text-xs">฿{fmt(stats.total, 0)}</TableCell>
                  <TableCell align="right" tabular className="text-xs">฿{fmt(filtered.reduce((s, o) => s + n(o.total_cost_89), 0), 0)}</TableCell>
                  <TableCell align="right" tabular className="text-xs text-emerald-700">฿{fmt(stats.profit, 0)}</TableCell>
                  <TableCell align="right" tabular className="text-xs text-slate-500">{stats.total > 0 ? ((stats.profit / stats.total) * 100).toFixed(1) : '0.0'}%</TableCell>
                  <TableCell colSpan={3} />
                </TableRow>
              </TableFooter>
            )}
          </Table>
        </>
      )}

      {/* ─── Add / Edit Dialog ─────────────────────────────────────────────────── */}
      <Dialog open={dlgOpen} onOpenChange={setDlgOpen}>
        <DialogContent size="xl">
          <DialogHeader>
            <DialogTitle>{editing ? 'แก้ไขรายการ B2G' : 'เพิ่มรายการ B2G'}</DialogTitle>
          </DialogHeader>

          <DialogBody>
          {/* Tab bar */}
          <div className="flex gap-1 border-b mb-4 -mx-1 px-1">
            {([
              ['basic',    'ข้อมูลพื้นฐาน'],
              ['finance',  'การเงิน'],
              ['internal', 'ภายใน 89'],
              ['timeline', 'Timeline & สถานะ'],
            ] as const).map(([key, label]) => (
              <button key={key} onClick={() => setActiveTab(key)}
                className={`px-3 py-1.5 text-sm rounded-t transition-colors ${
                  activeTab === key
                    ? 'bg-white border border-b-white -mb-px font-medium text-indigo-600'
                    : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="space-y-3">
            {/* ── Tab: Basic ── */}
            {activeTab === 'basic' && (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label htmlFor="seq_no">ลำดับ No.</Label>
                    <Input id="seq_no" type="number" placeholder="1"
                      value={form.seq_no ?? ''}
                      onChange={e => numF('seq_no', e.target.value)} />
                  </div>
                  <div>
                    <Label htmlFor="qt_ref">QT Reference</Label>
                    <Input id="qt_ref" placeholder="QT2026010001"
                      value={form.qt_reference ?? ''}
                      onChange={e => setF('qt_reference', e.target.value || null)} />
                  </div>
                </div>
                <div>
                  <Label htmlFor="customer_name">ชื่อลูกค้า *</Label>
                  <Input id="customer_name" placeholder="เทศบาลเมืองบางแก้ว"
                    value={form.customer_name}
                    onChange={e => setF('customer_name', e.target.value)} />
                </div>
                <div>
                  <Label htmlFor="department">กอง/หน่วยงาน/แผนก</Label>
                  <Input id="department" placeholder="กองการศึกษา"
                    value={form.department ?? ''}
                    onChange={e => setF('department', e.target.value || null)} />
                </div>
                <div>
                  <Label>บริษัทรับงาน</Label>
                  <CustomSelect
                    value={form.company ?? ''}
                    onChange={v => setF('company', v || null)}
                    options={COMPANY_FORM_OPTS}
                  />
                </div>
                <div>
                  <Label htmlFor="product">รายการสินค้า/บริการ</Label>
                  <Input id="product" placeholder="โต๊ะประชุม..."
                    value={form.product_description ?? ''}
                    onChange={e => setF('product_description', e.target.value || null)} />
                </div>
                <div>
                  <Label>วันที่เริ่มงาน</Label>
                  <ThaiDatePicker
                    value={form.start_date ?? ''}
                    onChange={v => setF('start_date', v || null)}
                    placeholder="เลือกวันที่เริ่มงาน"
                  />
                </div>
              </>
            )}

            {/* ── Tab: Finance ── */}
            {activeTab === 'finance' && (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label htmlFor="price_incl_vat">ยอดเสนอราคา (รวม VAT)</Label>
                    <Input id="price_incl_vat" type="number" placeholder="0"
                      value={form.price_incl_vat ?? ''}
                      onChange={e => numF('price_incl_vat', e.target.value)} />
                  </div>
                  <div>
                    <Label htmlFor="price_excl_vat">ยอดก่อน VAT</Label>
                    <Input id="price_excl_vat" type="number" placeholder="0"
                      value={form.price_excl_vat ?? ''}
                      onChange={e => numF('price_excl_vat', e.target.value)} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label htmlFor="wht">หัก ณ ที่จ่าย 1%</Label>
                    <Input id="wht" type="number" placeholder="0"
                      value={form.withholding_tax ?? ''}
                      onChange={e => numF('withholding_tax', e.target.value)} />
                  </div>
                  <div>
                    <Label htmlFor="net_recv">ยอดสุทธิที่รับ</Label>
                    <Input id="net_recv" type="number" placeholder="0"
                      value={form.net_receivable ?? ''}
                      onChange={e => numF('net_receivable', e.target.value)} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label htmlFor="cost_price">ราคาทุน</Label>
                    <Input id="cost_price" type="number" placeholder="0"
                      value={form.cost_price ?? ''}
                      onChange={e => numF('cost_price', e.target.value)} />
                  </div>
                  <div>
                    <Label htmlFor="gross_profit">กำไรขั้นต้น</Label>
                    <Input id="gross_profit" type="number" placeholder="0"
                      value={form.gross_profit ?? ''}
                      onChange={e => numF('gross_profit', e.target.value)} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label htmlFor="security">เงินประกันสัญญา</Label>
                    <Input id="security" type="number" placeholder="0"
                      value={form.security_deposit ?? ''}
                      onChange={e => numF('security_deposit', e.target.value)} />
                  </div>
                </div>
                <div className="border-t pt-3">
                  <p className="text-xs font-medium text-slate-500 mb-2">วันที่โอนเงินซื้อของ</p>
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <Label>Date</Label>
                      <ThaiDatePicker value={form.transfer_date ?? ''} onChange={v => setF('transfer_date', v || null)} />
                    </div>
                    <div>
                      <Label>โอนรอบที่ 1</Label>
                      <ThaiDatePicker value={form.transfer_round1 ?? ''} onChange={v => setF('transfer_round1', v || null)} />
                    </div>
                    <div>
                      <Label>โอนรอบที่ 2</Label>
                      <ThaiDatePicker value={form.transfer_round2 ?? ''} onChange={v => setF('transfer_round2', v || null)} />
                    </div>
                  </div>
                </div>
              </>
            )}

            {/* ── Tab: Internal (89) ── */}
            {activeTab === 'internal' && (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label htmlFor="cust_change">ทอนลูกค้า (10%)</Label>
                    <Input id="cust_change" type="number" placeholder="0"
                      value={form.customer_change ?? ''}
                      onChange={e => numF('customer_change', e.target.value)} />
                  </div>
                  <div>
                    <Label>Slip ทอนลูกค้า</Label>
                    <CustomSelect value={form.customer_change_slip ?? ''} onChange={v => setF('customer_change_slip', v || null)} options={SLIP_FORM_OPTS} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label htmlFor="petty">Petty Cash (5%)</Label>
                    <Input id="petty" type="number" placeholder="0"
                      value={form.petty_cash ?? ''}
                      onChange={e => numF('petty_cash', e.target.value)} />
                  </div>
                  <div>
                    <Label>Slip Petty Cash</Label>
                    <CustomSelect value={form.petty_cash_slip ?? ''} onChange={v => setF('petty_cash_slip', v || null)} options={SLIP_FORM_OPTS} />
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <Label htmlFor="trans_buy">ขนส่ง ซื้อ</Label>
                    <Input id="trans_buy" type="number" placeholder="0"
                      value={form.transport_buy ?? ''}
                      onChange={e => numF('transport_buy', e.target.value)} />
                  </div>
                  <div>
                    <Label htmlFor="trans_sell">ขนส่ง ขาย</Label>
                    <Input id="trans_sell" type="number" placeholder="0"
                      value={form.transport_sell ?? ''}
                      onChange={e => numF('transport_sell', e.target.value)} />
                  </div>
                  <div>
                    <Label htmlFor="trans_other">ขนส่ง อื่นๆ</Label>
                    <Input id="trans_other" type="number" placeholder="0"
                      value={form.transport_other ?? ''}
                      onChange={e => numF('transport_other', e.target.value)} />
                  </div>
                </div>
                <div>
                  <Label htmlFor="operate89">Operate 89 (10%)</Label>
                  <Input id="operate89" type="number" placeholder="0"
                    value={form.operate_89 ?? ''}
                    onChange={e => numF('operate_89', e.target.value)} />
                </div>
                <div className="grid grid-cols-3 gap-3 border-t pt-3">
                  <div>
                    <Label htmlFor="total_cost">ทุน 89 (รวม)</Label>
                    <Input id="total_cost" type="number" placeholder="0"
                      value={form.total_cost_89 ?? ''}
                      onChange={e => numF('total_cost_89', e.target.value)} />
                  </div>
                  <div>
                    <Label htmlFor="net_profit">กำไร 89</Label>
                    <Input id="net_profit" type="number" placeholder="0"
                      value={form.net_profit_89 ?? ''}
                      onChange={e => numF('net_profit_89', e.target.value)} />
                  </div>
                  <div>
                    <Label htmlFor="profit_pct">% กำไร</Label>
                    <Input id="profit_pct" type="number" placeholder="0.00" step="0.01"
                      value={form.profit_pct ?? ''}
                      onChange={e => numF('profit_pct', e.target.value)} />
                  </div>
                </div>
              </>
            )}

            {/* ── Tab: Timeline & Status ── */}
            {activeTab === 'timeline' && (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>วันที่เซ็นสัญญา</Label>
                    <ThaiDatePicker value={form.contract_date ?? ''} onChange={v => setF('contract_date', v || null)} />
                  </div>
                  <div>
                    <Label>ชำระเงิน/สั่งของ</Label>
                    <ThaiDatePicker value={form.payment_order_date ?? ''} onChange={v => setF('payment_order_date', v || null)} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>วันที่ส่งของ</Label>
                    <ThaiDatePicker value={form.delivery_date ?? ''} onChange={v => setF('delivery_date', v || null)} />
                  </div>
                  <div>
                    <Label>วันที่รับเงิน</Label>
                    <ThaiDatePicker value={form.receipt_date ?? ''} onChange={v => setF('receipt_date', v || null)} />
                  </div>
                </div>
                <div>
                  <Label htmlFor="duration">ระยะเวลา (วัน)</Label>
                  <Input id="duration" type="number" placeholder="0"
                    value={form.duration_days ?? ''}
                    onChange={e => numF('duration_days', e.target.value)} />
                </div>
                <div className="border-t pt-3">
                  <div>
                    <Label>สถานะงาน</Label>
                    <CustomSelect
                      value={form.job_status ?? ''}
                      onChange={v => setF('job_status', v || null)}
                      options={STATUS_FORM_OPTS}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>วันที่ Finance จ่าย</Label>
                    <ThaiDatePicker value={form.finance_payment_date ?? ''} onChange={v => setF('finance_payment_date', v || null)} />
                  </div>
                  <div>
                    <Label>วันที่จ่าย Support</Label>
                    <ThaiDatePicker value={form.support_payment_date ?? ''} onChange={v => setF('support_payment_date', v || null)} />
                  </div>
                </div>
                <div>
                  <Label>วันที่จ่ายค่าคอม</Label>
                  <ThaiDatePicker value={form.commission_payment_date ?? ''} onChange={v => setF('commission_payment_date', v || null)} />
                </div>
                <div>
                  <Label htmlFor="notes">หมายเหตุ</Label>
                  <Input id="notes" placeholder="หมายเหตุเพิ่มเติม…"
                    value={form.notes ?? ''}
                    onChange={e => setF('notes', e.target.value || null)} />
                </div>
              </>
            )}
          </div>
          </DialogBody>

          <DialogFooter>
            {editing && (
              <Button
                variant="ghost" className="mr-auto text-red-600 hover:bg-red-50 hover:text-red-700"
                disabled={deleting === editing.id}
                onClick={async () => { const id = editing.id; await handleDelete(id); setDlgOpen(false); }}
              >
                {deleting === editing.id ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Trash2 className="mr-1.5 h-4 w-4" />} ลบ
              </Button>
            )}
            <Button variant="outline" onClick={() => setDlgOpen(false)}>ยกเลิก</Button>
            <Button onClick={() => void handleSave()} disabled={saving}>
              {saving ? 'กำลังบันทึก…' : editing ? 'อัปเดต' : 'บันทึก'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}

// ─── Summary Card ─────────────────────────────────────────────────────────────
function SummaryCard({
  icon, label, value, sub, bg,
}: {
  icon: React.ReactNode; label: string; value: string; sub?: string; bg: string;
}) {
  return (
    <div className={`rounded-xl border p-3 ${bg} space-y-1`}>
      <div className="flex items-center gap-1.5 text-xs text-slate-500">
        {icon}<span>{label}</span>
      </div>
      <div className="text-base font-bold text-slate-800">{value}</div>
      {sub && <div className="text-xs text-slate-400">{sub}</div>}
    </div>
  );
}
