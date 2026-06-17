"use client";

import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronsUpDown } from "lucide-react";
import cn from "@core/utils/class-names";

// ─── Types ───────────────────────────────────────────────────────────────────

export type DropdownItem = {
  key: string;
  label: string;
  icon?: React.ReactNode;
  /** Small pill badge shown after the label (e.g. role tag) */
  badge?: string;
  disabled?: boolean;
  onClick: () => void;
};

type DropdownProps = {
  /** Text shown inside the trigger button */
  label: string;
  /** Icon shown to the left of the label */
  leadingIcon?: React.ReactNode;
  /** Small pill shown after the label inside the trigger (e.g. "OWNER") */
  badge?: string;
  items: DropdownItem[];
  /** Key of the currently selected item — renders a check mark on that row */
  selectedKey?: string;
  /** Extra className for the trigger button */
  className?: string;
  placement?: "bottom-start" | "bottom-end" | "top-start" | "top-end";
  disabled?: boolean;
  /** Minimum panel width — defaults to trigger width */
  minWidth?: number;
};

// ─── Constants ───────────────────────────────────────────────────────────────

const PANEL_MAX_H = 256;
const GAP = 6;

// ─── Dropdown ────────────────────────────────────────────────────────────────

/**
 * Standard Dropdown — trigger button + portal panel with icon/label/check items.
 *
 * Pattern: OrgSwitcher style.
 * Use this for navigation switchers, action menus, and any list-based selection.
 *
 * @example
 * <Dropdown
 *   label={selectedOrg.name}
 *   leadingIcon={<Building2 className="h-4 w-4" />}
 *   selectedKey={selectedOrg.id}
 *   items={orgs.map(o => ({
 *     key: o.id,
 *     label: o.name,
 *     icon: <Building2 className="h-4 w-4" />,
 *     onClick: () => switchOrg(o.id),
 *   }))}
 * />
 */
export function Dropdown({
  label,
  leadingIcon,
  badge,
  items,
  selectedKey,
  className,
  placement = "bottom-start",
  disabled,
  minWidth,
}: DropdownProps) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef   = useRef<HTMLDivElement>(null);
  const scrollRef  = useRef<HTMLDivElement>(null);

  interface PanelPos {
    left?: number;
    right?: number;
    width: number;
    top?: number;
    bottom?: number;
    maxHeight: number;
  }
  const [pos, setPos] = useState<PanelPos | null>(null);

  function calcPos() {
    if (!triggerRef.current) return;
    const r          = triggerRef.current.getBoundingClientRect();
    const vh         = window.innerHeight;
    const spaceBelow = vh - r.bottom - GAP;
    const spaceAbove = r.top - GAP;
    const wantUp     = placement.startsWith("top");
    const alignEnd   = placement.endsWith("end");
    // Respect explicit vertical placement, but flip if there isn't enough room.
    const openUpward = wantUp
      ? !(spaceAbove < PANEL_MAX_H && spaceBelow > spaceAbove)
      : (spaceBelow < PANEL_MAX_H && spaceAbove > spaceBelow);
    const maxHeight  = Math.floor(Math.min(PANEL_MAX_H, Math.max(openUpward ? spaceAbove : spaceBelow, 80)));
    const width      = Math.max(r.width, minWidth ?? 0);

    setPos({
      left:      alignEnd ? undefined : r.left,
      right:     alignEnd ? window.innerWidth - r.right : undefined,
      width,
      top:       openUpward ? undefined : r.bottom + GAP,
      bottom:    openUpward ? vh - r.top + GAP : undefined,
      maxHeight,
    });
  }

  useLayoutEffect(() => {
    if (open) calcPos();
    else setPos(null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function handle(e: MouseEvent) {
      const t = e.target as Node;
      if (
        triggerRef.current && !triggerRef.current.contains(t) &&
        panelRef.current   && !panelRef.current.contains(t)
      ) setOpen(false);
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [open]);

  // Close on scroll outside panel
  useEffect(() => {
    if (!open) return;
    function close(e: Event) {
      if (panelRef.current?.contains(e.target as Node)) return;
      setOpen(false);
    }
    window.addEventListener("scroll", close, true);
    return () => window.removeEventListener("scroll", close, true);
  }, [open]);

  // Recalc on resize
  useEffect(() => {
    if (!open) return;
    window.addEventListener("resize", calcPos);
    return () => window.removeEventListener("resize", calcPos);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Native wheel handler inside panel (mirrors custom-select.tsx)
  useEffect(() => {
    if (!pos) return;
    const el = scrollRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!el.contains(e.target as Node) && e.target !== el) return;
      const delta =
        e.deltaMode === 1 ? e.deltaY * 40
        : e.deltaMode === 2 ? e.deltaY * el.clientHeight
        : e.deltaY;
      const next = Math.max(0, Math.min(el.scrollTop + delta, el.scrollHeight - el.clientHeight));
      if (next === el.scrollTop) return;
      e.preventDefault();
      el.scrollTop = next;
    };
    document.addEventListener("wheel", onWheel, { passive: false, capture: true });
    return () => document.removeEventListener("wheel", onWheel, { capture: true });
  }, [pos]);

  return (
    <div className="relative">
      {/* Trigger */}
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={disabled}
        className={cn(
          "inline-flex h-9 items-center gap-2 rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-800 transition-colors",
          "hover:bg-slate-50 focus:outline-none disabled:opacity-60",
          open && "border-primary/30 bg-primary/5",
          className
        )}
      >
        {leadingIcon && (
          <span className={cn("shrink-0", open ? "text-primary/70" : "text-slate-500")}>
            {leadingIcon}
          </span>
        )}
        <span className="flex-1 truncate text-left font-medium">{label}</span>
        {badge && (
          <span className="rounded border border-slate-200 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
            {badge}
          </span>
        )}
        <ChevronsUpDown
          className={cn(
            "h-3.5 w-3.5 shrink-0 text-slate-400 transition-transform duration-150",
            open && "rotate-180"
          )}
        />
      </button>

      {/* Portal panel */}
      {open && pos && createPortal(
        <div
          ref={panelRef}
          style={{
            position: "fixed",
            left:      pos.left,
            right:     pos.right,
            width:     pos.width,
            top:       pos.top,
            bottom:    pos.bottom,
            zIndex:    9999,
            pointerEvents: "auto",
          }}
          className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg"
        >
          <div
            ref={scrollRef}
            style={{ maxHeight: pos.maxHeight, overscrollBehavior: "contain" }}
            className="overflow-y-scroll py-1"
          >
            {items.length === 0 && (
              <div className="px-4 py-3 text-sm text-slate-400">ไม่มีรายการ</div>
            )}
            {items.map((item) => (
              <button
                key={item.key}
                type="button"
                disabled={item.disabled}
                onClick={() => { item.onClick(); setOpen(false); }}
                className={cn(
                  "flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm text-slate-700",
                  "hover:bg-slate-50 disabled:opacity-50"
                )}
              >
                {item.icon && (
                  <span className="shrink-0 text-slate-400">{item.icon}</span>
                )}
                <span className="flex-1 truncate font-medium">{item.label}</span>
                {item.badge && (
                  <span className="rounded border border-slate-200 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                    {item.badge}
                  </span>
                )}
                {item.key === selectedKey && (
                  <Check className="h-4 w-4 shrink-0 text-slate-600" />
                )}
              </button>
            ))}
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
