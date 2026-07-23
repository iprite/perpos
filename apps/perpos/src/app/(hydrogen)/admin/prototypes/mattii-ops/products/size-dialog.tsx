"use client";

// size-dialog.tsx — เพิ่ม/แก้/ลบ "ขนาด + ราคาต่อชิ้น" ของแบบพรม (mock: อัปเดต state ของหน้า products)
// 🔒 owner-only §2.3: ช่อง "ต้นทุนต่อชิ้น" (base_cost) แสดงเฉพาะเจ้าของ
// ขนาดมาตรฐาน = ราคาต่อผืน · สั่งตัดพิเศษ = ราคาต่อ ตร.ม. (คิดตอนสร้างออเดอร์)

import { useState } from "react";
import { Button } from "@/components/ui/button";
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
import { SegmentedControl } from "@/components/ui/segmented";
import { Text } from "@/components/ui/typography";
import { notify } from "@/lib/toast";
import { MOCK_ORG_ID } from "../_fixtures/helpers";
import type { MattiiProductSize, SizeKind } from "../_fixtures/types";
import { fabricUsageOf, fmtMoney, fmtNum, useMattiiRole } from "../_components";

let seq = 1;

export function SizeDialog({
  open,
  productId,
  size,
  onOpenChange,
  onSizesChange,
}: {
  open: boolean;
  productId: string;
  /** null = เพิ่มขนาดใหม่ */
  size: MattiiProductSize | null;
  onOpenChange: (v: boolean) => void;
  onSizesChange: (updater: (prev: MattiiProductSize[]) => MattiiProductSize[]) => void;
}) {
  const { isOwner } = useMattiiRole();

  const [kind, setKind] = useState<SizeKind>(size?.size_kind ?? "standard");
  const [label, setLabel] = useState(size?.size_label ?? "");
  const [width, setWidth] = useState(size?.width_cm ? String(size.width_cm) : "");
  const [length, setLength] = useState(size?.length_cm ? String(size.length_cm) : "");
  const [price, setPrice] = useState(size ? String(size.unit_price) : "");
  const [cost, setCost] = useState(size ? String(size.base_cost) : "");
  const [perSqm, setPerSqm] = useState(size?.price_per_sqm ? String(size.price_per_sqm) : "");
  const [status, setStatus] = useState(size ? (size.is_active ? "on" : "off") : "on");
  const [touched, setTouched] = useState(false);

  const custom = kind === "custom_cut";
  const w = Number(width) || 0;
  const l = Number(length) || 0;
  const usage = !custom && w > 0 && l > 0 ? fabricUsageOf(w, l) : 0;

  const errors = {
    label: !label.trim() ? "กรอกชื่อขนาด เช่น 60 × 90 ซม." : "",
    dim: !custom && (w <= 0 || l <= 0) ? "กรอกกว้าง × ยาว (ซม.) ให้ครบ" : "",
    price: !custom && Number(price) <= 0 ? "ราคาต่อผืนต้องมากกว่า 0" : "",
    perSqm: custom && Number(perSqm) <= 0 ? "ราคาต่อ ตร.ม. ต้องมากกว่า 0" : "",
  };
  const invalid = Object.values(errors).some(Boolean);

  function autoLabel(nextW: string, nextL: string) {
    if (custom || size) return;
    const nw = Number(nextW) || 0;
    const nl = Number(nextL) || 0;
    if (nw > 0 && nl > 0) setLabel(`${fmtNum(nw)} × ${fmtNum(nl)} ซม.`);
  }

  function handleSave() {
    setTouched(true);
    if (invalid) {
      notify.error("กรอกข้อมูลให้ครบก่อนบันทึก");
      return;
    }
    const now = new Date().toISOString();
    const patch = {
      size_kind: kind,
      size_label: label.trim(),
      width_cm: custom ? null : w,
      length_cm: custom ? null : l,
      unit_price: custom ? 0 : Number(price),
      base_cost: custom ? 0 : Number(cost) || 0,
      price_per_sqm: custom ? Number(perSqm) : null,
      fabric_usage_sqm: custom ? 0 : usage,
      is_active: status === "on",
      updated_at: now,
    };

    if (size) {
      onSizesChange((prev) => prev.map((s) => (s.id === size.id ? { ...s, ...patch } : s)));
      notify.updated(`อัปเดตขนาด ${patch.size_label} แล้ว`);
    } else {
      const row: MattiiProductSize = {
        id: `sz-new-${Date.now()}-${seq++}`,
        org_id: MOCK_ORG_ID,
        product_id: productId,
        sort_order: 99,
        created_at: now,
        ...patch,
      };
      onSizesChange((prev) => [...prev, row]);
      notify.created(`เพิ่มขนาด ${row.size_label} แล้ว`);
    }
    onOpenChange(false);
  }

  function handleDelete() {
    if (!size) return;
    onSizesChange((prev) => prev.filter((s) => s.id !== size.id));
    notify.deleted(`ลบขนาด ${size.size_label} แล้ว`);
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>{size ? "แก้ไขขนาด & ราคา" : "เพิ่มขนาด & ราคา"}</DialogTitle>
        </DialogHeader>
        <DialogBody>
          <div className="space-y-4">
            <div>
              <Label>ชนิดขนาด</Label>
              <SegmentedControl
                className="mt-1"
                value={kind}
                onChange={(v) => setKind(v)}
                ariaLabel="ชนิดขนาด"
                options={[
                  { value: "standard", label: "ขนาดมาตรฐาน" },
                  { value: "custom_cut", label: "สั่งตัดพิเศษ" },
                ]}
              />
              <Text className="mt-1 text-xs text-gray-400">
                สั่งตัดพิเศษ = คิดราคาตามตารางเมตรตอนสร้างออเดอร์ (Sale กรอกกว้าง × ยาวเอง)
              </Text>
            </div>

            {!custom && (
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="mt-sz-w">กว้าง (ซม.) *</Label>
                  <Input
                    id="mt-sz-w"
                    type="number"
                    value={width}
                    onChange={(e) => {
                      setWidth(e.target.value);
                      autoLabel(e.target.value, length);
                    }}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label htmlFor="mt-sz-l">ยาว (ซม.) *</Label>
                  <Input
                    id="mt-sz-l"
                    type="number"
                    value={length}
                    onChange={(e) => {
                      setLength(e.target.value);
                      autoLabel(width, e.target.value);
                    }}
                    className="mt-1"
                  />
                </div>
                {touched && errors.dim && (
                  <Text className="col-span-2 text-xs text-red-600">{errors.dim}</Text>
                )}
              </div>
            )}

            <div>
              <Label htmlFor="mt-sz-label">ชื่อขนาดที่แสดงให้ลูกค้า *</Label>
              <Input
                id="mt-sz-label"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="เช่น 60 × 90 ซม."
                className="mt-1"
              />
              {touched && errors.label && (
                <Text className="mt-1 text-xs text-red-600">{errors.label}</Text>
              )}
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {custom ? (
                <div>
                  <Label htmlFor="mt-sz-persqm">ราคาต่อ ตร.ม. (฿) *</Label>
                  <Input
                    id="mt-sz-persqm"
                    type="number"
                    value={perSqm}
                    onChange={(e) => setPerSqm(e.target.value)}
                    className="mt-1"
                  />
                  {touched && errors.perSqm && (
                    <Text className="mt-1 text-xs text-red-600">{errors.perSqm}</Text>
                  )}
                </div>
              ) : (
                <div>
                  <Label htmlFor="mt-sz-price">ราคาขายต่อผืน (฿) *</Label>
                  <Input
                    id="mt-sz-price"
                    type="number"
                    value={price}
                    onChange={(e) => setPrice(e.target.value)}
                    className="mt-1"
                  />
                  {touched && errors.price && (
                    <Text className="mt-1 text-xs text-red-600">{errors.price}</Text>
                  )}
                </div>
              )}

              {/* 🔒 owner-only — ต้นทุนต่อชิ้น */}
              {isOwner && !custom && (
                <div>
                  <Label htmlFor="mt-sz-cost">ต้นทุนต่อชิ้น (฿)</Label>
                  <Input
                    id="mt-sz-cost"
                    type="number"
                    value={cost}
                    onChange={(e) => setCost(e.target.value)}
                    className="mt-1"
                  />
                  <Text className="mt-1 text-xs text-gray-400">
                    ใช้คิดกำไรขั้นต้นของออเดอร์ — เห็นเฉพาะเจ้าของ
                  </Text>
                </div>
              )}
            </div>

            <div>
              <Label>สถานะ</Label>
              <SegmentedControl
                className="mt-1"
                value={status}
                onChange={setStatus}
                ariaLabel="สถานะขนาด"
                options={[
                  { value: "on", label: "เปิดใช้งาน", activeClassName: "bg-green-600" },
                  { value: "off", label: "ปิดใช้งาน" },
                ]}
              />
            </div>

            <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm">
              {custom ? (
                <span className="text-gray-500">
                  ตัวอย่าง: สั่ง 120 × 180 ซม. ={" "}
                  <span className="font-mono font-semibold tabular-nums text-gray-900">
                    {fmtMoney(((120 * 180) / 10000) * (Number(perSqm) || 0))}
                  </span>
                </span>
              ) : (
                <span className="text-gray-500">
                  ผ้าที่ใช้โดยประมาณ{" "}
                  <span className="font-mono font-semibold tabular-nums text-gray-900">
                    {fmtNum(usage, 3)}
                  </span>{" "}
                  ตร.ม./ผืน (เผื่อขอบ 15%)
                  {isOwner && (
                    <>
                      {" · กำไรต่อผืน "}
                      <span className="font-mono font-semibold tabular-nums text-gray-900">
                        {fmtMoney((Number(price) || 0) - (Number(cost) || 0))}
                      </span>
                    </>
                  )}
                </span>
              )}
            </div>
          </div>
        </DialogBody>
        <DialogFooter>
          {size && (
            <Button variant="destructive" className="mr-auto" onClick={handleDelete}>
              ลบขนาด
            </Button>
          )}
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            ยกเลิก
          </Button>
          <Button onClick={handleSave}>บันทึก</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
