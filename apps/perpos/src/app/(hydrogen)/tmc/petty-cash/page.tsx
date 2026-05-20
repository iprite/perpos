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
import { Plus, Filter, Wallet, ArrowDownCircle, ArrowUpCircle, Pencil, Trash2, Settings } from 'lucide-react';

const TMC_ORG_ID = '1f52618c-09c4-49c5-a929-ea5060f26e7d';

const PROPERTY_CODES = ['TMC1', 'TMC2', 'TMC3-4', 'TMC5', 'TMC6', 'TMC7', 'ส่วนกลาง'];

const EXPENSE_CATEGORIES = [
  'ค่าอาหาร', 'อาหารเช้า', 'หมูกระทะ', 'บาร์บีคิว', 'ค่าแรง',
  'ค่าไฟ', 'ค่าน้ำ', 'ซักผ้า', 'ล้างแอร์', 'ค่าของใช้ทั่วไป',
  'ค่าโทรศัพท์', 'ค่าส่งของ', 'ค่าเสื้อพนักงาน', 'ค่านวด',
  'แมคโค', 'Timber', 'ค่าใช้จ่ายอื่นๆ',
];

type Fund = { id: string; name: string; note: string | null };
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

function fmt(n: number) {
  return n.toLocaleString('th-TH', { minimumFractionDigits: 2 });
}
function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('th-TH', { day: '2-digit', month: 'short', year: '2-digit' });
}

