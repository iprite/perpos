'use client';

import { LogOut, Ban, BedDouble, User, Calendar, CreditCard } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { useLang } from './_lang-context';
import { getPayLabel } from './_i18n';
import type { CalBooking } from './calendar-view';

interface Props {
  booking: CalBooking | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  orgId: string;
  token: string;
  onCheckout: (booking: CalBooking) => void;
  onCancel: (booking: CalBooking) => void;
}

const STATUS_COLOR: Record<string, string> = {
  checked_in:  'bg-green-100 text-green-700',
  checked_out: 'bg-slate-100 text-slate-500',
  reserved:    'bg-yellow-100 text-yellow-700',
  cancelled:   'bg-red-100 text-red-500',
};

const TYPE_COLOR: Record<string, string> = {
  A: 'bg-blue-100 text-blue-800 border-blue-200',
  V: 'bg-purple-100 text-purple-800 border-purple-200',
  C: 'bg-emerald-100 text-emerald-800 border-emerald-200',
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' });
}

export default function BookingDetailDialog({
  booking, open, onOpenChange, onCheckout, onCancel,
}: Props) {
  const { t } = useLang();
  if (!booking) return null;

  const room  = booking.pms_rooms;
  const total = booking.pms_payments.reduce((s, p) => s + Number(p.amount), 0);

  const statusLabel: Record<string, string> = {
    checked_in:  t.status_occupied,
    checked_out: t.status_checked_out,
    reserved:    t.status_reserved,
    cancelled:   t.status_cancelled,
  };

  const stayLabel = booking.stay_type === 'daily' ? t.stay_daily_long : t.stay_hourly;

  const row = (icon: React.ReactNode, label: string, value: React.ReactNode) => (
    <div className="flex items-start gap-3 py-2 border-b border-slate-100 last:border-0">
      <span className="mt-0.5 text-slate-400 shrink-0">{icon}</span>
      <div className="flex-1 min-w-0">
        <p className="text-xs text-slate-400">{label}</p>
        <div className="text-sm font-medium text-slate-800">{value}</div>
      </div>
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className={`text-xs font-semibold px-2 py-0.5 rounded border ${TYPE_COLOR[room.room_type]}`}>
              {room.room_number}
            </span>
            <span>{booking.guest_name}</span>
            <span className={`ml-auto text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLOR[booking.status]}`}>
              {statusLabel[booking.status] ?? booking.status}
            </span>
          </DialogTitle>
        </DialogHeader>

        <div className="divide-y divide-slate-100 py-1">
          {row(<User className="h-4 w-4" />, t.detail_guest,
            <span>{booking.guest_name}{booking.nationality ? ` · ${booking.nationality}` : ''}</span>
          )}
          {row(<BedDouble className="h-4 w-4" />, t.detail_stay, stayLabel)}
          {row(<Calendar className="h-4 w-4" />, t.detail_checkin,
            <span>
              {formatDate(booking.check_in_date)}
              {booking.check_in_time && <span className="text-slate-500 ml-1">{booking.check_in_time}</span>}
            </span>
          )}
          {row(<Calendar className="h-4 w-4" />, t.detail_checkout,
            booking.check_out_date ? (
              <span>
                {formatDate(booking.check_out_date)}
                {booking.check_out_time && <span className="text-slate-500 ml-1">{booking.check_out_time}</span>}
                {booking.nights && <span className="text-slate-400 ml-2">({booking.nights} {t.unit_night})</span>}
              </span>
            ) : <span className="text-slate-400">{t.not_set}</span>
          )}
          {row(<CreditCard className="h-4 w-4" />, t.detail_payment,
            booking.pms_payments.length === 0 ? (
              <span className="text-slate-400">{t.no_payment}</span>
            ) : (
              <div className="space-y-0.5">
                {booking.pms_payments.map((p, i) => (
                  <div key={i} className="flex justify-between text-xs">
                    <span className="text-slate-500">{getPayLabel(p.method, t)}</span>
                    <span className="font-semibold">{Number(p.amount).toLocaleString('th-TH', { minimumFractionDigits: 2 })}</span>
                  </div>
                ))}
                <div className="flex justify-between text-sm font-bold border-t pt-0.5 mt-1">
                  <span>{t.detail_total}</span>
                  <span>{total.toLocaleString('th-TH', { minimumFractionDigits: 2 })} ฿</span>
                </div>
              </div>
            )
          )}
          {booking.notes && row(<span className="text-base">📝</span>, t.field_notes, booking.notes)}
        </div>

        <DialogFooter className="gap-2 flex-wrap">
          <Button variant="outline" onClick={() => onOpenChange(false)} className="flex-1">{t.btn_close}</Button>
          {booking.status === 'checked_in' && (
            <>
              <Button variant="ghost" className="text-red-500 hover:text-red-700"
                onClick={() => { onOpenChange(false); onCancel(booking); }}>
                <Ban className="h-4 w-4 mr-1" />{t.btn_cancel}
              </Button>
              <Button onClick={() => { onOpenChange(false); onCheckout(booking); }}>
                <LogOut className="h-4 w-4 mr-1" />{t.btn_checkout}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
