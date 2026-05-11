"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
// ChevronLeft used for prev-month button only
import cn from "@core/utils/class-names";

// ─── Thai locale constants ────────────────────────────────────────────────────

const MONTH_FULL: string[] = [
  "มกราคม","กุมภาพันธ์","มีนาคม","เมษายน","พฤษภาคม","มิถุนายน",
  "กรกฎาคม","สิงหาคม","กันยายน","ตุลาคม","พฤศจิกายน","ธันวาคม",
];
const MONTH_SHORT: string[] = [
  "ม.ค.","ก.พ.","มี.ค.","เม.ย.","พ.ค.","มิ.ย.",
  "ก.ค.","ส.ค.","ก.ย.","ต.ค.","พ.ย.","ธ.ค.",
];
// Monday-first: จันทร์ อังคาร พุธ พฤหัส ศุกร์ เสาร์ อาทิตย์
const DAY_HEADERS: string[] = ["จันทร์","อังคาร","พุธ","พฤหัส","ศุกร์","เสาร์","อาทิตย์"];

const TO_BE = 543; // CE → BE offset

// ─── Helpers ─────────────────────────────────────────────────────────────────

function parseIso(iso: string): { y: number; m: number; d: number } | null {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  const [y, m, d] = iso.split("-").map(Number);
  return { y, m, d };
}

function toIso(y: number, m: number, d: number): string {
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function formatDisplay(iso: string): string {
  const p = parseIso(iso);
  if (!p) return "";
  return `${p.d} ${MONTH_SHORT[p.m - 1]} ${String(p.y + TO_BE).slice(-2)}`;
}

// Returns array of {day, iso, isCurrentMonth} for a Monday-first 6-week grid
function buildGrid(year: number, month: number): { day: number; iso: string; curMonth: boolean }[] {
  const firstDay = new Date(year, month - 1, 1).getDay(); // 0=Sun
  const daysInMonth = new Date(year, month, 0).getDate();

  // Monday-first offset: Mon=0, Tue=1 … Sun=6
  const offset = (firstDay + 6) % 7;

  const cells: { day: number; iso: string; curMonth: boolean }[] = [];

  // Leading days from prev month
  const prevMonth = month === 1 ? 12 : month - 1;
  const prevYear  = month === 1 ? year - 1 : year;
  const daysInPrev = new Date(prevYear, prevMonth, 0).getDate();
  for (let i = offset - 1; i >= 0; i--) {
    const d = daysInPrev - i;
    cells.push({ day: d, iso: toIso(prevYear, prevMonth, d), curMonth: false });
  }

  // Current month
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({ day: d, iso: toIso(year, month, d), curMonth: true });
  }

  // Trailing days
  const nextMonth = month === 12 ? 1 : month + 1;
  const nextYear  = month === 12 ? year + 1 : year;
  let nextDay = 1;
  while (cells.length < 42) {
    cells.push({ day: nextDay, iso: toIso(nextYear, nextMonth, nextDay), curMonth: false });
    nextDay++;
  }

  return cells;
}

// ─── Component ───────────────────────────────────────────────────────────────

type Props = {
  value: string;          // ISO "YYYY-MM-DD" (CE)
  onChange: (iso: string) => void;
  disabled?: boolean;
  hasError?: boolean;
  className?: string;
  placeholder?: string;
};

