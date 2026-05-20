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
import { Plus, X } from 'lucide-react';

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

const THAI_MONTHS = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];

function monthLabel(ym: string) {
  const [y, m] = ym.split('-');
  return `${THAI_MONTHS[Number(m) - 1]} ${Number(y) + 543}`;
}

const PROPERTY_FILTER_OPTIONS = [
  { value: '', label: 'ทุกแปลง' },
  ...PROPERTY_CODES.map(c => ({ value: c, label: c })),
];
const PROPERTY_FORM_OPTIONS = [
  { value: '', label: 'เลือก' },
  ...PROPERTY_CODES.map(c => ({ value: c, label: c })),
];
const STAY_TYPE_OPTIONS = STAY_TYPES.map(s => ({ value: s.value, label: s.label }));
const BOOKING_CHANNEL_OPTIONS = BOOKING_CHANNELS.map(c => ({ value: c, label: c }));
const GROUP_TYPE_OPTIONS = GROUP_TYPES.map(g => ({ value: g, label: g }));
const BUTLER_OPTIONS_SELECT = [
  { value: '', label: '—' },
  ...BUTLER_OPTIONS.map(o => ({ value: o, label: o })),
];

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

const emptyForm = {
  firstName: '', lastName: '', nickname: '', tel: '',
  propertyCode: '', checkIn: '', checkOut: '',
  checkInTime: '15:00', checkOutTime: '12:00',
  bookingChannel: 'Line', stayType: 'paid',
  roomRate: '', promotionPct: '', depositAmount: '',
  groupSize: '', groupType: 'Family',
  butlerServiceVisit: '', foodAmount: '', drinkAmount: '',
  mookataAmount: '', bbqAmount: '', activityDetail: '',
  feedback: '', issues: '', damagedItems: '',
};

