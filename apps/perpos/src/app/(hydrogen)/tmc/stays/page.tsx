'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { backendUrl } from '@/lib/backend';
import { Button } from 'rizzui';

const TMC_ORG_ID = '1f52618c-09c4-49c5-a929-ea5060f26e7d';
const PROPERTY_CODES = ['TMC1', 'TMC2', 'TMC3-4', 'TMC5', 'TMC6', 'TMC7'];
const BOOKING_CHANNELS = ['Line', 'Agoda', 'Walk-in', 'IG', 'Call', 'Friend', 'อินฟลู', 'อื่นๆ'];
const GROUP_TYPES = ['Family', 'Couple', 'Friend', 'Solo'];
const STAY_TYPES = [
  { value: 'paid', label: 'ชำระเงิน' },
  { value: 'influencer', label: 'อินฟลูเอนเซอร์ (ฟรี)' },
  { value: 'management', label: 'ผู้บริหาร (ฟรี)' },
  { value: 'free', label: 'ฟรี (อื่นๆ)' },
  { value: 'deposit_only', label: 'มัดจำอย่างเดียว' },
];
const BUTLER_OPTIONS = ['1 ครั้ง', '2 ครั้ง', '3 ครั้ง', 'มากกว่า 3 ครั้ง'];

type Stay = {
  id: string; check_in: string; check_out: string; nights: number;
  property_code: string | null; booking_channel: string | null; stay_type: string;
  room_rate: number | null; group_type: string | null; group_size: number | null;
  butler_service_visit: string | null; food_amount: number | null;
  mookata_amount: number | null; bbq_amount: number | null;
  feedback: string | null; issues: string | null; damaged_items: string | null;
  tmc_guests: { first_name: string; last_name: string | null; nickname: string | null; tel: string | null } | null;
};

function fmt(n: number | null) {
  if (!n && n !== 0) return '—';
  return n.toLocaleString('th-TH');
}

function stayTypeLabel(t: string) {
  return STAY_TYPES.find(s => s.value === t)?.label ?? t;
}

