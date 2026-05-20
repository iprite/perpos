'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { CustomSelect } from '@/components/ui/custom-select';
import { ThaiDatePicker } from '@/components/ui/thai-date-picker';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
  Plus, Filter, Wallet, ArrowDownCircle, ArrowUpCircle,
  Pencil, Trash2, Settings, Tag, MapPin, Check, X,
} from 'lucide-react';

const TMC_ORG_ID = '1f52618c-09c4-49c5-a929-ea5060f26e7d';

// ── Types ────────────────────────────────────────────────────────────────────
type Fund     = { id: string; name: string; note: string | null };
type Category = { id: string; name: string; sort_order: number; is_active: boolean };
type Property = { id: string; code: string; name: string; is_active: boolean; sort_order: number };
type Txn = {
  id: string; fund_id: string; txn_date: string; txn_type: 'top_up' | 'expense';
  amount: number; description: string; category: string | null;
  property_code: string | null; note: string | null;
  tmc_petty_cash_funds: { name: string } | null;
};

const EMPTY_FORM = {
  fundId: '', txnDate: new Date().toISOString().slice(0, 10),
  txnType: 'expense' as 'top_up' | 'expense',
  amount: '', description: '', category: '', propertyCode: '', note: '',
};

function fmt(n: number) { return n.toLocaleString('th-TH', { minimumFractionDigits: 2 }); }
function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('th-TH', { day: '2-digit', month: 'short', year: '2-digit' });
}

