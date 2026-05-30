"use client";

import React, { useMemo, useState, useRef, useEffect, useLayoutEffect, useTransition } from "react";
import { createPortal } from "react-dom";
import { Building2, Check, ChevronsUpDown } from "lucide-react";
import { useRouter } from "next/navigation";

import { setActiveOrganizationAction } from "@/lib/accounting/actions";
import type { OrganizationSummary } from "@/lib/accounting/queries";
import { useAuth } from "@/app/shared/auth-provider";

type OrgSwitcherProps = {
  organizations: OrganizationSummary[];
  activeOrganizationId: string | null;
};

const ROLE_LABEL: Record<string, string> = {
  owner: "OWNER",
  admin: "ADMIN",
  user:  "USER",
};

export function OrgSwitcher({ organizations, activeOrganizationId }: OrgSwitcherProps) {
  const router = useRouter();
  const { role } = useAuth();
  const isSystemAdmin = role === "super_admin";
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const triggerRef  = useRef<HTMLButtonElement>(null);
  const [rect, setRect] = useState<DOMRect | null>(null);

  const selected = activeOrganizationId ?? (organizations[0]?.id ?? "");
  const selectedOrg = useMemo(() => organizations.find((o) => o.id === selected), [organizations, selected]);

  useLayoutEffect(() => {
    if (open && triggerRef.current) setRect(triggerRef.current.getBoundingClientRect());
  }, [open]);

  // Close on outside click
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

  function switchOrg(id: string) {
    if (id === selected) { setOpen(false); return; }
    startTransition(async () => {
      const res = await setActiveOrganizationAction(id);
      if (res.ok) {
        setOpen(false);
        const org = organizations.find((o) => o.id === id);
        // Admin navigates directly to org slug so page.tsx /admin redirect is bypassed.
        // Regular users navigate to root — page.tsx resolves the active org + module.
        const dest = isSystemAdmin && org ? `/${org.slug}` : '/';
        router.push(dest);
        router.refresh();
      }
    });
  }

  return (
    <div className="relative">
      {/* Trigger */}
      <button
        ref={triggerRef}
        type="button"
        onClick={() => { setOpen((v) => !v); }}
        disabled={pending}
        className="inline-flex h-9 items-center gap-2 rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-800 hover:bg-slate-50 focus:outline-none disabled:opacity-60"
      >
        <Building2 className="h-4 w-4 shrink-0 text-slate-500" />
        <span className="max-w-[160px] truncate font-medium">{selectedOrg?.name ?? "เลือกองค์กร"}</span>
        {selectedOrg?.role ? (
          <span className="rounded border border-slate-200 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
            {ROLE_LABEL[selectedOrg.role] ?? selectedOrg.role}
          </span>
        ) : null}
        <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 text-slate-400" />
      </button>

      {/* Dropdown panel — portal so overflow-x-auto doesn't clip it */}
      {open && rect && createPortal(
        <div
          ref={dropdownRef}
          style={{ position: "fixed", top: rect.bottom + 6, left: rect.left, width: rect.width, zIndex: 9999 }}
          className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg"
        >
          {/* Org list */}
          <div className="max-h-60 overflow-y-auto py-1">
            {organizations.length === 0 && (
              <div className="px-4 py-3 text-sm text-slate-400">ไม่พบองค์กร</div>
            )}
            {organizations.map((org) => (
              <button
                key={org.id}
                type="button"
                onClick={() => switchOrg(org.id)}
                disabled={pending}
                className="flex w-full items-center justify-between px-4 py-2.5 text-left text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                <span className="flex items-center gap-2 truncate">
                  <span className="truncate">{org.name}</span>
                </span>
                {org.id === selected && <Check className="h-4 w-4 shrink-0 text-slate-600" />}
              </button>
            ))}
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
