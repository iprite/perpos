"use client";

import React, { useState, useTransition, useOptimistic } from "react";
import cn from "@core/utils/class-names";
import { MoreVertical, PencilLine } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CustomSelect } from "@/components/ui/custom-select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import { upsertPayItemAction, togglePayItemActiveAction, type PayItemRow } from "@/lib/payroll/actions";

// ─── Toggle Switch ────────────────────────────────────────────────────────────

function ToggleSwitch({
  active,
  disabled,
  onToggle,
}: {
  active: boolean;
  disabled?: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onToggle}
      className={cn(
        "relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none",
        active ? "bg-teal-500" : "bg-slate-200",
        disabled && "cursor-not-allowed opacity-50"
      )}
    >
      <span
        className={cn(
          "inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform",
          active ? "translate-x-6" : "translate-x-1"
        )}
      />
    </button>
  );
}

// ─── Action Menu ──────────────────────────────────────────────────────────────

function ActionMenu({ onEdit }: { onEdit: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
      >
        <MoreVertical className="h-4 w-4" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-20 mt-1 w-28 overflow-hidden rounded-md border border-slate-200 bg-white shadow-md">
            <button
              type="button"
              onClick={() => { setOpen(false); onEdit(); }}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
            >
              <PencilLine className="h-3.5 w-3.5" />
              แก้ไข
            </button>
          </div>
        </>
      )}
    </div>
  );
}

// ─── Dialog Form ─────────────────────────────────────────────────────────────

type FormState = {
  code: string;
  name: string;
  item_type: "earning" | "deduction";
  is_recurring: string;
  account_label: string;
  ytd_type: string;
};

const emptyForm = (tab: "earning" | "deduction"): FormState => ({
  code: "",
  name: "",
  item_type: tab,
  is_recurring: "true",
  account_label: "",
  ytd_type: "none",
});

