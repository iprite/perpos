'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  BedDouble, LogIn,
  ChevronLeft, ChevronRight, AlertCircle, Loader2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PageShell } from '@/components/ui/page-shell';
import { ThaiDatePicker } from '@/components/ui/thai-date-picker';
import {
  Dialog, DialogContent, DialogHeader, DialogBody, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { StatusBadge, type BadgeTone } from '@/components/ui/badge';
import {
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell,
} from '@/components/ui/table';
import BookingDialog, { METHOD_LABEL } from './booking-dialog';
import { toast } from '@/lib/toast';
import BookingDetailDialog from './booking-detail-dialog';
import type { CalBooking, CalRoom } from './calendar-view';
import { useUsvillaBootstrap, todayStr, addDays, formatThaiDate } from './_use-usvilla';
import { useLang } from './_lang-context';
import { getPayLabel } from './_i18n';

// ── Types ──────────────────────────────────────────────────────────────────

interface Payment { method: string; amount: number }

interface Booking extends CalBooking { created_at: string }

interface Room extends CalRoom {
  booking: { id: string; guest_name: string; stay_type: string; status: string; pms_payments: Payment[] } | null;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function totalPay(payments: Payment[]) {
  return payments.reduce((s, p) => s + Number(p.amount), 0);
}

const TYPE_COLOR: Record<string, string> = {
  A: 'bg-blue-100 text-blue-800 border-blue-200',
  V: 'bg-purple-100 text-purple-800 border-purple-200',
  C: 'bg-emerald-100 text-emerald-800 border-emerald-200',
};
const STATUS_TONE: Record<string, BadgeTone> = {
  checked_in: 'success', checked_out: 'neutral',
  reserved: 'warning', cancelled: 'danger',
};
const STATUS_TH: Record<string, string> = {
  checked_in: 'เข้าพักอยู่', checked_out: 'เช็คเอาท์แล้ว', reserved: 'จอง', cancelled: 'ยกเลิก',
};

// ── Room Grid ────────────────────────────────────────────────────────────────

function RoomGrid({ rooms, onRoomClick }: { rooms: Room[]; onRoomClick: (r: Room) => void }) {
  return (
    <div className="space-y-3">
      {(['A', 'V', 'C'] as const).map((type) => {
        const tr = rooms.filter((r) => r.room_type === type);
        const occ = tr.filter((r) => r.booking?.status === 'checked_in').length;
        return (
          <div key={type}>
            <div className="flex items-center gap-2 mb-1.5">
              <span className={`text-xs font-semibold px-2 py-0.5 rounded border ${TYPE_COLOR[type]}`}>{type} Room</span>
              <span className="text-xs text-slate-400">{occ}/{tr.length} ห้อง</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {tr.map((room) => {
                const occ = room.booking?.status === 'checked_in';
                const res = room.booking?.status === 'reserved';
                return (
                  <button key={room.id} onClick={() => onRoomClick(room)} title={room.booking?.guest_name || room.room_number}
                    className={['w-12 h-10 rounded text-xs font-medium border transition-colors',
                      room.status === 'maintenance' ? 'bg-slate-200 text-slate-400 border-slate-300 cursor-default' :
                      res   ? 'bg-yellow-100 text-yellow-700 border-yellow-300 hover:bg-yellow-200' :
                      occ   ? 'bg-orange-100 text-orange-700 border-orange-300 hover:bg-orange-200' :
                              'bg-white text-slate-500 border-slate-200 hover:bg-slate-50',
                    ].join(' ')}>{room.room_number.slice(1)}</button>
                );
              })}
            </div>
          </div>
        );
      })}
      <div className="flex gap-4 text-xs text-slate-400 pt-1">
        {[['bg-orange-100 border-orange-300','เข้าพักอยู่'],['bg-yellow-100 border-yellow-300','จอง'],['bg-white border-slate-200','ว่าง']].map(([cls,label]) => (
          <span key={label} className="flex items-center gap-1"><span className={`w-3 h-3 rounded border inline-block ${cls}`}/>{label}</span>
        ))}
      </div>
    </div>
  );
}

// ── Booking Row ───────────────────────────────────────────────────────────────

function BookingRow({ booking, onOpen }: {
  booking: Booking; onOpen: (b: Booking) => void;
}) {
  const { t } = useLang();
  const room  = booking.pms_rooms;
  const total = totalPay(booking.pms_payments);
  const payMethods = booking.pms_payments
    .map((p) => `${getPayLabel(p.method, t)}: ${Number(p.amount).toLocaleString()}`).join(' / ');
  const statusLabel: Record<string, string> = {
    checked_in: t.status_occupied, checked_out: t.status_checked_out,
    reserved: t.status_reserved, cancelled: t.status_cancelled,
  };
  return (
    <TableRow clickable onClick={() => onOpen(booking)}>
      <TableCell>
        <span className={`whitespace-nowrap rounded border px-2 py-0.5 text-xs font-semibold ${TYPE_COLOR[room.room_type]}`}>{room.room_number}</span>
      </TableCell>
      <TableCell className="font-medium">{booking.guest_name}</TableCell>
      <TableCell className="text-slate-500">{booking.nationality || '—'}</TableCell>
      <TableCell>
        <span className="whitespace-nowrap rounded bg-slate-100 px-1.5 py-0.5 text-xs">
          {booking.stay_type === 'daily' ? t.stay_daily : t.stay_hourly}
        </span>
      </TableCell>
      <TableCell className="text-slate-600">
        {formatThaiDate(booking.check_in_date)}
        {booking.check_in_time && <span className="ml-1 text-slate-400">{booking.check_in_time}</span>}
      </TableCell>
      <TableCell className="text-slate-600">
        {booking.check_out_date ? formatThaiDate(booking.check_out_date) : '—'}
        {booking.nights && <span className="ml-1 text-slate-400">({booking.nights} {t.unit_night})</span>}
      </TableCell>
      <TableCell align="right" tabular>
        {total > 0
          ? <span title={payMethods} className="font-medium text-slate-800">{total.toLocaleString('th-TH', { minimumFractionDigits: 2 })}</span>
          : <span className="text-slate-400">—</span>}
      </TableCell>
      <TableCell>
        <StatusBadge tone={STATUS_TONE[booking.status] ?? 'neutral'}>{statusLabel[booking.status] ?? booking.status}</StatusBadge>
      </TableCell>
    </TableRow>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function UsvillaPage() {
  const { t } = useLang();
  const { orgId, token, bootError } = useUsvillaBootstrap();
  const [date, setDate]             = useState(todayStr);
  const [rooms, setRooms]           = useState<Room[]>([]);
  const [bookings, setBookings]     = useState<Booking[]>([]);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState('');

  // Dialogs
  const [newOpen, setNewOpen]               = useState(false);
  const [detailBooking, setDetailBooking]   = useState<CalBooking | null>(null);
  const [checkoutBooking, setCheckoutBooking] = useState<CalBooking | null>(null);
  const [cancelBooking, setCancelBooking]     = useState<CalBooking | null>(null);
  const [cancelSaving, setCancelSaving]       = useState(false);

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
      if (!res.ok) throw new Error((await res.json()).error || 'โหลดข้อมูลล้มเหลว');
      setBookings((await res.json()).bookings ?? []);
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  }, [orgId, token, date]);

  useEffect(() => { if (orgId && token) { loadRooms(); loadBookings(); } }, [orgId, token, loadRooms, loadBookings]);

  const refresh = () => { loadRooms(); loadBookings(); };

  // Stats
  const occupied  = rooms.filter((r) => r.booking?.status === 'checked_in').length;
  const available = rooms.filter((r) => !r.booking && r.status === 'available').length;
  const todayTotal = bookings
    .filter((b) => b.check_in_date === date)
    .reduce((s, b) => s + totalPay(b.pms_payments), 0);

  const handleCancelConfirm = async () => {
    if (!cancelBooking) return;
    setCancelSaving(true);
    try {
      const res = await fetch(`/api/usvilla/bookings/${cancelBooking.id}?orgId=${orgId}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ action: 'cancel' }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      setCancelBooking(null); refresh();
      toast.success('ยกเลิกการจองแล้ว');
    } catch (e: any) { setError(e.message); toast.error(e.message || 'ยกเลิกไม่สำเร็จ'); }
    finally { setCancelSaving(false); }
  };

  const handleRoomClick = (room: Room) => {
    if (room.booking) { setDetailBooking(room.booking as unknown as CalBooking); }
    else { setNewOpen(true); }
  };

  const errMsg = bootError || error;

  return (
    <PageShell
      width="wide"
      icon={<BedDouble className="h-6 w-6" />}
      title={t.title_daily}
      description={t.subtitle_daily}
      actions={
        <>
          <Button onClick={() => setNewOpen(true)}>
            <LogIn className="h-4 w-4 mr-2" />{t.btn_checkin}
          </Button>
        </>
      }
    >
      {errMsg && (
        <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          <AlertCircle className="h-4 w-4 shrink-0" />{errMsg}
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: t.stat_occupied, value: occupied, color: 'text-orange-600' },
          { label: t.stat_available, value: available, color: 'text-green-600' },
          { label: `${t.stat_revenue} ${formatThaiDate(date)}`, value: todayTotal.toLocaleString('th-TH', { minimumFractionDigits: 2 }), color: 'text-indigo-700' },
        ].map((s) => (
          <div key={s.label} className="bg-white rounded-xl border p-4 text-center">
            <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
            <p className="text-xs text-slate-400 mt-1">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Room Grid */}
      {rooms.length > 0 && (
        <div className="bg-white rounded-xl border p-4">
          <h2 className="text-sm font-semibold text-slate-700 mb-3">{t.room_status_today}</h2>
          <RoomGrid rooms={rooms} onRoomClick={handleRoomClick} />
        </div>
      )}

      {/* Daily booking list */}
      <div className="bg-white rounded-xl border overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b bg-slate-50">
          <button onClick={() => setDate((d) => addDays(d, -1))} className="p-1 rounded hover:bg-slate-200">
            <ChevronLeft className="h-4 w-4" />
          </button>
          <div className="flex items-center gap-3">
            <span className="text-sm font-medium">{formatThaiDate(date)}</span>
            <ThaiDatePicker value={date} onChange={setDate} placeholder="เลือกวัน" />
            {date !== todayStr() && (
              <button onClick={() => setDate(todayStr())} className="text-xs text-indigo-600 hover:underline">วันนี้</button>
            )}
          </div>
          <button onClick={() => setDate((d) => addDays(d, 1))} className="p-1 rounded hover:bg-slate-200">
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>

        {loading ? (
          <div className="flex h-32 items-center justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
          </div>
        ) : bookings.length === 0 ? (
          <div className="flex h-32 items-center justify-center text-sm text-slate-400">{t.no_bookings}</div>
        ) : (
          <Table wrapperClassName="rounded-none border-0">
            <TableHeader>
              <TableRow>
                <TableHead>{t.col_room}</TableHead>
                <TableHead>{t.col_guest}</TableHead>
                <TableHead>{t.col_nationality}</TableHead>
                <TableHead>{t.col_type}</TableHead>
                <TableHead>{t.col_checkin}</TableHead>
                <TableHead>{t.col_checkout}</TableHead>
                <TableHead align="right">{t.col_amount}</TableHead>
                <TableHead>{t.col_status}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {bookings.map((b) => (
                <BookingRow key={b.id} booking={b} onOpen={(bk) => setDetailBooking(bk as unknown as CalBooking)} />
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      {/* Dialogs */}
      <BookingDialog open={newOpen} onOpenChange={setNewOpen} rooms={rooms} orgId={orgId} token={token} onSuccess={refresh} />

      <BookingDetailDialog
        booking={detailBooking} open={!!detailBooking} onOpenChange={(v) => !v && setDetailBooking(null)}
        orgId={orgId} token={token}
        onCheckout={(b) => { setDetailBooking(null); setCheckoutBooking(b); }}
        onCancel={(b) => { setDetailBooking(null); setCancelBooking(b); }}
      />

      {/* Checkout */}
      <Dialog open={!!checkoutBooking} onOpenChange={(v) => !v && setCheckoutBooking(null)}>
        <DialogContent size="sm">
          <DialogHeader><DialogTitle>{t.dlg_checkout_title}</DialogTitle></DialogHeader>
          <DialogBody>
          <div className="text-sm space-y-1">
            <p>{t.room_label} <strong>{checkoutBooking?.pms_rooms.room_number}</strong></p>
            <p>{t.col_guest} <strong>{checkoutBooking?.guest_name}</strong></p>
          </div>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCheckoutBooking(null)}>{t.btn_cancel}</Button>
            <Button onClick={async () => {
              if (!checkoutBooking) return;
              const res = await fetch(`/api/usvilla/bookings/${checkoutBooking.id}?orgId=${orgId}`, {
                method: 'PATCH', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify({ action: 'checkout' }),
              });
              setCheckoutBooking(null); refresh();
              if (res.ok) toast.success('เช็คเอาท์แล้ว');
              else toast.error('เช็คเอาท์ไม่สำเร็จ');
            }}>{t.btn_confirm} {t.btn_checkout}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Cancel */}
      <Dialog open={!!cancelBooking} onOpenChange={(v) => !v && setCancelBooking(null)}>
        <DialogContent size="sm">
          <DialogHeader><DialogTitle>{t.dlg_cancel_title}</DialogTitle></DialogHeader>
          <DialogBody>
          <p className="text-sm">
            {cancelBooking && t.dlg_cancel_confirm(cancelBooking.guest_name, cancelBooking.pms_rooms.room_number)}
          </p>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCancelBooking(null)} disabled={cancelSaving}>{t.btn_close}</Button>
            <Button variant="destructive" onClick={handleCancelConfirm} disabled={cancelSaving}>
              {cancelSaving ? t.btn_saving : t.dlg_cancel_btn}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}
