"use client";

import React, { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Check, ChevronDown } from "lucide-react";
import {
  BookOpenText, Users, BotMessageSquare, Building2, Briefcase,
} from "lucide-react";
import { useAtomValue } from "jotai";
import { ALL_MODULES } from "@/lib/modules";
import { enabledModuleKeysAtom, orgSlugAtom } from "@/app/shared/module-atoms";
import cn from "@core/utils/class-names";

const MODULE_ICONS: Record<string, React.ReactNode> = {
  accounting: <BookOpenText className="h-4 w-4" />,
  payroll:    <Users        className="h-4 w-4" />,
  assistant:  <BotMessageSquare className="h-4 w-4" />,
  tmc:        <Building2    className="h-4 w-4" />,
  crm:        <Briefcase    className="h-4 w-4" />,
};

export function SidebarModuleSwitcher() {
  const pathname    = usePathname() ?? "/";
  const orgSlug     = useAtomValue(orgSlugAtom);
  const enabledKeys = useAtomValue(enabledModuleKeysAtom);
  const router      = useRouter();
  const [open, setOpen] = useState(false);
  const containerRef    = useRef<HTMLDivElement>(null);

  const visibleModules = ALL_MODULES.filter((m) => enabledKeys.includes(m.key));
  const activeModule   = visibleModules.find((m) => m.match(pathname)) ?? visibleModules[0];

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function handle(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [open]);

  // Don't render if only 1 module
  if (visibleModules.length <= 1) return null;

  return (
    <div ref={containerRef} className="relative px-4 pb-3 pt-1 2xl:px-6">
      {/* Trigger */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "flex w-full items-center gap-2.5 rounded-lg border px-3 py-2.5 text-sm font-medium transition-colors",
          open
            ? "border-primary/30 bg-primary/5 text-primary"
            : "border-gray-200 bg-gray-50 text-gray-700 hover:border-gray-300 hover:bg-gray-100"
        )}
      >
        <span className={cn("shrink-0", open ? "text-primary" : "text-gray-500")}>
          {MODULE_ICONS[activeModule?.key ?? ""] ?? <BookOpenText className="h-4 w-4" />}
        </span>
        <span className="flex-1 truncate text-left">{activeModule?.label ?? "Module"}</span>
        <ChevronDown
          className={cn(
            "h-3.5 w-3.5 shrink-0 text-gray-400 transition-transform duration-150",
            open && "rotate-180"
          )}
        />
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute left-4 right-4 top-full z-50 mt-1 overflow-hidden rounded-lg border border-gray-200 bg-white shadow-lg 2xl:left-6 2xl:right-6">
          {visibleModules.map((m) => {
            const isActive = m.key === activeModule?.key;
            return (
              <button
                key={m.key}
                type="button"
                onClick={() => {
                  setOpen(false);
                  if (!isActive) router.push(`/${orgSlug}${m.href}`);
                }}
                className={cn(
                  "flex w-full items-center gap-3 px-3.5 py-2.5 text-left text-sm transition-colors",
                  isActive
                    ? "bg-primary/5 text-primary"
                    : "text-gray-700 hover:bg-gray-50"
                )}
              >
                <span className={cn("shrink-0", isActive ? "text-primary" : "text-gray-400")}>
                  {MODULE_ICONS[m.key] ?? <BookOpenText className="h-4 w-4" />}
                </span>
                <span className="flex-1 font-medium">{m.label}</span>
                {isActive && <Check className="h-3.5 w-3.5 shrink-0 text-primary" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
