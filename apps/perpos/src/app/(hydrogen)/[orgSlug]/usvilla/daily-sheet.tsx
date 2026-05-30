'use client';

import { useState } from 'react';
import { PlusCircle, LogOut, Printer } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useLang } from './_lang-context';
import { getPayLabel } from './_i18n';
import AddPaymentDialog from './add-payment-dialog';

export interface SheetBooking {
  id: string;
  guest_name: string;
  nationality: string | null;
  stay_type: string;
  check_in_date: string;
  check_in_time: string | null;
  check_out_date: string | null;
  check_out_time: string | null;
  nights: number | null;
  status: string;
  notes: string | null;
  pms_rooms: { id: string; room_number: string; room_type: string };
  pms_payments: { method: string; amount: number }[];
}

interface SheetRoom { id: string; room_number: string; room_type: 'A' | 'V' | 'C'; status: string }

interface Props {
  date: string;
  rooms: SheetRoom[];
  bookings: SheetBooking[];
  orgId: string;
  token: string;
  onCheckout: (b: SheetBooking) => void;
  onRefresh: () => void;
}

const METHODS = ['cash','qr','credit_card','trip','agoda','expedia','wechat','alipay'] as const;
type Method = typeof METHODS[number];

const TYPE_HEADER_BG: Record<string, string> = {
  A: 'bg-blue-600', V: 'bg-purple-600', C: 'bg-emerald-600',
};
const TYPE_ROW_BG: Record<string, string> = {
  A: 'bg-blue-50/60', V: 'bg-purple-50/60', C: 'bg-emerald-50/60',
};
const TYPE_SUBTOTAL_BG: Record<string, string> = {
  A: 'bg-blue-100', V: 'bg-purple-100', C: 'bg-emerald-100',
};
const TYPE_LABEL: Record<string, string> = { A: 'A Room', V: 'V Room', C: 'C Room' };

function payMap(payments: { method: string; amount: number }[]): Record<string, number> {
  const m: Record<string, number> = {};
  for (const p of payments) m[p.method] = (m[p.method] ?? 0) + Number(p.amount);
  return m;
}

function fmt(n: number) {
  return n === 0 ? '' : n.toLocaleString('th-TH', { minimumFractionDigits: 2 });
}
function fmtBold(n: number) {
  return n.toLocaleString('th-TH', { minimumFractionDigits: 2 });
}
function formatTime(t: string | null) { return t ? t.slice(0, 5) : '—'; }
function formatDate(iso: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('th-TH', { day: 'numeric', month: 'short' });
}

