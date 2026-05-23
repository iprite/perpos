"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronsUpDown } from "lucide-react";
import cn from "@core/utils/class-names";

export type SelectOption = { value: string; label: string };

type Props = {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  disabled?: boolean;
  hasError?: boolean;
  className?: string;
};

interface PanelPos {
  left:      number;
  width:     number;
  top?:      number;   // open downward
  bottom?:   number;   // open upward
  maxHeight: number;
}

const PANEL_MAX_H = 256; // max dropdown height in px
const GAP         = 4;   // gap between trigger and panel

export function CustomSelect({ value, onChange, options, placeholder = "เลือก...", disabled, hasError, className }: Props) {
  const [open,     setOpen]     = useState(false);
  const [pos,      setPos]      = useState<PanelPos | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef   = useRef<HTMLDivElement>(null);

  // Calculate position every time the dropdown opens (after layout, before paint)
  useLayoutEffect(() => {
    if (!open || !triggerRef.current) { setPos(null); return; }

    const r          = triggerRef.current.getBoundingClientRect();
    const vh         = window.innerHeight;
    const spaceBelow = vh - r.bottom - GAP;
    const spaceAbove = r.top - GAP;

    // Flip upward when there's not enough space below
    const openUpward = spaceBelow < PANEL_MAX_H && spaceAbove > spaceBelow;
    const maxHeight  = Math.floor(
      Math.min(PANEL_MAX_H, Math.max(openUpward ? spaceAbove : spaceBelow, 80))
    );

    setPos(
      openUpward
        ? { left: r.left, width: r.width, bottom: vh - r.top + GAP, maxHeight }
        : { left: r.left, width: r.width, top:    r.bottom + GAP,   maxHeight }
    );
  }, [open]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function handle(e: MouseEvent) {
      const t = e.target as Node;
      if (!triggerRef.current?.contains(t) && !panelRef.current?.contains(t)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [open]);

  // Close when the page scrolls (outside of the panel itself)
  useEffect(() => {
    if (!open) return;
    function close(e: Event) {
      if (panelRef.current?.contains(e.target as Node)) return;
      setOpen(false);
    }
    window.addEventListener("scroll", close, true);
    return () => window.removeEventListener("scroll", close, true);
  }, [open]);

  // Recalculate on window resize while open
  useEffect(() => {
    if (!open || !triggerRef.current) return;
    function onResize() {
      if (!triggerRef.current) return;
      const r          = triggerRef.current.getBoundingClientRect();
      const vh         = window.innerHeight;
      const spaceBelow = vh - r.bottom - GAP;
      const spaceAbove = r.top - GAP;
      const openUpward = spaceBelow < PANEL_MAX_H && spaceAbove > spaceBelow;
      const maxHeight  = Math.floor(
        Math.min(PANEL_MAX_H, Math.max(openUpward ? spaceAbove : spaceBelow, 80))
      );
      setPos(
        openUpward
          ? { left: r.left, width: r.width, bottom: vh - r.top + GAP, maxHeight }
          : { left: r.left, width: r.width, top:    r.bottom + GAP,   maxHeight }
      );
    }
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [open]);

  const selected = options.find((o) => o.value === value);

  const panel =
    open && pos
      ? createPortal(
          <div
            ref={panelRef}
            style={{
              position:  "fixed",
              left:      pos.left,
              width:     pos.width,
              top:       pos.top,
              bottom:    pos.bottom,
              zIndex:    9999,
              pointerEvents: "auto",
            }}
            className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg"
          >
            <div
              style={{ maxHeight: pos.maxHeight }}
              className="overflow-y-auto py-1"
            >
              {options.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => { onChange(opt.value); setOpen(false); }}
                  className="flex w-full items-center justify-between px-4 py-2.5 text-left text-sm text-slate-700 hover:bg-slate-50"
                >
                  <span className="truncate">{opt.label}</span>
                  {opt.value === value && <Check className="ml-2 h-4 w-4 shrink-0 text-slate-600" />}
                </button>
              ))}
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
          "inline-flex h-9 w-full items-center justify-between rounded-md border bg-white px-3 text-sm focus:outline-none disabled:opacity-60",
          hasError ? "border-red-300" : "border-slate-200",
          !disabled && "hover:bg-slate-50",
          selected ? "text-slate-800" : "text-slate-400"
        )}
      >
        <span className="truncate">{selected?.label ?? placeholder}</span>
        <ChevronsUpDown className="ml-2 h-3.5 w-3.5 shrink-0 text-slate-400" />
      </button>
      {panel}
    </div>
  );
}
