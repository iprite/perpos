"use client";

import React, { useMemo, useState, useTransition } from "react";
import { Building2, Plus } from "lucide-react";
import { useRouter } from "next/navigation";

import { createOrganizationAction, setActiveOrganizationAction } from "@/lib/accounting/actions";
import type { OrganizationSummary } from "@/lib/accounting/queries";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type OrgSwitcherProps = {
  organizations: OrganizationSummary[];
  activeOrganizationId: string | null;
};

export function OrgSwitcher({ organizations, activeOrganizationId }: OrgSwitcherProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [createOpen, setCreateOpen] = useState(false);
  const [newOrgName, setNewOrgName] = useState("");
  const [error, setError] = useState<string | null>(null);

  const canChoose = organizations.length > 0;
  const selected = activeOrganizationId ?? (organizations[0]?.id ?? "");

  const selectedRole = useMemo(() => {
    const org = organizations.find((o) => o.id === selected);
    return org?.role ?? null;
  }, [organizations, selected]);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex items-center gap-2">
        <div className="inline-flex h-9 items-center gap-2 rounded-md border border-slate-200 bg-white px-3">
          <Building2 className="h-4 w-4 text-slate-600" />
          <select
            className="h-8 bg-transparent text-sm text-slate-900 focus:outline-none disabled:opacity-60"
            disabled={!canChoose || pending}
            value={selected}
            onChange={(e) => {
              const nextId = e.target.value;
              setError(null);
              startTransition(async () => {
                const res = await setActiveOrganizationAction(nextId);
                if (!res.ok) {
                  setError(res.error ?? "เปลี่ยนองค์กรไม่สำเร็จ");
                  return;
                }
                router.refresh();
              });
            }}
          >
            {organizations.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
        </div>

        {selectedRole ? (
          <div className="rounded-full bg-slate-100 px-2 py-1 text-xs text-slate-700">{selectedRole}</div>
        ) : null}
      </div>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogTrigger asChild>
          <Button variant="outline" className="gap-2" disabled={pending}>
            <Plus className="h-4 w-4" />
            สร้างองค์กร
          </Button>
        </DialogTrigger>
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
            {error ? <div className="text-sm text-red-600">{error}</div> : null}
          </div>

          <DialogFooter>
            <Button
              variant="secondary"
              type="button"
              onClick={() => {
                setCreateOpen(false);
                setError(null);
              }}
            >
              ยกเลิก
            </Button>
            <Button
              type="button"
              disabled={pending || !newOrgName.trim()}
              onClick={() => {
                const name = newOrgName;
                setError(null);
                startTransition(async () => {
                  const res = await createOrganizationAction(name);
                  if (!res.ok) {
                    setError(res.error ?? "สร้างองค์กรไม่สำเร็จ");
                    return;
                  }
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
