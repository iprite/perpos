"use client";

import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { usePathname } from "next/navigation";
import cn from "@core/utils/class-names";

// ─── Types ───────────────────────────────────────────────────────────────────

export type PopoverPlacement =
  | "bottom-start" | "bottom-end"
  | "top-start"    | "top-end"
  | "right-start"  | "right-end"
  | "left-start"   | "left-end";

type PopoverProps = {
  /**
   * The trigger element. Either a node, or a render function receiving the
   * current open state — use the function form to rotate a ChevronsUpDown
   * (or any indicator) inside the trigger when the panel opens.
   */
  trigger: React.ReactNode | ((open: boolean) => React.ReactNode);
  /** Panel content */
  children: React.ReactNode;
  placement?: PopoverPlacement;
  /** Extra className for the panel */
  className?: string;
  /** Extra className for the trigger wrapper */
  triggerClassName?: string;
  /** Controlled open state (optional) */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
};

const GAP = 6;

// ─── Popover ─────────────────────────────────────────────────────────────────

/**
 * Standard Popover — wraps any trigger + renders a rich panel via portal.
 *
 * Pattern: Profile Menu (sidebar footer) style.
 * Use this for user menus, rich panels, or any non-list popover content.
 * For list-based dropdowns use <Dropdown> instead.
 *
 * Placement controls which side + alignment the panel opens. Side placements
 * ("right-*" / "left-*") are useful when the trigger sits against an edge
 * (e.g. a profile card at the bottom of the sidebar opens "right-end").
 *
 * @example
 * <Popover
 *   placement="right-end"
 *   trigger={(open) => (
 *     <button className="...">
 *       <Avatar /> <span>iprite</span>
 *       <ChevronsUpDown className={cn("h-4 w-4 transition-transform", open && "rotate-180")} />
 *     </button>
 *   )}
 * >
 *   <div className="w-56">{/* panel content *\/}</div>
 * </Popover>
 */
export function Popover({
  trigger,
  children,
  placement = "bottom-end",
  className,
  triggerClassName,
  open: controlledOpen,
  onOpenChange,
}: PopoverProps) {
  const isControlled = controlledOpen !== undefined;
  const [internalOpen, setInternalOpen] = useState(false);
  const open = isControlled ? controlledOpen : internalOpen;

  function setOpen(v: boolean) {
    if (!isControlled) setInternalOpen(v);
    onOpenChange?.(v);
  }

  const triggerRef = useRef<HTMLDivElement>(null);
  const panelRef   = useRef<HTMLDivElement>(null);
  const pathname   = usePathname();

  interface PanelPos {
    top?: number;
    bottom?: number;
    left?: number;
    right?: number;
  }
  const [pos, setPos] = useState<PanelPos | null>(null);

  // Close on route change
  useEffect(() => { setOpen(false); }, [pathname]); // eslint-disable-line react-hooks/exhaustive-deps

  useLayoutEffect(() => {
    if (!open || !triggerRef.current) { setPos(null); return; }
    const r  = triggerRef.current.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const side  = placement.split("-")[0];  // bottom | top | right | left
    const align = placement.split("-")[1];  // start | end

    const next: PanelPos = {};
    if (side === "bottom" || side === "top") {
      if (side === "bottom") next.top = r.bottom + GAP;
      else                   next.bottom = vh - r.top + GAP;
      if (align === "start") next.left = r.left;
      else                   next.right = vw - r.right;
    } else {
      // right / left — panel sits beside the trigger
      if (side === "right") next.left = r.right + GAP;
      else                   next.right = vw - r.left + GAP;
      // align start = top edge to trigger top · end = bottom edge to trigger bottom
      if (align === "start") next.top = r.top;
      else                   next.bottom = vh - r.bottom;
    }
    setPos(next);
  }, [open, placement]);

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
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
      {/* Trigger wrapper */}
      <div
        ref={triggerRef}
        onClick={() => setOpen(!open)}
        className={cn("cursor-pointer", triggerClassName)}
      >
        {typeof trigger === "function" ? trigger(open) : trigger}
      </div>

      {/* Portal panel */}
      {open && pos && createPortal(
        <div
          ref={panelRef}
          style={{
            position: "fixed",
            top:      pos.top,
            bottom:   pos.bottom,
            left:     pos.left,
            right:    pos.right,
            zIndex:   9999,
          }}
          className={cn(
            "overflow-hidden rounded-lg border border-gray-200 bg-white shadow-lg",
            className
          )}
        >
          {children}
        </div>,
        document.body
      )}
    </>
  );
}
