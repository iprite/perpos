'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { backendUrl } from '@/lib/backend';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { CustomSelect } from '@/components/ui/custom-select';
import { ThaiDatePicker } from '@/components/ui/thai-date-picker';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
  Plus, Filter, Settings, Tag, MapPin, Check, X, Pencil, Trash2,
  ChevronLeft, ChevronRight,
} from 'lucide-react';

const TMC_ORG_ID = '1f52618c-09c4-49c5-a929-ea5060f26e7d';

type Account  = { id: string; name: string; account_type: string };
type Category = { id: string; name: string; sort_order: number; is_active: boolean };
type Property = { id: string; code: string; name: string; is_active: boolean; sort_order: number };
type Entry = {
  id: string; entry_date: string; description: string; category: string;
  property_code: string | null; income: number | null; expense: number | null;
  note: string | null; tmc_accounts: { name: string } | null;
};

function fmt(n: number | null) {
  if (!n) return '—';
  return n.toLocaleString('th-TH', { minimumFractionDigits: 2 });
}

// ── Inline editable row ───────────────────────────────────────────────────────
function EditableRow({
  label, value, placeholder, onSave, onDelete, extraField,
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
export default function TmcFinancePage() {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [accounts,   setAccounts]   = useState<Account[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [properties, setProperties] = useState<Property[]>([]);
  const [entries,    setEntries]    = useState<Entry[]>([]);
  const [loading,    setLoading]    = useState(true);

  // filters
  const [accountId,    setAccountId]    = useState('');
  const [propertyCode, setPropertyCode] = useState('');
  const [category,     setCategory]     = useState('');
  const [from, setFrom] = useState('');
  const [to,   setTo]   = useState('');

  // pagination
  const PAGE_SIZE = 10;
  const [page, setPage] = useState(1);

  // form
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<{
    accountId: string; entryDate: string; description: string;
    entryType: 'income' | 'expense' | ''; category: string;
    propertyCode: string; amount: string; note: string;
  }>({
    accountId: '', entryDate: new Date().toISOString().slice(0, 10),
    description: '', entryType: '',
    category: '', propertyCode: '', amount: '', note: '',
  });
  const [saving, setSaving] = useState(false);

  // master data management
  const [showMaster,   setShowMaster]   = useState(false);
  const [masterTab,    setMasterTab]    = useState<'category' | 'property'>('category');
  const [newCatName,   setNewCatName]   = useState('');
  const [newPropCode,  setNewPropCode]  = useState('');
  const [newPropName,  setNewPropName]  = useState('');
  const [masterSaving, setMasterSaving] = useState(false);

  const authHeader = useCallback(async () => {
    const { data } = await supabase.auth.getSession();
    return {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${data.session?.access_token ?? ''}`,
    };
  }, [supabase]);

  // ── Loaders ────────────────────────────────────────────────────────────────
  const loadMaster = useCallback(async () => {
    const h = await authHeader();
    const [cRes, pRes] = await Promise.all([
      fetch(backendUrl(`/tmc/finance/categories?orgId=${TMC_ORG_ID}`), { headers: h }),
      fetch(backendUrl(`/tmc/properties?orgId=${TMC_ORG_ID}&all=1`), { headers: h }),
    ]);
    const [cData, pData] = await Promise.all([cRes.json(), pRes.json()]);
    setCategories(Array.isArray(cData) ? cData : []);
    setProperties(Array.isArray(pData) ? pData : []);
  }, [authHeader]);

  const load = useCallback(async () => {
    setLoading(true);
    const h = await authHeader();
    const p = new URLSearchParams({ orgId: TMC_ORG_ID });
    if (accountId)    p.set('accountId',    accountId);
    if (propertyCode) p.set('propertyCode', propertyCode);
    if (category)     p.set('category',     category);
    if (from)         p.set('from',         from);
    if (to)           p.set('to',           to);

    const [accRes, entRes] = await Promise.all([
      fetch(backendUrl(`/tmc/accounts?orgId=${TMC_ORG_ID}`), { headers: h }),
      fetch(backendUrl(`/tmc/finance?${p}`), { headers: h }),
    ]);
    const [accData, entData] = await Promise.all([accRes.json(), entRes.json()]);
    setAccounts(accData);
    setEntries(entData.entries ?? []);
    setLoading(false);
  }, [authHeader, accountId, propertyCode, category, from, to]);

  useEffect(() => { void loadMaster(); }, [loadMaster]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => { setPage(1); }, [entries]);

  // ── Save entry ─────────────────────────────────────────────────────────────
  async function handleSave() {
    if (!form.accountId || !form.description || !form.category || !form.entryType || !form.amount) return;
    setSaving(true);
    const h = await authHeader();
    const income  = form.entryType === 'income'  ? form.amount : '';
    const expense = form.entryType === 'expense' ? form.amount : '';
    await fetch(backendUrl('/tmc/finance'), {
      method: 'POST', headers: h,
      body: JSON.stringify({
        orgId: TMC_ORG_ID,
        accountId: form.accountId, entryDate: form.entryDate,
        description: form.description, category: form.category,
        propertyCode: form.propertyCode, income, expense, note: form.note,
      }),
    });
    setSaving(false);
    setShowForm(false);
    setForm({ accountId: '', entryDate: new Date().toISOString().slice(0, 10), description: '', entryType: '', category: '', propertyCode: '', amount: '', note: '' });
    void load();
  }

  // ── Category CRUD ──────────────────────────────────────────────────────────
  async function createCategory() {
    if (!newCatName.trim()) return;
    setMasterSaving(true);
    const h = await authHeader();
    await fetch(backendUrl('/tmc/finance/categories'), {
      method: 'POST', headers: h,
      body: JSON.stringify({ orgId: TMC_ORG_ID, name: newCatName }),
    });
    setNewCatName(''); setMasterSaving(false); void loadMaster();
  }

  async function updateCategory(id: string, name: string) {
    const h = await authHeader();
    await fetch(backendUrl('/tmc/finance/categories'), {
      method: 'PATCH', headers: h,
      body: JSON.stringify({ orgId: TMC_ORG_ID, id, name }),
    });
    void loadMaster();
  }

  async function deleteCategory(id: string) {
    const h = await authHeader();
    await fetch(backendUrl(`/tmc/finance/categories?id=${id}&orgId=${TMC_ORG_ID}`), {
      method: 'DELETE', headers: h,
    });
    void loadMaster();
  }

  // ── Property CRUD ──────────────────────────────────────────────────────────
  async function createProperty() {
    if (!newPropCode.trim() || !newPropName.trim()) return;
    setMasterSaving(true);
    const h = await authHeader();
    await fetch(backendUrl('/tmc/properties'), {
      method: 'POST', headers: h,
      body: JSON.stringify({ orgId: TMC_ORG_ID, code: newPropCode, name: newPropName }),
    });
    setNewPropCode(''); setNewPropName(''); setMasterSaving(false); void loadMaster();
  }

  async function updateProperty(id: string, name: string, code?: string) {
    const h = await authHeader();
    await fetch(backendUrl('/tmc/properties'), {
      method: 'PATCH', headers: h,
      body: JSON.stringify({ orgId: TMC_ORG_ID, id, name, ...(code ? { code } : {}) }),
    });
    void loadMaster();
  }

  async function deleteProperty(id: string) {
    const h = await authHeader();
    await fetch(backendUrl(`/tmc/properties?id=${id}&orgId=${TMC_ORG_ID}`), {
      method: 'DELETE', headers: h,
    });
    void loadMaster();
  }

  // ── Options ────────────────────────────────────────────────────────────────
  const activeCategories = useMemo(() => categories.filter(c => c.is_active), [categories]);
  const activeProperties = useMemo(() => properties.filter(p => p.is_active), [properties]);

  const totalIncome  = entries.reduce((s, e) => s + (e.income  ?? 0), 0);
  const totalExpense = entries.reduce((s, e) => s + (e.expense ?? 0), 0);

  const totalPages   = Math.max(1, Math.ceil(entries.length / PAGE_SIZE));
  const pagedEntries = entries.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const accountOptions = useMemo(() => [
    { value: '', label: 'ทุกบัญชี' },
    ...accounts.filter(a => a.account_type !== 'petty_cash').map(a => ({ value: a.id, label: a.name })),
  ], [accounts]);

  const propertyFilterOpts = useMemo(() => [
    { value: '', label: 'ทุกแปลง' },
    ...activeProperties.map(p => ({ value: p.code, label: p.code })),
  ], [activeProperties]);

  const categoryFilterOpts = useMemo(() => [
    { value: '', label: 'ทุกหมวด' },
    ...activeCategories.map(c => ({ value: c.name, label: c.name })),
  ], [activeCategories]);

  const accountFormOptions = useMemo(() => [
    { value: '', label: 'เลือกบัญชี' },
    ...accounts.filter(a => a.account_type !== 'petty_cash').map(a => ({ value: a.id, label: a.name })),
  ], [accounts]);

  const propertyFormOptions = useMemo(() => [
    { value: '', label: '-' },
    ...activeProperties.map(p => ({ value: p.code, label: p.code })),
  ], [activeProperties]);

  const categoryFormOptions = useMemo(() => [
    { value: '', label: 'เลือกหมวด' },
    ...activeCategories.map(c => ({ value: c.name, label: c.name })),
  ], [activeCategories]);

  return (
    <div className="p-4 md:p-6 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900">บัญชีและการเงิน</h1>
          <p className="text-sm text-slate-500">TMC Management</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => { setMasterTab('category'); setShowMaster(true); }}>
            <Settings className="w-4 h-4" /> จัดการหมวด/แปลง
          </Button>
          <Button onClick={() => setShowForm(true)}>
            <Plus className="w-4 h-4" /> เพิ่มรายการ
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-green-50 rounded-xl p-4 border border-green-100">
          <p className="text-xs text-green-600 font-medium">รายรับรวม</p>
          <p className="text-lg font-bold text-green-700">{fmt(totalIncome)}</p>
        </div>
        <div className="bg-red-50 rounded-xl p-4 border border-red-100">
          <p className="text-xs text-red-600 font-medium">รายจ่ายรวม</p>
          <p className="text-lg font-bold text-red-700">{fmt(totalExpense)}</p>
        </div>
        <div className={`rounded-xl p-4 border ${totalIncome - totalExpense >= 0 ? 'bg-blue-50 border-blue-100' : 'bg-orange-50 border-orange-100'}`}>
          <p className="text-xs text-blue-600 font-medium">คงเหลือ</p>
          <p className={`text-lg font-bold ${totalIncome - totalExpense >= 0 ? 'text-blue-700' : 'text-orange-700'}`}>
            {fmt(totalIncome - totalExpense)}
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl border p-3 flex flex-wrap items-center gap-2">
        <Filter className="w-4 h-4 text-slate-400 shrink-0" />
        <CustomSelect value={accountId}    onChange={setAccountId}    options={accountOptions}      className="w-36" />
        <CustomSelect value={propertyCode} onChange={setPropertyCode} options={propertyFilterOpts}  className="w-28" />
        <CustomSelect value={category}     onChange={setCategory}     options={categoryFilterOpts}  className="w-36" />
        <ThaiDatePicker value={from} onChange={setFrom} placeholder="ตั้งแต่" className="w-32" />
        <ThaiDatePicker value={to}   onChange={setTo}   placeholder="ถึง"     className="w-32" />
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border overflow-x-auto">
        {loading ? (
          <div className="p-8 text-center text-slate-400">กำลังโหลด...</div>
        ) : entries.length === 0 ? (
          <div className="p-8 text-center text-slate-400">ยังไม่มีรายการ</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b">
              <tr>
                <th className="text-left px-4 py-3 text-slate-600 font-medium">วันที่</th>
                <th className="text-left px-4 py-3 text-slate-600 font-medium">รายการ</th>
                <th className="text-left px-4 py-3 text-slate-600 font-medium">หมวด</th>
                <th className="text-left px-4 py-3 text-slate-600 font-medium">แปลง</th>
                <th className="text-left px-4 py-3 text-slate-600 font-medium">บัญชี</th>
                <th className="text-right px-4 py-3 text-green-600 font-medium">รายรับ</th>
                <th className="text-right px-4 py-3 text-red-600 font-medium">รายจ่าย</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {pagedEntries.map(e => (
                <tr key={e.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-4 py-3 text-slate-600 whitespace-nowrap">
                    {new Date(e.entry_date).toLocaleDateString('th-TH', { day: '2-digit', month: 'short', year: '2-digit' })}
                  </td>
                  <td className="px-4 py-3 text-slate-800 max-w-xs truncate" title={e.description}>
                    {e.description}
                  </td>
                  <td className="px-4 py-3">
                    <span className="inline-block bg-slate-100 text-slate-700 text-xs px-2 py-0.5 rounded-full">{e.category}</span>
                  </td>
                  <td className="px-4 py-3">
                    {e.property_code && (
                      <span className="inline-block bg-blue-100 text-blue-700 text-xs px-2 py-0.5 rounded-full">{e.property_code}</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-slate-500 text-xs">{e.tmc_accounts?.name}</td>
                  <td className="px-4 py-3 text-right font-medium text-green-600">{fmt(e.income)}</td>
                  <td className="px-4 py-3 text-right font-medium text-red-600">{fmt(e.expense)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {/* Pagination Footer */}
        {!loading && entries.length > 0 && (
          <div className="flex items-center justify-between px-4 py-3 border-t bg-slate-50">
            <p className="text-xs text-slate-500">
              แสดง {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, entries.length)} จาก {entries.length} รายการ
            </p>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost" size="icon"
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="h-8 w-8"
              >
                <ChevronLeft className="w-4 h-4" />
              </Button>

              {Array.from({ length: totalPages }, (_, i) => i + 1)
                .filter(p => p === 1 || p === totalPages || Math.abs(p - page) <= 1)
                .reduce<(number | 'ellipsis')[]>((acc, p, idx, arr) => {
                  if (idx > 0 && p - (arr[idx - 1] as number) > 1) acc.push('ellipsis');
                  acc.push(p);
                  return acc;
                }, [])
                .map((item, idx) =>
                  item === 'ellipsis' ? (
                    <span key={`e${idx}`} className="px-1 text-slate-400 text-xs">…</span>
                  ) : (
                    <Button
                      key={item}
                      variant={item === page ? 'default' : 'ghost'}
                      size="icon"
                      onClick={() => setPage(item as number)}
                      className="h-8 w-8 text-xs"
                    >
                      {item}
                    </Button>
                  )
                )}

              <Button
                variant="ghost" size="icon"
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="h-8 w-8"
              >
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* ── Add Entry Dialog ── */}
      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>เพิ่มรายการบัญชี</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            {/* ประเภท toggle */}
            <div className="col-span-2 space-y-1.5">
              <Label>ประเภท *</Label>
              <div className="grid grid-cols-2 gap-2">
                <Button
                  type="button"
                  variant={form.entryType === 'income' ? 'default' : 'outline'}
                  className={form.entryType === 'income'
                    ? 'bg-green-600 hover:bg-green-700 border-green-600 text-white'
                    : 'text-green-700 border-green-200 hover:bg-green-50 hover:text-green-800'}
                  onClick={() => setForm(f => ({ ...f, entryType: 'income' }))}
                >
                  ↑ รายรับ
                </Button>
                <Button
                  type="button"
                  variant={form.entryType === 'expense' ? 'default' : 'outline'}
                  className={form.entryType === 'expense'
                    ? 'bg-red-600 hover:bg-red-700 border-red-600 text-white'
                    : 'text-red-700 border-red-200 hover:bg-red-50 hover:text-red-800'}
                  onClick={() => setForm(f => ({ ...f, entryType: 'expense' }))}
                >
                  ↓ รายจ่าย
                </Button>
              </div>
            </div>
            <div className="col-span-2 space-y-1.5">
              <Label>บัญชี *</Label>
              <CustomSelect value={form.accountId} onChange={v => setForm(f => ({ ...f, accountId: v }))} options={accountFormOptions} />
            </div>
            <div className="space-y-1.5">
              <Label>วันที่ *</Label>
              <ThaiDatePicker value={form.entryDate} onChange={v => setForm(f => ({ ...f, entryDate: v }))} />
            </div>
            <div className="space-y-1.5">
              <Label>แปลง</Label>
              <CustomSelect value={form.propertyCode} onChange={v => setForm(f => ({ ...f, propertyCode: v }))} options={propertyFormOptions} />
            </div>
            <div className="col-span-2 space-y-1.5">
              <Label>รายการ *</Label>
              <Input placeholder="เช่น คุณวชิราภรณ์ เข้าพัก 1 คืน"
                value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
            </div>
            <div className="col-span-2 space-y-1.5">
              <Label>หมวดหมู่ *</Label>
              <CustomSelect value={form.category} onChange={v => setForm(f => ({ ...f, category: v }))} options={categoryFormOptions} />
            </div>
            <div className="col-span-2 space-y-1.5">
              <Label>จำนวน (บาท) *</Label>
              <Input type="number" placeholder="0.00" value={form.amount}
                onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} />
            </div>
            <div className="col-span-2 space-y-1.5">
              <Label>หมายเหตุ</Label>
              <Input value={form.note} onChange={e => setForm(f => ({ ...f, note: e.target.value }))} />
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-2">
            <Button variant="outline" onClick={() => setShowForm(false)}>ยกเลิก</Button>
            <Button onClick={handleSave} disabled={saving || !form.accountId || !form.description || !form.category || !form.entryType || !form.amount}>
              {saving ? 'กำลังบันทึก…' : 'บันทึก'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Master Data Dialog (หมวด / แปลง) ── */}
      <Dialog open={showMaster} onOpenChange={setShowMaster}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>จัดการหมวดและแปลง</DialogTitle></DialogHeader>

          {/* Tabs */}
          <div className="flex overflow-hidden rounded-lg border border-slate-200">
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
              <div className="max-h-56 space-y-1.5 overflow-y-auto pr-1">
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
                  <p className="py-4 text-center text-sm text-slate-400">ยังไม่มีหมวด</p>
                )}
              </div>
              <div className="flex gap-2 rounded-xl border border-dashed border-slate-300 p-3">
                <Input placeholder="ชื่อหมวดใหม่ เช่น ค่าซ่อมแซม"
                  value={newCatName} onChange={e => setNewCatName(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') void createCategory(); }}
                  className="flex-1" />
                <Button size="sm" onClick={createCategory} disabled={masterSaving || !newCatName.trim()}>
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}

          {/* Properties Tab */}
          {masterTab === 'property' && (
            <div className="space-y-3">
              <p className="text-xs text-slate-400">คลิก ✏️ เพื่อแก้ไขชื่อและรหัส | 🗑️ เพื่อลบ</p>
              <div className="max-h-56 space-y-1.5 overflow-y-auto pr-1">
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
                  <p className="py-4 text-center text-sm text-slate-400">ยังไม่มีแปลง</p>
                )}
              </div>
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
