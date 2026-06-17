"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronsUpDown, X } from "lucide-react";
import cn from "@core/utils/class-names";

export type SelectOption = { value: string; label: string };

type Props = {
  value: string[];
  onChange: (value: string[]) => void;
  options: SelectOption[];
  placeholder?: string;
  disabled?: boolean;
  hasError?: boolean;
  className?: string;
};

interface PanelPos {
  left: number;
  width: number;
  top?: number;
  bottom?: number;
  maxHeight: number;
}

const PANEL_MAX_H = 256;
const GAP = 4;

export function MultiSelect({ value, onChange, options, placeholder = "เลือก...", disabled, hasError, className }: Props) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<PanelPos | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (!open || !triggerRef.current) { setPos(null); return; }
    const r = triggerRef.current.getBoundingClientRect();
    const vh = window.innerHeight;
    const spaceBelow = vh - r.bottom - GAP;
    const spaceAbove = r.top - GAP;
    const openUpward = spaceBelow < PANEL_MAX_H && spaceAbove > spaceBelow;
    const maxHeight = Math.floor(Math.min(PANEL_MAX_H, Math.max(openUpward ? spaceAbove : spaceBelow, 80)));
    setPos(
      openUpward
        ? { left: r.left, width: r.width, bottom: vh - r.top + GAP, maxHeight }
        : { left: r.left, width: r.width, top: r.bottom + GAP, maxHeight }
    );
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function handle(e: MouseEvent) {
      const t = e.target as Node;
      if (!triggerRef.current?.contains(t) && !panelRef.current?.contains(t)) setOpen(false);
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function close(e: Event) {
      if (panelRef.current?.contains(e.target as Node)) return;
      setOpen(false);
    }
    window.addEventListener("scroll", close, true);
    return () => window.removeEventListener("scroll", close, true);
  }, [open]);

  useEffect(() => {
    if (!pos) return;
    const el = scrollRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!el.contains(e.target as Node) && e.target !== el) return;
      const delta = e.deltaMode === 1 ? e.deltaY * 40 : e.deltaMode === 2 ? e.deltaY * el.clientHeight : e.deltaY;
      const next = Math.max(0, Math.min(el.scrollTop + delta, el.scrollHeight - el.clientHeight));
      if (next === el.scrollTop) return;
      e.preventDefault();
      el.scrollTop = next;
    };
    document.addEventListener("wheel", onWheel, { passive: false, capture: true });
    return () => document.removeEventListener("wheel", onWheel, { capture: true });
  }, [pos]);

  function toggle(v: string) {
    if (value.includes(v)) onChange(value.filter(x => x !== v));
    else onChange([...value, v]);
  }

  function remove(v: string, e: React.MouseEvent) {
    e.stopPropagation();
    onChange(value.filter(x => x !== v));
  }

  const selectedLabels = value.map(v => options.find(o => o.value === v)?.label ?? v);

  const panel =
    open && pos
      ? createPortal(
          <div
            ref={panelRef}
            style={{ position: "fixed", left: pos.left, width: pos.width, top: pos.top, bottom: pos.bottom, zIndex: 9999, pointerEvents: "auto" }}
            className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg"
          >
            <div ref={scrollRef} style={{ maxHeight: pos.maxHeight, overscrollBehavior: "contain" }} className="overflow-y-scroll py-1">
              {options.map((opt) => {
                const checked = value.includes(opt.value);
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => toggle(opt.value)}
                    className="flex w-full items-center justify-between px-4 py-2.5 text-left text-sm text-slate-700 hover:bg-slate-50"
                  >
                    <span className="truncate">{opt.label}</span>
                    {checked && <Check className="ml-2 h-4 w-4 shrink-0 text-blue-600" />}
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
        onClick={() => setOpen(v => !v)}
        className={cn(
          "inline-flex min-h-9 w-full items-center justify-between rounded-md border bg-white px-3 py-1.5 text-sm focus:outline-none disabled:opacity-60",
          hasError ? "border-red-300" : "border-slate-200",
          !disabled && "hover:bg-slate-50",
          value.length === 0 ? "text-slate-400" : "text-slate-800"
        )}
      >
        <span className="flex flex-wrap gap-1 flex-1 min-w-0">
          {value.length === 0
            ? <span className="truncate">{placeholder}</span>
            : selectedLabels.map((label, i) => (
                <span key={value[i]} className="inline-flex items-center gap-1 rounded bg-blue-50 border border-blue-200 px-1.5 py-0.5 text-xs text-blue-700 font-medium">
                  {label}
                  <X className="h-3 w-3 cursor-pointer hover:text-blue-900" onClick={(e) => remove(value[i], e)} />
                </span>
              ))
          }
        </span>
        <ChevronsUpDown className={cn("ml-2 h-3.5 w-3.5 shrink-0 text-slate-400 transition-transform duration-200", open && "rotate-180")} />
      </button>
      {panel}
    </div>
  );
}
