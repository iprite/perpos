"use client";

import React, { useMemo, useState, useRef, useEffect, useLayoutEffect, useTransition } from "react";
import { createPortal } from "react-dom";
import { Building2, Check, ChevronsUpDown, Plus, Search } from "lucide-react";
import { useRouter } from "next/navigation";

import { createOrganizationAction, setActiveOrganizationAction } from "@/lib/accounting/actions";
import type { OrganizationSummary } from "@/lib/accounting/queries";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

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
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [newOrgName, setNewOrgName] = useState("");
  const [createError, setCreateError] = useState<string | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const triggerRef  = useRef<HTMLButtonElement>(null);
  const [rect, setRect] = useState<DOMRect | null>(null);

  const selected = activeOrganizationId ?? (organizations[0]?.id ?? "");
  const selectedOrg = useMemo(() => organizations.find((o) => o.id === selected), [organizations, selected]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return organizations;
    return organizations.filter((o) => o.name.toLowerCase().includes(q));
  }, [organizations, search]);

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
        setSearch("");
      }
    }
    if (open) document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [open]);

  function switchOrg(id: string) {
    if (id === selected) { setOpen(false); setSearch(""); return; }
    startTransition(async () => {
      const res = await setActiveOrganizationAction(id);
      if (res.ok) { setOpen(false); setSearch(""); router.refresh(); }
    });
  }

  return (
    <div className="relative">
      {/* Trigger */}
      <button
        ref={triggerRef}
        type="button"
        onClick={() => { setOpen((v) => !v); setSearch(""); }}
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
          style={{ position: "fixed", top: rect.bottom + 6, right: window.innerWidth - rect.right, zIndex: 9999 }}
          className="w-72 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg"
        >
          {/* Search */}
          <div className="flex items-center gap-2 border-b border-slate-100 px-4 py-1.5">
            <Search className="h-3.5 w-3.5 shrink-0 text-slate-400" />
            <input
              autoFocus
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Find organization..."
              className="w-full border-0 bg-transparent text-sm text-slate-700 placeholder-slate-400 outline-none ring-0 focus:outline-none focus-visible:outline-none focus:ring-0"
              style={{ outline: "none", border: "none" }}
            />
          </div>

          {/* Org list */}
          <div className="max-h-60 overflow-y-auto py-1">
            {filtered.length === 0 && (
              <div className="px-4 py-3 text-sm text-slate-400">ไม่พบองค์กร</div>
            )}
            {filtered.map((org) => (
              <button
                key={org.id}
                type="button"
                onClick={() => switchOrg(org.id)}
                disabled={pending}
                className="flex w-full items-center justify-between px-4 py-2.5 text-left text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                <span className="truncate">{org.name}</span>
                {org.id === selected && <Check className="h-4 w-4 shrink-0 text-slate-600" />}
              </button>
            ))}
          </div>

          {/* New org */}
          <div className="border-t border-slate-100">
            <button
              type="button"
              onClick={() => { setOpen(false); setSearch(""); setCreateOpen(true); }}
              className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left text-sm text-slate-600 hover:bg-slate-50"
            >
              <Plus className="h-4 w-4 shrink-0 text-slate-400" />
              New organization
            </button>
          </div>
        </div>,
        document.body
      )}

      {/* Create dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>สร้างองค์กรใหม่</DialogTitle>
          </DialogHeader>
          <div className="grid gap-2">
            <Label htmlFor="org-name">ชื่อองค์กร</Label>
            <Input
              id="org-name"
              value={newOrgName}
              onChange={(e) => setNewOrgName(e.target.value)}
              placeholder="เช่น บริษัท เอ บี ซี จำกัด"
            />
            {createError ? <div className="text-sm text-red-600">{createError}</div> : null}
          </div>
          <DialogFooter>
            <Button
              variant="secondary"
              type="button"
              onClick={() => { setCreateOpen(false); setCreateError(null); }}
            >
              ยกเลิก
            </Button>
            <Button
              type="button"
              disabled={pending || !newOrgName.trim()}
              onClick={() => {
                const name = newOrgName;
                setCreateError(null);
                startTransition(async () => {
                  const res = await createOrganizationAction(name);
                  if (!res.ok) { setCreateError(res.error ?? "สร้างองค์กรไม่สำเร็จ"); return; }
                  setCreateOpen(false);
                  setNewOrgName("");
                  router.refresh();
                });
              }}
            >
              {pending ? "กำลังสร้าง…" : "สร้าง"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