function TypeSection({
  type, bookings, rooms, orgId, token, onCheckout, onAddPayment,
}: {
  type: 'A' | 'V' | 'C'; bookings: SheetBooking[]; rooms: SheetRoom[];
  orgId: string; token: string;
  onCheckout: (b: SheetBooking) => void; onAddPayment: (b: SheetBooking) => void;
}) {
  const { t } = useLang();
  const typeRooms    = rooms.filter((r) => r.room_type === type);
  const typeBookings = bookings.filter((b) => b.pms_rooms.room_type === type);
  const occupiedIds  = new Set(typeBookings.map((b) => b.pms_rooms.id));
  const vacantCount  = typeRooms.filter((r) => !occupiedIds.has(r.id)).length;

  const subtotals: Record<string, number> = {};
  for (const b of typeBookings) {
    const pm = payMap(b.pms_payments);
    for (const m of METHODS) subtotals[m] = (subtotals[m] ?? 0) + (pm[m] ?? 0);
  }
  const subtotalTotal = Object.values(subtotals).reduce((s, v) => s + v, 0);

  const methodShort = (m: Method): string => {
    const map: Record<Method, keyof typeof t> = {
      cash: 'pay_cash', qr: 'pay_qr', credit_card: 'pay_credit',
      trip: 'pay_trip', agoda: 'pay_agoda', expedia: 'pay_expedia',
      wechat: 'pay_wechat', alipay: 'pay_alipay',
    };
    return t[map[m]] as string;
  };

  return (
    <>
      <tr>
        <td colSpan={15} className={`px-3 py-1.5 text-xs font-bold text-white ${TYPE_HEADER_BG[type]}`}>
          {TYPE_LABEL[type]} — {t.sheet_occupied(typeBookings.length)} · {t.sheet_vacant(vacantCount)}
        </td>
      </tr>
      {typeBookings.length === 0 ? (
        <tr><td colSpan={15} className="px-3 py-2 text-xs text-slate-400 text-center italic">{t.no_bookings}</td></tr>
      ) : (
        typeBookings
          .sort((a, b) => a.pms_rooms.room_number.localeCompare(b.pms_rooms.room_number))
          .map((b) => {
            const pm    = payMap(b.pms_payments);
            const total = Object.values(pm).reduce((s, v) => s + v, 0);
            const isOut = b.status === 'checked_out';
            return (
              <tr key={b.id} className={`border-b border-slate-100 text-xs ${isOut ? 'opacity-60' : TYPE_ROW_BG[type]}`}>
                <td className="px-2 py-2 font-bold text-slate-700 whitespace-nowrap">{b.pms_rooms.room_number}</td>
                <td className="px-2 py-2 font-medium text-slate-800 whitespace-nowrap max-w-[100px] truncate">{b.guest_name}</td>
                <td className="px-2 py-2 text-slate-500">{b.nationality || '—'}</td>
                <td className="px-2 py-2 text-slate-500 whitespace-nowrap">
                  {b.stay_type === 'daily' ? t.stay_daily : t.stay_hourly}
                </td>
                <td className="px-2 py-2 text-center text-slate-500">
                  {b.stay_type === 'daily' ? (b.nights ?? '—') : '—'}
                </td>
                <td className="px-2 py-2 text-center text-slate-600">{formatTime(b.check_in_time)}</td>
                <td className="px-2 py-2 text-center text-slate-600 whitespace-nowrap">
                  {isOut
                    ? <span className="text-slate-400">{formatDate(b.check_out_date)} {formatTime(b.check_out_time)}</span>
                    : formatDate(b.check_out_date)}
                </td>
                {METHODS.map((m) => (
                  <td key={m} className="px-1.5 py-2 text-right text-slate-700 tabular-nums">{fmt(pm[m] ?? 0)}</td>
                ))}
                <td className="px-2 py-2 text-right font-bold text-slate-800 tabular-nums whitespace-nowrap">{fmtBold(total)}</td>
                <td className="px-2 py-2 whitespace-nowrap">
                  {isOut ? (
                    <span className="text-xs text-slate-400">{t.status_checked_out}</span>
                  ) : (
                    <div className="flex gap-1">
                      <button onClick={() => onAddPayment(b)} title={t.btn_add_pay}
                        className="p-1 rounded hover:bg-white/70 text-indigo-500 hover:text-indigo-700 transition-colors">
                        <PlusCircle className="h-4 w-4" />
                      </button>
                      <button onClick={() => onCheckout(b)} title={t.btn_checkout}
                        className="p-1 rounded hover:bg-white/70 text-slate-400 hover:text-slate-700 transition-colors">
                        <LogOut className="h-4 w-4" />
                      </button>
                    </div>
                  )}
                </td>
              </tr>
            );
          })
      )}
      <tr className={`border-t-2 border-slate-300 font-semibold text-xs ${TYPE_SUBTOTAL_BG[type]}`}>
        <td className="px-2 py-1.5 text-slate-700" colSpan={7}>
          {t.sheet_subtotal(TYPE_LABEL[type], typeBookings.length)}
        </td>
        {METHODS.map((m) => (
          <td key={m} className="px-1.5 py-1.5 text-right text-slate-700 tabular-nums">{fmt(subtotals[m] ?? 0)}</td>
        ))}
        <td className="px-2 py-1.5 text-right font-bold text-slate-900 tabular-nums">{fmtBold(subtotalTotal)}</td>
        <td />
      </tr>
    </>
  );
}