// ── Inline editable row ───────────────────────────────────────────────────────
function EditableRow({
  label, value, placeholder, onSave, onDelete,
  extraField,
}: {
  label: string; value: string; placeholder?: string;
  onSave: (val: string, extra?: string) => Promise<void>;
  onDelete: () => Promise<void>;
  extraField?: { label: string; value: string; placeholder?: string };
}) {
  const [editing, setEditing] = useState(false);
  const [val,  setVal]  = useState(value);
  const [ext,  setExt]  = useState(extraField?.value ?? '');
  const [busy, setBusy] = useState(false);

  async function save() {
    if (!val.trim()) return;
    setBusy(true);
    await onSave(val.trim(), ext.trim() || undefined);
    setBusy(false); setEditing(false);
  }
  async function remove() {
    setBusy(true); await onDelete(); setBusy(false);
  }

  if (editing) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2">
        {extraField && (
          <Input value={ext} onChange={e => setExt(e.target.value)}
            placeholder={extraField.placeholder} className="w-24 h-7 text-sm" />
        )}
        <Input value={val} onChange={e => setVal(e.target.value)}
          placeholder={placeholder} className="flex-1 h-7 text-sm"
          onKeyDown={e => { if (e.key === 'Enter') void save(); if (e.key === 'Escape') setEditing(false); }}
          autoFocus />
        <button type="button" onClick={() => void save()} disabled={busy || !val.trim()}
          className="rounded p-1 text-green-600 hover:bg-green-100 disabled:opacity-40">
          <Check className="h-4 w-4" />
        </button>
        <button type="button" onClick={() => { setEditing(false); setVal(value); setExt(extraField?.value ?? ''); }}
          className="rounded p-1 text-slate-400 hover:bg-slate-100">
          <X className="h-4 w-4" />
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between rounded-lg border border-slate-100 bg-white px-3 py-2.5 hover:border-slate-200">
      <span className="flex items-center gap-2 text-sm text-slate-700">
        {extraField && (
          <span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs font-mono font-semibold text-slate-600">
            {extraField.value}
          </span>
        )}
        {label}
      </span>
      <div className="flex items-center gap-1">
        <button type="button" onClick={() => setEditing(true)}
          className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700">
          <Pencil className="h-3.5 w-3.5" />
        </button>
        <button type="button" onClick={() => void remove()} disabled={busy}
          className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-40">
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

// ── Main page ────────────────────────────────────────────────────────────────
export default function TmcPettyCashPage() {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);

  const [funds,      setFunds]      = useState<Fund[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [properties, setProperties] = useState<Property[]>([]);
  const [txns,       setTxns]       = useState<Txn[]>([]);
  const [totalTopUp,   setTotalTopUp]   = useState(0);
  const [totalExpense, setTotalExpense] = useState(0);
  const [loading, setLoading] = useState(true);

  // filters
  const [filterFund, setFilterFund] = useState('');
  const [filterType, setFilterType] = useState('');
  const [filterProp, setFilterProp] = useState('');
  const [from, setFrom] = useState('');
  const [to,   setTo]   = useState('');

  // txn form
  const [showForm, setShowForm] = useState(false);
  const [editId,   setEditId]   = useState<string | null>(null);
  const [form, setForm]         = useState({ ...EMPTY_FORM });
  const [saving,  setSaving]  = useState(false);
  const [formErr, setFormErr] = useState('');

  // fund management
  const [showFunds,   setShowFunds]   = useState(false);
  const [newFundName, setNewFundName] = useState('');
  const [newFundNote, setNewFundNote] = useState('');
  const [fundSaving,  setFundSaving]  = useState(false);

  // master data management
  const [showMaster,   setShowMaster]   = useState(false);
  const [masterTab,    setMasterTab]    = useState<'category' | 'property'>('category');
  const [newCatName,   setNewCatName]   = useState('');
  const [newPropCode,  setNewPropCode]  = useState('');
  const [newPropName,  setNewPropName]  = useState('');
  const [masterSaving, setMasterSaving] = useState(false);

  // delete confirm
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const authHeader = useCallback(async () => {
    const { data } = await supabase.auth.getSession();
    return { Authorization: `Bearer ${data.session?.access_token ?? ''}` };
  }, [supabase]);

  // ── Loaders ────────────────────────────────────────────────────────────────
  const loadMaster = useCallback(async () => {
    const h = await authHeader();
    const [fRes, cRes, pRes] = await Promise.all([
      fetch(`/api/tmc/petty-cash/funds?orgId=${TMC_ORG_ID}`, { headers: h }),
      fetch(`/api/tmc/petty-cash/categories?orgId=${TMC_ORG_ID}`, { headers: h }),
      fetch(`/api/tmc/properties?orgId=${TMC_ORG_ID}&all=1`, { headers: h }),
    ]);
    const [fData, cData, pData] = await Promise.all([fRes.json(), cRes.json(), pRes.json()]);
    setFunds(Array.isArray(fData) ? fData : []);
    setCategories(Array.isArray(cData) ? cData : []);
    setProperties(Array.isArray(pData) ? pData : []);
  }, [authHeader]);

  const load = useCallback(async () => {
    setLoading(true);
    const h = await authHeader();
    const p = new URLSearchParams({ orgId: TMC_ORG_ID });
    if (filterFund) p.set('fundId',       filterFund);
    if (filterType) p.set('txnType',      filterType);
    if (filterProp) p.set('propertyCode', filterProp);
    if (from)       p.set('from',         from);
    if (to)         p.set('to',           to);

    const res  = await fetch(`/api/tmc/petty-cash?${p}`, { headers: h });
    const data = await res.json();
    setTxns(data.txns ?? []);
    setTotalTopUp(data.totalTopUp ?? 0);
    setTotalExpense(data.totalExpense ?? 0);
    setLoading(false);
  }, [authHeader, filterFund, filterType, filterProp, from, to]);

  useEffect(() => { void loadMaster(); }, [loadMaster]);
  useEffect(() => { void load(); }, [load]);

  // ── Save txn ───────────────────────────────────────────────────────────────
  async function handleSave() {
    if (!form.fundId || !form.description || !form.amount) {
      setFormErr('กรุณากรอกข้อมูลที่จำเป็น'); return;
    }
    setSaving(true); setFormErr('');
    const h   = await authHeader();
    const body = {
      orgId: TMC_ORG_ID, fundId: form.fundId, txnDate: form.txnDate,
      txnType: form.txnType, amount: form.amount, description: form.description,
      category: form.category || undefined, propertyCode: form.propertyCode || undefined,
      note: form.note || undefined,
    };
    const res = editId
      ? await fetch('/api/tmc/petty-cash', { method: 'PUT',  headers: { ...h, 'Content-Type': 'application/json' }, body: JSON.stringify({ ...body, id: editId }) })
      : await fetch('/api/tmc/petty-cash', { method: 'POST', headers: { ...h, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

    if (!res.ok) { const e = await res.json().catch(() => ({})); setFormErr(e.error ?? 'บันทึกไม่สำเร็จ'); }
    else { setShowForm(false); setEditId(null); setForm({ ...EMPTY_FORM }); void load(); }
    setSaving(false);
  }

  function openEdit(t: Txn) {
    setForm({ fundId: t.fund_id, txnDate: t.txn_date, txnType: t.txn_type,
      amount: String(t.amount), description: t.description,
      category: t.category ?? '', propertyCode: t.property_code ?? '', note: t.note ?? '' });
    setEditId(t.id); setFormErr(''); setShowForm(true);
  }

  // ── Delete txn ─────────────────────────────────────────────────────────────
  async function handleDelete() {
    if (!deleteId) return;
    const h = await authHeader();
    await fetch(`/api/tmc/petty-cash?id=${deleteId}&orgId=${TMC_ORG_ID}`, { method: 'DELETE', headers: h });
    setDeleteId(null); void load();
  }

  // ── Fund ───────────────────────────────────────────────────────────────────
  async function handleCreateFund() {
    if (!newFundName.trim()) return;
    setFundSaving(true);
    const h = await authHeader();
    await fetch('/api/tmc/petty-cash/funds', { method: 'POST',
      headers: { ...h, 'Content-Type': 'application/json' },
      body: JSON.stringify({ orgId: TMC_ORG_ID, name: newFundName, note: newFundNote }),
    });
    setNewFundName(''); setNewFundNote(''); setFundSaving(false); void loadMaster();
  }

  // ── Category CRUD ──────────────────────────────────────────────────────────
  async function createCategory() {
    if (!newCatName.trim()) return;
    setMasterSaving(true);
    const h = await authHeader();
    await fetch('/api/tmc/petty-cash/categories', { method: 'POST',
      headers: { ...h, 'Content-Type': 'application/json' },
      body: JSON.stringify({ orgId: TMC_ORG_ID, name: newCatName }),
    });
    setNewCatName(''); setMasterSaving(false); void loadMaster();
  }

  async function updateCategory(id: string, name: string) {
    const h = await authHeader();
    await fetch('/api/tmc/petty-cash/categories', { method: 'PATCH',
      headers: { ...h, 'Content-Type': 'application/json' },
      body: JSON.stringify({ orgId: TMC_ORG_ID, id, name }),
    });
    void loadMaster();
  }

  async function deleteCategory(id: string) {
    const h = await authHeader();
    await fetch(`/api/tmc/petty-cash/categories?id=${id}&orgId=${TMC_ORG_ID}`, { method: 'DELETE', headers: h });
    void loadMaster();
  }

  // ── Property CRUD ──────────────────────────────────────────────────────────
  async function createProperty() {
    if (!newPropCode.trim() || !newPropName.trim()) return;
    setMasterSaving(true);
    const h = await authHeader();
    await fetch('/api/tmc/properties', { method: 'POST',
      headers: { ...h, 'Content-Type': 'application/json' },
      body: JSON.stringify({ orgId: TMC_ORG_ID, code: newPropCode, name: newPropName }),
    });
    setNewPropCode(''); setNewPropName(''); setMasterSaving(false); void loadMaster();
  }

  async function updateProperty(id: string, name: string, code?: string) {
    const h = await authHeader();
    await fetch('/api/tmc/properties', { method: 'PATCH',
      headers: { ...h, 'Content-Type': 'application/json' },
      body: JSON.stringify({ orgId: TMC_ORG_ID, id, name, ...(code ? { code } : {}) }),
    });
    void loadMaster();
  }

  async function deleteProperty(id: string) {
    const h = await authHeader();
    await fetch(`/api/tmc/properties?id=${id}&orgId=${TMC_ORG_ID}`, { method: 'DELETE', headers: h });
    void loadMaster();
  }

  // ── Options ────────────────────────────────────────────────────────────────
  const activeCategories = useMemo(() => categories.filter(c => c.is_active), [categories]);
  const activeProperties = useMemo(() => properties.filter(p => p.is_active), [properties]);

  const fundOptions    = useMemo(() => [{ value: '', label: 'ทุกกระเป๋า' }, ...funds.map(f => ({ value: f.id, label: f.name }))], [funds]);
  const fundFormOpts   = useMemo(() => [{ value: '', label: 'เลือกกระเป๋า' }, ...funds.map(f => ({ value: f.id, label: f.name }))], [funds]);
  const typeOptions    = [{ value: '', label: 'ทุกประเภท' }, { value: 'top_up', label: 'เติมเงิน' }, { value: 'expense', label: 'ใช้เงิน' }];
  const typeFormOpts   = [{ value: 'top_up', label: '⬆ เติมเงิน' }, { value: 'expense', label: '⬇ ใช้เงิน' }];
  const propFilterOpts = useMemo(() => [{ value: '', label: 'ทุกแปลง' }, ...activeProperties.map(p => ({ value: p.code, label: p.code }))], [activeProperties]);
  const propFormOpts   = useMemo(() => [{ value: '', label: '—' }, ...activeProperties.map(p => ({ value: p.code, label: `${p.code} ${p.name}` }))], [activeProperties]);
  const catFormOpts    = useMemo(() => [{ value: '', label: '— ไม่ระบุ —' }, ...activeCategories.map(c => ({ value: c.name, label: c.name }))], [activeCategories]);

  const hasFilter = filterFund || filterType || filterProp || from || to;
  const balance   = totalTopUp - totalExpense;

  return (
    <div className="p-4 md:p-6 space-y-4">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-100">
            <Wallet className="h-5 w-5 text-amber-600" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900">เงินสดย่อย</h1>
            <p className="text-sm text-slate-500">กระเป๋าเงินสดแยกจากบัญชีหลัก</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => { setMasterTab('category'); setShowMaster(true); }}>
            <Settings className="w-4 h-4" /> จัดการหมวด/แปลง
          </Button>
          <Button variant="outline" size="sm" onClick={() => setShowFunds(true)}>
            <Wallet className="w-4 h-4" /> กระเป๋า
          </Button>
          <Button onClick={() => { setEditId(null); setForm({ ...EMPTY_FORM }); setFormErr(''); setShowForm(true); }}>
            <Plus className="w-4 h-4" /> เพิ่มรายการ
          </Button>
        </div>
      </div>

      {/* Fund chips */}
      {funds.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {funds.map(f => (
            <button key={f.id} type="button"
              onClick={() => setFilterFund(p => p === f.id ? '' : f.id)}
              className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                filterFund === f.id ? 'border-amber-400 bg-amber-50 text-amber-700' : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
              }`}>{f.name}</button>
          ))}
        </div>
      )}

      {/* Summary */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-xl border border-green-100 bg-green-50 p-4">
          <div className="flex items-center gap-1.5 mb-1">
            <ArrowDownCircle className="h-3.5 w-3.5 text-green-500" />
            <p className="text-xs text-green-600 font-medium">เติมเงินรวม</p>
          </div>
          <p className="text-lg font-bold text-green-700">{fmt(totalTopUp)}</p>
        </div>
        <div className="rounded-xl border border-red-100 bg-red-50 p-4">
          <div className="flex items-center gap-1.5 mb-1">
            <ArrowUpCircle className="h-3.5 w-3.5 text-red-500" />
            <p className="text-xs text-red-600 font-medium">ใช้เงินรวม</p>
          </div>
          <p className="text-lg font-bold text-red-700">{fmt(totalExpense)}</p>
        </div>
        <div className={`rounded-xl border p-4 ${balance >= 0 ? 'border-blue-100 bg-blue-50' : 'border-orange-100 bg-orange-50'}`}>
          <div className="flex items-center gap-1.5 mb-1">
            <Wallet className="h-3.5 w-3.5 text-blue-500" />
            <p className="text-xs text-blue-600 font-medium">คงเหลือ</p>
          </div>
          <p className={`text-lg font-bold ${balance >= 0 ? 'text-blue-700' : 'text-orange-700'}`}>{fmt(balance)}</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2 rounded-xl border bg-white p-3">
        <Filter className="h-4 w-4 shrink-0 text-slate-400" />
        <CustomSelect value={filterFund} onChange={setFilterFund} options={fundOptions} className="w-36" />
        <CustomSelect value={filterType} onChange={setFilterType} options={typeOptions} className="w-28" />
        <CustomSelect value={filterProp} onChange={setFilterProp} options={propFilterOpts} className="w-28" />
        <ThaiDatePicker value={from} onChange={setFrom} placeholder="ตั้งแต่" className="w-32" />
        <ThaiDatePicker value={to}   onChange={setTo}   placeholder="ถึง"     className="w-32" />
        {hasFilter && (
          <Button variant="ghost" size="sm" onClick={() => { setFilterFund(''); setFilterType(''); setFilterProp(''); setFrom(''); setTo(''); }}>
            ล้างตัวกรอง
          </Button>
        )}
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-xl border bg-white">
        {loading ? (
          <div className="p-10 text-center text-sm text-slate-400">กำลังโหลด...</div>
        ) : txns.length === 0 ? (
          <div className="p-10 text-center text-sm text-slate-400">ยังไม่มีรายการเงินสดย่อย</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="border-b bg-slate-50">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-slate-500">วันที่</th>
                <th className="px-4 py-3 text-left font-medium text-slate-500">รายการ</th>
                <th className="px-4 py-3 text-left font-medium text-slate-500">กระเป๋า</th>
                <th className="px-4 py-3 text-left font-medium text-slate-500">หมวด</th>
                <th className="px-4 py-3 text-left font-medium text-slate-500">แปลง</th>
                <th className="px-4 py-3 text-right font-medium text-green-600">เติมเงิน</th>
                <th className="px-4 py-3 text-right font-medium text-red-600">ใช้เงิน</th>
                <th className="px-4 py-3 w-20"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {txns.map(t => (
                <tr key={t.id} className="hover:bg-slate-50 transition-colors">
                  <td className="whitespace-nowrap px-4 py-3 text-slate-500">{fmtDate(t.txn_date)}</td>
                  <td className="max-w-[200px] truncate px-4 py-3 text-slate-800" title={t.description}>
                    {t.description}
                    {t.note && <span className="ml-1 text-xs text-slate-400">({t.note})</span>}
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-500">{t.tmc_petty_cash_funds?.name ?? '—'}</td>
                  <td className="px-4 py-3">
                    {t.category && <span className="inline-block rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">{t.category}</span>}
                  </td>
                  <td className="px-4 py-3">
                    {t.property_code && <span className="inline-block rounded-full bg-blue-50 px-2 py-0.5 text-xs text-blue-600">{t.property_code}</span>}
                  </td>
                  <td className="px-4 py-3 text-right font-medium text-green-600">
                    {t.txn_type === 'top_up' ? fmt(t.amount) : ''}
                  </td>
                  <td className="px-4 py-3 text-right font-medium text-red-600">
                    {t.txn_type === 'expense' ? fmt(t.amount) : ''}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-center gap-1">
                      <button type="button" onClick={() => openEdit(t)}
                        className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700">
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button type="button" onClick={() => setDeleteId(t.id)}
                        className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* ── Add/Edit Txn Dialog ── */}
      <Dialog open={showForm} onOpenChange={v => { setShowForm(v); if (!v) { setEditId(null); setForm({ ...EMPTY_FORM }); } }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editId ? 'แก้ไขรายการ' : 'เพิ่มรายการเงินสดย่อย'}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            {/* Type toggle */}
            <div className="col-span-2 space-y-1.5">
              <Label>ประเภท *</Label>
              <div className="flex overflow-hidden rounded-lg border border-slate-200">
                {typeFormOpts.map(opt => (
                  <button key={opt.value} type="button"
                    onClick={() => setForm(f => ({ ...f, txnType: opt.value as 'top_up' | 'expense' }))}
                    className={`flex-1 py-2 text-sm font-medium transition-colors ${
                      form.txnType === opt.value
                        ? opt.value === 'top_up' ? 'bg-green-500 text-white' : 'bg-red-500 text-white'
                        : 'bg-white text-slate-500 hover:bg-slate-50'
                    }`}>{opt.label}</button>
                ))}
              </div>
            </div>
            <div className="col-span-2 space-y-1.5">
              <Label>กระเป๋าเงินสดย่อย *</Label>
              <CustomSelect value={form.fundId} onChange={v => setForm(f => ({ ...f, fundId: v }))} options={fundFormOpts} />
            </div>
            <div className="space-y-1.5">
              <Label>วันที่ *</Label>
              <ThaiDatePicker value={form.txnDate} onChange={v => setForm(f => ({ ...f, txnDate: v }))} />
            </div>
            <div className="space-y-1.5">
              <Label>จำนวนเงิน (บาท) *</Label>
              <Input type="number" placeholder="0.00" value={form.amount}
                onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} />
            </div>
            <div className="col-span-2 space-y-1.5">
              <Label>รายการ *</Label>
              <Input placeholder={form.txnType === 'top_up' ? 'เช่น เติมเงินสดย่อยรอบสัปดาห์' : 'เช่น ซื้อของใช้ทั่วไป'}
                value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
            </div>
            {form.txnType === 'expense' && (
              <div className="space-y-1.5">
                <Label>หมวด</Label>
                <CustomSelect value={form.category} onChange={v => setForm(f => ({ ...f, category: v }))} options={catFormOpts} />
              </div>
            )}
            <div className="space-y-1.5">
              <Label>แปลง</Label>
              <CustomSelect value={form.propertyCode} onChange={v => setForm(f => ({ ...f, propertyCode: v }))} options={propFormOpts} />
            </div>
            <div className="col-span-2 space-y-1.5">
              <Label>หมายเหตุ</Label>
              <Input value={form.note} onChange={e => setForm(f => ({ ...f, note: e.target.value }))} />
            </div>
          </div>
          {formErr && <p className="text-sm text-red-600">{formErr}</p>}
          <DialogFooter className="gap-2 sm:gap-2">
            <Button variant="outline" onClick={() => setShowForm(false)}>ยกเลิก</Button>
            <Button onClick={handleSave} disabled={saving || !form.fundId || !form.description || !form.amount}>
              {saving ? 'กำลังบันทึก…' : editId ? 'บันทึกการแก้ไข' : 'บันทึก'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Delete Confirm ── */}
      <Dialog open={!!deleteId} onOpenChange={v => { if (!v) setDeleteId(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>ยืนยันการลบ</DialogTitle></DialogHeader>
          <p className="text-sm text-slate-600">ต้องการลบรายการนี้ใช่หรือไม่? ไม่สามารถกู้คืนได้</p>
          <DialogFooter className="gap-2 sm:gap-2">
            <Button variant="outline" onClick={() => setDeleteId(null)}>ยกเลิก</Button>
            <Button variant="destructive" onClick={handleDelete}>ลบ</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Manage Funds Dialog ── */}
      <Dialog open={showFunds} onOpenChange={setShowFunds}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>จัดการกระเป๋าเงินสดย่อย</DialogTitle></DialogHeader>
          {funds.length > 0 && (
            <div className="space-y-2 mb-4">
              {funds.map(f => (
                <div key={f.id} className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2.5">
                  <div>
                    <p className="text-sm font-medium text-slate-800">{f.name}</p>
                    {f.note && <p className="text-xs text-slate-400">{f.note}</p>}
                  </div>
                </div>
              ))}
            </div>
          )}
          <div className="space-y-3 rounded-xl border border-dashed border-slate-300 p-4">
            <p className="text-sm font-medium text-slate-700">สร้างกระเป๋าใหม่</p>
            <div className="space-y-1.5">
              <Label>ชื่อกระเป๋า *</Label>
              <Input placeholder="เช่น กระเป๋าเงินสดย่อยหน้าบ้าน" value={newFundName} onChange={e => setNewFundName(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>หมายเหตุ</Label>
              <Input placeholder="รายละเอียดเพิ่มเติม (ไม่บังคับ)" value={newFundNote} onChange={e => setNewFundNote(e.target.value)} />
            </div>
            <Button onClick={handleCreateFund} disabled={fundSaving || !newFundName.trim()} size="sm">
              {fundSaving ? 'กำลังสร้าง…' : 'สร้างกระเป๋า'}
            </Button>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setShowFunds(false)}>ปิด</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Master Data Dialog (หมวด / แปลง) ── */}
      <Dialog open={showMaster} onOpenChange={setShowMaster}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>จัดการหมวดและแปลง</DialogTitle></DialogHeader>

          {/* Tabs */}
          <div className="flex rounded-lg border border-slate-200 overflow-hidden">
            <button type="button"
              onClick={() => setMasterTab('category')}
              className={`flex flex-1 items-center justify-center gap-2 py-2 text-sm font-medium transition-colors ${
                masterTab === 'category' ? 'bg-slate-800 text-white' : 'bg-white text-slate-500 hover:bg-slate-50'
              }`}>
              <Tag className="h-4 w-4" /> หมวดหมู่
            </button>
            <button type="button"
              onClick={() => setMasterTab('property')}
              className={`flex flex-1 items-center justify-center gap-2 py-2 text-sm font-medium transition-colors ${
                masterTab === 'property' ? 'bg-slate-800 text-white' : 'bg-white text-slate-500 hover:bg-slate-50'
              }`}>
              <MapPin className="h-4 w-4" /> แปลง
            </button>
          </div>

          {/* Categories Tab */}
          {masterTab === 'category' && (
            <div className="space-y-3">
              <p className="text-xs text-slate-400">คลิก ✏️ เพื่อแก้ไขชื่อ | 🗑️ เพื่อลบ</p>
              <div className="space-y-1.5 max-h-56 overflow-y-auto pr-1">
                {categories.map(cat => (
                  <EditableRow
                    key={cat.id}
                    label={cat.name}
                    value={cat.name}
                    placeholder="ชื่อหมวด"
                    onSave={async (name) => { await updateCategory(cat.id, name); }}
                    onDelete={async () => { await deleteCategory(cat.id); }}
                  />
                ))}
                {categories.length === 0 && (
                  <p className="text-center text-sm text-slate-400 py-4">ยังไม่มีหมวด</p>
                )}
              </div>

              {/* Add new */}
              <div className="flex gap-2 rounded-xl border border-dashed border-slate-300 p-3">
                <Input placeholder="ชื่อหมวดใหม่ เช่น ค่าซ่อมแซม"
                  value={newCatName} onChange={e => setNewCatName(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') void createCategory(); }}
                  className="flex-1" />
                <Button size="sm" onClick={createCategory}
                  disabled={masterSaving || !newCatName.trim()}>
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}

          {/* Properties Tab */}
          {masterTab === 'property' && (
            <div className="space-y-3">
              <p className="text-xs text-slate-400">คลิก ✏️ เพื่อแก้ไขชื่อและรหัส | 🗑️ เพื่อลบ</p>
              <div className="space-y-1.5 max-h-56 overflow-y-auto pr-1">
                {properties.map(prop => (
                  <EditableRow
                    key={prop.id}
                    label={prop.name}
                    value={prop.name}
                    placeholder="ชื่อแปลง"
                    extraField={{ label: 'รหัส', value: prop.code, placeholder: 'รหัส' }}
                    onSave={async (name, code) => { await updateProperty(prop.id, name, code); }}
                    onDelete={async () => { await deleteProperty(prop.id); }}
                  />
                ))}
                {properties.length === 0 && (
                  <p className="text-center text-sm text-slate-400 py-4">ยังไม่มีแปลง</p>
                )}
              </div>

              {/* Add new */}
              <div className="flex gap-2 rounded-xl border border-dashed border-slate-300 p-3">
                <Input placeholder="รหัส เช่น TMC8"
                  value={newPropCode} onChange={e => setNewPropCode(e.target.value)}
                  className="w-24" />
                <Input placeholder="ชื่อแปลง เช่น บ้านสวน"
                  value={newPropName} onChange={e => setNewPropName(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') void createProperty(); }}
                  className="flex-1" />
                <Button size="sm" onClick={createProperty}
                  disabled={masterSaving || !newPropCode.trim() || !newPropName.trim()}>
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowMaster(false)}>ปิด</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
