"use client";

import React, { useState, useTransition } from "react";
import { toast } from "react-hot-toast";
import { Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { CustomSelect } from "@/components/ui/custom-select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
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

  const deleteUnit = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm("ยืนยันการลบหน่วยนี้?")) return;
    startTransition(async () => {
      const res = await deleteProductUnitAction({ id });
      if (!res.ok) { toast.error(res.error); return; }
      toast.success("ลบหน่วยแล้ว");
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
              <TableHead className="w-[160px]">รหัส</TableHead>
              <TableHead>ชื่อหน่วย</TableHead>
              <TableHead className="w-[100px]">สถานะ</TableHead>
              <TableHead className="w-[100px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {units.map((u) => (
              <TableRow key={u.id} className="cursor-pointer hover:bg-slate-50" onClick={() => openEdit(u)}>
                <TableCell className="font-mono text-sm">{u.code}</TableCell>
                <TableCell className="text-sm text-slate-900">{u.name}</TableCell>
                <TableCell>
                  <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${u.active ? "bg-green-100 text-green-700" : "bg-slate-100 text-slate-500"}`}>
                    {u.active ? "ใช้งาน" : "ไม่ใช้งาน"}
                  </span>
                </TableCell>
                <TableCell>
                  <div className="flex justify-end gap-1">
                    <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); openEdit(u); }}>
                      แก้ไข
                    </Button>
                    <Button variant="ghost" size="sm" className="text-red-500 hover:text-red-700" onClick={(e) => deleteUnit(u.id, e)} disabled={pending}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {!units.length ? (
              <TableRow>
                <TableCell colSpan={4} className="py-10 text-center text-sm text-slate-500">
                  ยังไม่มีหน่วยนับ
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{edit.id ? "แก้ไขหน่วยนับ" : "เพิ่มหน่วยนับ"}</DialogTitle>
          </DialogHeader>
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
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="outline" onClick={() => setOpen(false)}>ยกเลิก</Button>
              <Button onClick={save} disabled={pending}>บันทึก</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
