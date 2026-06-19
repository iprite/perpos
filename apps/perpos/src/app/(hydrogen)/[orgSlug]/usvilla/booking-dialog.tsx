'use client';

import { useState, useEffect } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { CustomSelect } from '@/components/ui/custom-select';
import { ThaiDatePicker } from '@/components/ui/thai-date-picker';
import { toast } from '@/lib/toast';
import {
  Dialog, DialogContent, DialogHeader, DialogBody, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { useLang } from './_lang-context';
import { getPaymentMethods, getNationalities } from './_i18n';

// Legacy export so other files can still import METHOD_LABEL
export const METHOD_LABEL: Record<string, string> = {
  cash: 'เงินสด', qr: 'QR/โอน', credit_card: 'บัตรเครดิต',
  trip: 'Trip', agoda: 'Agoda', expedia: 'Expedia',
  wechat: 'WeChat', alipay: 'AliPay',
};

interface Room {
  id: string;
  room_number: string;
  room_type: string;
  booking: null | { status: string };
}

interface PaymentRow { method: string; amount: string }

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  rooms: Room[];
  orgId: string;
  token: string;
  onSuccess: () => void;
  presetRoomId?: string;
  presetDate?: string;
}

const STAY_TYPE_OPTIONS = (t: ReturnType<typeof useLang>['t']) => [
  { value: 'daily',  label: t.stay_daily_long },
  { value: 'hourly', label: t.stay_hourly },
];

function todayStr() { return new Date().toISOString().slice(0, 10); }
function nowTime()  { return new Date().toTimeString().slice(0, 5); }

