"use client";

import React, { useMemo, useState, useTransition } from "react";
import { toast } from "react-hot-toast";
import { Plus, RefreshCw } from "lucide-react";

import cn from "@core/utils/class-names";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  issueInventoryFifoAction,
  listInventoryLayersAction,
  listInventoryItemsAction,
  receiveInventoryAction,
  upsertInventoryItemAction,
  type InventoryItemRow,
} from "@/lib/phase4/inventory/actions";

function fmt(n: number) {
  return n.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function InventoryClient(props: { organizationId: string; initialItems: InventoryItemRow[] }) {
  const [pending, startTransition] = useTransition();
  const [items, setItems] = useState(props.initialItems);
  const [tab, setTab] = useState<"items" | "movements" | "layers">("items");

  const [editOpen, setEditOpen] = useState(false);
  const [edit, setEdit] = useState<{ id?: string; sku: string; name: string; uom: string; unitCost: string; status: "active" | "inactive" }>(
    { sku: "", name: "", uom: "EA", unitCost: "0", status: "active" },
  );

  const [moveOpen, setMoveOpen] = useState(false);
  const [move, setMove] = useState<{ itemId: string; type: "in" | "out"; qty: string; unitCost: string }>({
    itemId: "",
    type: "in",
    qty: "1",
    unitCost: "0",
  });

  const [layersOpen, setLayersOpen] = useState(false);
  const [layersTitle, setLayersTitle] = useState("FIFO Layers");
  const [layers, setLayers] = useState<any[]>([]);

  const refresh = () => {
    startTransition(async () => {
      const res = await listInventoryItemsAction({ organizationId: props.organizationId });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      setItems(res.rows);
    });
  };

  const itemsById = useMemo(() => new Map(items.map((x) => [x.id, x])), [items]);

  const saveItem = () => {
    if (!edit.sku.trim() || !edit.name.trim()) {
      toast.error("กรุณากรอก SKU และชื่อสินค้า");
      return;
    }
    const unitCost = Number(edit.unitCost || 0);
    startTransition(async () => {
      const res = await upsertInventoryItemAction({
        organizationId: props.organizationId,
        id: edit.id,
        sku: edit.sku.trim(),
        name: edit.name.trim(),
        uom: edit.uom || "EA",
        unitCost,
        status: edit.status,
      });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("บันทึกสินค้าแล้ว");
      setEditOpen(false);
      refresh();
    });
  };

  const submitMovement = () => {
    const qty = Number(move.qty || 0);
    const unitCost = Number(move.unitCost || 0);
    if (!move.itemId) {
      toast.error("กรุณาเลือกสินค้า");
      return;
    }
    if (!Number.isFinite(qty) || qty <= 0) {
      toast.error("จำนวนต้องมากกว่า 0");
      return;
    }
    if (move.type === "in" && (!Number.isFinite(unitCost) || unitCost <= 0)) {
      toast.error("ต้นทุนต้องมากกว่า 0");
      return;
    }
    startTransition(async () => {
      if (move.type === "in") {
        const res = await receiveInventoryAction({ organizationId: props.organizationId, itemId: move.itemId, qty, unitCost });
        if (!res.ok) {
          toast.error(res.error);
          return;
        }
        toast.success("รับเข้าแล้ว");
      } else {
        const res = await issueInventoryFifoAction({ organizationId: props.organizationId, itemId: move.itemId, qty });
        if (!res.ok) {
          toast.error(res.error);
          return;
        }
        toast.success(`จ่ายออกแล้ว (COGS ${fmt(res.cogs)})`);
      }
      setMoveOpen(false);
      refresh();
    });
  };

  const openLayers = (itemId: string) => {
    const it = itemsById.get(itemId);
    setLayersTitle(it ? `${it.sku} ${it.name}` : "FIFO Layers");
    setLayers([]);
    setLayersOpen(true);
    startTransition(async () => {
      const res = await listInventoryLayersAction({ organizationId: props.organizationId, itemId });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      setLayers(res.rows as any[]);
    });
  };

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            className={cn("rounded-md px-3 py-1.5 text-sm", tab === "items" ? "bg-slate-900 text-white" : "bg-slate-100 hover:bg-slate-200")}
            onClick={() => setTab("items")}
          >
            สินค้า
          </button>
          <button
            type="button"
            className={cn("rounded-md px-3 py-1.5 text-sm", tab === "layers" ? "bg-slate-900 text-white" : "bg-slate-100 hover:bg-slate-200")}
            onClick={() => setTab("layers")}
          >
            FIFO Layers
          </button>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" className="gap-2" onClick={refresh} disabled={pending}>
            <RefreshCw className={cn("h-4 w-4", pending ? "animate-spin" : undefined)} />
            Refresh
          </Button>
          <Button variant="outline" className="gap-2" onClick={() => setMoveOpen(true)}>
            เคลื่อนไหวสต๊อก
          </Button>
          <Button className="gap-2" onClick={() => { setEdit({ sku: "", name: "", uom: "EA", unitCost: "0", status: "active" }); setEditOpen(true); }}>
            <Plus className="h-4 w-4" />
            เพิ่มสินค้า
          </Button>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[140px]">SKU</TableHead>
              <TableHead>ชื่อ</TableHead>
              <TableHead className="w-[110px]">หน่วย</TableHead>
              <TableHead className="w-[140px] text-right">คงเหลือ</TableHead>
              <TableHead className="w-[140px] text-right">ต้นทุนล่าสุด</TableHead>
              <TableHead className="w-[120px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((it) => (
              <TableRow key={it.id}>
                <TableCell className="font-mono text-sm">{it.sku}</TableCell>
                <TableCell className="text-sm text-slate-900">{it.name}</TableCell>
                <TableCell>{it.uom}</TableCell>
                <TableCell className="text-right tabular-nums">{fmt(it.currentStock)}</TableCell>
                <TableCell className="text-right tabular-nums">{fmt(it.unitCost)}</TableCell>
                <TableCell>
                  <div className="flex justify-end gap-2">
                    <Button variant="outline" size="sm" onClick={() => openLayers(it.id)}>
                      Layers
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setEdit({ id: it.id, sku: it.sku, name: it.name, uom: it.uom, unitCost: String(it.unitCost), status: it.status === "inactive" ? "inactive" : "active" });
                        setEditOpen(true);
                      }}
                    >
                      แก้ไข
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {!items.length ? (
              <TableRow>
                <TableCell colSpan={6} className="py-10 text-center text-sm text-slate-600">
                  ยังไม่มีสินค้า
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
      </div>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{edit.id ? "แก้ไขสินค้า" : "เพิ่มสินค้า"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="grid gap-2">
              <Label>SKU</Label>
              <Input value={edit.sku} onChange={(e) => setEdit((s) => ({ ...s, sku: e.target.value }))} />
            </div>
            <div className="grid gap-2">
              <Label>ชื่อ</Label>
              <Input value={edit.name} onChange={(e) => setEdit((s) => ({ ...s, name: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="grid gap-2">
                <Label>หน่วย</Label>
                <Input value={edit.uom} onChange={(e) => setEdit((s) => ({ ...s, uom: e.target.value }))} />
              </div>
              <div className="grid gap-2">
                <Label>ต้นทุนเริ่มต้น/ล่าสุด</Label>
                <Input inputMode="decimal" value={edit.unitCost} onChange={(e) => setEdit((s) => ({ ...s, unitCost: e.target.value }))} />
              </div>
            </div>
            <div className="grid gap-2">
              <Label>สถานะ</Label>
              <select className="h-9 rounded-md border border-slate-200 bg-white px-3 text-sm" value={edit.status} onChange={(e) => setEdit((s) => ({ ...s, status: e.target.value as any }))}>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </div>
            <div className="flex justify-end">
              <Button onClick={saveItem} disabled={pending}>บันทึก</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={moveOpen} onOpenChange={setMoveOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>เคลื่อนไหวสต๊อก</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="grid gap-2">
              <Label>สินค้า</Label>
              <select className="h-9 rounded-md border border-slate-200 bg-white px-3 text-sm" value={move.itemId} onChange={(e) => setMove((s) => ({ ...s, itemId: e.target.value }))}>
                <option value="">เลือกสินค้า</option>
                {items.map((it) => (
                  <option key={it.id} value={it.id}>
                    {it.sku} {it.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="grid gap-2">
                <Label>ประเภท</Label>
                <select className="h-9 rounded-md border border-slate-200 bg-white px-3 text-sm" value={move.type} onChange={(e) => setMove((s) => ({ ...s, type: e.target.value as any }))}>
                  <option value="in">รับเข้า</option>
                  <option value="out">จ่ายออก</option>
                </select>
              </div>
              <div className="grid gap-2">
                <Label>จำนวน</Label>
                <Input inputMode="decimal" value={move.qty} onChange={(e) => setMove((s) => ({ ...s, qty: e.target.value }))} />
              </div>
            </div>
            {move.type === "in" ? (
              <div className="grid gap-2">
                <Label>ต้นทุน/หน่วย</Label>
                <Input inputMode="decimal" value={move.unitCost} onChange={(e) => setMove((s) => ({ ...s, unitCost: e.target.value }))} />
              </div>
            ) : null}
            <div className="flex justify-end">
              <Button onClick={submitMovement} disabled={pending}>บันทึก</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={layersOpen} onOpenChange={setLayersOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>FIFO Layers: {layersTitle}</DialogTitle>
          </DialogHeader>
          <div className="rounded-lg border border-slate-200">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[140px]">รับเข้า</TableHead>
                  <TableHead className="text-right w-[140px]">คงเหลือ</TableHead>
                  <TableHead className="text-right w-[140px]">ต้นทุน/หน่วย</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {layers.map((l: any) => (
                  <TableRow key={String(l.id)}>
                    <TableCell>{String(l.received_at).slice(0, 10)}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmt(Number(l.qty_remaining ?? 0))}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmt(Number(l.unit_cost ?? 0))}</TableCell>
                  </TableRow>
                ))}
                {!layers.length ? (
                  <TableRow>
                    <TableCell colSpan={3} className="py-10 text-center text-sm text-slate-600">
                      ไม่มี layers
                    </TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