function PayItemDialog({
  open,
  onClose,
  organizationId,
  editing,
  defaultTab,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  organizationId: string;
  editing: PayItemRow | null;
  defaultTab: "earning" | "deduction";
  onSaved: (row: PayItemRow) => void;
}) {
  const [form, setForm] = useState<FormState>(emptyForm(defaultTab));
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Sync form when dialog opens
  React.useEffect(() => {
    if (open) {
      if (editing) {
        setForm({
          code:          editing.code,
          name:          editing.name,
          item_type:     editing.item_type,
          is_recurring:  String(editing.is_recurring),
          account_label: editing.account_label ?? "",
          ytd_type:      editing.ytd_type,
        });
      } else {
        setForm(emptyForm(defaultTab));
      }
      setErr(null);
    }
  }, [open, editing, defaultTab]);

  function set(key: keyof FormState, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSave() {
    if (!form.name.trim() || !form.code.trim()) {
      setErr("กรุณากรอกรหัสและชื่อรายการ");
      return;
    }
    setSaving(true);
    setErr(null);
    const res = await upsertPayItemAction({
      organizationId,
      id:            editing?.id,
      code:          form.code.trim(),
      name:          form.name.trim(),
      item_type:     form.item_type,
      is_recurring:  form.is_recurring === "true",
      account_label: form.account_label.trim() || null,
      ytd_type:      form.ytd_type as "none" | "income40_1",
    });
    setSaving(false);
    if (!res.ok) { setErr((res as any).error ?? "บันทึกไม่สำเร็จ"); return; }

    onSaved({
      id:                editing?.id ?? "__new__",
      organization_id:   organizationId,
      code:              form.code.trim(),
      name:              form.name.trim(),
      item_type:         form.item_type,
      is_recurring:      form.is_recurring === "true",
      account_label:     form.account_label.trim() || null,
      linked_account_id: editing?.linked_account_id ?? null,
      ytd_type:          form.ytd_type as "none" | "income40_1",
      is_system:         editing?.is_system ?? false,
      active:            editing?.active ?? true,
      sort_order:        editing?.sort_order ?? 0,
    });
    onClose();
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {editing ? "แก้ไขรายการ" : form.item_type === "earning" ? "เพิ่มรายการเงินเพิ่มใหม่" : "เพิ่มรายการเงินหักใหม่"}
          </DialogTitle>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>รหัส <span className="text-red-500">*</span></Label>
              <Input
                value={form.code}
                onChange={(e) => set("code", e.target.value)}
                placeholder="เช่น SAL"
                disabled={editing?.is_system}
              />
            </div>
            <div className="space-y-1.5">
              <Label>ชื่อรายการ <span className="text-red-500">*</span></Label>
              <Input
                value={form.name}
                onChange={(e) => set("name", e.target.value)}
                placeholder="เช่น เงินเดือน"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>ประเภท</Label>
            <CustomSelect
              value={form.is_recurring}
              onChange={(v) => set("is_recurring", v)}
              options={[
                { value: "true",  label: "ประจำ" },
                { value: "false", label: "ไม่ประจำ" },
              ]}
            />
          </div>

          <div className="space-y-1.5">
            <Label>บันทึกที่บัญชี</Label>
            <Input
              value={form.account_label}
              onChange={(e) => set("account_label", e.target.value)}
              placeholder="เช่น 215201 ภ.ง.ด. 1 ค้างจ่าย"
            />
          </div>

          <div className="space-y-1.5">
            <Label>คำนวณเงินได้ทั้งปี</Label>
            <CustomSelect
              value={form.ytd_type}
              onChange={(v) => set("ytd_type", v)}
              options={[
                { value: "none",        label: "ไม่รวมรายการนี้" },
                { value: "income40_1",  label: "รวมคำนวณเป็นเงินได้ 40(1)" },
              ]}
            />
          </div>

          {err && <p className="text-sm text-red-500">{err}</p>}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>ยกเลิก</Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "กำลังบันทึก..." : "บันทึก"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main Client Component ────────────────────────────────────────────────────

export function PayItemsClient({
  organizationId,
  initialEarnings,
  initialDeductions,
}: {
  organizationId: string;
  initialEarnings: PayItemRow[];
  initialDeductions: PayItemRow[];
}) {
  const [currentTab, setCurrentTab] = useState<"earning" | "deduction">("earning");
  const [earnings, setEarnings] = useState<PayItemRow[]>(initialEarnings);
  const [deductions, setDeductions] = useState<PayItemRow[]>(initialDeductions);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<PayItemRow | null>(null);
  const [dialogDefaultTab, setDialogDefaultTab] = useState<"earning" | "deduction">("earning");

  const [, startTransition] = useTransition();

  const rows = currentTab === "earning" ? earnings : deductions;
  const setRows = currentTab === "earning" ? setEarnings : setDeductions;

  function openCreate(tab: "earning" | "deduction") {
    setEditing(null);
    setDialogDefaultTab(tab);
    setDialogOpen(true);
  }

  function openEdit(row: PayItemRow) {
    setEditing(row);
    setDialogDefaultTab(row.item_type);
    setDialogOpen(true);
  }

  function handleToggle(row: PayItemRow) {
    if (row.is_system) return;
    const next = !row.active;

    // Optimistic update
    const update = (list: PayItemRow[]) =>
      list.map((r) => (r.id === row.id ? { ...r, active: next } : r));
    setEarnings((e) => update(e));
    setDeductions((d) => update(d));

    startTransition(async () => {
      const res = await togglePayItemActiveAction({ id: row.id, organizationId, active: next });
      if (!res.ok) {
        // Revert
        const revert = (list: PayItemRow[]) =>
          list.map((r) => (r.id === row.id ? { ...r, active: row.active } : r));
        setEarnings((e) => revert(e));
        setDeductions((d) => revert(d));
      }
    });
  }

  function handleSaved(saved: PayItemRow) {
    const upsert = (list: PayItemRow[]) => {
      const idx = list.findIndex((r) => r.id === saved.id);
      if (idx >= 0) {
        const copy = [...list];
        copy[idx] = saved;
        return copy;
      }
      return [...list, { ...saved, id: saved.id === "__new__" ? String(Date.now()) : saved.id }];
    };
    if (saved.item_type === "earning") setEarnings((e) => upsert(e));
    else setDeductions((d) => upsert(d));
  }

  return (
    <div>
      {/* Tabs */}
      <div className="mb-4 flex items-center justify-between">
        <div className="flex gap-1 rounded-lg border border-slate-200 bg-slate-50 p-1">
          {(["earning", "deduction"] as const).map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setCurrentTab(tab)}
              className={cn(
                "rounded-md px-4 py-1.5 text-sm font-medium transition-colors",
                currentTab === tab
                  ? "bg-white text-slate-900 shadow-sm"
                  : "text-slate-500 hover:text-slate-700"
              )}
            >
              {tab === "earning" ? "เงินเพิ่ม" : "เงินหัก"}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => openCreate("earning")}>
            + เพิ่มรายการเงินเพิ่มใหม่
          </Button>
          <Button variant="outline" size="sm" onClick={() => openCreate("deduction")}>
            + เพิ่มรายการเงินหักใหม่
          </Button>
        </div>
      </div>

      {/* Table */}
      <div>
        <Table>
          <TableHeader>
            <TableRow className="bg-slate-50">
              <TableHead className="w-14 text-center">ลำดับ</TableHead>
              <TableHead className="w-24">เลขที่</TableHead>
              <TableHead>ชื่อรายการ</TableHead>
              <TableHead>บันทึกที่บัญชี</TableHead>
              <TableHead className="w-28">ประเภท</TableHead>
              <TableHead className="w-52">คำนวณเงินได้ทั้งปี</TableHead>
              <TableHead className="w-28 text-center">เปิดใช้งาน</TableHead>
              <TableHead className="w-12" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="py-10 text-center text-sm text-slate-400">
                  ไม่มีรายการ
                </TableCell>
              </TableRow>
            ) : (
              rows.map((row, idx) => (
                <TableRow key={row.id} className="hover:bg-slate-50">
                  <TableCell className="text-center text-sm text-slate-500">{idx + 1}</TableCell>
                  <TableCell className="font-mono text-sm text-slate-700">{row.code}</TableCell>
                  <TableCell className="text-sm text-slate-900">{row.name}</TableCell>
                  <TableCell className="text-sm text-slate-500">{row.account_label ?? "—"}</TableCell>
                  <TableCell className="text-sm text-slate-700">
                    {row.is_recurring ? "ประจำ" : "ไม่ประจำ"}
                  </TableCell>
                  <TableCell className="text-sm text-slate-700">
                    {row.ytd_type === "income40_1" ? "รวมคำนวณเป็นเงินได้ 40(1)" : "ไม่รวมรายการนี้"}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center justify-center gap-2">
                      <ToggleSwitch
                        active={row.active}
                        disabled={row.is_system}
                        onToggle={() => handleToggle(row)}
                      />
                      <span className={cn("text-xs", row.active ? "text-teal-600" : "text-slate-400")}>
                        {row.active ? "เปิด" : "ไม่เปิด"}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell>
                    {!row.is_system && (
                      <ActionMenu onEdit={() => openEdit(row)} />
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <PayItemDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        organizationId={organizationId}
        editing={editing}
        defaultTab={dialogDefaultTab}
        onSaved={handleSaved}
      />
    </div>
  );
}
