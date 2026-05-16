"use client";

import React, { useState, useRef, useEffect, useLayoutEffect } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronsUpDown, LayoutGrid } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";

import { ALL_MODULES } from "@/lib/modules";

type ModuleSwitcherProps = {
  enabledModuleKeys: string[];
};

export function ModuleSwitcher({ enabledModuleKeys }: ModuleSwitcherProps) {
  const pathname = usePathname() ?? "/";
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [rect, setRect] = useState<DOMRect | null>(null);

  const visibleModules = ALL_MODULES.filter((m) => enabledModuleKeys.includes(m.key));
  const activeModule = visibleModules.find((m) => m.match(pathname)) ?? visibleModules[0];

  useLayoutEffect(() => {
    if (open && triggerRef.current) setRect(triggerRef.current.getBoundingClientRect());
  }, [open]);

  useEffect(() => {
    function handle(e: MouseEvent) {
      const t = e.target as Node;
      if (
        triggerRef.current && !triggerRef.current.contains(t) &&
        dropdownRef.current && !dropdownRef.current.contains(t)
      ) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [open]);

  if (visibleModules.length === 0) return null;

  return (
    <div className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex h-9 items-center gap-2 rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-800 hover:bg-slate-50 focus:outline-none"
      >
        <LayoutGrid className="h-4 w-4 shrink-0 text-slate-500" />
        <span className="font-medium">{activeModule?.label ?? "Module"}</span>
        <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 text-slate-400" />
      </button>

      {open && rect && createPortal(
        <div
          ref={dropdownRef}
          style={{ position: "fixed", top: rect.bottom + 6, left: rect.left, zIndex: 9999 }}
          className="w-48 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg"
        >
          <div className="py-1">
            {visibleModules.map((m) => (
              <button
                key={m.key}
                type="button"
                onClick={() => { setOpen(false); router.push(m.href); }}
                className="flex w-full items-center justify-between px-4 py-2.5 text-left text-sm text-slate-700 hover:bg-slate-50"
              >
                <span>{m.label}</span>
                {activeModule?.key === m.key && <Check className="h-4 w-4 shrink-0 text-slate-600" />}
              </button>
            ))}
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}
