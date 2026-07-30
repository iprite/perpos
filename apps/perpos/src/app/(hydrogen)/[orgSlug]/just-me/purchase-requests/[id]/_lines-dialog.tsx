"use client";

/**
 * _lines-dialog.tsx — แก้บรรทัดของใบขอซื้อ (ทั้งชุด) + หยิบรายการจาก BOQ
 * ⛔ ด่าน "สั่งเกิน BOQ" อยู่ที่ API (`lib/just-me/purchasing.ts`) — ที่นี่แค่ช่วยเตือนล่วงหน้า
 *    และเปิดช่องให้เจ้าของกรอกเหตุผลเมื่อจำเป็นต้องสั่งเกินจริง
 */

import { useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
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
import type { BoqPickRow, PrOption } from "./_types";

interface LineDraft {
  key: string;
  boq_item_id: string | null;
  item_id: string | null;
  name: string;
  unit: string;
  qty: string;
  estimated_unit_cost: string;
}

let seq = 0;
const nextKey = () => `line-${++seq}`;

function toDraft(item: JustMePrItem): LineDraft {
  return {
    key: item.id,
    boq_item_id: item.boq_item_id,
    item_id: item.item_id,
    name: item.name,
    unit: item.unit,
    qty: String(item.qty ?? ""),
    estimated_unit_cost: item.estimated_unit_cost === null ? "" : String(item.estimated_unit_cost),
  };
}

export function LinesDialog({
  open,
  onOpenChange,
  orgId,
  prId,
  isOwner,
  items,
  boqPicks,
  inventoryOptions,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  orgId: string;
  prId: string;
  isOwner: boolean;
  items: JustMePrItem[];
  boqPicks: BoqPickRow[];
  inventoryOptions: PrOption[];
  onSaved: () => void;
}) {
  const [lines, setLines] = useState<LineDraft[]>(() => items.map(toDraft));
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setLines(items.map(toDraft));
      setReason("");
    }
  }, [open, items]);

  const usedBoqIds = new Set(lines.map((l) => l.boq_item_id).filter(Boolean));
  const picks = boqPicks.filter((b) => !usedBoqIds.has(b.boq_item_id));

  function addBlank() {
    setLines((prev) => [
      ...prev,
      {
        key: nextKey(),
        boq_item_id: null,
        item_id: null,
        name: "",
        unit: "",
        qty: "",
        estimated_unit_cost: "",
      },
    ]);
  }

  function addFromBoq(pick: BoqPickRow) {
    setLines((prev) => [
      ...prev,
      {
        key: nextKey(),
        boq_item_id: pick.boq_item_id,
        item_id: pick.item_id,
        name: pick.name,
        unit: pick.unit,
        qty: String(pick.remaining_qty > 0 ? pick.remaining_qty : pick.qty),
        estimated_unit_cost:
          pick.material_unit_cost === null ? "" : String(pick.material_unit_cost),
      },
    ]);
  }

  function update(key: string, patch: Partial<LineDraft>) {
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  }

  async function save() {
    setSaving(true);
    try {
      await jmSend(orgId, `purchase-requests/${prId}`, "PATCH", {
        items: lines.map((l, i) => ({
          boq_item_id: l.boq_item_id,
          item_id: l.item_id,
          name: l.name,
          unit: l.unit,
          qty: l.qty,
          estimated_unit_cost: l.estimated_unit_cost,
          sort_order: i,
        })),
        over_budget_reason: reason.trim() || null,
      });
      notify.updated("บันทึกรายการที่ขอซื้อแล้ว");
      onOpenChange(false);
      onSaved();
    } catch (e) {
      notify.error(e, "บันทึกรายการไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="3xl">
        <DialogHeader>
          <DialogTitle>รายการที่ขอซื้อ</DialogTitle>
        </DialogHeader>
        <DialogBody>
          <div className="space-y-4">
            {picks.length > 0 && (
              <div>
                <Label>หยิบจาก BOQ ที่อนุมัติแล้ว</Label>
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  <CustomSelect
                    value=""
                    onChange={(v) => {
                      const pick = picks.find((p) => p.boq_item_id === v);
                      if (pick) addFromBoq(pick);
                    }}
                    className="w-full sm:w-[28rem]"
                    options={[
                      { value: "", label: `— เลือกบรรทัด BOQ (เหลือ ${picks.length} บรรทัด) —` },
                      ...picks.map((p) => ({
                        value: p.boq_item_id,
                        label: `${p.name} · เหลือ ${qtyText(p.remaining_qty)} ${p.unit}`,
                      })),
                    ]}
                  />
                </div>
                <p className="mt-1 text-xs text-gray-500">
                  เลือกแล้วระบบเติมเป็นบรรทัดใหม่ในตารางด้านล่างพร้อมผูกกับ BOQ ให้ (ผูกไว้ =
                  ระบบกันสั่งเกินปริมาณที่ถอดไว้ได้) — เลือกได้ครบทุกบรรทัด ไม่ตัดจำนวน
                </p>
              </div>
            )}

            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>รายการ</TableHead>
                  <TableHead>วัสดุในคลัง</TableHead>
                  <TableHead>หน่วย</TableHead>
                  <TableHead align="right">จำนวน</TableHead>
                  <TableHead align="right">ราคาประเมิน/หน่วย</TableHead>
                  <TableHead align="center">ลบ</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {lines.length === 0 ? (
                  <TableEmpty colSpan={6}>ยังไม่มีรายการ — หยิบจาก BOQ หรือเพิ่มเอง</TableEmpty>
                ) : (
                  lines.map((l) => (
                    <TableRow key={l.key}>
                      <TableCell wrap>
                        <Input
                          value={l.name}
                          onChange={(e) => update(l.key, { name: e.target.value })}
                          placeholder="ชื่อรายการ"
                        />
                        {l.boq_item_id && (
                          <Text className="mt-1 text-xs text-gray-400">ผูกกับบรรทัด BOQ</Text>
                        )}
                      </TableCell>
                      <TableCell wrap>
                        <CustomSelect
                          value={l.item_id ?? ""}
                          onChange={(v) => update(l.key, { item_id: v || null })}
                          options={[{ value: "", label: "— ไม่ผูกคลัง —" }, ...inventoryOptions]}
                          className="w-52"
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          className="w-24"
                          value={l.unit}
                          onChange={(e) => update(l.key, { unit: e.target.value })}
                        />
                      </TableCell>
                      <TableCell align="right">
                        <Input
                          className="w-24 text-right"
                          inputMode="decimal"
                          value={l.qty}
                          onChange={(e) => update(l.key, { qty: e.target.value })}
                        />
                      </TableCell>
                      <TableCell align="right">
                        <Input
                          className="w-28 text-right"
                          inputMode="decimal"
                          value={l.estimated_unit_cost}
                          onChange={(e) => update(l.key, { estimated_unit_cost: e.target.value })}
                        />
                      </TableCell>
                      <TableCell align="center">
                        <Button
                          size="icon"
                          variant="ghost"
                          title="ลบรายการนี้"
                          onClick={() => setLines((prev) => prev.filter((x) => x.key !== l.key))}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>

            <Button size="sm" variant="outline" onClick={addBlank}>
              <Plus className="h-4 w-4" /> เพิ่มรายการเอง
            </Button>

            {isOwner && (
              <div>
                <Label htmlFor="jm-pr-over-reason">เหตุผลที่ต้องสั่งเกินปริมาณใน BOQ</Label>
                <Input
                  id="jm-pr-over-reason"
                  className="mt-1"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="กรอกเฉพาะกรณีจำเป็น เช่น เผื่อของเสียหน้างาน 5%"
                />
                <p className="mt-1 text-xs text-gray-500">
                  ถ้ายอดสะสมไม่เกิน BOQ ระบบจะไม่ใช้ช่องนี้ (บันทึกไว้เฉพาะเมื่อเกินจริง)
                </p>
              </div>
            )}
          </div>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            ยกเลิก
          </Button>
          <Button onClick={save} disabled={saving}>
            {saving ? "กำลังบันทึก…" : "บันทึกรายการ"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
