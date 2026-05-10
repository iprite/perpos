"use client";

import React, { useState, useTransition } from "react";
import { toast } from "react-hot-toast";
import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { CustomSelect } from "@/components/ui/custom-select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  listInventoryItemsAction,
  upsertInventoryItemAction,
  type InventoryItemRow,
} from "@/lib/phase4/inventory/actions";

type EditState = {
  id?: string;
  sku: string;
  name: string;
  uom: string;
  unitCost: string;
  status: "active" | "inactive";
};

const EMPTY_EDIT: EditState = { sku: "", name: "", uom: "EA", unitCost: "0", status: "active" };

function fmt(n: number) {
  return n.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function ProductsClient(props: { organizationId: string; initialItems: InventoryItemRow[] }) {
  const [pending, startTransition] = useTransition();
  const [items, setItems] = useState(props.initialItems);
  const [open, setOpen] = useState(false);
  const [edit, setEdit] = useState<EditState>(EMPTY_EDIT);

  const refresh = () => {
    startTransition(async () => {
      const res = await listInventoryItemsAction({ organizationId: props.organizationId });
      if (!res.ok) { toast.error(res.error); return; }
      setItems(res.rows);
    });
  };

  const openNew = () => {
    setEdit(EMPTY_EDIT);
    setOpen(true);
  };

  const openEdit = (it: InventoryItemRow) => {
    setEdit({
      id: it.id,
      sku: it.sku,
      name: it.name,
      uom: it.uom,
      unitCost: String(it.unitCost),
      status: it.status === "inactive" ? "inactive" : "active",
    });
    setOpen(true);
  };

  const save = () => {
    if (!edit.sku.trim() || !edit.name.trim()) {
      toast.error("กรุณากรอก SKU และชื่อสินค้า");
      return;
    }
    startTransition(async () => {
      const res = await upsertInventoryItemAction({
        organizationId: props.organizationId,
        id: edit.id,
        sku: edit.sku.trim(),
        name: edit.name.trim(),
        uom: edit.uom || "EA",
        unitCost: Number(edit.unitCost || 0),
        status: edit.status,
      });
      if (!res.ok) { toast.error(res.error); return; }
      toast.success("บันทึกสินค้าแล้ว");
      setOpen(false);
      refresh();
    });
  };

  return (
    <div className="grid gap-4">
      <div className="flex items-center justify-end">
        <Button onClick={openNew} className="gap-2">
          <Plus className="h-4 w-4" />
          เพิ่มสินค้า/บริการ
        </Button>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[140px]">SKU</TableHead>
              <TableHead>ชื่อสินค้า/บริการ</TableHead>
              <TableHead className="w-[100px]">หน่วย</TableHead>
              <TableHead className="w-[140px] text-right">ราคาต้นทุน</TableHead>
              <TableHead className="w-[100px]">สถานะ</TableHead>
              <TableHead className="w-[80px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((it) => (
              <TableRow key={it.id} className="cursor-pointer hover:bg-slate-50" onClick={() => openEdit(it)}>
                <TableCell className="font-mono text-sm">{it.sku}</TableCell>
                <TableCell className="text-sm text-slate-900">{it.name}</TableCell>
                <TableCell className="text-sm">{it.uom}</TableCell>
                <TableCell className="text-right tabular-nums text-sm">{fmt(it.unitCost)}</TableCell>
                <TableCell>
                  <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${it.status === "active" ? "bg-green-100 text-green-700" : "bg-slate-100 text-slate-500"}`}>
                    {it.status === "active" ? "ใช้งาน" : "ไม่ใช้งาน"}
                  </span>
                </TableCell>
                <TableCell>
                  <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); openEdit(it); }}>
                    แก้ไข
                  </Button>
                </TableCell>
              </TableRow>
            ))}
            {!items.length ? (
              <TableRow>
                <TableCell colSpan={6} className="py-10 text-center text-sm text-slate-500">
                  ยังไม่มีสินค้า/บริการ
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{edit.id ? "แก้ไขสินค้า/บริการ" : "เพิ่มสินค้า/บริการ"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="grid gap-1.5">
              <Label>SKU</Label>
              <Input value={edit.sku} onChange={(e) => setEdit((s) => ({ ...s, sku: e.target.value }))} placeholder="เช่น PRD-001" />
            </div>
            <div className="grid gap-1.5">
              <Label>ชื่อสินค้า/บริการ</Label>
              <Input value={edit.name} onChange={(e) => setEdit((s) => ({ ...s, name: e.target.value }))} placeholder="ชื่อสินค้า" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label>หน่วย (UOM)</Label>
                <Input value={edit.uom} onChange={(e) => setEdit((s) => ({ ...s, uom: e.target.value }))} placeholder="EA" />
              </div>
              <div className="grid gap-1.5">
                <Label>ราคาต้นทุน</Label>
                <Input inputMode="decimal" value={edit.unitCost} onChange={(e) => setEdit((s) => ({ ...s, unitCost: e.target.value }))} />
              </div>
            </div>
            <div className="grid gap-1.5">
              <Label>สถานะ</Label>
              <CustomSelect
                value={edit.status}
                onChange={(v) => setEdit((s) => ({ ...s, status: v as "active" | "inactive" }))}
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
