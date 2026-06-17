'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { backendUrl } from '@/lib/backend';
import { Button }       from '@/components/ui/button';
import { PageShell } from '@/components/ui/page-shell';
import { Input }        from '@/components/ui/input';
import { Label }        from '@/components/ui/label';
import { CustomSelect } from '@/components/ui/custom-select';
import { ThaiDatePicker } from '@/components/ui/thai-date-picker';
import {
  Dialog, DialogContent, DialogHeader, DialogBody, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Plus, X, Pencil, Trash2, AlertTriangle, BedDouble } from 'lucide-react';

const TMC_ORG_ID      = '1f52618c-09c4-49c5-a929-ea5060f26e7d';
const SAV_ACCOUNT_ID  = 'a4ee27ea-6568-4097-abd7-a91fbf4805d0'; // กสิกร ออมทรัพย์
const CUR_ACCOUNT_ID  = '273463cc-2475-439c-acfe-f054be5ffee4'; // กสิกร กระแสรายวัน
const DEPOSIT_ACCOUNT_OPTIONS = [
  { value: SAV_ACCOUNT_ID, label: 'กสิกร ออมทรัพย์' },
  { value: CUR_ACCOUNT_ID, label: 'กสิกร กระแสรายวัน' },
];
const PROPERTY_CODES    = ['TMC1', 'TMC2', 'TMC3-4', 'TMC5', 'TMC6', 'TMC7', 'ส่วนกลาง'];
const BOOKING_CHANNELS  = ['Line', 'Agoda', 'Walk-in', 'IG', 'Call', 'Friend', 'อินฟลู', 'อื่นๆ'];
const GROUP_TYPES       = ['Family', 'Couple', 'Friend', 'Solo'];
const STAY_TYPES = [
  { value: 'paid',         label: 'ชำระเงิน' },
  { value: 'influencer',   label: 'อินฟลูเอนเซอร์ (ฟรี)' },
  { value: 'management',   label: 'ผู้บริหาร (ฟรี)' },
  { value: 'free',         label: 'ฟรี (อื่นๆ)' },
  { value: 'deposit_only', label: 'มัดจำอย่างเดียว' },
];
const BUTLER_OPTIONS = ['1 ครั้ง', '2 ครั้ง', '3 ครั้ง', 'มากกว่า 3 ครั้ง'];
const THAI_MONTHS    = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];

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
const STAY_TYPE_OPTIONS       = STAY_TYPES.map(s => ({ value: s.value, label: s.label }));
const BOOKING_CHANNEL_OPTIONS = BOOKING_CHANNELS.map(c => ({ value: c, label: c }));
const GROUP_TYPE_OPTIONS      = GROUP_TYPES.map(g => ({ value: g, label: g }));
const BUTLER_OPTIONS_SELECT   = [
  { value: '', label: '—' },
  ...BUTLER_OPTIONS.map(o => ({ value: o, label: o })),
];

// ── Types ─────────────────────────────────────────────────────────────────────

type Stay = {
  id:                   string;
  check_in:             string;
  check_out:            string;
  check_in_time:        string | null;
  check_out_time:       string | null;
  nights:               number;
  property_code:        string | null;
  booking_channel:      string | null;
  stay_type:            string;
  room_rate:            number | null;
  promotion_pct:        number | null;
  group_type:           string | null;
  group_size:           number | null;
  butler_service_visit: string | null;
  food_amount:          number | null;
  drink_amount:         number | null;
  mookata_amount:       number | null;
  bbq_amount:           number | null;
  activity_detail:      string | null;
  deposit_received:      number | null;
  deposit_returned:      number | null;
  deposit_account_id:    string | null;
  deposit_received_date: string | null;
  deposit_returned_date: string | null;
  feedback:             string | null;
  issues:               string | null;
  damaged_items:        string | null;
  tmc_guests: {
    id:         string;
    first_name: string;
    last_name:  string | null;
    nickname:   string | null;
    tel:        string | null;
  } | null;
};

