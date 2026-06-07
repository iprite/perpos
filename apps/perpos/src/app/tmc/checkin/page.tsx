'use client';

import { useEffect, useState, useCallback, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NativeSelect } from '@/components/ui/native-select';
import { ThaiDatePicker } from '@/components/ui/thai-date-picker';

// ─── Types ────────────────────────────────────────────────────────────────────
type Info = {
  displayName: string;
  properties: { id: string; code: string; name: string }[];
  bookingChannels: string[];
  stayTypes: { value: string; label: string }[];
};

type Stay = {
  id: string;
  check_in: string;
  check_out: string | null;
  property_code: string | null;
  stay_type: string;
  room_rate: number | null;
  food_amount: number | null;
  drink_amount: number | null;
  mookata_amount: number | null;
  bbq_amount: number | null;
  activity_detail: string | null;
  feedback: string | null;
  issues: string | null;
  damaged_items: string | null;
  deposit_amount: number | null;
  group_size: number | null;
  group_type: string | null;
  booking_channel: string | null;
  promotion_pct: number | null;
  tmc_guests: { first_name: string; last_name: string | null; nickname: string | null; tel: string | null } | null;
};

type RecentStay = {
  id: string;
  check_in: string;
  check_out: string | null;
  property_code: string | null;
  tmc_guests: { first_name: string; last_name: string | null; nickname: string | null } | null;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
function fmtDate(iso: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' });
}
function guestName(g: RecentStay['tmc_guests']) {
  if (!g) return 'ไม่ระบุชื่อ';
  return [g.nickname ? `"${g.nickname}"` : null, g.first_name, g.last_name].filter(Boolean).join(' ');
}

// ─── Field component ──────────────────────────────────────────────────────────
function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-slate-700">
        {label}{required && <span className="ml-0.5 text-red-500">*</span>}
      </Label>
      {children}
    </div>
  );
}

// Mobile-optimized input style
const inputCls = 'w-full rounded-xl border-slate-200 bg-white px-4 py-3 text-sm focus:border-blue-400 placeholder:text-slate-400';

