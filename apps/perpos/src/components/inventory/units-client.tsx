"use client";

import React, { useState, useTransition } from "react";
import { toast } from '@/lib/toast';
import { Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { CustomSelect } from "@/components/ui/custom-select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogBody, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StatusBadge } from "@/components/ui/badge";
import {
  listProductUnitsAction,
  upsertProductUnitAction,
  deleteProductUnitAction,
  type ProductUnitRow,
} from "@/lib/inventory/actions";

type EditState = {
  id?: string;
  code: string;
  name: string;
  active: boolean;
};

const EMPTY_EDIT: EditState = { code: "", name: "", active: true };

export function UnitsClient(props: { organizationId: string; initialUnits: ProductUnitRow[] }) {
  const [pending, startTransition] = useTransition();
  const [units, setUnits] = useState(props.initialUnits);
  const [open, setOpen] = useState(false);
  const [edit, setEdit] = useState<EditState>(EMPTY_EDIT);

  const refresh = () => {
    startTransition(async () => {
      const res = await listProductUnitsAction({ organizationId: props.organizationId });
      if (!res.ok) { toast.error(res.error); return; }
      setUnits(res.rows);
    });
  };

  const openNew = () => {
    setEdit(EMPTY_EDIT);
    setOpen(true);
  };

  const openEdit = (u: ProductUnitRow) => {
    setEdit({ id: u.id, code: u.code, name: u.name, active: u.active });
    setOpen(true);
  };

  const save = () => {
    if (!edit.code.trim() || !edit.name.trim()) {
      toast.error("กรุณากรอกรหัสและชื่อหน่วย");
      return;
    }
    startTransition(async () => {
      const res = await upsertProductUnitAction({
        organizationId: props.organizationId,
        id: edit.id,
        code: edit.code.trim(),
        name: edit.name.trim(),
        active: edit.active,
      });
      if (!res.ok) { toast.error(res.error); return; }
      toast.success("บันทึกหน่วยแล้ว");
      setOpen(false);
      refresh();
    });
  };

  return (
    <div className="grid gap-4">
      <div className="flex items-center justify-end">
        <Button onClick={openNew} className="gap-2">
          <Plus className="h-4 w-4" />
          เพิ่มหน่วย
        </Button>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>รหัส</TableHead>
              <TableHead>ชื่อหน่วย</TableHead>
              <TableHead>สถานะ</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {units.map((u) => (
              <TableRow key={u.id} clickable onClick={() => openEdit(u)}>
                <TableCell className="font-mono text-sm">{u.code}</TableCell>
                <TableCell className="text-sm text-slate-900">{u.name}</TableCell>
                <TableCell>
                  <StatusBadge tone={u.active ? "success" : "neutral"}>{u.active ? "ใช้งาน" : "ไม่ใช้งาน"}</StatusBadge>
                </TableCell>
              </TableRow>
            ))}
            {!units.length ? (
              <TableRow>
                <TableCell colSpan={3} className="py-10 text-center text-sm text-slate-500">
                  ยังไม่มีหน่วยนับ
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent size="sm">
          <DialogHeader>
            <DialogTitle>{edit.id ? "แก้ไขหน่วยนับ" : "เพิ่มหน่วยนับ"}</DialogTitle>
          </DialogHeader>
          <DialogBody>
          <div className="grid gap-3">
            <div className="grid gap-1.5">
              <Label>รหัสหน่วย</Label>
              <Input value={edit.code} onChange={(e) => setEdit((s) => ({ ...s, code: e.target.value }))} placeholder="เช่น EA, PCS, KG" />
            </div>
            <div className="grid gap-1.5">
              <Label>ชื่อหน่วย</Label>
              <Input value={edit.name} onChange={(e) => setEdit((s) => ({ ...s, name: e.target.value }))} placeholder="เช่น ชิ้น, กิโลกรัม" />
            </div>
            <div className="grid gap-1.5">
              <Label>สถานะ</Label>
              <CustomSelect
                value={edit.active ? "active" : "inactive"}
                onChange={(v) => setEdit((s) => ({ ...s, active: v === "active" }))}
                options={[
                  { value: "active",   label: "ใช้งาน" },
                  { value: "inactive", label: "ไม่ใช้งาน" },
                ]}
              />
            </div>
          </div>
          </DialogBody>
          <DialogFooter className="sm:justify-between">
            {edit.id ? (
              <Button variant="ghost" className="text-red-600 hover:bg-red-50 hover:text-red-700" disabled={pending}
                onClick={() => {
                  if (!edit.id || !confirm("ยืนยันการลบหน่วยนี้?")) return;
                  const id = edit.id;
                  startTransition(async () => {
                    const res = await deleteProductUnitAction({ id });
                    if (!res.ok) { toast.error(res.error); return; }
                    toast.success("ลบหน่วยแล้ว"); setOpen(false); refresh();
                  });
                }}>
                <Trash2 className="mr-1.5 h-4 w-4" /> ลบ
              </Button>
            ) : <span />}
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setOpen(false)}>ยกเลิก</Button>
              <Button onClick={save} disabled={pending}>บันทึก</Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
