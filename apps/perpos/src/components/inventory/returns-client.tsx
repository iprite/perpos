"use client";

import React, { useState, useTransition } from "react";
import { CustomSelect } from "@/components/ui/custom-select";
import { toast } from "react-hot-toast";
import { Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  listStockReturnsAction,
  createStockReturnAction,
  type ReturnRow,
} from "@/lib/inventory/actions";

type InventoryItemOption = { id: string; name: string; uom: string };

type ItemLine = {
  inventoryItemId: string;
  productName: string;
  qty: string;
  unit: string;
};

const EMPTY_LINE: ItemLine = { inventoryItemId: "", productName: "", qty: "1", unit: "EA" };

const STATUS_BADGE: Record<string, string> = {
  draft: "bg-slate-100 text-slate-600",
  completed: "bg-green-100 text-green-700",
  cancelled: "bg-red-100 text-red-600",
};

const STATUS_TH: Record<string, string> = {
  draft: "ร่าง",
  completed: "เสร็จสิ้น",
  cancelled: "ยกเลิก",
};

export function ReturnsClient(props: {
  organizationId: string;
  initialRows: ReturnRow[];
  inventoryItems: InventoryItemOption[];
}) {
  const [pending, startTransition] = useTransition();
  const [rows, setRows] = useState(props.initialRows);
  const [open, setOpen] = useState(false);

  const [docNumber, setDocNumber] = useState("");
  const [docDate, setDocDate] = useState(new Date().toISOString().slice(0, 10));
  const [requisitionId, setRequisitionId] = useState("");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<ItemLine[]>([{ ...EMPTY_LINE }]);

  const refresh = () => {
    startTransition(async () => {
      const res = await listStockReturnsAction({ organizationId: props.organizationId });
      if (!res.ok) { toast.error(res.error); return; }
      setRows(res.rows);
    });
  };

  const openNew = () => {
    setDocNumber("");
    setDocDate(new Date().toISOString().slice(0, 10));
    setRequisitionId("");
    setNotes("");
    setLines([{ ...EMPTY_LINE }]);
    setOpen(true);
  };

  const updateLine = (idx: number, patch: Partial<ItemLine>) => {
    setLines((prev) => prev.map((l, i) => i === idx ? { ...l, ...patch } : l));
  };

  const selectItem = (idx: number, itemId: string) => {
    const found = props.inventoryItems.find((x) => x.id === itemId);
    updateLine(idx, {
      inventoryItemId: itemId,
      productName: found?.name ?? "",
      unit: found?.uom ?? "EA",
    });
  };

  const addLine = () => setLines((prev) => [...prev, { ...EMPTY_LINE }]);
  const removeLine = (idx: number) => setLines((prev) => prev.filter((_, i) => i !== idx));

  const save = () => {
    if (!docNumber.trim()) { toast.error("กรุณากรอกเลขที่เอกสาร"); return; }
    if (!docDate) { toast.error("กรุณากรอกวันที่"); return; }
    const validLines = lines.filter((l) => l.productName.trim());
    if (!validLines.length) { toast.error("กรุณาเพิ่มรายการอย่างน้อย 1 รายการ"); return; }

    startTransition(async () => {
      const res = await createStockReturnAction({
        organizationId: props.organizationId,
        requisitionId: requisitionId.trim() || undefined,
        docNumber: docNumber.trim(),
        docDate,
        notes: notes.trim() || undefined,
        items: validLines.map((l) => ({
          inventoryItemId: l.inventoryItemId || undefined,
          productName: l.productName.trim(),
          qty: Number(l.qty || 1),
          unit: l.unit || "EA",
        })),
      });
      if (!res.ok) { toast.error(res.error); return; }
      toast.success("บันทึกใบส่งคืนแล้ว");
      setOpen(false);
      refresh();
    });
  };

  return (
    <div className="grid gap-4">
      <div className="flex items-center justify-end">
        <Button onClick={openNew} className="gap-2">
          <Plus className="h-4 w-4" />
          สร้างใบส่งคืน
        </Button>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[160px]">เลขที่</TableHead>
              <TableHead className="w-[120px]">วันที่</TableHead>
              <TableHead>อ้างอิงใบเบิก</TableHead>
              <TableHead>หมายเหตุ</TableHead>
              <TableHead className="w-[110px]">สถานะ</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="font-mono text-sm">{r.docNumber}</TableCell>
                <TableCell className="text-sm">{r.docDate}</TableCell>
                <TableCell className="font-mono text-xs text-slate-500">{r.requisitionId ? r.requisitionId.slice(0, 8) + "…" : "-"}</TableCell>
                <TableCell className="text-sm">{r.notes ?? "-"}</TableCell>
                <TableCell>
                  <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_BADGE[r.status] ?? "bg-slate-100 text-slate-600"}`}>
                    {STATUS_TH[r.status] ?? r.status}
                  </span>
                </TableCell>
              </TableRow>
            ))}
            {!rows.length ? (
              <TableRow>
                <TableCell colSpan={5} className="py-10 text-center text-sm text-slate-500">
                  ยังไม่มีใบส่งคืนสินค้า
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>สร้างใบส่งคืนสินค้า</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label>เลขที่เอกสาร</Label>
                <Input value={docNumber} onChange={(e) => setDocNumber(e.target.value)} placeholder="RET-001" />
              </div>
              <div className="grid gap-1.5">
                <Label>วันที่</Label>
                <Input type="date" value={docDate} onChange={(e) => setDocDate(e.target.value)} />
              </div>
            </div>
            <div className="grid gap-1.5">
              <Label>อ้างอิงใบเบิก (รหัส UUID ถ้ามี)</Label>
              <Input value={requisitionId} onChange={(e) => setRequisitionId(e.target.value)} placeholder="ไม่บังคับ" />
            </div>
            <div className="grid gap-1.5">
              <Label>หมายเหตุ</Label>
              <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="หมายเหตุ (ถ้ามี)" />
            </div>

            <div className="mt-2">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-sm font-medium text-slate-700">รายการสินค้า</span>
                <Button type="button" variant="outline" size="sm" onClick={addLine} className="gap-1">
                  <Plus className="h-3.5 w-3.5" />
                  เพิ่มรายการ
                </Button>
              </div>
              <div className="grid gap-2">
                {lines.map((line, idx) => (
                  <div key={idx} className="grid grid-cols-[1fr_80px_80px_32px] gap-2 rounded-lg border border-slate-100 p-2">
                    <div className="grid gap-1">
                      {props.inventoryItems.length > 0 && (
                        <CustomSelect
                          value={line.inventoryItemId}
                          onChange={(v) => selectItem(idx, v)}
                          options={[
                            { value: "", label: "เลือกสินค้า (หรือพิมพ์เอง)" },
                            ...props.inventoryItems.map((it) => ({ value: it.id, label: it.name })),
                          ]}
                        />
                      )}
                      <Input
                        className="h-8 text-xs"
                        placeholder="ชื่อสินค้า"
                        value={line.productName}
                        onChange={(e) => updateLine(idx, { productName: e.target.value })}
                      />
                    </div>
                    <div className="grid gap-1">
                      <span className="text-xs text-slate-500">จำนวน</span>
                      <Input
                        className="h-8 text-xs"
                        inputMode="decimal"
                        value={line.qty}
                        onChange={(e) => updateLine(idx, { qty: e.target.value })}
                      />
                    </div>
                    <div className="grid gap-1">
                      <span className="text-xs text-slate-500">หน่วย</span>
                      <Input
                        className="h-8 text-xs"
                        value={line.unit}
                        onChange={(e) => updateLine(idx, { unit: e.target.value })}
                      />
                    </div>
                    <div className="flex items-end">
                      <button
                        type="button"
                        className="flex h-8 w-8 items-center justify-center rounded text-slate-400 hover:text-red-500"
                        onClick={() => removeLine(idx)}
                        disabled={lines.length <= 1}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
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
