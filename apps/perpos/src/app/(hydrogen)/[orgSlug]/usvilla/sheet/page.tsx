'use client';

import { useEffect, useState, useCallback } from 'react';
import { ChevronLeft, ChevronRight, Loader2, AlertCircle, LogOut, ClipboardList } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PageShell } from '@/components/ui/page-shell';
import { ThaiDatePicker } from '@/components/ui/thai-date-picker';
import {
  Dialog, DialogContent, DialogHeader, DialogBody, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import DailySheet, { type SheetBooking } from '../daily-sheet';
import type { CalBooking } from '../calendar-view';
import { useUsvillaBootstrap, todayStr, addDays, formatThaiDate } from '../_use-usvilla';
import { useLang } from '../_lang-context';

interface Room { id: string; room_number: string; room_type: 'A' | 'V' | 'C'; status: string }

export default function SheetPage() {
  const { t } = useLang();
  const { orgId, token, bootError } = useUsvillaBootstrap();
  const [date, setDate]         = useState(todayStr);
  const [rooms, setRooms]       = useState<Room[]>([]);
  const [bookings, setBookings] = useState<SheetBooking[]>([]);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState('');
  const [checkoutBooking, setCheckoutBooking] = useState<CalBooking | null>(null);
  const [checkoutSaving, setCheckoutSaving]   = useState(false);

  const loadRooms = useCallback(async () => {
    if (!orgId || !token) return;
    const res = await fetch(`/api/usvilla/rooms?orgId=${orgId}`, { headers: { Authorization: `Bearer ${token}` } });
    if (res.ok) setRooms((await res.json()).rooms ?? []);
  }, [orgId, token]);

  const loadBookings = useCallback(async () => {
    if (!orgId || !token) return;
    setLoading(true); setError('');
    try {
      const res = await fetch(`/api/usvilla/bookings?orgId=${orgId}&date=${date}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error((await res.json()).error);
      setBookings((await res.json()).bookings ?? []);
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  }, [orgId, token, date]);

  useEffect(() => { if (orgId && token) { loadRooms(); loadBookings(); } }, [orgId, token, loadRooms, loadBookings]);

  const refresh = () => { loadRooms(); loadBookings(); };

  const handleCheckout = async () => {
    if (!checkoutBooking) return;
    setCheckoutSaving(true);
    const res = await fetch(`/api/usvilla/bookings/${checkoutBooking.id}?orgId=${orgId}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ action: 'checkout' }),
    });
    setCheckoutSaving(false);
    if (res.ok) { setCheckoutBooking(null); refresh(); }
  };

  const errMsg = bootError || error;

  return (
    <PageShell
      width="wide"
      icon={<ClipboardList className="h-6 w-6" />}
      title={t.title_sheet}
      description={t.subtitle_sheet}
    >
      {errMsg && (
        <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          <AlertCircle className="h-4 w-4 shrink-0" />{errMsg}
        </div>
      )}

      {/* Date nav */}
      <div className="flex items-center gap-3 bg-white rounded-xl border px-4 py-2.5">
        <button onClick={() => setDate((d) => addDays(d, -1))} className="p-1 rounded hover:bg-slate-100">
          <ChevronLeft className="h-4 w-4" />
        </button>
        <span className="text-sm font-medium">{formatThaiDate(date)}</span>
        <ThaiDatePicker value={date} onChange={setDate} placeholder="เลือกวัน" />
        {date !== todayStr() && (
          <button onClick={() => setDate(todayStr())} className="text-xs text-indigo-600 hover:underline">{t.btn_today}</button>
        )}
        <button onClick={() => setDate((d) => addDays(d, 1))} className="p-1 rounded hover:bg-slate-100">
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      {loading ? (
        <div className="flex h-64 items-center justify-center bg-white rounded-xl border">
          <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
        </div>
      ) : (
        <DailySheet
          date={date}
          rooms={rooms as any}
          bookings={bookings}
          orgId={orgId}
          token={token}
          onCheckout={(b) => setCheckoutBooking(b as unknown as CalBooking)}
          onRefresh={refresh}
        />
      )}

      {/* Checkout dialog */}
      <Dialog open={!!checkoutBooking} onOpenChange={(v) => !v && setCheckoutBooking(null)}>
        <DialogContent size="sm">
          <DialogHeader><DialogTitle>ยืนยัน Check-out</DialogTitle></DialogHeader>
          <DialogBody>
          <div className="text-sm space-y-1">
            <p>ห้อง <strong>{checkoutBooking?.pms_rooms.room_number}</strong></p>
            <p>แขก <strong>{checkoutBooking?.guest_name}</strong></p>
            <p className="text-slate-400">เวลา {new Date().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })}</p>
          </div>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCheckoutBooking(null)} disabled={checkoutSaving}>ยกเลิก</Button>
            <Button onClick={handleCheckout} disabled={checkoutSaving}>
              <LogOut className="h-4 w-4 mr-1" />{checkoutSaving ? 'กำลังบันทึก…' : 'ยืนยัน Check-out'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}
