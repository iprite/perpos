"use client";

/**
 * _receive-dialog.tsx — รับของเข้าคลังตามใบขอซื้อ
 * ⛔ ปริมาณคงเหลือ/สถานะใบ คิดที่ server (`receivePurchaseRequest`) — ที่นี่แค่กรอกจำนวนที่ได้รับรอบนี้
 */

import { useEffect, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CustomSelect } from "@/components/ui/custom-select";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableEmpty,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Text } from "@/components/ui/typography";
import { notify } from "@/lib/toast";
import type { JustMePrItem } from "@/lib/just-me/types";
import { jmSend } from "../../_components/api-client";
import { qtyText } from "../../_components/format";
import type { PrOption } from "./_types";

export function ReceiveDialog({
  open,
  onOpenChange,
  orgId,
  prId,
  items,
  warehouseOptions,
  defaultWarehouseId,
  onEditLines,
  onDone,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  orgId: string;
  prId: string;
  items: JustMePrItem[];
  warehouseOptions: PrOption[];
  defaultWarehouseId: string | null;
  /** พาไปกล่อง "แก้รายการ" เพื่อผูกวัสดุในคลังให้บรรทัดที่ยังไม่ผูก (null = ใบนี้แก้รายการไม่ได้แล้ว) */
  onEditLines: (() => void) | null;
  onDone: () => void;
}) {
  const [warehouseId, setWarehouseId] = useState(defaultWarehouseId ?? "");
  const [qty, setQty] = useState<Record<string, string>>({});
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setWarehouseId(defaultWarehouseId ?? warehouseOptions[0]?.value ?? "");
    const next: Record<string, string> = {};
    for (const it of items) {
      const remaining = (it.qty ?? 0) - (it.received_qty ?? 0);
      next[it.id] = remaining > 0 ? String(remaining) : "";
    }
    setQty(next);
    setNote("");
  }, [open, items, defaultWarehouseId, warehouseOptions]);

  const unlinkedCount = items.filter((it) => !it.item_id).length;
  const receivable = items.some((it) => Number(qty[it.id]) > 0 && it.item_id);

  async function submit() {
    const lines = items
      .filter((it) => Number(qty[it.id]) > 0)
      .map((it) => ({ pr_item_id: it.id, qty: Number(qty[it.id]) }));
    if (lines.length === 0) {
      notify.error("ยังไม่ได้ระบุจำนวนที่รับของ");
      return;
    }
    setSaving(true);
    try {
      const res = await jmSend<{ status_changed_to: string | null }>(
        orgId,
        `purchase-requests/${prId}/receive`,
        "POST",
        { warehouse_id: warehouseId || null, lines, note: note.trim() || null },
      );
      notify.success(
        res.status_changed_to === "received" ? "รับของครบตามใบขอซื้อแล้ว" : "บันทึกการรับของแล้ว",
      );
      onOpenChange(false);
      onDone();
    } catch (e) {
      notify.error(e, "รับของไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="2xl">
        <DialogHeader>
          <DialogTitle>รับของเข้าคลัง</DialogTitle>
        </DialogHeader>
        <DialogBody>
          <div className="space-y-4">
            <div>
              <Label>คลังปลายทาง *</Label>
              <div className="mt-1">
                <CustomSelect
                  value={warehouseId}
                  onChange={setWarehouseId}
                  options={[{ value: "", label: "— เลือกคลัง —" }, ...warehouseOptions]}
                />
              </div>
              <p className="mt-1 text-xs text-gray-500">
                ต้นทุนเฉลี่ยของวัสดุระบบคิดให้เองจากราคาที่เลือกไว้ในใบขอซื้อ
              </p>
            </div>

            {/* ผลของการกดบันทึกเกิดทันทีและย้อนไม่ได้ → บอกก่อนกด */}
            <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
              <Text className="text-sm text-amber-800">
                กดบันทึกแล้ว <span className="font-medium">สต๊อกในคลังเพิ่มขึ้นทันที</span> และ{" "}
                <span className="font-medium">ต้นทุนเฉลี่ยของวัสดุถูกคำนวณใหม่</span> —
                รายการเคลื่อนไหวย้อนหลังแก้ไม่ได้ ถ้ารับผิดต้องลงรายการปรับที่หน้าคลังแทน
              </Text>
            </div>

            {unlinkedCount > 0 && (
              <div className="flex flex-wrap items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3">
                <Text className="text-sm text-amber-800">
                  มี {unlinkedCount.toLocaleString("th-TH")} รายการที่ยังไม่ได้ผูกกับวัสดุในคลัง
                  จึงรับของรายการนั้นไม่ได้ —{" "}
                  {onEditLines
                    ? "ผูกวัสดุที่ “แก้รายการ” ก่อน"
                    : "ใบที่อนุมัติแล้วแก้รายการไม่ได้ ต้องรับของรายการที่เหลือแล้วเปิดใบใหม่สำหรับรายการนี้"}
                </Text>
                {onEditLines && (
                  <Button size="sm" variant="outline" className="ms-auto" onClick={onEditLines}>
                    ไปผูกวัสดุ
                  </Button>
                )}
              </div>
            )}

            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>รายการ</TableHead>
                  <TableHead align="right">สั่งไว้</TableHead>
                  <TableHead align="right">รับแล้ว</TableHead>
                  <TableHead align="right">รับรอบนี้</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.length === 0 ? (
                  <TableEmpty colSpan={4}>ใบขอซื้อนี้ยังไม่มีรายการ</TableEmpty>
                ) : (
                  items.map((it) => {
                    const remaining = (it.qty ?? 0) - (it.received_qty ?? 0);
                    return (
                      <TableRow key={it.id}>
                        <TableCell wrap>
                          {it.name}
                          {!it.item_id && (
                            <span className="ms-1 text-xs text-amber-700">
                              (ยังไม่ผูกวัสดุในคลัง — รับของไม่ได้)
                            </span>
                          )}
                        </TableCell>
                        <TableCell align="right" className="tabular-nums">
                          {qtyText(it.qty)} {it.unit}
                        </TableCell>
                        <TableCell align="right" className="tabular-nums">
                          {qtyText(it.received_qty)}
                        </TableCell>
                        <TableCell align="right">
                          <Input
                            className="w-28 text-right"
                            inputMode="decimal"
                            value={qty[it.id] ?? ""}
                            disabled={remaining <= 0 || !it.item_id}
                            onChange={(e) =>
                              setQty((prev) => ({ ...prev, [it.id]: e.target.value }))
                            }
                          />
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>

            <div>
              <Label htmlFor="jm-receive-note">หมายเหตุการรับของ</Label>
              <Input
                id="jm-receive-note"
                className="mt-1"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="เช่น เลขที่ใบส่งของของผู้ขาย"
              />
            </div>
          </div>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            ยกเลิก
          </Button>
          <Button
            onClick={submit}
            disabled={saving || !warehouseId || !receivable}
            title={
              !warehouseId
                ? "เลือกคลังปลายทางก่อน"
                : !receivable
                  ? "ยังไม่ได้ระบุจำนวนที่รับของ"
                  : undefined
            }
          >
            {saving ? "กำลังบันทึก…" : "บันทึกการรับของ"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
