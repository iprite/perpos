"use client";

import React, { useMemo, useState, useTransition } from "react";
import { Plus } from "lucide-react";
import { useRouter } from "next/navigation";

import type { OrganizationSummary } from "@/lib/accounting/queries";
import { upsertAccountAction, type AccountUpsertInput } from "@/lib/accounting/accounts-actions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AccountsCategorySection } from "@/components/accounting/accounts-category-section";
import { defaultNormalBalance, formatType, typeLabels, type AccountRow, type AccountType, type NormalBalance } from "@/components/accounting/accounts-types";

export { type AccountRow };

export function AccountsManager(props: {
  organizations: OrganizationSummary[];
  activeOrganizationId: string | null;
  accounts: AccountRow[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [editing, setEditing] = useState<AccountRow | null>(null);

  const activeOrg = props.activeOrganizationId;
  const canManage = useMemo(() => {
    if (!activeOrg) return false;
    const org = props.organizations.find((o) => o.id === activeOrg);
    return org?.role === "owner" || org?.role === "admin";
  }, [activeOrg, props.organizations]);

  const grouped = useMemo(() => {
    const byType: Record<AccountType, AccountRow[]> = {
      asset: [],
      liability: [],
      equity: [],
      income: [],
      expense: [],
    };
    for (const a of props.accounts) byType[a.type].push(a);
    return byType;
  }, [props.accounts]);

  const parentOptions = useMemo(() => {
    return props.accounts
      .filter((a) => a.isActive)
      .map((a) => ({ id: a.id, label: `${a.code} ${a.name}` }))
      .sort((a, b) => a.label.localeCompare(b.label, "th"));
  }, [props.accounts]);

  const [draft, setDraft] = useState<AccountUpsertInput>(() => ({
    organizationId: activeOrg ?? "",
    code: "",
    name: "",
    type: "asset",
    normalBalance: "debit",
    parentAccountId: null,
    description: null,
  }));

  const openCreate = () => {
    if (!activeOrg) return;
    setEditing(null);
    setFormError(null);
    setDraft({
      organizationId: activeOrg,
      code: "",
      name: "",
      type: "asset",
      normalBalance: "debit",
      parentAccountId: null,
      description: null,
    });
    setOpen(true);
  };

  const openEdit = (a: AccountRow) => {
    setEditing(a);
    setFormError(null);
    setDraft({
      id: a.id,
      organizationId: a.organizationId,
      code: a.code,
      name: a.name,
      type: a.type,
      normalBalance: a.normalBalance,
      parentAccountId: a.parentAccountId,
      description: a.description,
    });
    setOpen(true);
  };

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-sm text-slate-600">{activeOrg ? "แสดงตามองค์กรที่เลือก" : "กรุณาสร้างหรือเลือกองค์กรก่อน"}</div>

        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2" onClick={openCreate} disabled={!activeOrg || !canManage}>
              <Plus className="h-4 w-4" />
              เพิ่มบัญชี
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editing ? "แก้ไขบัญชี" : "เพิ่มบัญชีใหม่"}</DialogTitle>
            </DialogHeader>

            <div className="grid gap-4">
              <div className="grid gap-2">
                <Label htmlFor="coa-code">รหัสบัญชี</Label>
                <Input
                  id="coa-code"
                  value={draft.code}
                  onChange={(e) => setDraft((s) => ({ ...s, code: e.target.value }))}
                  placeholder="เช่น 1100"
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="coa-name">ชื่อบัญชี</Label>
                <Input
                  id="coa-name"
                  value={draft.name}
                  onChange={(e) => setDraft((s) => ({ ...s, name: e.target.value }))}
                  placeholder="เช่น เงินสด"
                />
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="grid gap-2">
                  <Label>ประเภทบัญชี</Label>
                  <select
                    className="h-9 w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900 focus:outline-none"
                    value={draft.type}
                    onChange={(e) => {
                      const t = e.target.value as AccountType;
                      setDraft((s) => ({ ...s, type: t, normalBalance: defaultNormalBalance(t) }));
                    }}
                  >
                    {(Object.keys(typeLabels) as AccountType[]).map((k) => (
                      <option key={k} value={k}>
                        {formatType(k)}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="grid gap-2">
                  <Label>Normal balance</Label>
                  <select
                    className="h-9 w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900 focus:outline-none"
                    value={draft.normalBalance}
                    onChange={(e) => setDraft((s) => ({ ...s, normalBalance: e.target.value as NormalBalance }))}
                  >
                    <option value="debit">Debit</option>
                    <option value="credit">Credit</option>
                  </select>
                </div>
              </div>

              <div className="grid gap-2">
                <Label>บัญชีแม่ (ถ้ามี)</Label>
                <select
                  className="h-9 w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900 focus:outline-none"
                  value={draft.parentAccountId ?? ""}
                  onChange={(e) => setDraft((s) => ({ ...s, parentAccountId: e.target.value || null }))}
                >
                  <option value="">ไม่มี</option>
                  {parentOptions.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="coa-desc">คำอธิบาย</Label>
                <Input
                  id="coa-desc"
                  value={draft.description ?? ""}
                  onChange={(e) => setDraft((s) => ({ ...s, description: e.target.value }))}
                  placeholder="(ไม่บังคับ)"
                />
              </div>

              {formError ? <div className="text-sm text-red-600">{formError}</div> : null}
            </div>

            <DialogFooter>
              <Button variant="secondary" type="button" onClick={() => setOpen(false)}>
                ยกเลิก
              </Button>
              <Button
                type="button"
                disabled={pending || !canManage || !draft.code.trim() || !draft.name.trim() || !draft.organizationId}
                onClick={() => {
                  setFormError(null);
                  startTransition(async () => {
                    const res = await upsertAccountAction({
                      ...draft,
                      code: draft.code.trim(),
                      name: draft.name.trim(),
                      description: draft.description ? String(draft.description).trim() : null,
                    });
                    if (!res.ok) {
                      if (res.error === "duplicate_code") {
                        setFormError("รหัสบัญชีซ้ำในองค์กรนี้ กรุณาเปลี่ยนรหัส");
                        return;
                      }
                      setFormError(res.error ?? "บันทึกไม่สำเร็จ");
                      return;
                    }
                    setOpen(false);
                    router.refresh();
                  });
                }}
              >
                {pending ? "กำลังบันทึก…" : "บันทึก"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {!activeOrg ? <div className="mt-6 rounded-lg border border-slate-200 bg-white p-6 text-sm text-slate-700">ยังไม่มีองค์กรที่เลือก</div> : null}

      <div className="mt-6 grid gap-6">
        {activeOrg
          ? (Object.keys(typeLabels) as AccountType[]).map((t) => (
              <AccountsCategorySection
                key={t}
                type={t}
                rows={grouped[t]}
                canManage={canManage}
                activeOrganizationId={activeOrg}
                onEdit={openEdit}
                onRefresh={() => router.refresh()}
              />
            ))
          : null}
      </div>
    </div>
  );
}
