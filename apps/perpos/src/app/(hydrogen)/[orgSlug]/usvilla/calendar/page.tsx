'use client';

import { useEffect, useState, useCallback } from 'react';
import { ChevronLeft, ChevronRight, Loader2, AlertCircle, LogIn } from 'lucide-react';
import { Button } from '@/components/ui/button';
import CalendarView, { type CalBooking, type CalRoom } from '../calendar-view';
import BookingDetailDialog from '../booking-detail-dialog';
import BookingDialog from '../booking-dialog';
import { useUsvillaBootstrap, todayStr, addDays, formatThaiDate } from '../_use-usvilla';
import { useLang } from '../_lang-context';

interface Room extends CalRoom { booking: null | { id: string; guest_name: string; stay_type: string; status: string; pms_payments: { method: string; amount: number }[] } }

const CAL_DAYS = 14;

function CheckoutConfirmDialog({ booking, open, onOpenChange, orgId, token, onSuccess }: {
  booking: CalBooking | null; open: boolean; onOpenChange: (v: boolean) => void;
  orgId: string; token: string; onSuccess: () => void;
}) {
  const [saving, setSaving] = useState(false);
  if (!booking) return null;
  const handleCheckout = async () => {
    setSaving(true);
    const res = await fetch(`/api/usvilla/bookings/${booking.id}?orgId=${orgId}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ action: 'checkout' }),
    });
    setSaving(false);
    if (res.ok) { onSuccess(); onOpenChange(false); }
  };
  return (
    <div className={`fixed inset-0 z-50 flex items-center justify-center bg-black/40 ${open ? '' : 'hidden'}`}>
      <div className="bg-white rounded-xl p-6 max-w-sm w-full mx-4 space-y-4 shadow-xl">
        <h3 className="font-semibold">ยืนยัน Check-out</h3>
        <p className="text-sm">ห้อง <strong>{booking.pms_rooms.room_number}</strong> · {booking.guest_name}</p>
        <div className="flex gap-2 justify-end">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>ยกเลิก</Button>
          <Button onClick={handleCheckout} disabled={saving}>{saving ? 'กำลังบันทึก…' : 'ยืนยัน'}</Button>
        </div>
      </div>
    </div>
  );
}

export default function CalendarPage() {
  const { t } = useLang();
  const { orgId, token, bootError } = useUsvillaBootstrap();
  const [rooms, setRooms]               = useState<Room[]>([]);
  const [calBookings, setCalBookings]   = useState<CalBooking[]>([]);
  const [calStart, setCalStart]         = useState(() => addDays(todayStr(), -3));
  const [loading, setLoading]           = useState(false);
  const [error, setError]               = useState('');
  const [detailBooking, setDetailBooking] = useState<CalBooking | null>(null);
  const [checkoutBooking, setCheckoutBooking] = useState<CalBooking | null>(null);
  const [cancelBooking, setCancelBooking]     = useState<CalBooking | null>(null);
  const [newOpen, setNewOpen]           = useState(false);
  const [newPreset, setNewPreset]       = useState<{ room_id: string; date: string } | null>(null);

  const loadRooms = useCallback(async () => {
    if (!orgId || !token) return;
    const res = await fetch(`/api/usvilla/rooms?orgId=${orgId}`, { headers: { Authorization: `Bearer ${token}` } });
    if (res.ok) setRooms((await res.json()).rooms ?? []);
  }, [orgId, token]);

  const loadCalBookings = useCallback(async () => {
    if (!orgId || !token) return;
    setLoading(true);
    try {
      const to = addDays(calStart, CAL_DAYS - 1);
      const res = await fetch(`/api/usvilla/bookings?orgId=${orgId}&from=${calStart}&to=${to}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error((await res.json()).error);
      setCalBookings((await res.json()).bookings ?? []);
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  }, [orgId, token, calStart]);

  useEffect(() => { if (orgId && token) { loadRooms(); loadCalBookings(); } }, [orgId, token, loadRooms, loadCalBookings]);

  const refresh = () => { loadRooms(); loadCalBookings(); };

  const handleCancel = async (b: CalBooking) => {
    await fetch(`/api/usvilla/bookings/${b.id}?orgId=${orgId}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ action: 'cancel' }),
    });
    setCancelBooking(null); refresh();
  };

  const errMsg = bootError || error;
  const calRooms = rooms as unknown as CalRoom[];

  return (
    <div className="p-4 md:p-6 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-lg font-bold text-slate-900">{t.title_calendar}</h1>
          <p className="text-sm text-slate-500">{t.subtitle_calendar}</p>
        </div>
        <div className="flex gap-2 items-center">
          <Button onClick={() => { setNewPreset(null); setNewOpen(true); }}>
            <LogIn className="h-4 w-4 mr-2" />{t.btn_checkin}
          </Button>
        </div>
      </div>

      {errMsg && (
        <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          <AlertCircle className="h-4 w-4 shrink-0" />{errMsg}
        </div>
      )}

      {/* Calendar nav */}
      <div className="flex items-center justify-between bg-white rounded-xl border px-4 py-2.5">
        <div className="flex items-center gap-2">
          <button onClick={() => setCalStart((d) => addDays(d, -7))} className="p-1.5 rounded-lg border hover:bg-slate-50">
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="text-sm font-medium text-slate-700">
            {formatThaiDate(calStart)} — {formatThaiDate(addDays(calStart, CAL_DAYS - 1))}
          </span>
          <button onClick={() => setCalStart((d) => addDays(d, 7))} className="p-1.5 rounded-lg border hover:bg-slate-50">
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
        <button onClick={() => setCalStart(addDays(todayStr(), -3))} className="text-xs text-indigo-600 border border-indigo-200 px-3 py-1 rounded-lg hover:bg-indigo-50">
          {t.btn_today}
        </button>
      </div>

      {loading ? (
        <div className="flex h-64 items-center justify-center bg-white rounded-xl border">
          <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
        </div>
      ) : (
        <CalendarView
          rooms={calRooms}
          bookings={calBookings}
          startDate={calStart}
          days={CAL_DAYS}
          onEmptyClick={(roomId, date) => { setNewPreset({ room_id: roomId, date }); setNewOpen(true); }}
          onBookingClick={(b) => setDetailBooking(b)}
        />
      )}

      <BookingDetailDialog
        booking={detailBooking}
        open={!!detailBooking}
        onOpenChange={(v) => !v && setDetailBooking(null)}
        orgId={orgId} token={token}
        onCheckout={(b) => { setDetailBooking(null); setCheckoutBooking(b); }}
        onCancel={(b) => { setDetailBooking(null); setCancelBooking(b); }}
      />

      <CheckoutConfirmDialog
        booking={checkoutBooking}
        open={!!checkoutBooking}
        onOpenChange={(v) => !v && setCheckoutBooking(null)}
        orgId={orgId} token={token} onSuccess={refresh}
      />

      {cancelBooking && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl p-6 max-w-sm w-full mx-4 space-y-4 shadow-xl">
            <h3 className="font-semibold">ยืนยันยกเลิก</h3>
            <p className="text-sm">ยกเลิกการเข้าพักของ <strong>{cancelBooking.guest_name}</strong>?</p>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setCancelBooking(null)}>ปิด</Button>
              <Button variant="destructive" onClick={() => handleCancel(cancelBooking)}>ยืนยันยกเลิก</Button>
            </div>
          </div>
        </div>
      )}

      <BookingDialog
        open={newOpen}
        onOpenChange={(v) => { setNewOpen(v); if (!v) setNewPreset(null); }}
        rooms={rooms} orgId={orgId} token={token}
        onSuccess={refresh}
        presetRoomId={newPreset?.room_id}
        presetDate={newPreset?.date}
      />
    </div>
  );
}