// ─── Main form component ───────────────────────────────────────────────────────
function CheckinForm() {
  const params = useSearchParams();
  const token  = params.get('t') ?? '';
  const editId = params.get('id') ?? '';   // ถ้ามี → edit mode

  const [info,     setInfo]     = useState<Info | null>(null);
  const [stay,     setStay]     = useState<Stay | null>(null);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState('');
  const [saving,   setSaving]   = useState(false);
  const [saved,    setSaved]    = useState<{ id: string; editUrl: string } | null>(null);

  // form state
  const [firstName,          setFirstName]          = useState('');
  const [lastName,           setLastName]           = useState('');
  const [tel,                setTel]                = useState('');
  const [selectedProperties, setSelectedProperties] = useState<string[]>([]);
  const [checkIn,            setCheckIn]            = useState(new Date().toISOString().slice(0, 10));
  const [checkOut,       setCheckOut]       = useState('');
  const [bookingChannel, setBookingChannel] = useState('Line');
  const [stayType,       setStayType]       = useState('paid');
  const [roomRate,       setRoomRate]       = useState('');
  const [depositAmount,  setDepositAmount]  = useState('');
  const [groupSize,      setGroupSize]      = useState('');
  const [promotionPct,   setPromotionPct]   = useState('');
  const [foodAmount,     setFoodAmount]     = useState('');
  const [drinkAmount,    setDrinkAmount]    = useState('');
  const [mookataAmount,  setMookataAmount]  = useState('');
  const [bbqAmount,      setBbqAmount]      = useState('');
  const [activityDetail, setActivityDetail] = useState('');
  const [feedback,       setFeedback]       = useState('');
  const [issues,         setIssues]         = useState('');
  const [damagedItems,   setDamagedItems]   = useState('');

  // recent stays list (for linking to edit)
  const [recentStays,  setRecentStays]  = useState<RecentStay[]>([]);
  const [showRecent,   setShowRecent]   = useState(false);

  const authHeader = useCallback(() => ({ Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }), [token]);

  useEffect(() => {
    if (!token) { setError('ลิงก์ไม่ถูกต้องหรือหมดอายุ'); setLoading(false); return; }

    async function init() {
      setLoading(true);
      const infoRes = await fetch(`/api/tmc/mobile/info?t=${token}`);
      if (!infoRes.ok) { setError('ลิงก์ไม่ถูกต้องหรือหมดอายุ กรุณาพิมพ์ /tmc ใหม่ใน LINE เพื่อรับลิงก์ใหม่'); setLoading(false); return; }
      const infoData: Info = await infoRes.json();
      setInfo(infoData);

      if (editId) {
        const stayRes = await fetch(`/api/tmc/mobile/stays?t=${token}&id=${editId}`);
        if (stayRes.ok) {
          const s: Stay = await stayRes.json();
          setStay(s);
          if (s.tmc_guests) {
            setFirstName(s.tmc_guests.first_name ?? '');
            setLastName(s.tmc_guests.last_name ?? '');
            setTel(s.tmc_guests.tel ?? '');
          }
          if (s.property_code) {
            setSelectedProperties([s.property_code]);
          } else {
            setSelectedProperties([]);
          }
          setCheckIn(s.check_in ?? '');
          setCheckOut(s.check_out ?? '');
          setBookingChannel(s.booking_channel ?? 'Line');
          setStayType(s.stay_type ?? 'paid');
          setRoomRate(s.room_rate?.toString() ?? '');
          setDepositAmount(s.deposit_amount?.toString() ?? '');
          setGroupSize(s.group_size?.toString() ?? '');
          setPromotionPct(s.promotion_pct?.toString() ?? '');
          setFoodAmount(s.food_amount?.toString() ?? '');
          setDrinkAmount(s.drink_amount?.toString() ?? '');
          setMookataAmount(s.mookata_amount?.toString() ?? '');
          setBbqAmount(s.bbq_amount?.toString() ?? '');
          setActivityDetail(s.activity_detail ?? '');
          setFeedback(s.feedback ?? '');
          setIssues(s.issues ?? '');
          setDamagedItems(s.damaged_items ?? '');
        }
      }
      setLoading(false);
    }
    void init();
  }, [token, editId]);

  async function loadRecent() {
    const res = await fetch(`/api/tmc/mobile/stays?t=${token}`, { headers: authHeader() });
    if (res.ok) setRecentStays(await res.json());
    setShowRecent(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (selectedProperties.length === 0) { alert('กรุณาเลือกแปลง'); return; }
    if (!firstName.trim()) { alert('กรุณาระบุชื่อแขก'); return; }

    setSaving(true);
    const payload = {
      firstName: firstName.trim(),
      lastName: lastName.trim() || undefined,
      tel: tel.trim() || undefined,
      propertyCodes: selectedProperties,
      checkIn,
      checkOut: checkOut || undefined,
      bookingChannel,
      stayType,
      roomRate: roomRate || undefined,
      depositAmount: depositAmount || undefined,
      groupSize: groupSize || undefined,
      promotionPct: promotionPct || undefined,
      foodAmount: foodAmount || undefined,
      drinkAmount: drinkAmount || undefined,
      mookataAmount: mookataAmount || undefined,
      bbqAmount: bbqAmount || undefined,
      activityDetail: activityDetail || undefined,
      feedback: feedback || undefined,
      issues: issues || undefined,
      damagedItems: damagedItems || undefined,
    };

    const url = '/api/tmc/mobile/stays';
    const method = editId ? 'PATCH' : 'POST';
    const body = editId
      ? JSON.stringify({ ...payload, id: editId, propertyCode: selectedProperties[0] || null })
      : JSON.stringify(payload);

    const res = await fetch(url, { method, headers: authHeader(), body });
    const data = await res.json() as Stay & { error?: string };

    if (!res.ok) {
      alert(data.error ?? 'บันทึกไม่สำเร็จ');
    } else {
      const savedId = editId || data.id;
      const editUrl = `${window.location.origin}/tmc/checkin?t=${token}&id=${savedId}`;
      setSaved({ id: savedId, editUrl });
    }
    setSaving(false);
  }

  // ─── Render states ──────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-slate-400 text-sm">กำลังโหลด...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center p-6">
        <div className="rounded-2xl bg-white p-6 shadow text-center max-w-sm w-full">
          <div className="text-4xl mb-3">⚠️</div>
          <p className="text-slate-700 text-sm">{error}</p>
        </div>
      </div>
    );
  }

  if (saved) {
    return (
      <div className="flex min-h-screen items-center justify-center p-6">
        <div className="rounded-2xl bg-white p-6 shadow text-center max-w-sm w-full space-y-4">
          <div className="text-5xl">✅</div>
          <h2 className="text-lg font-bold text-slate-800">{editId ? 'อัปเดตแล้ว' : 'บันทึกแล้ว'}</h2>
          <p className="text-sm text-slate-500">
            {editId ? 'แก้ไขข้อมูลการเข้าพักสำเร็จ' : 'บันทึกการเข้าพักสำเร็จ'}
          </p>
          <div className="rounded-xl bg-blue-50 p-3 text-left space-y-1.5">
            <p className="text-xs text-blue-600 font-medium">ลิงก์แก้ไขทีหลัง:</p>
            <p className="text-xs text-blue-800 break-all">{saved.editUrl}</p>
            <Button
              type="button"
              variant="secondary"
              className="mt-1 w-full rounded-lg bg-blue-600 text-xs text-white hover:bg-blue-700"
              onClick={() => navigator.clipboard.writeText(saved.editUrl).then(() => alert('คัดลอกแล้ว!'))}
            >
              📋 คัดลอกลิงก์
            </Button>
          </div>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="secondary"
              className="flex-1 rounded-xl py-3 text-sm"
              onClick={() => {
                setSaved(null);
                if (!editId) {
                  setFirstName(''); setTel(''); setSelectedProperties([]); setRoomRate('');
                  setCheckOut(''); setFoodAmount(''); setDrinkAmount('');
                  setMookataAmount(''); setBbqAmount(''); setActivityDetail('');
                  setFeedback(''); setIssues(''); setDamagedItems('');
                }
              }}
            >
              {editId ? 'แก้ไขต่อ' : 'บันทึกรายการใหม่'}
            </Button>
            <a
              href={saved.editUrl}
              className="flex-1 rounded-xl bg-blue-600 py-3 text-sm font-medium text-white text-center flex items-center justify-center"
            >
              แก้ไขรายการนี้
            </a>
          </div>
        </div>
      </div>
    );
  }

  const isEdit = !!editId && !!stay;

  return (
    <div className="min-h-screen">
      {/* Header */}
      <div className="bg-blue-600 px-4 py-5 text-white">
        <div className="max-w-lg mx-auto">
          <p className="text-blue-200 text-xs">TMC Management</p>
          <h1 className="text-lg font-bold mt-0.5">
            {isEdit ? '✏️ แก้ไขการเข้าพัก' : '🏠 บันทึกการเข้าพัก'}
          </h1>
          <p className="text-blue-200 text-xs mt-1">ผู้บันทึก: {info?.displayName}</p>
        </div>
      </div>

      {/* Recent stays button (create mode only) */}
      {!isEdit && (
        <div className="max-w-lg mx-auto px-4 pt-3">
          <Button
            type="button"
            variant="outline"
            onClick={loadRecent}
            className="w-full justify-between rounded-xl text-sm text-slate-600"
          >
            <span>📋 รายการเข้าพักล่าสุด (แก้ไข)</span>
            <span className="text-slate-400">›</span>
          </Button>

          {showRecent && (
            <div className="mt-2 rounded-xl border border-slate-200 bg-white overflow-hidden divide-y divide-slate-100">
              {recentStays.length === 0 ? (
                <p className="px-4 py-3 text-sm text-slate-400">ยังไม่มีรายการ</p>
              ) : recentStays.map(s => (
                <a key={s.id}
                  href={`/tmc/checkin?t=${token}&id=${s.id}`}
                  className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50 transition-colors duration-150">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-800 truncate">{guestName(s.tmc_guests)}</p>
                    <p className="text-xs text-slate-500">
                      {s.property_code ?? '—'} · {fmtDate(s.check_in)}
                      {s.check_out ? ` → ${fmtDate(s.check_out)}` : ' (ยังไม่ออก)'}
                    </p>
                  </div>
                  <span className="text-blue-500 text-sm">แก้ไข</span>
                </a>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Form */}
      <form onSubmit={handleSubmit} className="max-w-lg mx-auto px-4 py-4 space-y-6">

        {/* ── ข้อมูลแขก ─────────────────────────────────────────────────── */}
        <section className="rounded-2xl bg-white shadow-sm border border-slate-100 p-4 space-y-3">
          <h2 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
            <span>👤</span> ข้อมูลแขก
          </h2>
          <Field label="ชื่อแขก" required>
            <Input className={inputCls} value={firstName} onChange={e => setFirstName(e.target.value)}
              placeholder="เช่น คุณมาลี" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="นามสกุล">
              <Input className={inputCls} value={lastName} onChange={e => setLastName(e.target.value)}
                placeholder="ไม่บังคับ" />
            </Field>
            <Field label="เบอร์โทร">
              <Input className={inputCls} type="tel" value={tel} onChange={e => setTel(e.target.value)}
                placeholder="0812345678" />
            </Field>
          </div>
        </section>

        {/* ── ข้อมูลการเข้าพัก ─────────────────────────────────────────── */}
        <section className="rounded-2xl bg-white shadow-sm border border-slate-100 p-4 space-y-3">
          <h2 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
            <span>🏠</span> การเข้าพัก
          </h2>
          <Field label="แปลงที่จอง (เลือกได้มากกว่า 1 แปลง)" required>
            <div className="grid grid-cols-3 gap-2 mt-1">
              {info?.properties.map(p => {
                const isSelected = selectedProperties.includes(p.code);
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => {
                      if (editId) {
                        setSelectedProperties([p.code]);
                      } else {
                        setSelectedProperties(prev =>
                          prev.includes(p.code)
                            ? prev.filter(c => c !== p.code)
                            : [...prev, p.code]
                        );
                      }
                    }}
                    className={`px-3 py-2.5 text-sm font-medium rounded-xl border text-center transition-all ${
                      isSelected
                        ? 'bg-blue-600 border-blue-600 text-white shadow-sm'
                        : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    {p.code}
                  </button>
                );
              })}
            </div>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="วันเข้าพัก" required>
              <ThaiDatePicker
                value={checkIn}
                onChange={setCheckIn}
                placeholder="เลือกวันที่"
              />
            </Field>
            <Field label="วันออก">
              <ThaiDatePicker
                value={checkOut}
                onChange={setCheckOut}
                placeholder="(ยังไม่ออก)"
              />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="ช่องทางจอง">
              <NativeSelect
                className="w-full rounded-xl border-slate-200 bg-white px-4 py-3 text-sm"
                value={bookingChannel}
                onChange={e => setBookingChannel(e.target.value)}
              >
                {info?.bookingChannels.map(c => <option key={c} value={c}>{c}</option>)}
              </NativeSelect>
            </Field>
            <Field label="ประเภท">
              <NativeSelect
                className="w-full rounded-xl border-slate-200 bg-white px-4 py-3 text-sm"
                value={stayType}
                onChange={e => setStayType(e.target.value)}
              >
                {info?.stayTypes.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </NativeSelect>
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="ยอดค่าห้อง (บาท)">
              <Input className={inputCls} type="number" value={roomRate} onChange={e => setRoomRate(e.target.value)}
                placeholder="0" />
            </Field>
            <Field label="มัดจำ (บาท)">
              <Input className={inputCls} type="number" value={depositAmount} onChange={e => setDepositAmount(e.target.value)}
                placeholder="0" />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="จำนวนคน">
              <Input className={inputCls} type="number" value={groupSize} onChange={e => setGroupSize(e.target.value)}
                placeholder="1" />
            </Field>
            <Field label="ส่วนลด (%)">
              <Input className={inputCls} type="number" value={promotionPct} onChange={e => setPromotionPct(e.target.value)}
                placeholder="0" />
            </Field>
          </div>
        </section>

        {/* ── ค่าบริการเพิ่มเติม ────────────────────────────────────────── */}
        <section className="rounded-2xl bg-white shadow-sm border border-slate-100 p-4 space-y-3">
          <h2 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
            <span>🍽️</span> ค่าบริการเพิ่มเติม
            <span className="text-xs font-normal text-slate-400">(แก้ไขได้ทีหลัง)</span>
          </h2>
          <div className="grid grid-cols-2 gap-3">
            <Field label="ค่าอาหาร (บาท)">
              <Input className={inputCls} type="number" value={foodAmount} onChange={e => setFoodAmount(e.target.value)}
                placeholder="0" />
            </Field>
            <Field label="ค่าเครื่องดื่ม (บาท)">
              <Input className={inputCls} type="number" value={drinkAmount} onChange={e => setDrinkAmount(e.target.value)}
                placeholder="0" />
            </Field>
            <Field label="มูกาต้า (บาท)">
              <Input className={inputCls} type="number" value={mookataAmount} onChange={e => setMookataAmount(e.target.value)}
                placeholder="0" />
            </Field>
            <Field label="BBQ (บาท)">
              <Input className={inputCls} type="number" value={bbqAmount} onChange={e => setBbqAmount(e.target.value)}
                placeholder="0" />
            </Field>
          </div>
          <Field label="กิจกรรม / รายละเอียดเพิ่มเติม">
            <textarea
              className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm focus:border-blue-400 focus:outline-none placeholder:text-slate-400"
              rows={2} value={activityDetail} onChange={e => setActivityDetail(e.target.value)}
              placeholder="เช่น ปาร์ตี้วันเกิด, มาคู่"
            />
          </Field>
        </section>

        {/* ── บันทึกเพิ่มเติม ─────────────────────────────────────────────── */}
        <section className="rounded-2xl bg-white shadow-sm border border-slate-100 p-4 space-y-3">
          <h2 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
            <span>📝</span> บันทึกเพิ่มเติม
            <span className="text-xs font-normal text-slate-400">(แก้ไขได้ทีหลัง)</span>
          </h2>
          <Field label="Feedback จากแขก">
            <textarea
              className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm focus:border-blue-400 focus:outline-none placeholder:text-slate-400"
              rows={2} value={feedback} onChange={e => setFeedback(e.target.value)}
              placeholder="ความคิดเห็น / รีวิว"
            />
          </Field>
          <Field label="ปัญหาที่พบ">
            <textarea
              className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm focus:border-blue-400 focus:outline-none placeholder:text-slate-400"
              rows={2} value={issues} onChange={e => setIssues(e.target.value)}
              placeholder="เช่น แอร์มีปัญหา, น้ำไม่ร้อน"
            />
          </Field>
          <Field label="ของชำรุด/เสียหาย">
            <Input className={inputCls} value={damagedItems} onChange={e => setDamagedItems(e.target.value)}
              placeholder="เช่น ผ้าขนหนู 1 ผืน" />
          </Field>
        </section>

        {/* Submit */}
        <Button
          type="submit"
          disabled={saving}
          className="w-full rounded-2xl bg-blue-600 py-4 text-base font-semibold text-white hover:bg-blue-700 active:scale-[0.97] transition-transform duration-150 disabled:opacity-60"
        >
          {saving ? 'กำลังบันทึก...' : isEdit ? '💾 บันทึกการแก้ไข' : '✅ บันทึกการเข้าพัก'}
        </Button>
        <div className="pb-8" />
      </form>
    </div>
  );
}

// ─── Page wrapper ─────────────────────────────────────────────────────────────
export default function TmcCheckinPage() {
  return (
    <Suspense fallback={
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-slate-400 text-sm">กำลังโหลด...</div>
      </div>
    }>
      <CheckinForm />
    </Suspense>
  );
}
