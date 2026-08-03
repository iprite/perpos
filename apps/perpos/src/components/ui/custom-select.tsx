"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronsUpDown, Search } from "lucide-react";
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
  /** ช่องค้นหาในแผงตัวเลือก — ไม่ส่งมา = เปิดเองเมื่อรายการยาว (> 8) */
  searchable?: boolean;
};

interface PanelPos {
  left: number;
  width: number;
  top?: number; // open downward
  bottom?: number; // open upward
  maxHeight: number;
}

const PANEL_MAX_H = 256; // max dropdown height in px
const GAP = 4; // gap between trigger and panel

export function CustomSelect({
  value,
  onChange,
  options,
  placeholder = "เลือก...",
  disabled,
  hasError,
  className,
  searchable,
}: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [pos, setPos] = useState<PanelPos | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Calculate position every time the dropdown opens (after layout, before paint)
  useLayoutEffect(() => {
    if (!open || !triggerRef.current) {
      setPos(null);
      return;
    }

    const r = triggerRef.current.getBoundingClientRect();
    const vh = window.innerHeight;
    const spaceBelow = vh - r.bottom - GAP;
    const spaceAbove = r.top - GAP;

    // Flip upward when there's not enough space below
    const openUpward = spaceBelow < PANEL_MAX_H && spaceAbove > spaceBelow;
    const maxHeight = Math.floor(
      Math.min(PANEL_MAX_H, Math.max(openUpward ? spaceAbove : spaceBelow, 80)),
    );

    setPos(
      openUpward
        ? { left: r.left, width: r.width, bottom: vh - r.top + GAP, maxHeight }
        : { left: r.left, width: r.width, top: r.bottom + GAP, maxHeight },
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

  // Native wheel handler — intercepts at document-level capture so it runs
  // regardless of what react-remove-scroll (Radix Dialog) does at window-level.
  // Manually assigning scrollTop bypasses any upstream preventDefault().
  // Dependency is `pos` (not `open`) because the portal only renders after pos is set,
  // so scrollRef.current is guaranteed non-null when this effect fires.
  useEffect(() => {
    if (!pos) return;
    const el = scrollRef.current;
    if (!el) return;

    const onWheel = (e: WheelEvent) => {
      // Only handle events whose target is inside our scroll panel
      if (!el.contains(e.target as Node) && e.target !== el) return;

      // Normalize to pixels: mode 0=px, 1=lines(~40px), 2=page
      const delta =
        e.deltaMode === 1
          ? e.deltaY * 40
          : e.deltaMode === 2
            ? e.deltaY * el.clientHeight
            : e.deltaY;

      const next = Math.max(0, Math.min(el.scrollTop + delta, el.scrollHeight - el.clientHeight));
      if (next === el.scrollTop) return; // already at boundary — allow default (page scroll)
      e.preventDefault();
      el.scrollTop = next;
    };

    // Capture at document so we run after window (react-remove-scroll), but JS
    // scrollTop assignment is unaffected by any upstream preventDefault.
    document.addEventListener("wheel", onWheel, { passive: false, capture: true });
    return () => document.removeEventListener("wheel", onWheel, { capture: true });
  }, [pos]);

  // Recalculate on window resize while open
  useEffect(() => {
    if (!open || !triggerRef.current) return;
    function onResize() {
      if (!triggerRef.current) return;
      const r = triggerRef.current.getBoundingClientRect();
      const vh = window.innerHeight;
      const spaceBelow = vh - r.bottom - GAP;
      const spaceAbove = r.top - GAP;
      const openUpward = spaceBelow < PANEL_MAX_H && spaceAbove > spaceBelow;
      const maxHeight = Math.floor(
        Math.min(PANEL_MAX_H, Math.max(openUpward ? spaceAbove : spaceBelow, 80)),
      );
      setPos(
        openUpward
          ? { left: r.left, width: r.width, bottom: vh - r.top + GAP, maxHeight }
          : { left: r.left, width: r.width, top: r.bottom + GAP, maxHeight },
      );
    }
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [open]);

  // ล้างคำค้นทุกครั้งที่ปิด — เปิดใหม่ต้องเห็นรายการเต็ม
  useEffect(() => {
    if (!open) setQuery("");
  }, [open]);

  const selected = options.find((o) => o.value === value);

  // รายการยาวต้องหาได้ ไม่ใช่ไล่เลื่อนทีละบรรทัด
  const showSearch = searchable ?? options.length > 8;
  const q = query.trim().toLowerCase();
  const visible = q ? options.filter((o) => o.label.toLowerCase().includes(q)) : options;

  const panel =
    open && pos
      ? createPortal(
          <div
            ref={panelRef}
            style={{
              position: "fixed",
              left: pos.left,
              width: pos.width,
              top: pos.top,
              bottom: pos.bottom,
              zIndex: 9999,
              pointerEvents: "auto",
            }}
            className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg"
          >
            {showSearch && (
              <div className="border-b border-slate-100 p-2">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                  <input
                    ref={searchRef}
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Escape") setOpen(false);
                      if (e.key === "Enter" && visible.length > 0) {
                        e.preventDefault();
                        onChange(visible[0].value);
                        setOpen(false);
                      }
                    }}
                    placeholder="ค้นหา..."
                    className="h-8 w-full rounded-md border border-slate-200 bg-white pl-8 pr-2 text-sm text-slate-800 placeholder:text-slate-400 focus:border-slate-400 focus:outline-none"
                  />
                </div>
              </div>
            )}
            <div
              ref={scrollRef}
              style={{
                // เผื่อความสูงของช่องค้นหา (~52px) ไม่ให้แผงล้นจอ
                maxHeight: showSearch ? Math.max(pos.maxHeight - 52, 96) : pos.maxHeight,
                overscrollBehavior: "contain",
              }}
              className="overflow-y-scroll py-1"
            >
              {visible.length === 0 && (
                <p className="px-4 py-3 text-sm text-slate-400">ไม่พบรายการที่ค้นหา</p>
              )}
              {visible.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => {
                    onChange(opt.value);
                    setOpen(false);
                  }}
                  className="flex w-full items-center justify-between px-4 py-2.5 text-left text-sm text-slate-700 hover:bg-slate-50"
                >
                  <span className="truncate">{opt.label}</span>
                  {opt.value === value && (
                    <Check className="ml-2 h-4 w-4 shrink-0 text-slate-600" />
                  )}
                </button>
              ))}
            </div>
          </div>,
          document.body,
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
          "inline-flex h-9 w-full items-center justify-between rounded-md border bg-white px-3 text-sm transition-colors focus:outline-none disabled:opacity-60",
          open
            ? "border-slate-400 ring-2 ring-slate-900/10"
            : hasError
              ? "border-red-300"
              : "border-slate-200",
          !disabled && !open && "hover:border-slate-300",
          selected ? "text-slate-800" : "text-slate-400",
        )}
      >
        <span className="truncate">{selected?.label ?? placeholder}</span>
        <ChevronsUpDown
          className={cn(
            "ml-2 h-3.5 w-3.5 shrink-0 text-slate-400 transition-transform duration-200",
            open && "rotate-180",
          )}
        />
      </button>
      {panel}
    </div>
  );
}
