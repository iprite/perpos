"use client";

import React, { useState } from "react";
import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogBody,
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
            <TableRow>
              <TableHead align="center">ลำดับ</TableHead>
              <TableHead>รหัส</TableHead>
              <TableHead>ชื่อแผนก</TableHead>
              <TableHead align="center">สถานะ</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="py-10 text-center text-sm text-slate-400">
                  ไม่มีข้อมูลแผนก
                </TableCell>
              </TableRow>
            ) : (
              rows.map((row, idx) => (
                <TableRow key={row.id} clickable onClick={() => openEdit(row)}>
                  <TableCell align="center" className="text-sm text-slate-500">{idx + 1}</TableCell>
                  <TableCell className="font-mono text-sm">{row.code ?? "—"}</TableCell>
                  <TableCell className="text-sm font-medium text-slate-900">{row.name}</TableCell>
                  <TableCell align="center">
                    <StatusBadge tone={row.active ? "success" : "neutral"}>{row.active ? "ใช้งาน" : "ปิดใช้งาน"}</StatusBadge>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={dialogOpen} onOpenChange={(v) => { if (!v) setDialogOpen(false); }}>
        <DialogContent size="sm">
          <DialogHeader>
            <DialogTitle>{editing ? "แก้ไขแผนก" : "เพิ่มแผนกใหม่"}</DialogTitle>
          </DialogHeader>
          <DialogBody>
          <div className="grid gap-4">
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
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>ยกเลิก</Button>
            <Button onClick={handleSave} disabled={saving}>{saving ? "กำลังบันทึก..." : "บันทึก"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