export default function DailySheet({ date, rooms, bookings, orgId, token, onCheckout, onRefresh }: Props) {
  const { t } = useLang();
  const [payTarget, setPayTarget] = useState<SheetBooking | null>(null);

  const grandTotals: Record<string, number> = {};
  for (const b of bookings) {
    const pm = payMap(b.pms_payments);
    for (const m of METHODS) grandTotals[m] = (grandTotals[m] ?? 0) + (pm[m] ?? 0);
  }
  const grandTotal = Object.values(grandTotals).reduce((s, v) => s + v, 0);

  const methodShortLabel = (m: Method): string => {
    const map: Record<Method, keyof typeof t> = {
      cash: 'pay_cash', qr: 'pay_qr', credit_card: 'pay_credit',
      trip: 'pay_trip', agoda: 'pay_agoda', expedia: 'pay_expedia',
      wechat: 'pay_wechat', alipay: 'pay_alipay',
    };
    return t[map[m]] as string;
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-slate-700">{t.sheet_head}</h2>
          <p className="text-xs text-slate-400">
            {new Date(date).toLocaleDateString('th-TH', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
            {' · '}{bookings.filter((b) => b.status === 'checked_in').length} {t.unit_rooms}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => window.print()} className="print:hidden">
          <Printer className="h-4 w-4 mr-1" />{t.btn_print}
        </Button>
      </div>

      <div className="overflow-x-auto rounded-xl border bg-white print:overflow-visible">
        <table className="w-full border-collapse text-xs" style={{ minWidth: 900 }}>
          <thead>
            <tr className="bg-slate-700 text-white">
              <th className="px-2 py-2 text-left font-semibold whitespace-nowrap">{t.col_room}</th>
              <th className="px-2 py-2 text-left font-semibold whitespace-nowrap">{t.col_guest}</th>
              <th className="px-2 py-2 text-left font-semibold">{t.col_nationality}</th>
              <th className="px-2 py-2 text-left font-semibold whitespace-nowrap">{t.sheet_col_stay}</th>
              <th className="px-2 py-2 text-center font-semibold">{t.col_nights}</th>
              <th className="px-2 py-2 text-center font-semibold whitespace-nowrap">{t.sheet_col_checkin}</th>
              <th className="px-2 py-2 text-center font-semibold whitespace-nowrap">{t.sheet_col_checkout}</th>
              {METHODS.map((m) => (
                <th key={m} className="px-1.5 py-2 text-right font-semibold whitespace-nowrap">
                  {methodShortLabel(m)}
                </th>
              ))}
              <th className="px-2 py-2 text-right font-semibold">{t.col_subtotal}</th>
              <th className="px-2 py-2 text-center font-semibold print:hidden"></th>
            </tr>
          </thead>
          <tbody>
            {(['A','V','C'] as const).map((type) => (
              <TypeSection key={type} type={type} bookings={bookings} rooms={rooms}
                orgId={orgId} token={token} onCheckout={onCheckout} onAddPayment={setPayTarget} />
            ))}
            <tr className="border-t-4 border-slate-400 bg-slate-800 text-white font-bold text-xs">
              <td className="px-2 py-2" colSpan={7}>{t.sheet_grand_total(bookings.length)}</td>
              {METHODS.map((m) => (
                <td key={m} className="px-1.5 py-2 text-right tabular-nums">{fmt(grandTotals[m] ?? 0)}</td>
              ))}
              <td className="px-2 py-2 text-right tabular-nums text-yellow-300 text-sm">{fmtBold(grandTotal)}</td>
              <td className="print:hidden" />
            </tr>
            <tr className="bg-slate-50">
              <td className="px-2 py-2 text-slate-500 text-xs font-medium" colSpan={7}>{t.sheet_method_sum}</td>
              {METHODS.map((m) => (
                <td key={m} className="px-1.5 py-2 text-right text-xs text-slate-600 tabular-nums font-medium">
                  {grandTotals[m] ? fmtBold(grandTotals[m]) : <span className="text-slate-300">—</span>}
                </td>
              ))}
              <td colSpan={2} />
            </tr>
          </tbody>
        </table>
      </div>

      {payTarget && (
        <AddPaymentDialog
          open={!!payTarget} onOpenChange={(v) => !v && setPayTarget(null)}
          bookingId={payTarget.id} guestName={payTarget.guest_name}
          roomNumber={payTarget.pms_rooms.room_number}
          orgId={orgId} token={token}
          onSuccess={() => { setPayTarget(null); onRefresh(); }}
        />
      )}
    </div>
  );
}
