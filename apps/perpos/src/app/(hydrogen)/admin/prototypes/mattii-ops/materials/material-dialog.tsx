"use client";

// material-dialog.tsx — รายละเอียดวัสดุ + รับเข้าสต๊อก / ปรับยอด (ปุ่มอยู่ใน DialogFooter ตาม DESIGN §5 ข้อ 3)
// 🔒 owner-only §2.3: ต้นทุน/หน่วย + มูลค่าคงเหลือ แสดงเฉพาะเจ้าของ
// รับเข้า → qty_delta บวก · ปรับยอด → กรอก "ยอดนับจริง" แล้วระบบคิดผลต่างให้ (อาจติดลบ → แสดง −)

import { useState } from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/badge";
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
import { Text } from "@/components/ui/typography";
import { notify } from "@/lib/toast";
import { MATERIAL_CATEGORY_LABEL, STOCK_MOVE_TYPE_LABEL } from "../_fixtures/labels";
import type { MattiiMaterial, MattiiStockMovement, StockMoveType } from "../_fixtures/types";
import { Field, SectionHeading, fmtDateTH, fmtMoney, fmtNum, useMattiiRole } from "../_components";
import { isLowStock } from "./materials-table";

type Mode = "view" | "receive" | "adjust";

export function MaterialDialog({
  material,
  movements,
  unitLabel,
  onOpenChange,
  onApply,
  onViewMovements,
}: {
  /** null = ปิด dialog */
  material: MattiiMaterial | null;
  movements: MattiiStockMovement[];
  unitLabel: string;
  onOpenChange: (v: boolean) => void;
  onApply: (
    material: MattiiMaterial,
    moveType: StockMoveType,
    qtyDelta: number,
    reason: string,
  ) => void;
  onViewMovements: (m: MattiiMaterial) => void;
}) {
  const { isOwner } = useMattiiRole();
  const [mode, setMode] = useState<Mode>("view");
  const [qty, setQty] = useState("");
  const [reason, setReason] = useState("");
  const [touched, setTouched] = useState(false);

  const recent = movements
    .slice()
    .sort((a, b) => b.occurred_at.localeCompare(a.occurred_at))
    .slice(0, 5);

  function reset() {
    setMode("view");
    setQty("");
    setReason("");
    setTouched(false);
  }

  function close() {
    reset();
    onOpenChange(false);
  }

  const qtyNum = Number(qty);
  const delta =
    material && mode === "adjust"
      ? Math.round((qtyNum - material.qty_on_hand) * 1000) / 1000
      : qtyNum;
  const invalid =
    mode === "receive"
      ? !(qtyNum > 0)
      : mode === "adjust"
        ? !(qty !== "" && qtyNum >= 0 && delta !== 0)
        : false;

  function handleSubmit() {
    if (!material) return;
    setTouched(true);
    if (invalid) {
      notify.error(
        mode === "receive" ? "กรอกจำนวนที่รับเข้ามากกว่า 0" : "กรอกยอดนับจริงที่ต่างจากยอดในระบบ",
      );
      return;
    }
    if (mode === "receive") {
      onApply(material, "receive", qtyNum, reason.trim() || "รับเข้าสต๊อก (บันทึกมือ)");
      notify.success(
        `รับเข้า ${fmtNum(qtyNum, qtyNum % 1 === 0 ? 0 : 2)} ${unitLabel} — ${material.name}`,
      );
    } else {
      onApply(material, "adjust", delta, reason.trim() || "ปรับยอดจากการนับสต๊อกจริง");
      notify.success(
        `ปรับยอด ${material.name} เป็น ${fmtNum(qtyNum, qtyNum % 1 === 0 ? 0 : 2)} ${unitLabel}`,
      );
    }
    close();
  }

  return (
    <Dialog
      open={Boolean(material)}
      onOpenChange={(v) => {
        if (!v) close();
      }}
    >
      <DialogContent size="xl">
        <DialogHeader>
          <DialogTitle>{material ? material.name : "วัสดุ"}</DialogTitle>
        </DialogHeader>
        <DialogBody>
          {material && (
            <div className="space-y-5">
              {isLowStock(material) && (
                <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
                  <Text className="text-sm text-red-700">
                    คงเหลือต่ำกว่าจุดสั่งซื้อ ({fmtNum(material.qty_on_hand, 2)} จาก{" "}
                    {fmtNum(material.reorder_point)} {unitLabel}) —
                    ควรสั่งเพิ่มก่อนของหมดกลางงานพิมพ์
                  </Text>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                <Field label="รหัส">
                  <span className="font-mono">{material.code}</span>
                </Field>
                <Field label="หมวด">{MATERIAL_CATEGORY_LABEL[material.category]}</Field>
                <Field label="คงเหลือ">
                  <span className="tabular-nums">
                    {fmtNum(material.qty_on_hand, material.qty_on_hand % 1 === 0 ? 0 : 3)}{" "}
                    {unitLabel}
                  </span>
                </Field>
                <Field label="จุดสั่งซื้อซ้ำ">
                  <span className="tabular-nums">
                    {fmtNum(material.reorder_point)} {unitLabel}
                  </span>
                </Field>
                <Field label="ผู้ขาย">{material.supplier_name ?? "—"}</Field>
                <Field label="ที่เก็บ">{material.location ?? "—"}</Field>
                {isOwner && (
                  <>
                    <Field label="ต้นทุน/หน่วย 🔒">
                      <span className="font-mono tabular-nums">{fmtMoney(material.unit_cost)}</span>
                    </Field>
                    <Field label="มูลค่าคงเหลือ 🔒">
                      <span className="font-mono tabular-nums">
                        {fmtMoney(material.stock_value)}
                      </span>
                    </Field>
                  </>
                )}
              </div>

              {material.note && (
                <Text className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-600">
                  {material.note}
                </Text>
              )}

              {mode === "view" ? (
                <div>
                  <SectionHeading>ความเคลื่อนไหวล่าสุด</SectionHeading>
                  {recent.length === 0 ? (
                    <Text className="px-1 text-sm text-gray-500">
                      ยังไม่มีความเคลื่อนไหวของวัสดุนี้
                    </Text>
                  ) : (
                    <ul className="space-y-1.5">
                      {recent.map((mv) => (
                        <li
                          key={mv.id}
                          className="flex flex-wrap items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm"
                        >
                          <span className="tabular-nums text-gray-500">
                            {fmtDateTH(mv.occurred_at)}
                          </span>
                          <StatusBadge tone="neutral">
                            {STOCK_MOVE_TYPE_LABEL[mv.move_type]}
                          </StatusBadge>
                          <span
                            className={
                              mv.qty_delta < 0
                                ? "font-medium tabular-nums text-red-600"
                                : "font-medium tabular-nums text-green-600"
                            }
                          >
                            {mv.qty_delta > 0 ? "+" : ""}
                            {fmtNum(mv.qty_delta, mv.qty_delta % 1 === 0 ? 0 : 3)} {unitLabel}
                          </span>
                          <span className="ms-auto tabular-nums text-gray-500">
                            เหลือ {fmtNum(mv.qty_after, mv.qty_after % 1 === 0 ? 0 : 3)} {unitLabel}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ) : (
                <div className="space-y-4 rounded-lg border border-gray-200 bg-gray-50 p-4">
                  <div className="text-sm font-semibold text-gray-900">
                    {mode === "receive" ? "รับเข้าสต๊อก" : "ปรับยอดตามที่นับได้จริง"}
                  </div>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div>
                      <Label htmlFor="mt-mat-qty">
                        {mode === "receive"
                          ? `จำนวนที่รับเข้า (${unitLabel}) *`
                          : `ยอดนับจริง (${unitLabel}) *`}
                      </Label>
                      <Input
                        id="mt-mat-qty"
                        type="number"
                        value={qty}
                        onChange={(e) => setQty(e.target.value)}
                        className="mt-1"
                      />
                      {touched && invalid && (
                        <Text className="mt-1 text-xs text-red-600">
                          {mode === "receive"
                            ? "จำนวนต้องมากกว่า 0"
                            : "กรอกยอดนับจริงที่ต่างจากยอดในระบบ"}
                        </Text>
                      )}
                    </div>
                    <div>
                      <Label htmlFor="mt-mat-reason">เหตุผล / อ้างอิง</Label>
                      <Input
                        id="mt-mat-reason"
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                        placeholder={
                          mode === "receive"
                            ? "เช่น รับของจากผู้ขาย รอบ 25 ก.ค."
                            : "เช่น นับสต๊อกประจำเดือนพบขาดหาย"
                        }
                        className="mt-1"
                      />
                    </div>
                  </div>
                  <Text className="text-sm text-gray-600">
                    คงเหลือหลังบันทึก{" "}
                    <span className="font-mono font-semibold tabular-nums text-gray-900">
                      {fmtNum(
                        Math.round(
                          (material.qty_on_hand + (Number.isFinite(delta) ? delta : 0)) * 1000,
                        ) / 1000,
                        3,
                      )}{" "}
                      {unitLabel}
                    </span>
                    {mode === "adjust" && Number.isFinite(delta) && delta !== 0 && (
                      <span className={delta < 0 ? "text-red-600" : "text-green-600"}>
                        {" "}
                        (ผลต่าง {delta > 0 ? "+" : ""}
                        {fmtNum(delta, 3)} {unitLabel})
                      </span>
                    )}
                  </Text>
                </div>
              )}
            </div>
          )}
        </DialogBody>
        <DialogFooter>
          {mode === "view" ? (
            <>
              {material && (
                <Button
                  variant="ghost"
                  className="mr-auto"
                  onClick={() => onViewMovements(material)}
                >
                  ดูความเคลื่อนไหวทั้งหมด
                </Button>
              )}
              <Button variant="outline" onClick={close}>
                ปิด
              </Button>
              <Button variant="outline" onClick={() => setMode("adjust")}>
                ปรับยอด
              </Button>
              <Button onClick={() => setMode("receive")}>รับเข้าสต๊อก</Button>
            </>
          ) : (
            <>
              <Button variant="outline" onClick={reset}>
                ย้อนกลับ
              </Button>
              <Button onClick={handleSubmit}>บันทึก</Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