export default function TmcStaysPage() {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [stays, setStays] = useState<Stay[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [filterProperty, setFilterProperty] = useState('');
  const [filterMonth, setFilterMonth] = useState('');
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    firstName: '', lastName: '', nickname: '', tel: '',
    propertyCode: '', checkIn: '', checkOut: '',
    checkInTime: '15:00', checkOutTime: '12:00',
    bookingChannel: 'Line', stayType: 'paid',
    roomRate: '', promotionPct: '', depositAmount: '',
    groupSize: '', groupType: 'Family',
    butlerServiceVisit: '', foodAmount: '', drinkAmount: '',
    mookataAmount: '', bbqAmount: '', activityDetail: '',
    feedback: '', issues: '', damagedItems: '',
  });

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
    const p = new URLSearchParams({ orgId: TMC_ORG_ID, limit: '200' });
    if (filterProperty) p.set('propertyCode', filterProperty);
    if (filterMonth) {
      const [y, m] = filterMonth.split('-');
      p.set('from', `${y}-${m}-01`);
      const last = new Date(Number(y), Number(m), 0).getDate();
      p.set('to', `${y}-${m}-${last}`);
    }
    const res = await fetch(backendUrl(`/tmc/stays?${p}`), { headers: h });
    setStays(await res.json());
    setLoading(false);
  }, [headers, filterProperty, filterMonth]);

  useEffect(() => { load(); }, [load]);

  async function handleSave() {
    if (!form.firstName || !form.propertyCode || !form.checkIn || !form.checkOut) return;
    setSaving(true);
    const h = await headers();
    await fetch(backendUrl('/tmc/stays'), {
      method: 'POST', headers: h,
      body: JSON.stringify({ orgId: TMC_ORG_ID, ...form }),
    });
    setSaving(false);
    setShowForm(false);
    setForm({ firstName: '', lastName: '', nickname: '', tel: '', propertyCode: '', checkIn: '', checkOut: '', checkInTime: '15:00', checkOutTime: '12:00', bookingChannel: 'Line', stayType: 'paid', roomRate: '', promotionPct: '', depositAmount: '', groupSize: '', groupType: 'Family', butlerServiceVisit: '', foodAmount: '', drinkAmount: '', mookataAmount: '', bbqAmount: '', activityDetail: '', feedback: '', issues: '', damagedItems: '' });
    load();
  }

  // Stats
  const totalRevenue = stays.reduce((s, st) => s + (st.room_rate ?? 0), 0);
  const paidStays = stays.filter(s => s.stay_type === 'paid');
  const influStays = stays.filter(s => s.stay_type === 'influencer');

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">การเข้าพัก</h1>
          <p className="text-sm text-gray-500">TMC Management</p>
        </div>
        <Button onClick={() => setShowForm(true)} className="gap-1">
          + บันทึกเข้าพัก
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-white rounded-xl border p-4">
          <p className="text-xs text-gray-500">เข้าพักทั้งหมด</p>
          <p className="text-2xl font-bold text-gray-800">{stays.length} <span className="text-sm font-normal text-gray-400">ครั้ง</span></p>
        </div>
        <div className="bg-white rounded-xl border p-4">
          <p className="text-xs text-gray-500">รายได้รวม</p>
          <p className="text-xl font-bold text-green-600">{fmt(totalRevenue)}</p>
        </div>
        <div className="bg-white rounded-xl border p-4">
          <p className="text-xs text-gray-500">ชำระเงิน</p>
          <p className="text-2xl font-bold text-blue-600">{paidStays.length}</p>
        </div>
        <div className="bg-white rounded-xl border p-4">
          <p className="text-xs text-gray-500">อินฟลูเอนเซอร์</p>
          <p className="text-2xl font-bold text-purple-600">{influStays.length}</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-3 flex-wrap">
        <select className="border rounded-lg px-3 py-1.5 text-sm"
          value={filterProperty} onChange={e => setFilterProperty(e.target.value)}>
          <option value="">ทุกแปลง</option>
          {PROPERTY_CODES.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <input type="month" className="border rounded-lg px-3 py-1.5 text-sm"
          value={filterMonth} onChange={e => setFilterMonth(e.target.value)} />
      </div>

      {/* Stays Grid */}
      {loading ? (
        <div className="p-8 text-center text-gray-400">กำลังโหลด...</div>
      ) : stays.length === 0 ? (
        <div className="p-8 text-center text-gray-400">ยังไม่มีข้อมูลการเข้าพัก</div>
      ) : (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-3">
          {stays.map(stay => {
            const guest = stay.tmc_guests;
            const name = guest?.nickname ?? `${guest?.first_name ?? ''} ${guest?.last_name ?? ''}`.trim();
            const extraRevenue = (stay.food_amount ?? 0) + (stay.mookata_amount ?? 0) + (stay.bbq_amount ?? 0);
            return (
              <div key={stay.id} className="bg-white rounded-xl border p-4 space-y-3 hover:shadow-md transition-shadow">
                {/* Header */}
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="bg-blue-100 text-blue-700 text-xs font-bold px-2 py-0.5 rounded-full">
                        {stay.property_code ?? '—'}
                      </span>
                      <span className={`text-xs px-2 py-0.5 rounded-full ${
                        stay.stay_type === 'paid' ? 'bg-green-100 text-green-700' :
                        stay.stay_type === 'influencer' ? 'bg-purple-100 text-purple-700' :
                        'bg-gray-100 text-gray-600'
                      }`}>{stayTypeLabel(stay.stay_type)}</span>
                    </div>
                    <p className="font-semibold text-gray-800 mt-1">{name || 'ไม่ระบุชื่อ'}</p>
                    {guest?.tel && <p className="text-xs text-gray-400">{guest.tel}</p>}
                  </div>
                  {stay.room_rate && (
                    <p className="text-green-600 font-bold">{fmt(stay.room_rate)}</p>
                  )}
                </div>

                {/* Dates */}
                <div className="flex items-center gap-2 text-sm text-gray-600 bg-gray-50 rounded-lg px-3 py-2">
                  <span>{new Date(stay.check_in).toLocaleDateString('th-TH', { day: 'numeric', month: 'short' })}</span>
                  <span className="text-gray-300">→</span>
                  <span>{new Date(stay.check_out).toLocaleDateString('th-TH', { day: 'numeric', month: 'short' })}</span>
                  <span className="text-gray-400 ml-auto">{stay.nights} คืน</span>
                </div>

                {/* Info */}
                <div className="flex flex-wrap gap-2 text-xs text-gray-500">
                  {stay.booking_channel && <span className="bg-gray-100 px-2 py-0.5 rounded">{stay.booking_channel}</span>}
                  {stay.group_type && <span className="bg-gray-100 px-2 py-0.5 rounded">{stay.group_type}</span>}
                  {stay.group_size && <span className="bg-gray-100 px-2 py-0.5 rounded">{stay.group_size} คน</span>}
                  {stay.butler_service_visit && <span className="bg-indigo-50 text-indigo-600 px-2 py-0.5 rounded">บัตเลอร์ {stay.butler_service_visit}</span>}
                </div>

                {/* Extra revenue */}
                {extraRevenue > 0 && (
                  <div className="text-xs text-gray-500 flex gap-2 flex-wrap">
                    {stay.food_amount ? <span>🍽️ {fmt(stay.food_amount)}</span> : null}
                    {stay.mookata_amount ? <span>🥩 {fmt(stay.mookata_amount)}</span> : null}
                    {stay.bbq_amount ? <span>🔥 {fmt(stay.bbq_amount)}</span> : null}
                  </div>
                )}

                {/* Feedback / Issues */}
                {(stay.feedback || stay.issues || stay.damaged_items) && (
                  <div className="border-t pt-2 space-y-1 text-xs">
                    {stay.feedback && <p className="text-gray-600">💬 {stay.feedback}</p>}
                    {stay.issues && <p className="text-orange-600">⚠️ {stay.issues}</p>}
                    {stay.damaged_items && <p className="text-red-600">🔧 {stay.damaged_items}</p>}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Add Stay Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end md:items-center justify-center p-0 md:p-4">
          <div className="bg-white rounded-t-2xl md:rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b px-6 py-4 flex items-center justify-between">
              <h2 className="text-lg font-bold">บันทึกการเข้าพัก</h2>
              <button onClick={() => setShowForm(false)} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
            </div>
            <div className="p-6 space-y-4">
              {/* Guest */}
              <div>
                <p className="text-sm font-semibold text-gray-700 mb-2">👤 ข้อมูลลูกค้า</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-gray-500 mb-1 block">ชื่อ *</label>
                    <input className="w-full border rounded-lg px-3 py-2 text-sm"
                      placeholder="คุณ..." value={form.firstName}
                      onChange={e => setForm(f => ({ ...f, firstName: e.target.value }))} />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 mb-1 block">นามสกุล</label>
                    <input className="w-full border rounded-lg px-3 py-2 text-sm"
                      value={form.lastName} onChange={e => setForm(f => ({ ...f, lastName: e.target.value }))} />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 mb-1 block">ชื่อเล่น</label>
                    <input className="w-full border rounded-lg px-3 py-2 text-sm"
                      value={form.nickname} onChange={e => setForm(f => ({ ...f, nickname: e.target.value }))} />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 mb-1 block">เบอร์โทร</label>
                    <input className="w-full border rounded-lg px-3 py-2 text-sm"
                      value={form.tel} onChange={e => setForm(f => ({ ...f, tel: e.target.value }))} />
                  </div>
                </div>
              </div>

              {/* Stay Info */}
              <div>
                <p className="text-sm font-semibold text-gray-700 mb-2">🏠 ข้อมูลการเข้าพัก</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-gray-500 mb-1 block">แปลง *</label>
                    <select className="w-full border rounded-lg px-3 py-2 text-sm"
                      value={form.propertyCode} onChange={e => setForm(f => ({ ...f, propertyCode: e.target.value }))}>
                      <option value="">เลือก</option>
                      {PROPERTY_CODES.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 mb-1 block">ประเภท</label>
                    <select className="w-full border rounded-lg px-3 py-2 text-sm"
                      value={form.stayType} onChange={e => setForm(f => ({ ...f, stayType: e.target.value }))}>
                      {STAY_TYPES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 mb-1 block">เช็คอิน *</label>
                    <input type="date" className="w-full border rounded-lg px-3 py-2 text-sm"
                      value={form.checkIn} onChange={e => setForm(f => ({ ...f, checkIn: e.target.value }))} />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 mb-1 block">เช็คเอาต์ *</label>
                    <input type="date" className="w-full border rounded-lg px-3 py-2 text-sm"
                      value={form.checkOut} onChange={e => setForm(f => ({ ...f, checkOut: e.target.value }))} />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 mb-1 block">เวลาเช็คอิน</label>
                    <input type="time" className="w-full border rounded-lg px-3 py-2 text-sm"
                      value={form.checkInTime} onChange={e => setForm(f => ({ ...f, checkInTime: e.target.value }))} />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 mb-1 block">เวลาเช็คเอาต์</label>
                    <input type="time" className="w-full border rounded-lg px-3 py-2 text-sm"
                      value={form.checkOutTime} onChange={e => setForm(f => ({ ...f, checkOutTime: e.target.value }))} />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 mb-1 block">ช่องทางจอง</label>
                    <select className="w-full border rounded-lg px-3 py-2 text-sm"
                      value={form.bookingChannel} onChange={e => setForm(f => ({ ...f, bookingChannel: e.target.value }))}>
                      {BOOKING_CHANNELS.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 mb-1 block">มากับใคร</label>
                    <select className="w-full border rounded-lg px-3 py-2 text-sm"
                      value={form.groupType} onChange={e => setForm(f => ({ ...f, groupType: e.target.value }))}>
                      {GROUP_TYPES.map(g => <option key={g} value={g}>{g}</option>)}
                    </select>
                  </div>
                </div>
              </div>

              {/* Revenue */}
              <div>
                <p className="text-sm font-semibold text-gray-700 mb-2">💰 ยอดเงิน</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-gray-500 mb-1 block">ยอดที่พัก (บาท)</label>
                    <input type="number" className="w-full border rounded-lg px-3 py-2 text-sm"
                      value={form.roomRate} onChange={e => setForm(f => ({ ...f, roomRate: e.target.value }))} />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 mb-1 block">ส่วนลด (%)</label>
                    <input type="number" className="w-full border rounded-lg px-3 py-2 text-sm"
                      value={form.promotionPct} onChange={e => setForm(f => ({ ...f, promotionPct: e.target.value }))} />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 mb-1 block">จำนวนคน</label>
                    <input type="number" className="w-full border rounded-lg px-3 py-2 text-sm"
                      value={form.groupSize} onChange={e => setForm(f => ({ ...f, groupSize: e.target.value }))} />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 mb-1 block">Butlet Service</label>
                    <select className="w-full border rounded-lg px-3 py-2 text-sm"
                      value={form.butlerServiceVisit} onChange={e => setForm(f => ({ ...f, butlerServiceVisit: e.target.value }))}>
                      <option value="">—</option>
                      {BUTLER_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 mb-1 block">🍽️ ยอดอาหาร</label>
                    <input type="number" className="w-full border rounded-lg px-3 py-2 text-sm"
                      value={form.foodAmount} onChange={e => setForm(f => ({ ...f, foodAmount: e.target.value }))} />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 mb-1 block">🥩 หมูกระทะ</label>
                    <input type="number" className="w-full border rounded-lg px-3 py-2 text-sm"
                      value={form.mookataAmount} onChange={e => setForm(f => ({ ...f, mookataAmount: e.target.value }))} />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 mb-1 block">🔥 บาร์บีคิว</label>
                    <input type="number" className="w-full border rounded-lg px-3 py-2 text-sm"
                      value={form.bbqAmount} onChange={e => setForm(f => ({ ...f, bbqAmount: e.target.value }))} />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 mb-1 block">Activity</label>
                    <input className="w-full border rounded-lg px-3 py-2 text-sm"
                      placeholder="เช่น ส่องสัตว์, ตักบาตร"
                      value={form.activityDetail} onChange={e => setForm(f => ({ ...f, activityDetail: e.target.value }))} />
                  </div>
                </div>
              </div>

              {/* CRM */}
              <div>
                <p className="text-sm font-semibold text-gray-700 mb-2">⭐ CRM</p>
                <div className="space-y-3">
                  <div>
                    <label className="text-xs text-gray-500 mb-1 block">Feedback</label>
                    <textarea className="w-full border rounded-lg px-3 py-2 text-sm" rows={2}
                      value={form.feedback} onChange={e => setForm(f => ({ ...f, feedback: e.target.value }))} />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 mb-1 block">ปัญหา</label>
                    <input className="w-full border rounded-lg px-3 py-2 text-sm"
                      value={form.issues} onChange={e => setForm(f => ({ ...f, issues: e.target.value }))} />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 mb-1 block">ของเสียหาย</label>
                    <input className="w-full border rounded-lg px-3 py-2 text-sm"
                      value={form.damagedItems} onChange={e => setForm(f => ({ ...f, damagedItems: e.target.value }))} />
                  </div>
                </div>
              </div>
            </div>
            <div className="sticky bottom-0 bg-white border-t px-6 py-4 flex gap-2">
              <Button className="flex-1" onClick={handleSave} isLoading={saving}
                disabled={!form.firstName || !form.propertyCode || !form.checkIn || !form.checkOut}>
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
