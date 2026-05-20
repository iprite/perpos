'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { backendUrl } from '@/lib/backend';
import { Button } from 'rizzui';
import { Plus, Filter } from 'lucide-react';

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

  // form
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    accountId: '', entryDate: new Date().toISOString().slice(0, 10),
    description: '', checkInDate: '', checkOutDate: '',
    category: '', propertyCode: '', income: '', expense: '', note: '',
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

  async function handleSave() {
    if (!form.accountId || !form.description || !form.category) return;
    setSaving(true);
    const h = await headers();
    await fetch(backendUrl('/tmc/finance'), {
      method: 'POST',
      headers: h,
      body: JSON.stringify({ orgId: TMC_ORG_ID, ...form }),
    });
    setSaving(false);
    setShowForm(false);
    setForm({ accountId: '', entryDate: new Date().toISOString().slice(0, 10), description: '', checkInDate: '', checkOutDate: '', category: '', propertyCode: '', income: '', expense: '', note: '' });
    load();
  }

  const totalIncome = entries.reduce((s, e) => s + (e.income ?? 0), 0);
  const totalExpense = entries.reduce((s, e) => s + (e.expense ?? 0), 0);

  return (
    <div className="p-4 md:p-6 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">บัญชีและการเงิน</h1>
          <p className="text-sm text-gray-500">TMC Management</p>
        </div>
        <Button onClick={() => setShowForm(true)} className="gap-1">
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
      <div className="bg-white rounded-xl border p-4 flex flex-wrap gap-3">
        <Filter className="w-4 h-4 text-gray-400 mt-2" />
        <select
          className="border rounded-lg px-3 py-1.5 text-sm text-gray-700"
          value={accountId} onChange={e => setAccountId(e.target.value)}
        >
          <option value="">ทุกบัญชี</option>
          {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
        <select
          className="border rounded-lg px-3 py-1.5 text-sm text-gray-700"
          value={propertyCode} onChange={e => setPropertyCode(e.target.value)}
        >
          <option value="">ทุกแปลง</option>
          {PROPERTY_CODES.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <select
          className="border rounded-lg px-3 py-1.5 text-sm text-gray-700"
          value={category} onChange={e => setCategory(e.target.value)}
        >
          <option value="">ทุกหมวด</option>
          {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <input type="date" value={from} onChange={e => setFrom(e.target.value)}
          className="border rounded-lg px-3 py-1.5 text-sm text-gray-700" />
        <input type="date" value={to} onChange={e => setTo(e.target.value)}
          className="border rounded-lg px-3 py-1.5 text-sm text-gray-700" />
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border overflow-x-auto">
        {loading ? (
          <div className="p-8 text-center text-gray-400">กำลังโหลด...</div>
        ) : entries.length === 0 ? (
          <div className="p-8 text-center text-gray-400">ยังไม่มีรายการ</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="text-left px-4 py-3 text-gray-600 font-medium">วันที่</th>
                <th className="text-left px-4 py-3 text-gray-600 font-medium">รายการ</th>
                <th className="text-left px-4 py-3 text-gray-600 font-medium">หมวด</th>
                <th className="text-left px-4 py-3 text-gray-600 font-medium">แปลง</th>
                <th className="text-left px-4 py-3 text-gray-600 font-medium">บัญชี</th>
                <th className="text-right px-4 py-3 text-green-600 font-medium">รายรับ</th>
                <th className="text-right px-4 py-3 text-red-600 font-medium">รายจ่าย</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {entries.map(e => (
                <tr key={e.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
                    {new Date(e.entry_date).toLocaleDateString('th-TH', { day: '2-digit', month: 'short', year: '2-digit' })}
                  </td>
                  <td className="px-4 py-3 text-gray-800 max-w-xs truncate" title={e.description}>
                    {e.description}
                  </td>
                  <td className="px-4 py-3">
                    <span className="inline-block bg-gray-100 text-gray-700 text-xs px-2 py-0.5 rounded-full">
                      {e.category}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {e.property_code && (
                      <span className="inline-block bg-blue-100 text-blue-700 text-xs px-2 py-0.5 rounded-full">
                        {e.property_code}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-500 text-xs">{e.tmc_accounts?.name}</td>
                  <td className="px-4 py-3 text-right font-medium text-green-600">{fmt(e.income)}</td>
                  <td className="px-4 py-3 text-right font-medium text-red-600">{fmt(e.expense)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Add Entry Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg p-6 space-y-4">
            <h2 className="text-lg font-bold">เพิ่มรายการบัญชี</h2>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <label className="text-xs text-gray-500 mb-1 block">บัญชี *</label>
                <select className="w-full border rounded-lg px-3 py-2 text-sm"
                  value={form.accountId} onChange={e => setForm(f => ({ ...f, accountId: e.target.value }))}>
                  <option value="">เลือกบัญชี</option>
                  {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">วันที่ *</label>
                <input type="date" className="w-full border rounded-lg px-3 py-2 text-sm"
                  value={form.entryDate} onChange={e => setForm(f => ({ ...f, entryDate: e.target.value }))} />
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">แปลง</label>
                <select className="w-full border rounded-lg px-3 py-2 text-sm"
                  value={form.propertyCode} onChange={e => setForm(f => ({ ...f, propertyCode: e.target.value }))}>
                  <option value="">-</option>
                  {PROPERTY_CODES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div className="col-span-2">
                <label className="text-xs text-gray-500 mb-1 block">รายการ *</label>
                <input className="w-full border rounded-lg px-3 py-2 text-sm"
                  placeholder="เช่น คุณวชิราภรณ์ เข้าพัก 1 คืน"
                  value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">วันเช็คอิน</label>
                <input type="date" className="w-full border rounded-lg px-3 py-2 text-sm"
                  value={form.checkInDate} onChange={e => setForm(f => ({ ...f, checkInDate: e.target.value }))} />
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">วันเช็คเอาต์</label>
                <input type="date" className="w-full border rounded-lg px-3 py-2 text-sm"
                  value={form.checkOutDate} onChange={e => setForm(f => ({ ...f, checkOutDate: e.target.value }))} />
              </div>
              <div className="col-span-2">
                <label className="text-xs text-gray-500 mb-1 block">หมวดหมู่ *</label>
                <select className="w-full border rounded-lg px-3 py-2 text-sm"
                  value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}>
                  <option value="">เลือกหมวด</option>
                  {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">รายรับ (บาท)</label>
                <input type="number" className="w-full border rounded-lg px-3 py-2 text-sm"
                  placeholder="0.00" value={form.income}
                  onChange={e => setForm(f => ({ ...f, income: e.target.value, expense: '' }))} />
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">รายจ่าย (บาท)</label>
                <input type="number" className="w-full border rounded-lg px-3 py-2 text-sm"
                  placeholder="0.00" value={form.expense}
                  onChange={e => setForm(f => ({ ...f, expense: e.target.value, income: '' }))} />
              </div>
              <div className="col-span-2">
                <label className="text-xs text-gray-500 mb-1 block">หมายเหตุ</label>
                <input className="w-full border rounded-lg px-3 py-2 text-sm"
                  value={form.note} onChange={e => setForm(f => ({ ...f, note: e.target.value }))} />
              </div>
            </div>
            <div className="flex gap-2 pt-2">
              <Button className="flex-1" onClick={handleSave} isLoading={saving}
                disabled={!form.accountId || !form.description || !form.category}>
                บันทึก
              </Button>
              <Button variant="outline" className="flex-1" onClick={() => setShowForm(false)}>ยกเลิก</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
