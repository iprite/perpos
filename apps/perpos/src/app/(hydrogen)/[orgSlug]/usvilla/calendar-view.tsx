'use client';

import { useMemo } from 'react';

export interface CalBooking {
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

export interface CalRoom {
  id: string;
  room_number: string;
  room_type: 'A' | 'V' | 'C';
  status: string;
}

interface Props {
  rooms: CalRoom[];
  bookings: CalBooking[];
  startDate: string;
  days: number;
  onEmptyClick: (roomId: string, date: string) => void;
  onBookingClick: (booking: CalBooking) => void;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function addDays(iso: string, n: number) {
  const d = new Date(iso);
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

const TYPE_HEADER: Record<string, string> = {
  A: 'bg-blue-50 text-blue-800 border-r border-blue-100',
  V: 'bg-purple-50 text-purple-800 border-r border-purple-100',
  C: 'bg-emerald-50 text-emerald-800 border-r border-emerald-100',
};

// Booking bar colors by type + status
function barColor(type: string, status: string) {
  if (status === 'reserved') return 'bg-amber-300 text-amber-900';
  if (status === 'checked_out') return 'bg-slate-200 text-slate-500';
  return {
    A: 'bg-blue-400 text-white',
    V: 'bg-purple-400 text-white',
    C: 'bg-emerald-500 text-white',
  }[type] ?? 'bg-slate-400 text-white';
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function CalendarView({
  rooms, bookings, startDate, days, onEmptyClick, onBookingClick,
}: Props) {
  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const endDate = useMemo(() => addDays(startDate, days - 1), [startDate, days]);

  const dates = useMemo(
    () => Array.from({ length: days }, (_, i) => addDays(startDate, i)),
    [startDate, days],
  );

  // roomId → bookings sorted by check_in_date
  const byRoom = useMemo(() => {
    const map: Record<string, CalBooking[]> = {};
    for (const b of bookings) {
      const rid = b.pms_rooms.id;
      if (!map[rid]) map[rid] = [];
      map[rid].push(b);
    }
    return map;
  }, [bookings]);

  // For each (roomId, date) → booking info + position
  function getCell(roomId: string, date: string) {
    const list = byRoom[roomId] ?? [];
    for (const b of list) {
      const startsOnOrBefore = b.check_in_date <= date;
      const endsOnOrAfter = !b.check_out_date || b.check_out_date >= date;
      if (!startsOnOrBefore || !endsOnOrAfter) continue;

      // Position within the booking (for bar styling + label visibility)
      const isActualStart = b.check_in_date === date;
      const isActualEnd   = b.check_out_date === date;
      const isViewStart   = date === startDate && b.check_in_date < startDate;
      const isViewEnd     = date === endDate && (!b.check_out_date || b.check_out_date > endDate);

      const showLabel = isActualStart || isViewStart;
      const roundLeft  = isActualStart;
      const roundRight = isActualEnd || isViewEnd || !b.check_out_date;

      return { booking: b, showLabel, roundLeft, roundRight };
    }
    return null;
  }

  const types: ('A' | 'V' | 'C')[] = ['A', 'V', 'C'];

  // Date header formatting
  function headerInfo(iso: string) {
    const d = new Date(iso + 'T00:00:00');
    return {
      day:      d.getDate(),
      weekday:  d.toLocaleDateString('th-TH', { weekday: 'short' }),
      isToday:  iso === today,
      isWeekend: d.getDay() === 0 || d.getDay() === 6,
    };
  }

  const COL_W = 44; // px per date column
  const ROW_H = 36; // px per room row

  return (
    <div className="overflow-x-auto rounded-xl border bg-white select-none">
      <table
        className="border-collapse"
        style={{ minWidth: 80 + days * COL_W, tableLayout: 'fixed' }}
      >
        {/* Column widths */}
        <colgroup>
          <col style={{ width: 80 }} />
          {dates.map((d) => <col key={d} style={{ width: COL_W }} />)}
        </colgroup>

        {/* Date header */}
        <thead>
          <tr className="border-b bg-slate-50">
            <th className="sticky left-0 z-20 bg-slate-50 border-r border-slate-200 px-2 py-1.5 text-left text-xs font-semibold text-slate-400">
              ห้อง
            </th>
            {dates.map((date) => {
              const { day, weekday, isToday, isWeekend } = headerInfo(date);
              return (
                <th
                  key={date}
                  className={[
                    'px-0 py-1 text-center border-r border-slate-100',
                    isToday ? 'bg-indigo-50' : '',
                  ].join(' ')}
                >
                  <div className={`text-[10px] leading-none ${isWeekend ? 'text-red-400' : 'text-slate-400'}`}>
                    {weekday}
                  </div>
                  <div className={[
                    'text-sm font-bold leading-tight mt-0.5',
                    isToday
                      ? 'bg-indigo-500 text-white rounded-full w-6 h-6 flex items-center justify-center mx-auto'
                      : isWeekend ? 'text-red-400' : 'text-slate-700',
                  ].join(' ')}>
                    {day}
                  </div>
                </th>
              );
            })}
          </tr>
        </thead>

        {/* Room rows grouped by type */}
        <tbody>
          {types.map((type) => {
            const typeRooms = rooms.filter((r) => r.room_type === type);
            if (typeRooms.length === 0) return null;

            return typeRooms.map((room, ri) => (
              <tr
                key={room.id}
                style={{ height: ROW_H }}
                className={[
                  'border-b border-slate-100',
                  ri === 0 ? 'border-t-2 border-t-slate-200' : '',
                ].join(' ')}
              >
                {/* Room label */}
                <td
                  className={[
                    'sticky left-0 z-10 px-2 text-xs font-bold border-r',
                    room.status === 'maintenance' ? 'bg-slate-100 text-slate-400' : TYPE_HEADER[type],
                  ].join(' ')}
                >
                  {room.room_number}
                </td>

                {/* Date cells */}
                {dates.map((date) => {
                  const cell = getCell(room.id, date);
                  const isTodayCol = date === today;

                  if (!cell) {
                    return (
                      <td
                        key={date}
                        onClick={() => room.status === 'available' && onEmptyClick(room.id, date)}
                        className={[
                          'border-r border-slate-100 p-0',
                          room.status === 'available'
                            ? `cursor-pointer ${isTodayCol ? 'bg-indigo-50/50 hover:bg-indigo-100/70' : 'hover:bg-slate-50'}`
                            : isTodayCol ? 'bg-indigo-50/20' : '',
                        ].join(' ')}
                      />
                    );
                  }

                  const { booking, showLabel, roundLeft, roundRight } = cell;
                  const color = barColor(type, booking.status);

                  return (
                    <td
                      key={date}
                      onClick={() => onBookingClick(booking)}
                      className={[
                        'p-0 border-r border-slate-100 cursor-pointer',
                        isTodayCol ? 'bg-indigo-50/20' : '',
                      ].join(' ')}
                    >
                      {/* Booking bar */}
                      <div
                        className={[
                          'flex items-center h-7 my-0.5 px-1 text-[10px] font-semibold overflow-hidden',
                          color,
                          roundLeft  ? 'rounded-l ml-0.5' : 'ml-0',
                          roundRight ? 'rounded-r mr-0.5' : 'mr-0',
                        ].join(' ')}
                      >
                        {showLabel && (
                          <span className="truncate leading-none">
                            {booking.guest_name}
                            {booking.nationality ? ` (${booking.nationality})` : ''}
                          </span>
                        )}
                      </div>
                    </td>
                  );
                })}
              </tr>
            ));
          })}
        </tbody>
      </table>

      {/* Legend */}
      <div className="flex flex-wrap gap-4 px-4 py-2 border-t bg-slate-50 text-xs text-slate-500">
        <span className="flex items-center gap-1.5"><span className="w-4 h-3 rounded bg-blue-400 inline-block"/>A Room — เช็คอิน</span>
        <span className="flex items-center gap-1.5"><span className="w-4 h-3 rounded bg-purple-400 inline-block"/>V Room — เช็คอิน</span>
        <span className="flex items-center gap-1.5"><span className="w-4 h-3 rounded bg-emerald-500 inline-block"/>C Room — เช็คอิน</span>
        <span className="flex items-center gap-1.5"><span className="w-4 h-3 rounded bg-amber-300 inline-block"/>จอง (Reserved)</span>
        <span className="flex items-center gap-1.5"><span className="w-4 h-3 rounded bg-slate-200 inline-block"/>เช็คเอาท์แล้ว</span>
      </div>
    </div>
  );
}