export default function BookingDialog({
  open, onOpenChange, rooms, orgId, token, onSuccess, presetRoomId, presetDate,
}: Props) {
  const { t } = useLang();
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState('');

  const [form, setForm] = useState({
    room_id: presetRoomId || '', guest_name: '', nationality: 'CN',
    stay_type: 'daily', check_in_date: presetDate || todayStr(),
    check_in_time: nowTime(), check_out_date: '', nights: '1', notes: '',
  });

  const [payments, setPayments] = useState<PaymentRow[]>([{ method: 'cash', amount: '' }]);

  useEffect(() => {
    if (open) {
      setForm((f) => ({
        ...f,
        room_id:       presetRoomId || f.room_id,
        check_in_date: presetDate   || f.check_in_date,
      }));
    }
  }, [open, presetRoomId, presetDate]);

  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const handleNightsChange = (v: string) => {
    set('nights', v);
    const n = parseInt(v);
    if (!isNaN(n) && n > 0 && form.check_in_date) {
      const d = new Date(form.check_in_date);
      d.setDate(d.getDate() + n);
      set('check_out_date', d.toISOString().slice(0, 10));
    }
  };

  const handleCheckInChange = (iso: string) => {
    set('check_in_date', iso);
    const n = parseInt(form.nights);
    if (!isNaN(n) && n > 0 && iso) {
      const d = new Date(iso);
      d.setDate(d.getDate() + n);
      set('check_out_date', d.toISOString().slice(0, 10));
    }
  };

  const addPayment    = () => setPayments((p) => [...p, { method: 'cash', amount: '' }]);
  const removePayment = (i: number) => setPayments((p) => p.filter((_, idx) => idx !== i));
  const setPayField   = (i: number, k: keyof PaymentRow, v: string) =>
    setPayments((p) => p.map((row, idx) => idx === i ? { ...row, [k]: v } : row));

  const availableRooms = rooms.filter((r) => !r.booking || r.booking.status === 'reserved');
  const roomOptions = [
    { value: '', label: t.ph_select_room },
    ...availableRooms.map((r) => ({ value: r.id, label: `${r.room_number} (${r.room_type})` })),
  ];

  const handleSave = async () => {
    if (!form.room_id) { setError(t.err_select_room); return; }
    if (!form.guest_name.trim()) { setError(t.err_enter_guest); return; }
    const validPay = payments.filter((p) => p.method && Number(p.amount) > 0);
    setSaving(true); setError('');
    try {
      const res = await fetch(`/api/usvilla/bookings?orgId=${orgId}`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body:    JSON.stringify({
          ...form,
          nights:   form.stay_type === 'daily' ? Number(form.nights) || null : null,
          payments: validPay.map((p) => ({ method: p.method, amount: Number(p.amount) })),
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || t.err_load_fail);
      onSuccess(); onOpenChange(false); resetForm();
      toast.success('บันทึกการจองแล้ว');
    } catch (e: any) { setError(e.message); toast.error(e.message || 'บันทึกไม่สำเร็จ'); }
    finally { setSaving(false); }
  };

  const resetForm = () => {
    setForm({
      room_id: '', guest_name: '', nationality: 'CN', stay_type: 'daily',
      check_in_date: todayStr(), check_in_time: nowTime(),
      check_out_date: '', nights: '1', notes: '',
    });
    setPayments([{ method: 'cash', amount: '' }]);
    setError('');
  };

  const handleClose = (v: boolean) => { if (!v) resetForm(); onOpenChange(v); };

  const payMethods   = getPaymentMethods(t);
  const nationalities = getNationalities(t);

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>{t.dlg_checkin_title}</DialogTitle>
        </DialogHeader>

        <DialogBody>
        <div className="space-y-4">
          <div className="space-y-1">
            <Label>{t.field_room} *</Label>
            <CustomSelect value={form.room_id} onChange={(v) => set('room_id', v)} options={roomOptions} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>{t.field_guest} *</Label>
              <Input value={form.guest_name} onChange={(e) => set('guest_name', e.target.value)} placeholder={t.ph_guest} />
            </div>
            <div className="space-y-1">
              <Label>{t.field_nationality}</Label>
              <CustomSelect value={form.nationality} onChange={(v) => set('nationality', v)} options={nationalities} />
            </div>
          </div>

          <div className="space-y-1">
            <Label>{t.field_stay_type}</Label>
            <CustomSelect value={form.stay_type} onChange={(v) => set('stay_type', v)} options={STAY_TYPE_OPTIONS(t)} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>{t.field_checkin_date} *</Label>
              <ThaiDatePicker value={form.check_in_date} onChange={handleCheckInChange} />
            </div>
            <div className="space-y-1">
              <Label>{t.field_checkin_time}</Label>
              <Input type="time" value={form.check_in_time} onChange={(e) => set('check_in_time', e.target.value)} />
            </div>
          </div>

          {form.stay_type === 'daily' && (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>{t.field_nights}</Label>
                <Input type="number" min="1" value={form.nights} onChange={(e) => handleNightsChange(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>{t.field_checkout_date}</Label>
                <ThaiDatePicker value={form.check_out_date} onChange={(iso) => set('check_out_date', iso)} />
              </div>
            </div>
          )}

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>{t.field_payment}</Label>
              <Button type="button" variant="ghost" size="sm" onClick={addPayment}>
                <Plus className="h-4 w-4 mr-1" />{t.btn_add}
              </Button>
            </div>
            {payments.map((row, i) => (
              <div key={i} className="flex gap-2 items-center">
                <div className="flex-1">
                  <CustomSelect value={row.method} onChange={(v) => setPayField(i, 'method', v)} options={payMethods} />
                </div>
                <div className="w-28">
                  <Input type="number" min="0" placeholder={t.ph_amount} value={row.amount}
                    onChange={(e) => setPayField(i, 'amount', e.target.value)} />
                </div>
                {payments.length > 1 && (
                  <Button type="button" variant="ghost" size="icon" onClick={() => removePayment(i)}>
                    <Trash2 className="h-4 w-4 text-red-400" />
                  </Button>
                )}
              </div>
            ))}
          </div>

          <div className="space-y-1">
            <Label>{t.field_notes}</Label>
            <Input value={form.notes} onChange={(e) => set('notes', e.target.value)} placeholder={t.ph_notes} />
          </div>

          {error && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>
          )}
        </div>
        </DialogBody>

        <DialogFooter>
          <Button variant="outline" onClick={() => handleClose(false)} disabled={saving}>{t.btn_cancel}</Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? t.btn_saving : t.dlg_checkin_btn}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
