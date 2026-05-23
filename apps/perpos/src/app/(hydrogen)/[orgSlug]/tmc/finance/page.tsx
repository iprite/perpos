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
import { Plus, Filter, ChevronLeft, ChevronRight } from 'lucide-react';

const TMC_ORG_ID = '1f52618c-09c4-49c5-a929-ea5060f26e7d';

const CATEGORIES = [
  'รายรับ ค่าเช่า', 'ค่ามัดจำ', 'คืนเงินมัดจำ', 'ค่าอาหาร', 'อาหารเช้า',
  'หมูกระทะ', 'บาร์บีคิว', 'ค่าแรง(เงินเดือน+จ้างนอก)', 'ค่าไฟ', 'ค่าน้ำ',
  'ซักผ้า', 'ล้างแอร์', 'ค่าของใช้ทั่วไป', 'ค่าโทรศัพท์', 'ค่าใช้จ่ายอื่นๆ',
  'ค่าส่งของ', 'ค่าเสื้อพนักงาน', 'ค่านวด', 'เงินสดย่อย', 'แมคโค', 'ส่วนกลาง', 'บัญชี',
];

const PROPERTY_CODES = ['TMC1', 'TMC2', 'TMC3-4', 'TMC5', 'TMC6', 'TMC7', 'ส่วนกลาง'];

type Account = { id: string; name: string; account_type: string };
type Entry = {
  id: string; entry_date: string; description: string; category: string;
  property_code: string | null; income: number | null; expense: number | null;
  note: string | null; tmc_accounts: { name: string } | null;
};

function fmt(n: number | null) {
  if (!n) return '—';
  return n.toLocaleString('th-TH', { minimumFractionDigits: 2 });
}

export default function TmcFinancePage() {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);

  // filters
  const [accountId, setAccountId] = useState('');
  const [propertyCode, setPropertyCode] = useState('');
  const [category, setCategory] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

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

  const headers = useCallback(async () => {
    const { data } = await supabase.auth.getSession();
    return {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${data.session?.access_token ?? ''}`,
    };
  }, [supabase]);

  const load = useCallback(async () => {
    setLoading(true);
    const h = await headers();
    const p = new URLSearchParams({ orgId: TMC_ORG_ID });
    if (accountId) p.set('accountId', accountId);
    if (propertyCode) p.set('propertyCode', propertyCode);
    if (category) p.set('category', category);
    if (from) p.set('from', from);
    if (to) p.set('to', to);

    const [accRes, entRes] = await Promise.all([
      fetch(backendUrl(`/tmc/accounts?orgId=${TMC_ORG_ID}`), { headers: h }),
      fetch(backendUrl(`/tmc/finance?${p}`), { headers: h }),
    ]);
    const [accData, entData] = await Promise.all([accRes.json(), entRes.json()]);
    setAccounts(accData);
    setEntries(entData.entries ?? []);
    setLoading(false);
  }, [headers, accountId, propertyCode, category, from, to]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { setPage(1); }, [entries]);

  async function handleSave() {
    if (!form.accountId || !form.description || !form.category || !form.entryType || !form.amount) return;
    setSaving(true);
    const h = await headers();
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
    load();
  }

  const totalIncome = entries.reduce((s, e) => s + (e.income ?? 0), 0);
  const totalExpense = entries.reduce((s, e) => s + (e.expense ?? 0), 0);

  const totalPages = Math.max(1, Math.ceil(entries.length / PAGE_SIZE));
  const pagedEntries = entries.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const accountOptions = useMemo(() => [
    { value: '', label: 'ทุกบัญชี' },
    ...accounts
      .filter(a => a.account_type !== 'petty_cash')
      .map(a => ({ value: a.id, label: a.name })),
  ], [accounts]);

  const propertyOptions = useMemo(() => [
    { value: '', label: 'ทุกแปลง' },
    ...PROPERTY_CODES.map(c => ({ value: c, label: c })),
  ], []);

  const categoryOptions = useMemo(() => [
    { value: '', label: 'ทุกหมวด' },
    ...CATEGORIES.map(c => ({ value: c, label: c })),
  ], []);

  const accountFormOptions = useMemo(() => [
    { value: '', label: 'เลือกบัญชี' },
    ...accounts
      .filter(a => a.account_type !== 'petty_cash')
      .map(a => ({ value: a.id, label: a.name })),
  ], [accounts]);

  const propertyFormOptions = useMemo(() => [
    { value: '', label: '-' },
    ...PROPERTY_CODES.map(c => ({ value: c, label: c })),
  ], []);

  const categoryFormOptions = useMemo(() => [
    { value: '', label: 'เลือกหมวด' },
    ...CATEGORIES.map(c => ({ value: c, label: c })),
  ], []);

  return (
    <div className="p-4 md:p-6 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900">บัญชีและการเงิน</h1>
          <p className="text-sm text-slate-500">TMC Management</p>
        </div>
        <Button onClick={() => setShowForm(true)}>
          <Plus className="w-4 h-4" /> เพิ่มรายการ
        </Button>
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
        <CustomSelect value={accountId} onChange={setAccountId} options={accountOptions} className="w-36" />
        <CustomSelect value={propertyCode} onChange={setPropertyCode} options={propertyOptions} className="w-28" />
        <CustomSelect value={category} onChange={setCategory} options={categoryOptions} className="w-36" />
        <ThaiDatePicker value={from} onChange={setFrom} placeholder="ตั้งแต่" className="w-32" />
        <ThaiDatePicker value={to} onChange={setTo} placeholder="ถึง" className="w-32" />
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

              {/* Page number pills */}
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

      {/* Add Entry Dialog */}
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
    </div>
  );
}
