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

export function CustomSelect({ value, onChange, options, placeholder = "เลือก...", disabled, hasError, className }: Props) {
  const [open, setOpen] = useState(false);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (open && triggerRef.current) {
      setRect(triggerRef.current.getBoundingClientRect());
    }
  }, [open]);

  useEffect(() => {
    function handle(e: MouseEvent) {
      const target = e.target as Node;
      if (!triggerRef.current?.contains(target) && !panelRef.current?.contains(target)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [open]);

  // Close on scroll so panel doesn't drift
  useEffect(() => {
    if (open) {
      const close = () => setOpen(false);
      window.addEventListener("scroll", close, true);
      return () => window.removeEventListener("scroll", close, true);
    }
  }, [open]);

  const selected = options.find((o) => o.value === value);

  const panel =
    open && rect
      ? createPortal(
          <div
            ref={panelRef}
            style={{
              position: "fixed",
              top: rect.bottom + 4,
              left: rect.left,
              width: rect.width,
              zIndex: 9999,
            }}
            className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg"
          >
            <div className="max-h-60 overflow-y-auto py-1">
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
