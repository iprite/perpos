"use client";

import React, { useState } from "react";
import cn from "@core/utils/class-names";
import { MoreVertical, PencilLine, Plus } from "lucide-react";

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

import { upsertFundAction, type FundRow } from "@/lib/payroll/actions";

const FUND_TYPE_LABELS: Record<string, string> = {
  ssf:   "ประกันสังคม (SSF)",
  pvd:   "กองทุนสำรองเลี้ยงชีพ (PVD)",
  gf:    "กองทุนสงเคราะห์ (GF)",
  other: "อื่นๆ",
};

const fundTypeOptions = [
  { value: "ssf",   label: "ประกันสังคม (SSF)" },
  { value: "pvd",   label: "กองทุนสำรองเลี้ยงชีพ (PVD)" },
  { value: "gf",    label: "กองทุนสงเคราะห์ (GF)" },
  { value: "other", label: "อื่นๆ" },
];

type FormState = {
  fund_type: string;
  name: string;
  employee_rate: string;
  employer_rate: string;
  ceiling_wage: string;
  notes: string;
};

const emptyForm: FormState = {
  fund_type:     "ssf",
  name:          "",
  employee_rate: "",
  employer_rate: "",
  ceiling_wage:  "",
  notes:         "",
};

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

function fmtRate(rate: number) {
  return (rate * 100).toFixed(2) + "%";
}

export function FundsClient({
  organizationId,
  initialRows,
}: {
  organizationId: string;
  initialRows: FundRow[];
}) {
  const [rows, setRows] = useState<FundRow[]>(initialRows);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<FundRow | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  function openCreate() {
    setEditing(null);
    setForm(emptyForm);
    setErr(null);
    setDialogOpen(true);
  }

  function openEdit(row: FundRow) {
    setEditing(row);
    setForm({
      fund_type:     row.fund_type,
      name:          row.name,
      employee_rate: String(row.employee_rate * 100),
      employer_rate: String(row.employer_rate * 100),
      ceiling_wage:  row.ceiling_wage != null ? String(row.ceiling_wage) : "",
      notes:         row.notes ?? "",
    });
    setErr(null);
    setDialogOpen(true);
  }

  function set(key: keyof FormState, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSave() {
    if (!form.name.trim()) { setErr("กรุณากรอกชื่อกองทุน"); return; }
    setSaving(true);
    setErr(null);
    const res = await upsertFundAction({
      organizationId,
      id:            editing?.id,
      fund_type:     form.fund_type as FundRow["fund_type"],
      name:          form.name.trim(),
      employee_rate: (parseFloat(form.employee_rate) || 0) / 100,
      employer_rate: (parseFloat(form.employer_rate) || 0) / 100,
      ceiling_wage:  parseFloat(form.ceiling_wage) || null,
      notes:         form.notes.trim() || null,
    });
    setSaving(false);
    if (!res.ok) { setErr((res as any).error ?? "บันทึกไม่สำเร็จ"); return; }

    const updated: FundRow = {
      id:              editing?.id ?? String(Date.now()),
      organization_id: organizationId,
      fund_type:       form.fund_type as FundRow["fund_type"],
      name:            form.name.trim(),
      employee_rate:   (parseFloat(form.employee_rate) || 0) / 100,
      employer_rate:   (parseFloat(form.employer_rate) || 0) / 100,
      ceiling_wage:    parseFloat(form.ceiling_wage) || null,
      active:          editing?.active ?? true,
      notes:           form.notes.trim() || null,
    };
    setRows((prev) => {
      const idx = prev.findIndex((r) => r.id === editing?.id);
      if (idx >= 0) { const c = [...prev]; c[idx] = updated; return c; }
      return [...prev, updated];
    });
    setDialogOpen(false);
  }

  return (
    <div>
      <div className="mb-4 flex justify-end">
        <Button onClick={openCreate} size="sm">
          <Plus className="mr-1 h-4 w-4" /> เพิ่มกองทุนใหม่
        </Button>
      </div>

      <div>
        <Table>
          <TableHeader>
            <TableRow className="bg-slate-50">
              <TableHead>ประเภท</TableHead>
              <TableHead>ชื่อกองทุน</TableHead>
              <TableHead className="w-36 text-right">อัตราพนักงาน (%)</TableHead>
              <TableHead className="w-36 text-right">อัตรานายจ้าง (%)</TableHead>
              <TableHead className="w-36 text-right">เพดานค่าจ้าง</TableHead>
              <TableHead className="w-28 text-center">สถานะ</TableHead>
              <TableHead className="w-12" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="py-10 text-center text-sm text-slate-400">
                  ไม่มีข้อมูลกองทุน
                </TableCell>
              </TableRow>
            ) : (
              rows.map((row) => (
                <TableRow key={row.id} className="hover:bg-slate-50">
                  <TableCell className="text-sm text-slate-600">{FUND_TYPE_LABELS[row.fund_type] ?? row.fund_type}</TableCell>
                  <TableCell className="text-sm font-medium text-slate-900">{row.name}</TableCell>
                  <TableCell className="text-right text-sm text-slate-700">{fmtRate(row.employee_rate)}</TableCell>
                  <TableCell className="text-right text-sm text-slate-700">{fmtRate(row.employer_rate)}</TableCell>
                  <TableCell className="text-right text-sm text-slate-600">
                    {row.ceiling_wage != null ? row.ceiling_wage.toLocaleString("th-TH") : "—"}
                  </TableCell>
                  <TableCell className="text-center">
                    <span className={cn(
                      "rounded-full px-2.5 py-0.5 text-xs font-medium",
                      row.active ? "bg-teal-50 text-teal-700" : "bg-slate-100 text-slate-500"
                    )}>
                      {row.active ? "ใช้งาน" : "ปิดใช้งาน"}
                    </span>
                  </TableCell>
                  <TableCell>
                    <ActionMenu onEdit={() => openEdit(row)} />
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={dialogOpen} onOpenChange={(v) => { if (!v) setDialogOpen(false); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? "แก้ไขกองทุน" : "เพิ่มกองทุนใหม่"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="space-y-1.5">
              <Label>ประเภทกองทุน</Label>
              <CustomSelect value={form.fund_type} onChange={(v) => set("fund_type", v)} options={fundTypeOptions} />
            </div>
            <div className="space-y-1.5">
              <Label>ชื่อกองทุน <span className="text-red-500">*</span></Label>
              <Input value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="เช่น ประกันสังคม" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>อัตราพนักงาน (%)</Label>
                <Input type="number" step="0.01" value={form.employee_rate} onChange={(e) => set("employee_rate", e.target.value)} placeholder="5.00" />
              </div>
              <div className="space-y-1.5">
                <Label>อัตรานายจ้าง (%)</Label>
                <Input type="number" step="0.01" value={form.employer_rate} onChange={(e) => set("employer_rate", e.target.value)} placeholder="5.00" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>เพดานค่าจ้าง (บาท)</Label>
              <Input type="number" value={form.ceiling_wage} onChange={(e) => set("ceiling_wage", e.target.value)} placeholder="15000" />
            </div>
            <div className="space-y-1.5">
              <Label>หมายเหตุ</Label>
              <Input value={form.notes} onChange={(e) => set("notes", e.target.value)} placeholder="(ถ้ามี)" />
            </div>
            {err && <p className="text-sm text-red-500">{err}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>ยกเลิก</Button>
            <Button onClick={handleSave} disabled={saving}>{saving ? "กำลังบันทึก..." : "บันทึก"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