// ── Form state ────────────────────────────────────────────────────────────────

const emptyForm = {
  // guest (add only)
  firstName: '', lastName: '', nickname: '', tel: '',
  // stay
  propertyCode: '',
  propertyCodes: [] as string[],
  checkIn: '', checkOut: '',
  checkInTime: '15:00', checkOutTime: '12:00',
  bookingChannel: 'Line', stayType: 'paid',
  roomRate: '', promotionPct: '',
  depositReceived: '', depositReturned: '', depositAccountId: SAV_ACCOUNT_ID,
  depositReceivedDate: '', depositReturnedDate: '',
  groupSize: '', groupType: 'Family',
  butlerServiceVisit: '', foodAmount: '', drinkAmount: '',
  mookataAmount: '', bbqAmount: '', activityDetail: '',
  feedback: '', issues: '', damagedItems: '',
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(n: number | null) {
  if (!n && n !== 0) return '—';
  return n.toLocaleString('th-TH');
}
function stayTypeLabel(t: string) { return STAY_TYPES.find(s => s.value === t)?.label ?? t; }
function guestDisplayName(g: Stay['tmc_guests']) {
  if (!g) return 'ไม่ระบุชื่อ';
  return g.nickname ?? `${g.first_name} ${g.last_name ?? ''}`.trim();
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function TmcStaysPage() {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [stays,          setStays]          = useState<Stay[]>([]);
  const [loading,        setLoading]        = useState(true);
  const [filterProperty, setFilterProperty] = useState('');
  const [filterMonth,    setFilterMonth]    = useState('');
  const [availableMonths, setAvailableMonths] = useState<string[]>([]);

  // Add / Edit form
  const [showForm,    setShowForm]    = useState(false);
  const [editingStay, setEditingStay] = useState<Stay | null>(null); // null = add mode
  const [form,        setForm]        = useState(emptyForm);
  const [saving,      setSaving]      = useState(false);
  const [formError,   setFormError]   = useState('');

  // Delete confirmation
  const [deleteTarget, setDeleteTarget] = useState<Stay | null>(null);
  const [deleteReason, setDeleteReason] = useState('');
  const [deleting,     setDeleting]     = useState(false);

  const headers = useCallback(async () => {
    const { data } = await supabase.auth.getSession();
    return {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${data.session?.access_token ?? ''}`,
    };
  }, [supabase]);

  // Fetch distinct months once on mount
  useEffect(() => {
    async function fetchMonths() {
      const h = await headers();
      const res  = await fetch(backendUrl(`/tmc/stays?orgId=${TMC_ORG_ID}&limit=500`), { headers: h });
      const data: Stay[] = await res.json();
      if (Array.isArray(data) && data.length > 0) {
        const months = Array.from(new Set(data.map(s => s.check_in.slice(0, 7)))).sort().reverse();
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

  // ── Open add form ──────────────────────────────────────────────────────────
  function openAdd() {
    setEditingStay(null);
    setForm(emptyForm);
    setFormError('');
    setShowForm(true);
  }

  // ── Open edit form ─────────────────────────────────────────────────────────
  function openEdit(stay: Stay) {
    setEditingStay(stay);
    setForm({
      firstName:          stay.tmc_guests?.first_name  ?? '',
      lastName:           stay.tmc_guests?.last_name   ?? '',
      nickname:           stay.tmc_guests?.nickname    ?? '',
      tel:                stay.tmc_guests?.tel         ?? '',
      propertyCode:       stay.property_code           ?? '',
      propertyCodes:      stay.property_code            ? [stay.property_code] : [],
      checkIn:            stay.check_in,
      checkOut:           stay.check_out,
      checkInTime:        stay.check_in_time           ?? '15:00',
      checkOutTime:       stay.check_out_time          ?? '12:00',
      bookingChannel:     stay.booking_channel         ?? 'Line',
      stayType:           stay.stay_type,
      roomRate:           stay.room_rate               != null ? String(stay.room_rate)            : '',
      promotionPct:       stay.promotion_pct           != null ? String(stay.promotion_pct)        : '',
      depositReceived:    stay.deposit_received        != null ? String(stay.deposit_received)     : '',
      depositReturned:    stay.deposit_returned        != null ? String(stay.deposit_returned)     : '',
      depositAccountId:   stay.deposit_account_id     ?? SAV_ACCOUNT_ID,
      depositReceivedDate: stay.deposit_received_date  ?? '',
      depositReturnedDate: stay.deposit_returned_date  ?? '',
      groupSize:          stay.group_size              != null ? String(stay.group_size)           : '',
      groupType:          stay.group_type              ?? 'Family',
      butlerServiceVisit: stay.butler_service_visit    ?? '',
      foodAmount:         stay.food_amount             != null ? String(stay.food_amount)          : '',
      drinkAmount:        stay.drink_amount            != null ? String(stay.drink_amount)         : '',
      mookataAmount:      stay.mookata_amount          != null ? String(stay.mookata_amount)       : '',
      bbqAmount:          stay.bbq_amount              != null ? String(stay.bbq_amount)           : '',
      activityDetail:     stay.activity_detail         ?? '',
      feedback:           stay.feedback                ?? '',
      issues:             stay.issues                  ?? '',
      damagedItems:       stay.damaged_items           ?? '',
    });
    setFormError('');
    setShowForm(true);
  }

  // ── Save (add or edit) ─────────────────────────────────────────────────────
  async function handleSave() {
    const hasProperty = editingStay ? !!form.propertyCode : form.propertyCodes.length > 0;
    if (!hasProperty || !form.checkIn || !form.checkOut) return;
    if (!editingStay && !form.firstName) return;
    setSaving(true); setFormError('');
    try {
      const h = await headers();
      if (editingStay) {
        // Update
        const res = await fetch(backendUrl('/tmc/stays'), {
          method: 'PUT', headers: h,
          body: JSON.stringify({ id: editingStay.id, orgId: TMC_ORG_ID, ...form }),
        });
        if (!res.ok) {
          const d = await res.json() as { error?: string };
          setFormError(d.error ?? 'เกิดข้อผิดพลาด'); return;
        }
      } else {
        // Create
        const res = await fetch(backendUrl('/tmc/stays'), {
          method: 'POST', headers: h,
          body: JSON.stringify({ orgId: TMC_ORG_ID, ...form }),
        });
        if (!res.ok) {
          const d = await res.json() as { error?: string };
          setFormError(d.error ?? 'เกิดข้อผิดพลาด'); return;
        }
      }
      setShowForm(false);
      setForm(emptyForm);
      setEditingStay(null);
      load();
    } catch { setFormError('Network error'); }
    finally  { setSaving(false); }
  }

  // ── Delete ─────────────────────────────────────────────────────────────────
  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const h    = await headers();
      const p    = new URLSearchParams({ id: deleteTarget.id, orgId: TMC_ORG_ID });
      if (deleteReason) p.set('note', deleteReason);
      const res  = await fetch(backendUrl(`/tmc/stays?${p}`), { method: 'DELETE', headers: h });
      if (!res.ok) {
        const d = await res.json() as { error?: string };
        alert(d.error ?? 'ลบไม่สำเร็จ'); return;
      }
      setDeleteTarget(null);
      setDeleteReason('');
      load();
    } catch { alert('Network error'); }
    finally  { setDeleting(false); }
  }

  // ── Derived stats ──────────────────────────────────────────────────────────
  const totalRevenue = stays.reduce((s, st) => s + (st.room_rate ?? 0), 0);
  const paidStays    = stays.filter(s => s.stay_type === 'paid');
  const influStays   = stays.filter(s => s.stay_type === 'influencer');

  const isEditMode = editingStay !== null;

  // ── Form body (shared between add + edit) ──────────────────────────────────
  const formBody = (
    <DialogBody className="space-y-5">

      {/* Guest — editable in both add and edit mode */}
      <div>
        <p className="text-sm font-semibold text-slate-700 mb-3">👤 ข้อมูลลูกค้า</p>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>{isEditMode ? 'ชื่อ' : 'ชื่อ *'}</Label>
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
          <div className="col-span-2 space-y-1.5">
            <Label>แปลงที่จอง * {!isEditMode && <span className="text-xs text-slate-400 font-normal">(เลือกได้มากกว่า 1 แปลง)</span>}</Label>
            <div className="grid grid-cols-4 sm:grid-cols-6 gap-2 mt-1">
              {PROPERTY_CODES.filter(code => code !== 'ส่วนกลาง').map(code => {
                const isSelected = isEditMode
                  ? form.propertyCode === code
                  : form.propertyCodes.includes(code);
                return (
                  <button
                    key={code}
                    type="button"
                    onClick={() => {
                      if (isEditMode) {
                        setForm(f => ({ ...f, propertyCode: code }));
                      } else {
                        setForm(f => {
                          const exist = f.propertyCodes.includes(code);
                          const next = exist
                            ? f.propertyCodes.filter(c => c !== code)
                            : [...f.propertyCodes, code];
                          return { ...f, propertyCodes: next };
                        });
                      }
                    }}
                    className={`px-3 py-2 text-sm font-medium rounded-lg border text-center transition-all ${
                      isSelected
                        ? 'bg-blue-600 border-blue-600 text-white shadow-sm'
                        : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    {code}
                  </button>
                );
              })}
            </div>
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
            <Label>🥤 เครื่องดื่ม</Label>
            <Input type="number" value={form.drinkAmount} onChange={e => setForm(f => ({ ...f, drinkAmount: e.target.value }))} />
          </div>
          <div className="space-y-1.5">
            <Label>🥩 หมูกระทะ</Label>
            <Input type="number" value={form.mookataAmount} onChange={e => setForm(f => ({ ...f, mookataAmount: e.target.value }))} />
          </div>
          <div className="space-y-1.5">
            <Label>🔥 บาร์บีคิว</Label>
            <Input type="number" value={form.bbqAmount} onChange={e => setForm(f => ({ ...f, bbqAmount: e.target.value }))} />
          </div>
          <div className="col-span-2 space-y-1.5">
            <Label>Activity</Label>
            <Input placeholder="เช่น ส่องสัตว์, ตักบาตร" value={form.activityDetail} onChange={e => setForm(f => ({ ...f, activityDetail: e.target.value }))} />
          </div>
        </div>
      </div>

      {/* Deposit */}
      <div className="bg-amber-50 border border-amber-100 rounded-xl p-4">
        <p className="text-sm font-semibold text-amber-800 mb-3">💵 เงินมัดจำ
          <span className="ml-2 text-xs font-normal text-amber-600">บันทึกลงบัญชีอัตโนมัติ</span>
        </p>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>รับเงินมัดจำ (บาท)</Label>
            <Input type="number" placeholder="0" value={form.depositReceived} onChange={e => setForm(f => ({ ...f, depositReceived: e.target.value }))} />
          </div>
          <div className="space-y-1.5">
            <Label>วันที่รับเงินมัดจำ</Label>
            <ThaiDatePicker value={form.depositReceivedDate} onChange={v => setForm(f => ({ ...f, depositReceivedDate: v }))} placeholder="เลือกวันที่" />
          </div>
          <div className="space-y-1.5">
            <Label>คืนเงินมัดจำ (บาท)</Label>
            <Input type="number" placeholder="0" value={form.depositReturned} onChange={e => setForm(f => ({ ...f, depositReturned: e.target.value }))} />
          </div>
          <div className="space-y-1.5">
            <Label>วันที่คืนเงินมัดจำ</Label>
            <ThaiDatePicker value={form.depositReturnedDate} onChange={v => setForm(f => ({ ...f, depositReturnedDate: v }))} placeholder="เลือกวันที่" />
          </div>
          <div className="col-span-2 space-y-1.5">
            <Label>บันทึกเข้าบัญชี</Label>
            <CustomSelect value={form.depositAccountId} onChange={v => setForm(f => ({ ...f, depositAccountId: v }))} options={DEPOSIT_ACCOUNT_OPTIONS} />
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

      {formError && (
        <p className="text-sm text-red-600">{formError}</p>
      )}
    </DialogBody>
  );

  return (
    <PageShell
      width="full"
      icon={<BedDouble className="h-6 w-6" />}
      title="การเข้าพัก"
      description="TMC Management"
      actions={
        <Button onClick={openAdd}>
          <Plus className="w-4 h-4" /> บันทึกเข้าพัก
        </Button>
      }
    >
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
        <CustomSelect value={filterMonth}    onChange={setFilterMonth}    options={monthOptions}            className="w-36" />
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
            const guest        = stay.tmc_guests;
            const name         = guestDisplayName(guest);
            const extraRevenue = (stay.food_amount ?? 0) + (stay.mookata_amount ?? 0) + (stay.bbq_amount ?? 0) + (stay.drink_amount ?? 0);
            return (
              <div key={stay.id} className="bg-white rounded-xl border p-4 space-y-3 hover:shadow-md transition-shadow">
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="bg-blue-100 text-blue-700 text-xs font-bold px-2 py-0.5 rounded-full">
                        {stay.property_code ?? '—'}
                      </span>
                      <span className={`text-xs px-2 py-0.5 rounded-full ${
                        stay.stay_type === 'paid'       ? 'bg-green-100 text-green-700' :
                        stay.stay_type === 'influencer' ? 'bg-purple-100 text-purple-700' :
                        'bg-slate-100 text-slate-600'
                      }`}>{stayTypeLabel(stay.stay_type)}</span>
                    </div>
                    <p className="font-semibold text-slate-800 mt-1 truncate">{name}</p>
                    {guest?.tel && <p className="text-xs text-slate-400">{guest.tel}</p>}
                  </div>
                  {/* Action buttons */}
                  <div className="flex items-center gap-1 ml-2 shrink-0">
                    {stay.room_rate != null && (
                      <p className="text-green-600 font-bold text-sm mr-1">{fmt(stay.room_rate)}</p>
                    )}
                    <button
                      onClick={() => openEdit(stay)}
                      title="แก้ไข"
                      className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => { setDeleteTarget(stay); setDeleteReason(''); }}
                      title="ลบ"
                      className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                <div className="flex items-center gap-2 text-sm text-slate-600 bg-slate-50 rounded-lg px-3 py-2">
                  <span>{new Date(stay.check_in).toLocaleDateString('th-TH', { day: 'numeric', month: 'short' })}</span>
                  <span className="text-slate-300">→</span>
                  <span>{new Date(stay.check_out).toLocaleDateString('th-TH', { day: 'numeric', month: 'short' })}</span>
                  <span className="text-slate-400 ml-auto">{stay.nights} คืน</span>
                </div>

                <div className="flex flex-wrap gap-2 text-xs text-slate-500">
                  {stay.booking_channel     && <span className="bg-slate-100 px-2 py-0.5 rounded">{stay.booking_channel}</span>}
                  {stay.group_type          && <span className="bg-slate-100 px-2 py-0.5 rounded">{stay.group_type}</span>}
                  {stay.group_size          && <span className="bg-slate-100 px-2 py-0.5 rounded">{stay.group_size} คน</span>}
                  {stay.butler_service_visit && <span className="bg-indigo-50 text-indigo-600 px-2 py-0.5 rounded">บัตเลอร์ {stay.butler_service_visit}</span>}
                </div>

                {extraRevenue > 0 && (
                  <div className="text-xs text-slate-500 flex gap-2 flex-wrap">
                    {stay.food_amount     ? <span>🍽️ {fmt(stay.food_amount)}</span>     : null}
                    {stay.drink_amount    ? <span>🥤 {fmt(stay.drink_amount)}</span>    : null}
                    {stay.mookata_amount  ? <span>🥩 {fmt(stay.mookata_amount)}</span>  : null}
                    {stay.bbq_amount      ? <span>🔥 {fmt(stay.bbq_amount)}</span>      : null}
                  </div>
                )}

                {(stay.deposit_received || stay.deposit_returned) && (
                  <div className="flex gap-2 flex-wrap text-xs">
                    {stay.deposit_received
                      ? <span className="bg-amber-50 text-amber-700 border border-amber-200 px-2 py-0.5 rounded-full">
                          💵 มัดจำ {fmt(stay.deposit_received)}
                        </span> : null}
                    {stay.deposit_returned
                      ? <span className="bg-slate-100 text-slate-500 border border-slate-200 px-2 py-0.5 rounded-full">
                          ↩ คืน {fmt(stay.deposit_returned)}
                        </span> : null}
                  </div>
                )}

                {(stay.feedback || stay.issues || stay.damaged_items) && (
                  <div className="border-t pt-2 space-y-1 text-xs">
                    {stay.feedback      && <p className="text-slate-600">💬 {stay.feedback}</p>}
                    {stay.issues        && <p className="text-orange-600">⚠️ {stay.issues}</p>}
                    {stay.damaged_items && <p className="text-red-600">🔧 {stay.damaged_items}</p>}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ── Add / Edit Dialog ────────────────────────────────────────────── */}
      <Dialog open={showForm} onOpenChange={(open) => { if (!open) { setShowForm(false); setEditingStay(null); } }}>
        <DialogContent size="xl">
          <DialogHeader>
            <DialogTitle>
              {isEditMode ? `แก้ไขการเข้าพัก — ${guestDisplayName(editingStay.tmc_guests)}` : 'บันทึกการเข้าพัก'}
            </DialogTitle>
          </DialogHeader>
          {formBody}
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowForm(false); setEditingStay(null); }}>ยกเลิก</Button>
            <Button
              onClick={handleSave}
              disabled={saving || (isEditMode ? !form.propertyCode : form.propertyCodes.length === 0) || !form.checkIn || !form.checkOut || (!isEditMode && !form.firstName)}>
              {saving ? 'กำลังบันทึก…' : isEditMode ? 'บันทึกการแก้ไข' : 'บันทึก'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Delete Confirmation Dialog ───────────────────────────────────── */}
      <Dialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
        <DialogContent size="md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <AlertTriangle className="w-5 h-5" /> ยืนยันการลบ
            </DialogTitle>
          </DialogHeader>
          <DialogBody>
          {deleteTarget && (
            <div className="space-y-4">
              <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm">
                <p className="font-semibold text-red-800">
                  {guestDisplayName(deleteTarget.tmc_guests)}
                </p>
                <p className="text-red-600 mt-0.5">
                  {deleteTarget.property_code} · {new Date(deleteTarget.check_in).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' })}
                  {' → '}
                  {new Date(deleteTarget.check_out).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' })}
                  {' · '}{deleteTarget.nights} คืน
                </p>
                {deleteTarget.room_rate != null && (
                  <p className="text-red-600 text-xs mt-0.5">ยอด {fmt(deleteTarget.room_rate)} บาท</p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label>เหตุผลในการลบ <span className="text-slate-400 font-normal">(บันทึกใน audit log)</span></Label>
                <Input
                  placeholder="เช่น บันทึกซ้ำ, ข้อมูลผิดพลาด..."
                  value={deleteReason}
                  onChange={e => setDeleteReason(e.target.value)}
                />
              </div>
              <p className="text-xs text-slate-400">
                การกระทำนี้ไม่สามารถย้อนกลับได้ ข้อมูลที่ถูกลบจะถูกบันทึกใน audit log
              </p>
            </div>
          )}
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>ยกเลิก</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
              {deleting ? 'กำลังลบ…' : 'ลบรายการนี้'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}
