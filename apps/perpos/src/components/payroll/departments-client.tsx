"use client";

import React, { useState } from "react";
import cn from "@core/utils/class-names";
import { MoreVertical, PencilLine, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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

import { upsertDepartmentAction, type DepartmentRow } from "@/lib/payroll/actions";

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

export function DepartmentsClient({
  organizationId,
  initialRows,
}: {
  organizationId: string;
  initialRows: DepartmentRow[];
}) {
  const [rows, setRows] = useState<DepartmentRow[]>(initialRows);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<DepartmentRow | null>(null);
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  function openCreate() {
    setEditing(null);
    setCode("");
    setName("");
    setErr(null);
    setDialogOpen(true);
  }

  function openEdit(row: DepartmentRow) {
    setEditing(row);
    setCode(row.code ?? "");
    setName(row.name);
    setErr(null);
    setDialogOpen(true);
  }

  async function handleSave() {
    if (!name.trim()) { setErr("กรุณากรอกชื่อแผนก"); return; }
    setSaving(true);
    setErr(null);
    const res = await upsertDepartmentAction({
      organizationId,
      id:   editing?.id,
      code: code.trim() || undefined,
      name: name.trim(),
    });
    setSaving(false);
    if (!res.ok) { setErr((res as any).error ?? "บันทึกไม่สำเร็จ"); return; }

    const updated: DepartmentRow = {
      id:              editing?.id ?? String(Date.now()),
      organization_id: organizationId,
      code:            code.trim() || null,
      name:            name.trim(),
      active:          editing?.active ?? true,
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
          <Plus className="mr-1 h-4 w-4" /> เพิ่มแผนกใหม่
        </Button>
      </div>

      <div>
        <Table>
          <TableHeader>
            <TableRow className="bg-slate-50">
              <TableHead className="w-14 text-center">ลำดับ</TableHead>
              <TableHead className="w-32">รหัส</TableHead>
              <TableHead>ชื่อแผนก</TableHead>
              <TableHead className="w-28 text-center">สถานะ</TableHead>
              <TableHead className="w-12" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="py-10 text-center text-sm text-slate-400">
                  ไม่มีข้อมูลแผนก
                </TableCell>
              </TableRow>
            ) : (
              rows.map((row, idx) => (
                <TableRow key={row.id} className="hover:bg-slate-50">
                  <TableCell className="text-center text-sm text-slate-500">{idx + 1}</TableCell>
                  <TableCell className="font-mono text-sm">{row.code ?? "—"}</TableCell>
                  <TableCell className="text-sm font-medium text-slate-900">{row.name}</TableCell>
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
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{editing ? "แก้ไขแผนก" : "เพิ่มแผนกใหม่"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="space-y-1.5">
              <Label>รหัสแผนก</Label>
              <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="เช่น ACC" />
            </div>
            <div className="space-y-1.5">
              <Label>ชื่อแผนก <span className="text-red-500">*</span></Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="เช่น บัญชี" />
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
