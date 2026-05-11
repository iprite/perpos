"use client";

import React, { useState } from "react";
import cn from "@core/utils/class-names";
import { MoreVertical, PencilLine, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ThaiDatePicker } from "@/components/ui/thai-date-picker";
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

import { upsertEmployeeAction, type EmployeeRow, type DepartmentRow } from "@/lib/payroll/actions";

const STATUS_LABELS: Record<string, string> = {
  active:     "ทำงานอยู่",
  inactive:   "ไม่ใช้งาน",
  terminated: "พ้นสภาพ",
};

const STATUS_COLORS: Record<string, string> = {
  active:     "text-teal-700 bg-teal-50",
  inactive:   "text-slate-600 bg-slate-100",
  terminated: "text-red-600 bg-red-50",
};

type FormState = {
  employee_code: string;
  first_name: string;
  last_name: string;
  department_id: string;
  position: string;
  base_salary: string;
  tax_id: string;
  bank_name: string;
  bank_account: string;
  start_date: string;
  end_date: string;
  status: string;
};

const emptyForm: FormState = {
  employee_code: "",
  first_name: "",
  last_name: "",
  department_id: "",
  position: "",
  base_salary: "",
  tax_id: "",
  bank_name: "",
  bank_account: "",
  start_date: "",
  end_date: "",
  status: "active",
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

export function EmployeesClient({
  organizationId,
  initialRows,
  departments,
}: {
  organizationId: string;
  initialRows: EmployeeRow[];
  departments: DepartmentRow[];
}) {
  const [rows, setRows] = useState<EmployeeRow[]>(initialRows);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<EmployeeRow | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const deptOptions = [
    { value: "", label: "— ไม่ระบุ —" },
    ...departments.map((d) => ({ value: d.id, label: d.name })),
  ];

  const statusOptions = [
    { value: "active",     label: "ทำงานอยู่" },
    { value: "inactive",   label: "ไม่ใช้งาน" },
    { value: "terminated", label: "พ้นสภาพ" },
  ];

  function openCreate() {
    setEditing(null);
    setForm(emptyForm);
    setErr(null);
    setDialogOpen(true);
  }

  function openEdit(row: EmployeeRow) {
    setEditing(row);
    setForm({
      employee_code: row.employee_code,
      first_name:    row.first_name,
      last_name:     row.last_name,
      department_id: row.department_id ?? "",
      position:      row.position ?? "",
      base_salary:   String(row.base_salary),
      tax_id:        row.tax_id ?? "",
      bank_name:     row.bank_name ?? "",
      bank_account:  row.bank_account ?? "",
      start_date:    row.start_date ?? "",
      end_date:      row.end_date ?? "",
      status:        row.status,
    });
    setErr(null);
    setDialogOpen(true);
  }

  function set(key: keyof FormState, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSave() {
    if (!form.employee_code.trim() || !form.first_name.trim() || !form.last_name.trim()) {
      setErr("กรุณากรอกรหัส ชื่อ และนามสกุลพนักงาน");
      return;
    }
    setSaving(true);
    setErr(null);
    const res = await upsertEmployeeAction({
      organizationId,
      id:            editing?.id,
      employee_code: form.employee_code.trim(),
      first_name:    form.first_name.trim(),
      last_name:     form.last_name.trim(),
      department_id: form.department_id || null,
      position:      form.position.trim() || null,
      base_salary:   parseFloat(form.base_salary) || 0,
      tax_id:        form.tax_id.trim() || null,
      bank_name:     form.bank_name.trim() || null,
      bank_account:  form.bank_account.trim() || null,
      start_date:    form.start_date || null,
      end_date:      form.end_date || null,
      status:        form.status as EmployeeRow["status"],
    });
    setSaving(false);
    if (!res.ok) { setErr((res as any).error ?? "บันทึกไม่สำเร็จ"); return; }

    const dept = departments.find((d) => d.id === form.department_id);
    const updated: EmployeeRow = {
      id:              editing?.id ?? String(Date.now()),
      organization_id: organizationId,
      employee_code:   form.employee_code.trim(),
      first_name:      form.first_name.trim(),
      last_name:       form.last_name.trim(),
      department_id:   form.department_id || null,
      department_name: dept?.name ?? null,
      position:        form.position.trim() || null,
      base_salary:     parseFloat(form.base_salary) || 0,
      tax_id:          form.tax_id.trim() || null,
      bank_name:       form.bank_name.trim() || null,
      bank_account:    form.bank_account.trim() || null,
      start_date:      form.start_date || null,
      end_date:        form.end_date || null,
      status:          form.status as EmployeeRow["status"],
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
          <Plus className="mr-1 h-4 w-4" /> เพิ่มพนักงานใหม่
        </Button>
      </div>

      <div>
        <Table>
          <TableHeader>
            <TableRow className="bg-slate-50">
              <TableHead>รหัส</TableHead>
              <TableHead>ชื่อ-นามสกุล</TableHead>
              <TableHead>แผนก</TableHead>
              <TableHead>ตำแหน่ง</TableHead>
              <TableHead className="text-right">เงินเดือนพื้นฐาน</TableHead>
              <TableHead className="w-28 text-center">สถานะ</TableHead>
              <TableHead className="w-12" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="py-10 text-center text-sm text-slate-400">
                  ไม่มีข้อมูลพนักงาน
                </TableCell>
              </TableRow>
            ) : (
              rows.map((row) => (
                <TableRow key={row.id} className="hover:bg-slate-50">
                  <TableCell className="font-mono text-sm">{row.employee_code}</TableCell>
                  <TableCell className="text-sm font-medium text-slate-900">
                    {row.first_name} {row.last_name}
                  </TableCell>
                  <TableCell className="text-sm text-slate-600">{row.department_name ?? "—"}</TableCell>
                  <TableCell className="text-sm text-slate-600">{row.position ?? "—"}</TableCell>
                  <TableCell className="text-right text-sm text-slate-700">
                    {row.base_salary.toLocaleString("th-TH", { minimumFractionDigits: 2 })}
                  </TableCell>
                  <TableCell className="text-center">
                    <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-medium", STATUS_COLORS[row.status] ?? "bg-slate-100 text-slate-600")}>
                      {STATUS_LABELS[row.status] ?? row.status}
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

      {/* Dialog */}
      <Dialog open={dialogOpen} onOpenChange={(v) => { if (!v) setDialogOpen(false); }}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>{editing ? "แก้ไขข้อมูลพนักงาน" : "เพิ่มพนักงานใหม่"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label>รหัสพนักงาน <span className="text-red-500">*</span></Label>
                <Input value={form.employee_code} onChange={(e) => set("employee_code", e.target.value)} placeholder="EMP001" />
              </div>
              <div className="space-y-1.5">
                <Label>ชื่อ <span className="text-red-500">*</span></Label>
                <Input value={form.first_name} onChange={(e) => set("first_name", e.target.value)} placeholder="สมชาย" />
              </div>
              <div className="space-y-1.5">
                <Label>นามสกุล <span className="text-red-500">*</span></Label>
                <Input value={form.last_name} onChange={(e) => set("last_name", e.target.value)} placeholder="ใจดี" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>แผนก</Label>
                <CustomSelect value={form.department_id} onChange={(v) => set("department_id", v)} options={deptOptions} placeholder="— ไม่ระบุ —" />
              </div>
              <div className="space-y-1.5">
                <Label>ตำแหน่ง</Label>
                <Input value={form.position} onChange={(e) => set("position", e.target.value)} placeholder="ตำแหน่งงาน" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>เงินเดือนพื้นฐาน (บาท)</Label>
                <Input type="number" value={form.base_salary} onChange={(e) => set("base_salary", e.target.value)} placeholder="0.00" />
              </div>
              <div className="space-y-1.5">
                <Label>สถานะ</Label>
                <CustomSelect value={form.status} onChange={(v) => set("status", v)} options={statusOptions} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>เลขที่บัตรประชาชน / Tax ID</Label>
                <Input value={form.tax_id} onChange={(e) => set("tax_id", e.target.value)} placeholder="1234567890123" />
              </div>
              <div className="space-y-1.5">
                <Label>ธนาคาร</Label>
                <Input value={form.bank_name} onChange={(e) => set("bank_name", e.target.value)} placeholder="กสิกรไทย" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>เลขบัญชีธนาคาร</Label>
                <Input value={form.bank_account} onChange={(e) => set("bank_account", e.target.value)} placeholder="xxx-x-xxxxx-x" />
              </div>
              <div className="space-y-1.5">
                <Label>วันที่เริ่มงาน</Label>
                <ThaiDatePicker value={form.start_date} onChange={(v) => set("start_date", v)} />
              </div>
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
