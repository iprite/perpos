'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { backendUrl } from '@/lib/backend';
import { Button } from '@/components/ui/button';
import { PageShell } from '@/components/ui/page-shell';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { CustomSelect } from '@/components/ui/custom-select';
import { MultiSelect } from '@/components/ui/multi-select';
import { ThaiDatePicker } from '@/components/ui/thai-date-picker';
import { StatusBadge } from '@/components/ui/badge';
import {
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell, TableEmpty, TableLoading,
} from '@/components/ui/table';
import {
  Dialog, DialogContent, DialogHeader, DialogBody, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
  Plus, Filter, Settings, Tag, MapPin, Check, X, Pencil, Trash2,
  ChevronLeft, ChevronRight, Landmark, History, TrendingUp, TrendingDown, Wallet,
} from 'lucide-react';
import { StatCard } from '@/components/ui/stat-card';

const TMC_ORG_ID = '1f52618c-09c4-49c5-a929-ea5060f26e7d';

const ACCOUNT_TYPES = [
  { value: 'savings',    label: 'ออมทรัพย์' },
  { value: 'current',   label: 'กระแสรายวัน' },
  { value: 'petty_cash', label: 'เงินสดย่อย' },
  { value: 'other',     label: 'อื่นๆ' },
];

function accountTypeBadge(type: string) {
  switch (type) {
    case 'savings':    return 'bg-green-100 text-green-700 border border-green-200';
    case 'current':    return 'bg-purple-100 text-purple-700 border border-purple-200';
    case 'petty_cash': return 'bg-amber-100 text-amber-700 border border-amber-200';
    default:           return 'bg-slate-100 text-slate-600 border border-slate-200';
  }
}

// ── Types ─────────────────────────────────────────────────────────────────────
type Account  = { id: string; name: string; account_type: string; bank_name: string | null; account_no: string | null; sort_order: number; is_active: boolean };
type Category = { id: string; name: string; sort_order: number; is_active: boolean };
type Property = { id: string; code: string; name: string; is_active: boolean; sort_order: number };
type Entry = {
  id: string; account_id: string; entry_date: string; description: string; category: string;
  property_code: string | null; income: number | null; expense: number | null;
  note: string | null; tmc_accounts: { name: string; account_type: string } | null;
};
type AuditLog = {
  id: string;
  action: 'update' | 'delete';
  changed_at: string;
  old_data: Record<string, unknown> | null;
  new_data: Record<string, unknown> | null;
  profiles: { display_name: string | null; email: string } | null;
};

// ── Helpers ────────────────────────────────────────────────────────────────────
function fmt(n: number | null) {
  if (!n) return '—';
  return n.toLocaleString('th-TH', { minimumFractionDigits: 2 });
}
function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleString('th-TH', {
    day: '2-digit', month: 'short', year: '2-digit',
    hour: '2-digit', minute: '2-digit',
  });
}

const DIFF_FIELDS: [string, string][] = [
  ['entry_date',    'วันที่'],
  ['description',   'รายการ'],
  ['category',      'หมวด'],
  ['property_code', 'แปลง'],
  ['income',        'รายรับ'],
  ['expense',       'รายจ่าย'],
  ['note',          'หมายเหตุ'],
];

function diffSummary(log: AuditLog): string {
  if (log.action === 'delete') {
    const old = log.old_data ?? {};
    const desc = String(old.description ?? '—');
    const amount = old.income != null ? Number(old.income) : old.expense != null ? Number(old.expense) : null;
    return `ลบ: "${desc}"${amount != null ? ` (${amount.toLocaleString('th-TH')} บาท)` : ''}`;
  }
  const oldD = log.old_data ?? {};
  const newD = log.new_data ?? {};
  const changes: string[] = [];
  for (const [key, label] of DIFF_FIELDS) {
    if (JSON.stringify(oldD[key]) !== JSON.stringify(newD[key])) {
      const fmtVal = (v: unknown) => {
        if (v == null) return '—';
        if (key === 'income' || key === 'expense') return Number(v).toLocaleString('th-TH');
        return String(v);
      };
      changes.push(`${label}: ${fmtVal(oldD[key])} → ${fmtVal(newD[key])}`);
    }
  }
  return changes.length > 0 ? changes.join(' | ') : 'ไม่มีการเปลี่ยนแปลง';
}