export function ThaiDatePicker({ value, onChange, disabled, hasError, className, placeholder = "วว/ดด/ปป" }: Props) {
  const today   = new Date();
  const todayIso = toIso(today.getFullYear(), today.getMonth() + 1, today.getDate());

  const parsed = parseIso(value);
  const [viewYear,   setViewYear]  = useState(parsed?.y  ?? today.getFullYear());
  const [viewMonth,  setViewMonth] = useState(parsed?.m  ?? today.getMonth() + 1);
  const [yearInput,  setYearInput] = useState(String((parsed?.y ?? today.getFullYear()) + TO_BE));
  const [open,       setOpen]      = useState(false);
  const [rect,       setRect]      = useState<DOMRect | null>(null);

  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef   = useRef<HTMLDivElement>(null);

  // Sync view when value changes externally
  useEffect(() => {
    const p = parseIso(value);
    if (p) { setViewYear(p.y); setViewMonth(p.m); setYearInput(String(p.y + TO_BE)); }
  }, [value]);

  useLayoutEffect(() => {
    if (open && triggerRef.current) setRect(triggerRef.current.getBoundingClientRect());
  }, [open]);

  useEffect(() => {
    const handle = (e: MouseEvent) => {
      if (!triggerRef.current?.contains(e.target as Node) && !panelRef.current?.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    if (open) document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const close = () => {
      // Don't close if an input inside the panel has focus (e.g. year input)
      if (panelRef.current?.contains(document.activeElement)) return;
      setOpen(false);
    };
    window.addEventListener("scroll", close, true);
    return () => window.removeEventListener("scroll", close, true);
  }, [open]);

  const prevMonth = () => {
    setViewMonth((m) => {
      if (m === 1) {
        setViewYear((y) => { setYearInput(String(y - 1 + TO_BE)); return y - 1; });
        return 12;
      }
      return m - 1;
    });
  };
  const nextMonth = () => {
    setViewMonth((m) => {
      if (m === 12) {
        setViewYear((y) => { setYearInput(String(y + 1 + TO_BE)); return y + 1; });
        return 1;
      }
      return m + 1;
    });
  };

  const select = (iso: string) => {
    onChange(iso);
    setOpen(false);
  };

  const grid = buildGrid(viewYear, viewMonth);

  // Dropdown years: ±10 years from today, displayed as BE
  const yearOptions = Array.from({ length: 21 }, (_, i) => today.getFullYear() - 10 + i);

  const panel = open && rect
    ? createPortal(
        <div
          ref={panelRef}
          style={{ position: "fixed", top: rect.bottom + 4, left: rect.left, width: rect.width, zIndex: 9999 }}
          className="rounded-xl border border-slate-200 bg-white shadow-xl"
        >
          {/* Header */}
          <div className="flex items-center border-b border-slate-100 px-3 py-2.5">
            <button
              type="button"
              onClick={prevMonth}
              className="shrink-0 rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>

            <div className="flex flex-1 items-center justify-center gap-3 text-[11px] font-medium text-slate-800">
              {/* Month dropdown */}
              <select
                value={viewMonth}
                onChange={(e) => setViewMonth(Number(e.target.value))}
                className="appearance-none border-0 bg-transparent font-medium text-slate-800 outline-none ring-0 focus:outline-none focus:ring-0 cursor-pointer"
              >
                {MONTH_FULL.map((name, i) => (
                  <option key={i} value={i + 1}>{name}</option>
                ))}
              </select>

              {/* Year input (BE) */}
              <input
                type="text"
                inputMode="numeric"
                maxLength={4}
                value={yearInput}
                onChange={(e) => {
                  const v = e.target.value.replace(/\D/g, "");
                  setYearInput(v);
                  if (v.length === 4 && Number(v) > 2400) setViewYear(Number(v) - TO_BE);
                }}
                onBlur={() => setYearInput(String(viewYear + TO_BE))}
                className="w-[4.55rem] shrink-0 border-0 bg-transparent text-center font-medium text-slate-800 outline-none ring-0 focus:outline-none focus:ring-0"
              />
            </div>

            <button
              type="button"
              onClick={nextMonth}
              className="shrink-0 rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          {/* Day headers */}
          <div className="grid grid-cols-7 border-b border-slate-100 px-2 pt-2 pb-1">
            {DAY_HEADERS.map((d) => (
              <div key={d} className="text-center text-[11px] font-medium text-slate-400">{d}</div>
            ))}
          </div>

          {/* Day grid */}
          <div className="grid grid-cols-7 gap-y-0.5 p-2">
            {grid.map((cell) => {
              const isSelected = cell.iso === value;
              const isToday    = cell.iso === todayIso;
              return (
                <button
                  key={cell.iso}
                  type="button"
                  onClick={() => select(cell.iso)}
                  className={cn(
                    "mx-auto flex h-8 w-8 items-center justify-center rounded-full text-sm transition-colors",
                    isSelected
                      ? "bg-orange-500 text-white font-semibold"
                      : isToday
                        ? "text-orange-500 font-semibold hover:bg-orange-50"
                        : cell.curMonth
                          ? "text-slate-700 hover:bg-slate-100"
                          : "text-slate-300 hover:bg-slate-50",
                  )}
                >
                  {cell.day}
                </button>
              );
            })}
          </div>
        </div>,
        document.body
      )
    : null;

  return (
    <div className={cn("relative", className)}>
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "inline-flex h-9 w-full items-center justify-between rounded-md border bg-white px-3 text-sm transition-colors focus:outline-none disabled:cursor-not-allowed disabled:opacity-50",
          open
            ? "border-orange-400 ring-1 ring-orange-400"
            : hasError
              ? "border-red-300"
              : "border-slate-200 hover:border-slate-300",
          value ? "text-slate-800" : "text-slate-400",
        )}
      >
        <span>{value ? formatDisplay(value) : placeholder}</span>
        <CalendarDays className="ml-2 h-4 w-4 shrink-0 text-slate-400" />
      </button>
      {panel}
    </div>
  );
}