export default function TmcStaysPage() {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [stays, setStays] = useState<Stay[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [filterProperty, setFilterProperty] = useState('');
  const [filterMonth, setFilterMonth] = useState('');
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [availableMonths, setAvailableMonths] = useState<string[]>([]);

  const headers = useCallback(async () => {
    const { data } = await supabase.auth.getSession();
    return {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${data.session?.access_token ?? ''}`,
    };
  }, [supabase]);

  // Fetch distinct months with data once on mount
  useEffect(() => {
    async function fetchMonths() {
      const h = await headers();
      const res = await fetch(backendUrl(`/tmc/stays?orgId=${TMC_ORG_ID}&limit=500`), { headers: h });
      const data: Stay[] = await res.json();
      if (Array.isArray(data) && data.length > 0) {
        const months = Array.from(new Set(data.map(s => s.check_in.slice(0, 7))))
          .sort()
          .reverse();
        setAvailableMonths(months);
      }
    }
    fetchMonths();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const monthOptions = useMemo(() => [
    { value: '', label: 'ทุกเดือน' },
    ...availableMonths.map(ym => ({ value: ym, label: monthLabel(ym) })),
  ], [availableMonths]);

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
    setForm(emptyForm);
    load();
  }

  const totalRevenue = stays.reduce((s, st) => s + (st.room_rate ?? 0), 0);
  const paidStays = stays.filter(s => s.stay_type === 'paid');
  const influStays = stays.filter(s => s.stay_type === 'influencer');

  return (
    <div className="p-4 md:p-6 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900">การเข้าพัก</h1>
          <p className="text-sm text-slate-500">TMC Management</p>
        </div>
        <Button onClick={() => setShowForm(true)}>
          <Plus className="w-4 h-4" /> บันทึกเข้าพัก
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-white rounded-xl border p-4">
          <p className="text-xs text-slate-500">เข้าพักทั้งหมด</p>
          <p className="text-2xl font-bold text-slate-800">{stays.length} <span className="text-sm font-normal text-slate-400">ครั้ง</span></p>
        </div>
        <div className="bg-white rounded-xl border p-4">
          <p className="text-xs text-slate-500">รายได้รวม</p>
          <p className="text-xl font-bold text-green-600">{fmt(totalRevenue)}</p>
        </div>
        <div className="bg-white rounded-xl border p-4">
          <p className="text-xs text-slate-500">ชำระเงิน</p>
          <p className="text-2xl font-bold text-blue-600">{paidStays.length}</p>
        </div>
        <div className="bg-white rounded-xl border p-4">
          <p className="text-xs text-slate-500">อินฟลูเอนเซอร์</p>
          <p className="text-2xl font-bold text-purple-600">{influStays.length}</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-2 flex-wrap items-center">
        <CustomSelect value={filterProperty} onChange={setFilterProperty} options={PROPERTY_FILTER_OPTIONS} className="w-32" />
        <CustomSelect value={filterMonth} onChange={setFilterMonth} options={monthOptions} className="w-36" />
        {(filterProperty || filterMonth) && (
          <Button variant="ghost" size="sm" onClick={() => { setFilterProperty(''); setFilterMonth(''); }}
            className="text-slate-400 hover:text-slate-600 gap-1">
            <X className="w-3.5 h-3.5" /> ล้างตัวกรอง
          </Button>
        )}
      </div>

      {/* Stays Grid */}
      {loading ? (
        <div className="p-8 text-center text-slate-400">กำลังโหลด...</div>
      ) : stays.length === 0 ? (
        <div className="p-8 text-center text-slate-400">ยังไม่มีข้อมูลการเข้าพัก</div>
      ) : (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-3">
          {stays.map(stay => {
            const guest = stay.tmc_guests;
            const name = guest?.nickname ?? `${guest?.first_name ?? ''} ${guest?.last_name ?? ''}`.trim();
            const extraRevenue = (stay.food_amount ?? 0) + (stay.mookata_amount ?? 0) + (stay.bbq_amount ?? 0);
            return (
              <div key={stay.id} className="bg-white rounded-xl border p-4 space-y-3 hover:shadow-md transition-shadow">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="bg-blue-100 text-blue-700 text-xs font-bold px-2 py-0.5 rounded-full">
                        {stay.property_code ?? '—'}
                      </span>
                      <span className={`text-xs px-2 py-0.5 rounded-full ${
                        stay.stay_type === 'paid' ? 'bg-green-100 text-green-700' :
                        stay.stay_type === 'influencer' ? 'bg-purple-100 text-purple-700' :
                        'bg-slate-100 text-slate-600'
                      }`}>{stayTypeLabel(stay.stay_type)}</span>
                    </div>
                    <p className="font-semibold text-slate-800 mt-1">{name || 'ไม่ระบุชื่อ'}</p>
                    {guest?.tel && <p className="text-xs text-slate-400">{guest.tel}</p>}
                  </div>
                  {stay.room_rate && <p className="text-green-600 font-bold">{fmt(stay.room_rate)}</p>}
                </div>
                <div className="flex items-center gap-2 text-sm text-slate-600 bg-slate-50 rounded-lg px-3 py-2">
                  <span>{new Date(stay.check_in).toLocaleDateString('th-TH', { day: 'numeric', month: 'short' })}</span>
                  <span className="text-slate-300">→</span>
                  <span>{new Date(stay.check_out).toLocaleDateString('th-TH', { day: 'numeric', month: 'short' })}</span>
                  <span className="text-slate-400 ml-auto">{stay.nights} คืน</span>
                </div>
                <div className="flex flex-wrap gap-2 text-xs text-slate-500">
                  {stay.booking_channel && <span className="bg-slate-100 px-2 py-0.5 rounded">{stay.booking_channel}</span>}
                  {stay.group_type && <span className="bg-slate-100 px-2 py-0.5 rounded">{stay.group_type}</span>}
                  {stay.group_size && <span className="bg-slate-100 px-2 py-0.5 rounded">{stay.group_size} คน</span>}
                  {stay.butler_service_visit && <span className="bg-indigo-50 text-indigo-600 px-2 py-0.5 rounded">บัตเลอร์ {stay.butler_service_visit}</span>}
                </div>
                {extraRevenue > 0 && (
                  <div className="text-xs text-slate-500 flex gap-2 flex-wrap">
                    {stay.food_amount ? <span>🍽️ {fmt(stay.food_amount)}</span> : null}
                    {stay.mookata_amount ? <span>🥩 {fmt(stay.mookata_amount)}</span> : null}
                    {stay.bbq_amount ? <span>🔥 {fmt(stay.bbq_amount)}</span> : null}
                  </div>
                )}
                {(stay.feedback || stay.issues || stay.damaged_items) && (
                  <div className="border-t pt-2 space-y-1 text-xs">
                    {stay.feedback && <p className="text-slate-600">💬 {stay.feedback}</p>}
                    {stay.issues && <p className="text-orange-600">⚠️ {stay.issues}</p>}
                    {stay.damaged_items && <p className="text-red-600">🔧 {stay.damaged_items}</p>}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Add Stay Dialog */}
      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-2xl max-h-[75vh] flex flex-col p-0 gap-0 overflow-hidden">
          {/* Sticky Header */}
          <DialogHeader className="shrink-0 px-6 pt-6 pb-4 border-b border-slate-100">
            <DialogTitle>บันทึกการเข้าพัก</DialogTitle>
          </DialogHeader>

          {/* Scrollable Body */}
          <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
            {/* Guest */}
            <div>
              <p className="text-sm font-semibold text-slate-700 mb-3">👤 ข้อมูลลูกค้า</p>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>ชื่อ *</Label>
                  <Input placeholder="คุณ..." value={form.firstName} onChange={e => setForm(f => ({ ...f, firstName: e.target.value }))} />
                </div>
                <div className="space-y-1.5">
                  <Label>นามสกุล</Label>
                  <Input value={form.lastName} onChange={e => setForm(f => ({ ...f, lastName: e.target.value }))} />
                </div>
                <div className="space-y-1.5">
                  <Label>ชื่อเล่น</Label>
                  <Input value={form.nickname} onChange={e => setForm(f => ({ ...f, nickname: e.target.value }))} />
                </div>
                <div className="space-y-1.5">
                  <Label>เบอร์โทร</Label>
                  <Input value={form.tel} onChange={e => setForm(f => ({ ...f, tel: e.target.value }))} />
                </div>
              </div>
            </div>

            {/* Stay Info */}
            <div>
              <p className="text-sm font-semibold text-slate-700 mb-3">🏠 ข้อมูลการเข้าพัก</p>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>แปลง *</Label>
                  <CustomSelect value={form.propertyCode} onChange={v => setForm(f => ({ ...f, propertyCode: v }))} options={PROPERTY_FORM_OPTIONS} />
                </div>
                <div className="space-y-1.5">
                  <Label>ประเภท</Label>
                  <CustomSelect value={form.stayType} onChange={v => setForm(f => ({ ...f, stayType: v }))} options={STAY_TYPE_OPTIONS} />
                </div>
                <div className="space-y-1.5">
                  <Label>เช็คอิน *</Label>
                  <ThaiDatePicker value={form.checkIn} onChange={v => setForm(f => ({ ...f, checkIn: v }))} />
                </div>
                <div className="space-y-1.5">
                  <Label>เช็คเอาต์ *</Label>
                  <ThaiDatePicker value={form.checkOut} onChange={v => setForm(f => ({ ...f, checkOut: v }))} />
                </div>
                <div className="space-y-1.5">
                  <Label>เวลาเช็คอิน</Label>
                  <Input type="time" value={form.checkInTime} onChange={e => setForm(f => ({ ...f, checkInTime: e.target.value }))} />
                </div>
                <div className="space-y-1.5">
                  <Label>เวลาเช็คเอาต์</Label>
                  <Input type="time" value={form.checkOutTime} onChange={e => setForm(f => ({ ...f, checkOutTime: e.target.value }))} />
                </div>
                <div className="space-y-1.5">
                  <Label>ช่องทางจอง</Label>
                  <CustomSelect value={form.bookingChannel} onChange={v => setForm(f => ({ ...f, bookingChannel: v }))} options={BOOKING_CHANNEL_OPTIONS} />
                </div>
                <div className="space-y-1.5">
                  <Label>มากับใคร</Label>
                  <CustomSelect value={form.groupType} onChange={v => setForm(f => ({ ...f, groupType: v }))} options={GROUP_TYPE_OPTIONS} />
                </div>
              </div>
            </div>

            {/* Revenue */}
            <div>
              <p className="text-sm font-semibold text-slate-700 mb-3">💰 ยอดเงิน</p>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>ยอดที่พัก (บาท)</Label>
                  <Input type="number" value={form.roomRate} onChange={e => setForm(f => ({ ...f, roomRate: e.target.value }))} />
                </div>
                <div className="space-y-1.5">
                  <Label>ส่วนลด (%)</Label>
                  <Input type="number" value={form.promotionPct} onChange={e => setForm(f => ({ ...f, promotionPct: e.target.value }))} />
                </div>
                <div className="space-y-1.5">
                  <Label>จำนวนคน</Label>
                  <Input type="number" value={form.groupSize} onChange={e => setForm(f => ({ ...f, groupSize: e.target.value }))} />
                </div>
                <div className="space-y-1.5">
                  <Label>Butler Service</Label>
                  <CustomSelect value={form.butlerServiceVisit} onChange={v => setForm(f => ({ ...f, butlerServiceVisit: v }))} options={BUTLER_OPTIONS_SELECT} />
                </div>
                <div className="space-y-1.5">
                  <Label>🍽️ ยอดอาหาร</Label>
                  <Input type="number" value={form.foodAmount} onChange={e => setForm(f => ({ ...f, foodAmount: e.target.value }))} />
                </div>
                <div className="space-y-1.5">
                  <Label>🥩 หมูกระทะ</Label>
                  <Input type="number" value={form.mookataAmount} onChange={e => setForm(f => ({ ...f, mookataAmount: e.target.value }))} />
                </div>
                <div className="space-y-1.5">
                  <Label>🔥 บาร์บีคิว</Label>
                  <Input type="number" value={form.bbqAmount} onChange={e => setForm(f => ({ ...f, bbqAmount: e.target.value }))} />
                </div>
                <div className="space-y-1.5">
                  <Label>Activity</Label>
                  <Input placeholder="เช่น ส่องสัตว์, ตักบาตร" value={form.activityDetail} onChange={e => setForm(f => ({ ...f, activityDetail: e.target.value }))} />
                </div>
              </div>
            </div>

            {/* CRM */}
            <div>
              <p className="text-sm font-semibold text-slate-700 mb-3">⭐ CRM</p>
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label>Feedback</Label>
                  <textarea rows={2}
                    className="flex w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 ring-offset-white resize-none"
                    value={form.feedback} onChange={e => setForm(f => ({ ...f, feedback: e.target.value }))} />
                </div>
                <div className="space-y-1.5">
                  <Label>ปัญหา</Label>
                  <Input value={form.issues} onChange={e => setForm(f => ({ ...f, issues: e.target.value }))} />
                </div>
                <div className="space-y-1.5">
                  <Label>ของเสียหาย</Label>
                  <Input value={form.damagedItems} onChange={e => setForm(f => ({ ...f, damagedItems: e.target.value }))} />
                </div>
              </div>
            </div>
          </div>

          {/* Sticky Footer */}
          <DialogFooter className="shrink-0 px-6 py-4 border-t border-slate-100 gap-2 sm:gap-2">
            <Button variant="outline" onClick={() => setShowForm(false)}>ยกเลิก</Button>
            <Button onClick={handleSave}
              disabled={saving || !form.firstName || !form.propertyCode || !form.checkIn || !form.checkOut}>
              {saving ? 'กำลังบันทึก…' : 'บันทึก'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