// ── Inline editable row ────────────────────────────────────────────────────────
function EditableRow({
  label, value, placeholder, onSave, onDelete, extraField,
}: {
  label: string; value: string; placeholder?: string;
  onSave: (val: string, extra?: string) => Promise<void>;
  onDelete: () => Promise<void>;
  extraField?: { label: string; value: string; placeholder?: string };
}) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(value);
  const [ext, setExt] = useState(extraField?.value ?? '');
  const [busy, setBusy] = useState(false);

  async function save() {
    if (!val.trim()) return;
    setBusy(true);
    await onSave(val.trim(), ext.trim() || undefined);
    setBusy(false); setEditing(false);
  }
  async function remove() { setBusy(true); await onDelete(); setBusy(false); }

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

// ── Constants ─────────────────────────────────────────────────────────────────
const EMPTY_ACCOUNT = { name: '', account_type: 'savings', bank_name: '', account_no: '' };
const EMPTY_FORM = {
  accountId: '', entryDate: new Date().toISOString().slice(0, 10),
  description: '', entryType: '' as 'income' | 'expense' | '',
  category: '', propertyCodes: [] as string[], amount: '', note: '',
};

// ── Main page ──────────────────────────────────────────────────────────────────
export default function TmcFinancePage() {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);

  const [accounts,   setAccounts]   = useState<Account[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [properties, setProperties] = useState<Property[]>([]);
  const [entries,    setEntries]    = useState<Entry[]>([]);
  const [loading,    setLoading]    = useState(true);

  // filters
  const [filterAccountId, setFilterAccountId] = useState('');
  const [filterPropCode,  setFilterPropCode]  = useState<string[]>([]);
  const [filterCategory,  setFilterCategory]  = useState('');
  const [from, setFrom] = useState('');
  const [to,   setTo]   = useState('');

  // pagination
  const PAGE_SIZE = 10;
  const [page, setPage] = useState(1);

  // entry form (create / edit)
  const [showForm,   setShowForm]   = useState(false);
  const [editEntry,  setEditEntry]  = useState<Entry | null>(null);
  const [form,       setForm]       = useState({ ...EMPTY_FORM });
  const [saving,     setSaving]     = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [deleting,   setDeleting]   = useState(false);

  // master data (categories / properties)
  const [showMaster,   setShowMaster]   = useState(false);
  const [masterTab,    setMasterTab]    = useState<'category' | 'property'>('category');
  const [newCatName,   setNewCatName]   = useState('');
  const [newPropCode,  setNewPropCode]  = useState('');
  const [newPropName,  setNewPropName]  = useState('');
  const [masterSaving, setMasterSaving] = useState(false);

  // accounts management
  const [showAccounts,    setShowAccounts]    = useState(false);
  const [editAccount,     setEditAccount]     = useState<Account | null>(null);
  const [accountForm,     setAccountForm]     = useState({ ...EMPTY_ACCOUNT });
  const [accountSaving,   setAccountSaving]   = useState(false);
  const [showAccountForm, setShowAccountForm] = useState(false);

  // audit log viewer
  const [showLogs,   setShowLogs]   = useState(false);
  const [logs,       setLogs]       = useState<AuditLog[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);

  const authHeader = useCallback(async () => {
    const { data } = await supabase.auth.getSession();
    return {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${data.session?.access_token ?? ''}`,
    };
  }, [supabase]);

  // ── Loaders ──────────────────────────────────────────────────────────────────
  const loadAccounts = useCallback(async () => {
    const h = await authHeader();
    const res = await fetch(backendUrl(`/tmc/accounts?orgId=${TMC_ORG_ID}&all=1`), { headers: h });
    const data = await res.json();
    setAccounts(Array.isArray(data) ? data : []);
  }, [authHeader]);

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
    if (filterAccountId)           p.set('accountId',     filterAccountId);
    if (filterPropCode.length > 0) p.set('propertyCodes', filterPropCode.join(','));
    if (filterCategory)  p.set('category',     filterCategory);
    if (from)            p.set('from',         from);
    if (to)              p.set('to',           to);

    const [accRes, entRes] = await Promise.all([
      fetch(backendUrl(`/tmc/accounts?orgId=${TMC_ORG_ID}`), { headers: h }),
      fetch(backendUrl(`/tmc/finance?${p}`), { headers: h }),
    ]);
    const [accData, entData] = await Promise.all([accRes.json(), entRes.json()]);
    setAccounts(Array.isArray(accData) ? accData : []);
    setEntries(entData.entries ?? []);
    setLoading(false);
  }, [authHeader, filterAccountId, filterPropCode.join(','), filterCategory, from, to]);

  const loadLogs = useCallback(async () => {
    setLogsLoading(true);
    const h = await authHeader();
    const res = await fetch(backendUrl(`/tmc/audit-logs?orgId=${TMC_ORG_ID}&table=tmc_finance_entries&limit=100`), { headers: h });
    const data = await res.json();
    setLogs(Array.isArray(data) ? data : []);
    setLogsLoading(false);
  }, [authHeader]);

  useEffect(() => { void loadMaster(); }, [loadMaster]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => { setPage(1); }, [entries]);

  // ── Entry form helpers ───────────────────────────────────────────────────────
  function openCreate() {
    setEditEntry(null);
    setForm({ ...EMPTY_FORM, entryDate: new Date().toISOString().slice(0, 10) });
    setShowForm(true);
  }

  function openEdit(entry: Entry) {
    setEditEntry(entry);
    setForm({
      accountId:  entry.account_id,
      entryDate:  entry.entry_date.slice(0, 10),
      description: entry.description,
      entryType:  entry.income != null ? 'income' : 'expense',
      category:   entry.category,
      propertyCodes: entry.property_code ? entry.property_code.split(',').filter(Boolean) : [],
      amount:     String(entry.income ?? entry.expense ?? ''),
      note:       entry.note ?? '',
    });
    setShowForm(true);
  }

  function closeForm() {
    setShowForm(false);
    setEditEntry(null);
    setDeleteConfirm(false);
    setForm({ ...EMPTY_FORM, entryDate: new Date().toISOString().slice(0, 10) });
  }

  async function handleSave() {
    if (!form.accountId || !form.description || !form.category || !form.entryType || !form.amount) return;
    setSaving(true);
    const h = await authHeader();
    const income  = form.entryType === 'income'  ? form.amount : '';
    const expense = form.entryType === 'expense' ? form.amount : '';

    const propertyCode = form.propertyCodes.length > 0 ? form.propertyCodes.join(',') : '';
    if (editEntry) {
      await fetch(backendUrl('/tmc/finance'), {
        method: 'PUT', headers: h,
        body: JSON.stringify({
          id: editEntry.id, orgId: TMC_ORG_ID,
          accountId: form.accountId, entryDate: form.entryDate,
          description: form.description, category: form.category,
          propertyCode, income, expense, note: form.note,
        }),
      });
    } else {
      await fetch(backendUrl('/tmc/finance'), {
        method: 'POST', headers: h,
        body: JSON.stringify({
          orgId: TMC_ORG_ID,
          accountId: form.accountId, entryDate: form.entryDate,
          description: form.description, category: form.category,
          propertyCode, income, expense, note: form.note,
        }),
      });
    }
    setSaving(false);
    closeForm();
    void load();
  }

  async function handleDelete() {
    if (!editEntry) return;
    setDeleting(true);
    const h = await authHeader();
    await fetch(backendUrl(`/tmc/finance?id=${editEntry.id}&orgId=${TMC_ORG_ID}`), {
      method: 'DELETE', headers: h,
    });
    setDeleting(false);
    closeForm();
    void load();
  }

  // ── Account CRUD ─────────────────────────────────────────────────────────────
  async function handleSaveAccount() {
    if (!accountForm.name.trim()) return;
    setAccountSaving(true);
    const h = await authHeader();
    if (editAccount) {
      await fetch(backendUrl('/tmc/accounts'), {
        method: 'PATCH', headers: h,
        body: JSON.stringify({ orgId: TMC_ORG_ID, id: editAccount.id, ...accountForm }),
      });
    } else {
      await fetch(backendUrl('/tmc/accounts'), {
        method: 'POST', headers: h,
        body: JSON.stringify({ orgId: TMC_ORG_ID, ...accountForm }),
      });
    }
    setAccountSaving(false);
    setShowAccountForm(false);
    setEditAccount(null);
    setAccountForm({ ...EMPTY_ACCOUNT });
    void loadAccounts();
    void load();
  }

  async function handleDeleteAccount(id: string) {
    const h = await authHeader();
    await fetch(backendUrl(`/tmc/accounts?id=${id}&orgId=${TMC_ORG_ID}`), {
      method: 'DELETE', headers: h,
    });
    void loadAccounts();
    void load();
  }

  // ── Category CRUD ────────────────────────────────────────────────────────────
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

  // ── Property CRUD ────────────────────────────────────────────────────────────
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

  // ── Options ──────────────────────────────────────────────────────────────────
  const activeAccounts   = useMemo(() => accounts.filter(a => a.is_active && a.account_type !== 'petty_cash'), [accounts]);
  const activeCategories = useMemo(() => categories.filter(c => c.is_active), [categories]);
  const activeProperties = useMemo(() => properties.filter(p => p.is_active), [properties]);

  const totalIncome  = entries.reduce((s, e) => s + (e.income  ?? 0), 0);
  const totalExpense = entries.reduce((s, e) => s + (e.expense ?? 0), 0);
  const totalPages   = Math.max(1, Math.ceil(entries.length / PAGE_SIZE));
  const pagedEntries = entries.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const accountFilterOpts  = useMemo(() => [{ value: '', label: 'ทุกบัญชี' }, ...activeAccounts.map(a => ({ value: a.id, label: a.name }))], [activeAccounts]);
  const propertyFilterOpts = useMemo(() => [{ value: '', label: 'ทุกแปลง' }, ...activeProperties.map(p => ({ value: p.code, label: p.code }))], [activeProperties]);
  const categoryFilterOpts = useMemo(() => [{ value: '', label: 'ทุกหมวด' }, ...activeCategories.map(c => ({ value: c.name, label: c.name }))], [activeCategories]);
  const accountFormOptions = useMemo(() => [{ value: '', label: 'เลือกบัญชี' }, ...activeAccounts.map(a => ({ value: a.id, label: a.name }))], [activeAccounts]);
  const propertyFormOpts   = useMemo(() => [{ value: '', label: '-' }, ...activeProperties.map(p => ({ value: p.code, label: p.code }))], [activeProperties]);
  const categoryFormOpts   = useMemo(() => [{ value: '', label: 'เลือกหมวด' }, ...activeCategories.map(c => ({ value: c.name, label: c.name }))], [activeCategories]);
  const accountTypeOpts    = ACCOUNT_TYPES.map(t => ({ value: t.value, label: t.label }));

  const canSave = !saving && !!form.accountId && !!form.description && !!form.category && !!form.entryType && !!form.amount;

  return (
    <PageShell
      width="full"
      icon={<Landmark className="h-6 w-6" />}
      title="บัญชีและการเงิน"
      description="TMC Management"
      actions={
        <>
          <Button variant="outline" size="sm" onClick={() => { void loadLogs(); setShowLogs(true); }}>
            <History className="w-4 h-4" /> ประวัติ
          </Button>
          <Button variant="outline" size="sm" onClick={() => { void loadAccounts(); setShowAccounts(true); }}>
            <Landmark className="w-4 h-4" /> จัดการบัญชี
          </Button>
          <Button variant="outline" size="sm" onClick={() => { setMasterTab('category'); setShowMaster(true); }}>
            <Settings className="w-4 h-4" /> จัดการหมวด/แปลง
          </Button>
          <Button onClick={openCreate}>
            <Plus className="w-4 h-4" /> เพิ่มรายการ
          </Button>
        </>
      }
    >

      {/* ── Summary Cards ── */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatCard
          icon={<TrendingUp className="h-4 w-4" />}
          label="รายรับรวม"
          value={fmt(totalIncome)}
          tone="positive"
          valueColored
        />
        <StatCard
          icon={<TrendingDown className="h-4 w-4" />}
          label="รายจ่ายรวม"
          value={fmt(totalExpense)}
          tone="negative"
          valueColored
        />
        <StatCard
          icon={<Wallet className="h-4 w-4" />}
          label="คงเหลือ"
          value={fmt(totalIncome - totalExpense)}
          tone={totalIncome - totalExpense >= 0 ? 'info' : 'negative'}
          valueColored
        />
      </div>

      {/* ── Filters ── */}
      <div className="bg-white rounded-xl border p-3 flex flex-wrap items-center gap-2">
        <Filter className="w-4 h-4 text-slate-400 shrink-0" />
        <CustomSelect value={filterAccountId} onChange={setFilterAccountId} options={accountFilterOpts} className="w-44" />
        <MultiSelect value={filterPropCode}  onChange={setFilterPropCode}  options={activeProperties.map(p => ({ value: p.code, label: p.code }))} placeholder="ทุกแปลง" className="w-36" />
        <CustomSelect value={filterCategory}  onChange={setFilterCategory}  options={categoryFilterOpts} className="w-36" />
        <ThaiDatePicker value={from} onChange={setFrom} placeholder="ตั้งแต่" className="w-32" />
        <ThaiDatePicker value={to}   onChange={setTo}   placeholder="ถึง"     className="w-32" />
      </div>

      {/* ── Table ── */}
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>วันที่</TableHead>
            <TableHead>รายการ</TableHead>
            <TableHead>หมวด</TableHead>
            <TableHead>แปลง</TableHead>
            <TableHead>บัญชี</TableHead>
            <TableHead align="right">รายรับ</TableHead>
            <TableHead align="right">รายจ่าย</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {loading ? (
            <TableLoading colSpan={7} />
          ) : entries.length === 0 ? (
            <TableEmpty colSpan={7}>ยังไม่มีรายการ</TableEmpty>
          ) : pagedEntries.map(e => (
            <TableRow key={e.id} clickable onClick={() => openEdit(e)}>
              <TableCell className="text-slate-600">
                {new Date(e.entry_date).toLocaleDateString('th-TH', { day: '2-digit', month: 'short', year: '2-digit' })}
              </TableCell>
              <TableCell className="text-slate-800">{e.description}</TableCell>
              <TableCell><StatusBadge tone="neutral">{e.category}</StatusBadge></TableCell>
              <TableCell>
                {e.property_code && <StatusBadge tone="info">{e.property_code}</StatusBadge>}
              </TableCell>
              <TableCell>
                {e.tmc_accounts && (
                  <span className={`inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${accountTypeBadge(e.tmc_accounts.account_type)}`}>
                    {e.tmc_accounts.name}
                  </span>
                )}
              </TableCell>
              <TableCell align="right" tabular className="font-medium text-green-600">{fmt(e.income)}</TableCell>
              <TableCell align="right" tabular className="font-medium text-red-600">{fmt(e.expense)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      {/* Pagination */}
      {!loading && entries.length > 0 && (
        <div className="flex items-center justify-between px-1">
          <p className="text-xs text-slate-500">
            แสดง {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, entries.length)} จาก {entries.length} รายการ
          </p>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="h-8 w-8">
              <ChevronLeft className="w-4 h-4" />
            </Button>
            {Array.from({ length: totalPages }, (_, i) => i + 1)
              .filter(p => p === 1 || p === totalPages || Math.abs(p - page) <= 1)
              .reduce<(number | 'ellipsis')[]>((acc, p, idx, arr) => {
                if (idx > 0 && p - (arr[idx - 1] as number) > 1) acc.push('ellipsis');
                acc.push(p); return acc;
              }, [])
              .map((item, idx) =>
                item === 'ellipsis'
                  ? <span key={`e${idx}`} className="px-1 text-slate-400 text-xs">…</span>
                  : <Button key={item} variant={item === page ? 'default' : 'ghost'} size="icon"
                      onClick={() => setPage(item as number)} className="h-8 w-8 text-xs">{item}</Button>
              )}
            <Button variant="ghost" size="icon" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="h-8 w-8">
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      )}

      {/* ── Add / Edit Entry Dialog ── */}
      <Dialog open={showForm} onOpenChange={v => { if (!v) closeForm(); }}>
        <DialogContent size="lg">
          <DialogHeader>
            <DialogTitle>{editEntry ? 'แก้ไขรายการ' : 'เพิ่มรายการบัญชี'}</DialogTitle>
          </DialogHeader>
          <DialogBody>
          <div className="grid grid-cols-2 gap-3">
            {/* ประเภท toggle */}
            <div className="col-span-2 space-y-1.5">
              <Label>ประเภท *</Label>
              <div className="grid grid-cols-2 gap-2">
                <Button type="button"
                  variant={form.entryType === 'income' ? 'default' : 'outline'}
                  className={form.entryType === 'income'
                    ? 'bg-green-600 hover:bg-green-700 border-green-600 text-white'
                    : 'text-green-700 border-green-200 hover:bg-green-50 hover:text-green-800'}
                  onClick={() => setForm(f => ({ ...f, entryType: 'income' }))}>
                  ↑ รายรับ
                </Button>
                <Button type="button"
                  variant={form.entryType === 'expense' ? 'default' : 'outline'}
                  className={form.entryType === 'expense'
                    ? 'bg-red-600 hover:bg-red-700 border-red-600 text-white'
                    : 'text-red-700 border-red-200 hover:bg-red-50 hover:text-red-800'}
                  onClick={() => setForm(f => ({ ...f, entryType: 'expense' }))}>
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
              <MultiSelect
                value={form.propertyCodes}
                onChange={v => setForm(f => ({ ...f, propertyCodes: v }))}
                options={activeProperties.map(p => ({ value: p.code, label: `${p.code} ${p.name}` }))}
                placeholder="— ไม่ระบุ —"
              />
            </div>
            <div className="col-span-2 space-y-1.5">
              <Label>รายการ *</Label>
              <Input placeholder="เช่น คุณวชิราภรณ์ เข้าพัก 1 คืน"
                value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
            </div>
            <div className="col-span-2 space-y-1.5">
              <Label>หมวดหมู่ *</Label>
              <CustomSelect value={form.category} onChange={v => setForm(f => ({ ...f, category: v }))} options={categoryFormOpts} />
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
          </DialogBody>

          <DialogFooter>
            {editEntry && (
              <Button type="button" variant="destructive" className="mr-auto"
                onClick={() => setDeleteConfirm(true)}>
                <Trash2 className="h-4 w-4" /> ลบรายการ
              </Button>
            )}
            <Button variant="outline" onClick={closeForm}>ยกเลิก</Button>
            <Button onClick={handleSave} disabled={!canSave}>
              {saving ? 'กำลังบันทึก…' : editEntry ? 'บันทึกการแก้ไข' : 'บันทึก'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Delete Confirm Dialog ── */}
      <Dialog open={deleteConfirm} onOpenChange={v => { if (!v) setDeleteConfirm(false); }}>
        <DialogContent size="sm">
          <DialogHeader>
            <DialogTitle>ยืนยันการลบ</DialogTitle>
          </DialogHeader>
          <DialogBody className="space-y-3">
          {editEntry && (
            <div className="space-y-2 rounded-lg bg-red-50 border border-red-100 p-3 text-sm">
              <p className="font-medium text-slate-800 truncate">{editEntry.description}</p>
              <p className="text-slate-500">
                {editEntry.income != null
                  ? <span className="text-green-700 font-semibold">รายรับ {fmt(editEntry.income)} บาท</span>
                  : <span className="text-red-700 font-semibold">รายจ่าย {fmt(editEntry.expense)} บาท</span>}
                {' · '}
                {new Date(editEntry.entry_date).toLocaleDateString('th-TH', { day: '2-digit', month: 'short', year: '2-digit' })}
              </p>
            </div>
          )}
          <p className="text-sm text-slate-500">ต้องการลบรายการนี้ใช่หรือไม่? การดำเนินการนี้ไม่สามารถยกเลิกได้</p>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirm(false)}>ยกเลิก</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
              {deleting ? 'กำลังลบ…' : 'ลบ'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Audit Log Viewer ── */}
      <Dialog open={showLogs} onOpenChange={setShowLogs}>
        <DialogContent size="3xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <History className="h-4 w-4" /> ประวัติการแก้ไขและลบ
            </DialogTitle>
          </DialogHeader>

          <DialogBody>
          {logsLoading ? (
            <div className="py-10 text-center text-sm text-slate-400">กำลังโหลด...</div>
          ) : logs.length === 0 ? (
            <div className="py-10 text-center text-sm text-slate-400">ยังไม่มีประวัติการแก้ไข</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>วันเวลา</TableHead>
                  <TableHead>ผู้แก้ไข</TableHead>
                  <TableHead>รายการ</TableHead>
                  <TableHead align="center">ประเภท</TableHead>
                  <TableHead>สรุปการเปลี่ยนแปลง</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {logs.map(log => {
                  const diff = diffSummary(log);
                  const editor = log.profiles?.display_name ?? log.profiles?.email ?? 'ไม่ทราบ';
                  const refDesc = String(log.old_data?.description ?? log.new_data?.description ?? '—');
                  return (
                    <TableRow key={log.id}>
                      <TableCell className="text-xs text-slate-500">{fmtDateTime(log.changed_at)}</TableCell>
                      <TableCell className="max-w-[120px] truncate text-xs text-slate-700" title={editor}>{editor}</TableCell>
                      <TableCell className="max-w-[140px] truncate text-slate-700" title={refDesc}>{refDesc}</TableCell>
                      <TableCell align="center">
                        {log.action === 'delete'
                          ? <StatusBadge tone="danger">ลบ</StatusBadge>
                          : <StatusBadge tone="warning">แก้ไข</StatusBadge>}
                      </TableCell>
                      <TableCell wrap className="max-w-xs text-xs text-slate-500" title={diff}>{diff}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
          </DialogBody>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowLogs(false)}>ปิด</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Manage Accounts Dialog ── */}
      <Dialog open={showAccounts} onOpenChange={v => { setShowAccounts(v); if (!v) { setShowAccountForm(false); setEditAccount(null); setAccountForm({ ...EMPTY_ACCOUNT }); } }}>
        <DialogContent size="md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Landmark className="h-4 w-4" /> จัดการบัญชี
            </DialogTitle>
          </DialogHeader>
          <DialogBody>
          <div className="space-y-2">
            {accounts.filter(a => a.is_active).map(acc => (
              <div key={acc.id} className="flex items-center justify-between rounded-lg border border-slate-100 bg-white px-3 py-2.5 hover:border-slate-200">
                <div className="flex items-center gap-2.5 min-w-0">
                  <span className={`shrink-0 inline-block text-xs px-2 py-0.5 rounded-full font-medium ${accountTypeBadge(acc.account_type)}`}>
                    {ACCOUNT_TYPES.find(t => t.value === acc.account_type)?.label ?? acc.account_type}
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-800 truncate">{acc.name}</p>
                    {acc.account_no && <p className="text-xs text-slate-400">{acc.account_no}</p>}
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0 ml-2">
                  <button type="button"
                    onClick={() => { setEditAccount(acc); setAccountForm({ name: acc.name, account_type: acc.account_type, bank_name: acc.bank_name ?? '', account_no: acc.account_no ?? '' }); setShowAccountForm(true); }}
                    className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700">
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button type="button" onClick={() => void handleDeleteAccount(acc.id)}
                    className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ))}
            {accounts.filter(a => a.is_active).length === 0 && (
              <p className="py-4 text-center text-sm text-slate-400">ยังไม่มีบัญชี</p>
            )}
          </div>

          {showAccountForm ? (
            <div className="space-y-3 rounded-xl border border-blue-200 bg-blue-50 p-4">
              <p className="text-sm font-medium text-blue-800">{editAccount ? 'แก้ไขบัญชี' : 'เพิ่มบัญชีใหม่'}</p>
              <div className="space-y-1.5">
                <Label>ชื่อบัญชี *</Label>
                <Input placeholder="เช่น กสิกร ออมทรัพย์"
                  value={accountForm.name} onChange={e => setAccountForm(f => ({ ...f, name: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>ประเภทบัญชี</Label>
                <CustomSelect value={accountForm.account_type}
                  onChange={v => setAccountForm(f => ({ ...f, account_type: v }))}
                  options={accountTypeOpts} />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1.5">
                  <Label>ธนาคาร</Label>
                  <Input placeholder="เช่น กสิกรไทย"
                    value={accountForm.bank_name} onChange={e => setAccountForm(f => ({ ...f, bank_name: e.target.value }))} />
                </div>
                <div className="space-y-1.5">
                  <Label>เลขที่บัญชี</Label>
                  <Input placeholder="xxx-x-xxxxx-x"
                    value={accountForm.account_no} onChange={e => setAccountForm(f => ({ ...f, account_no: e.target.value }))} />
                </div>
              </div>
              <div className="flex gap-2">
                <Button size="sm" onClick={handleSaveAccount} disabled={accountSaving || !accountForm.name.trim()}>
                  {accountSaving ? 'กำลังบันทึก…' : editAccount ? 'บันทึกการแก้ไข' : 'เพิ่มบัญชี'}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => { setShowAccountForm(false); setEditAccount(null); setAccountForm({ ...EMPTY_ACCOUNT }); }}>
                  ยกเลิก
                </Button>
              </div>
            </div>
          ) : (
            <button type="button"
              onClick={() => { setEditAccount(null); setAccountForm({ ...EMPTY_ACCOUNT }); setShowAccountForm(true); }}
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-slate-300 p-3 text-sm text-slate-500 hover:border-slate-400 hover:text-slate-700 transition-colors">
              <Plus className="h-4 w-4" /> เพิ่มบัญชีใหม่
            </button>
          )}
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAccounts(false)}>ปิด</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Master Data Dialog (หมวด / แปลง) ── */}
      <Dialog open={showMaster} onOpenChange={setShowMaster}>
        <DialogContent size="lg">
          <DialogHeader><DialogTitle>จัดการหมวดและแปลง</DialogTitle></DialogHeader>
          <DialogBody>
          <div className="flex overflow-hidden rounded-lg border border-slate-200">
            <button type="button" onClick={() => setMasterTab('category')}
              className={`flex flex-1 items-center justify-center gap-2 py-2 text-sm font-medium transition-colors ${
                masterTab === 'category' ? 'bg-slate-800 text-white' : 'bg-white text-slate-500 hover:bg-slate-50'}`}>
              <Tag className="h-4 w-4" /> หมวดหมู่
            </button>
            <button type="button" onClick={() => setMasterTab('property')}
              className={`flex flex-1 items-center justify-center gap-2 py-2 text-sm font-medium transition-colors ${
                masterTab === 'property' ? 'bg-slate-800 text-white' : 'bg-white text-slate-500 hover:bg-slate-50'}`}>
              <MapPin className="h-4 w-4" /> แปลง
            </button>
          </div>

          {masterTab === 'category' && (
            <div className="space-y-3">
              <p className="text-xs text-slate-400">คลิก ✏️ เพื่อแก้ไขชื่อ | 🗑️ เพื่อลบ</p>
              <div className="max-h-56 space-y-1.5 overflow-y-auto pr-1">
                {categories.map(cat => (
                  <EditableRow key={cat.id} label={cat.name} value={cat.name} placeholder="ชื่อหมวด"
                    onSave={async (name) => { await updateCategory(cat.id, name); }}
                    onDelete={async () => { await deleteCategory(cat.id); }} />
                ))}
                {categories.length === 0 && <p className="py-4 text-center text-sm text-slate-400">ยังไม่มีหมวด</p>}
              </div>
              <div className="flex gap-2 rounded-xl border border-dashed border-slate-300 p-3">
                <Input placeholder="ชื่อหมวดใหม่ เช่น ค่าซ่อมแซม"
                  value={newCatName} onChange={e => setNewCatName(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') void createCategory(); }} className="flex-1" />
                <Button size="sm" onClick={createCategory} disabled={masterSaving || !newCatName.trim()}>
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}

          {masterTab === 'property' && (
            <div className="space-y-3">
              <p className="text-xs text-slate-400">คลิก ✏️ เพื่อแก้ไขชื่อและรหัส | 🗑️ เพื่อลบ</p>
              <div className="max-h-56 space-y-1.5 overflow-y-auto pr-1">
                {properties.map(prop => (
                  <EditableRow key={prop.id} label={prop.name} value={prop.name} placeholder="ชื่อแปลง"
                    extraField={{ label: 'รหัส', value: prop.code, placeholder: 'รหัส' }}
                    onSave={async (name, code) => { await updateProperty(prop.id, name, code); }}
                    onDelete={async () => { await deleteProperty(prop.id); }} />
                ))}
                {properties.length === 0 && <p className="py-4 text-center text-sm text-slate-400">ยังไม่มีแปลง</p>}
              </div>
              <div className="flex gap-2 rounded-xl border border-dashed border-slate-300 p-3">
                <Input placeholder="รหัส เช่น TMC8" value={newPropCode} onChange={e => setNewPropCode(e.target.value)} className="w-24" />
                <Input placeholder="ชื่อแปลง เช่น บ้านสวน" value={newPropName} onChange={e => setNewPropName(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') void createProperty(); }} className="flex-1" />
                <Button size="sm" onClick={createProperty} disabled={masterSaving || !newPropCode.trim() || !newPropName.trim()}>
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
          </DialogBody>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowMaster(false)}>ปิด</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}