export default function TmcPettyCashPage() {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);

  const [funds, setFunds] = useState<Fund[]>([]);
  const [txns,  setTxns]  = useState<Txn[]>([]);
  const [totalTopUp,   setTotalTopUp]   = useState(0);
  const [totalExpense, setTotalExpense] = useState(0);
  const [loading, setLoading] = useState(true);

  // filters
  const [filterFund, setFilterFund]     = useState('');
  const [filterType, setFilterType]     = useState('');
  const [filterProp, setFilterProp]     = useState('');
  const [from, setFrom]                 = useState('');
  const [to,   setTo]                   = useState('');

  // txn form
  const [showForm, setShowForm]   = useState(false);
  const [editId,   setEditId]     = useState<string | null>(null);
  const [form, setForm]           = useState({ ...EMPTY_FORM });
  const [saving,   setSaving]     = useState(false);
  const [formErr,  setFormErr]    = useState('');

  // fund management dialog
  const [showFunds,   setShowFunds]   = useState(false);
  const [newFundName, setNewFundName] = useState('');
  const [newFundNote, setNewFundNote] = useState('');
  const [fundSaving,  setFundSaving]  = useState(false);

  // delete confirm
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const authHeader = useCallback(async () => {
    const { data } = await supabase.auth.getSession();
    return { Authorization: `Bearer ${data.session?.access_token ?? ''}` };
  }, [supabase]);

  const loadFunds = useCallback(async () => {
    const h = await authHeader();
    const res = await fetch(`/api/tmc/petty-cash/funds?orgId=${TMC_ORG_ID}`, { headers: h });
    const data = await res.json();
    setFunds(Array.isArray(data) ? data : []);
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

  useEffect(() => { void loadFunds(); }, [loadFunds]);
  useEffect(() => { void load(); }, [load]);

  // ── Save transaction ─────────────────────────────────────────────────────────
  async function handleSave() {
    if (!form.fundId || !form.description || !form.amount) {
      setFormErr('กรุณากรอกข้อมูลที่จำเป็น'); return;
    }
    setSaving(true); setFormErr('');
    const h = await authHeader();
    const body = {
      orgId:        TMC_ORG_ID,
      fundId:       form.fundId,
      txnDate:      form.txnDate,
      txnType:      form.txnType,
      amount:       form.amount,
      description:  form.description,
      category:     form.category || undefined,
      propertyCode: form.propertyCode || undefined,
      note:         form.note || undefined,
    };
    const res = editId
      ? await fetch('/api/tmc/petty-cash', { method: 'PUT',  headers: { ...h, 'Content-Type': 'application/json' }, body: JSON.stringify({ ...body, id: editId }) })
      : await fetch('/api/tmc/petty-cash', { method: 'POST', headers: { ...h, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      setFormErr(err.error ?? 'บันทึกไม่สำเร็จ');
    } else {
      setShowForm(false); setEditId(null); setForm({ ...EMPTY_FORM }); void load();
    }
    setSaving(false);
  }

  function openEdit(t: Txn) {
    setForm({
      fundId: t.fund_id, txnDate: t.txn_date, txnType: t.txn_type,
      amount: String(t.amount), description: t.description,
      category: t.category ?? '', propertyCode: t.property_code ?? '', note: t.note ?? '',
    });
    setEditId(t.id); setFormErr(''); setShowForm(true);
  }

  // ── Delete transaction ───────────────────────────────────────────────────────
  async function handleDelete() {
    if (!deleteId) return;
    const h = await authHeader();
    await fetch(`/api/tmc/petty-cash?id=${deleteId}&orgId=${TMC_ORG_ID}`, { method: 'DELETE', headers: h });
    setDeleteId(null); void load();
  }

  // ── Create fund ─────────────────────────────────────────────────────────────
  async function handleCreateFund() {
    if (!newFundName.trim()) return;
    setFundSaving(true);
    const h = await authHeader();
    await fetch('/api/tmc/petty-cash/funds', {
      method: 'POST',
      headers: { ...h, 'Content-Type': 'application/json' },
      body: JSON.stringify({ orgId: TMC_ORG_ID, name: newFundName, note: newFundNote }),
    });
    setNewFundName(''); setNewFundNote(''); setFundSaving(false);
    void loadFunds();
  }

  // ── Options ─────────────────────────────────────────────────────────────────
  const fundOptions = useMemo(() => [
    { value: '', label: 'ทุกกระเป๋า' },
    ...funds.map(f => ({ value: f.id, label: f.name })),
  ], [funds]);

  const fundFormOptions = useMemo(() => [
    { value: '', label: 'เลือกกระเป๋า' },
    ...funds.map(f => ({ value: f.id, label: f.name })),
  ], [funds]);

  const typeOptions = [
    { value: '', label: 'ทุกประเภท' },
    { value: 'top_up',  label: 'เติมเงิน' },
    { value: 'expense', label: 'ใช้เงิน' },
  ];
  const typeFormOptions = [
    { value: 'top_up',  label: '⬆ เติมเงิน' },
    { value: 'expense', label: '⬇ ใช้เงิน' },
  ];

  const propOptions = useMemo(() => [
    { value: '', label: 'ทุกแปลง' },
    ...PROPERTY_CODES.map(c => ({ value: c, label: c })),
  ], []);

  const catOptions = useMemo(() => [
    { value: '', label: '— ไม่ระบุ —' },
    ...EXPENSE_CATEGORIES.map(c => ({ value: c, label: c })),
  ], []);

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
          <Button variant="outline" size="sm" onClick={() => setShowFunds(true)}>
            <Settings className="w-4 h-4" /> จัดการกระเป๋า
          </Button>
          <Button onClick={() => { setEditId(null); setForm({ ...EMPTY_FORM }); setFormErr(''); setShowForm(true); }}>
            <Plus className="w-4 h-4" /> เพิ่มรายการ
          </Button>
        </div>
      </div>

      {/* No funds warning */}
      {funds.length === 0 && !loading && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-700">
          ยังไม่มีกระเป๋าเงินสดย่อย — กด <strong>จัดการกระเป๋า</strong> เพื่อสร้างกระเป๋าแรก
        </div>
      )}

      {/* Fund balance chips */}
      {funds.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {funds.map(f => (
            <button
              key={f.id}
              type="button"
              onClick={() => setFilterFund(prev => prev === f.id ? '' : f.id)}
              className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                filterFund === f.id
                  ? 'border-amber-400 bg-amber-50 text-amber-700'
                  : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
              }`}
            >
              {f.name}
            </button>
          ))}
        </div>
      )}

      {/* Summary Cards */}
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
        <CustomSelect value={filterProp} onChange={setFilterProp} options={propOptions} className="w-28" />
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
                <th className="px-4 py-3 text-center font-medium text-slate-400 w-20"></th>
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
                    {t.category && (
                      <span className="inline-block rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">{t.category}</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {t.property_code && (
                      <span className="inline-block rounded-full bg-blue-50 px-2 py-0.5 text-xs text-blue-600">{t.property_code}</span>
                    )}
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

      {/* ── Add/Edit Transaction Dialog ── */}
      <Dialog open={showForm} onOpenChange={v => { setShowForm(v); if (!v) { setEditId(null); setForm({ ...EMPTY_FORM }); } }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editId ? 'แก้ไขรายการ' : 'เพิ่มรายการเงินสดย่อย'}</DialogTitle>
          </DialogHeader>

          <div className="grid grid-cols-2 gap-3">
            {/* Type toggle */}
            <div className="col-span-2 space-y-1.5">
              <Label>ประเภท *</Label>
              <div className="flex rounded-lg border border-slate-200 overflow-hidden">
                {typeFormOptions.map(opt => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setForm(f => ({ ...f, txnType: opt.value as 'top_up' | 'expense' }))}
                    className={`flex-1 py-2 text-sm font-medium transition-colors ${
                      form.txnType === opt.value
                        ? opt.value === 'top_up'
                          ? 'bg-green-500 text-white'
                          : 'bg-red-500 text-white'
                        : 'bg-white text-slate-500 hover:bg-slate-50'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Fund */}
            <div className="col-span-2 space-y-1.5">
              <Label>กระเป๋าเงินสดย่อย *</Label>
              <CustomSelect value={form.fundId} onChange={v => setForm(f => ({ ...f, fundId: v }))} options={fundFormOptions} />
            </div>

            {/* Date + Amount */}
            <div className="space-y-1.5">
              <Label>วันที่ *</Label>
              <ThaiDatePicker value={form.txnDate} onChange={v => setForm(f => ({ ...f, txnDate: v }))} />
            </div>
            <div className="space-y-1.5">
              <Label>จำนวนเงิน (บาท) *</Label>
              <Input type="number" placeholder="0.00" value={form.amount}
                onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} />
            </div>

            {/* Description */}
            <div className="col-span-2 space-y-1.5">
              <Label>รายการ *</Label>
              <Input placeholder={form.txnType === 'top_up' ? 'เช่น เติมเงินสดย่อยรอบสัปดาห์' : 'เช่น ซื้อของใช้ทั่วไป'}
                value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
            </div>

            {/* Category (expense only) */}
            {form.txnType === 'expense' && (
              <div className="space-y-1.5">
                <Label>หมวด</Label>
                <CustomSelect value={form.category} onChange={v => setForm(f => ({ ...f, category: v }))} options={catOptions} />
              </div>
            )}

            {/* Property */}
            <div className="space-y-1.5">
              <Label>แปลง</Label>
              <CustomSelect value={form.propertyCode} onChange={v => setForm(f => ({ ...f, propertyCode: v }))}
                options={[{ value: '', label: '—' }, ...PROPERTY_CODES.map(c => ({ value: c, label: c }))]} />
            </div>

            {/* Note */}
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

      {/* ── Delete Confirm Dialog ── */}
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

          {/* Existing funds */}
          {funds.length > 0 && (
            <div className="mb-4 space-y-2">
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

          {/* Create new fund */}
          <div className="space-y-3 rounded-xl border border-dashed border-slate-300 p-4">
            <p className="text-sm font-medium text-slate-700">สร้างกระเป๋าใหม่</p>
            <div className="space-y-1.5">
              <Label>ชื่อกระเป๋า *</Label>
              <Input placeholder="เช่น กระเป๋าเงินสดย่อยหน้าบ้าน"
                value={newFundName} onChange={e => setNewFundName(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>หมายเหตุ</Label>
              <Input placeholder="รายละเอียดเพิ่มเติม (ไม่บังคับ)"
                value={newFundNote} onChange={e => setNewFundNote(e.target.value)} />
            </div>
            <Button onClick={handleCreateFund} disabled={fundSaving || !newFundName.trim()} size="sm">
              {fundSaving ? 'กำลังสร้าง…' : 'สร้างกระเป๋า'}
            </Button>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowFunds(false)}>ปิด</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
