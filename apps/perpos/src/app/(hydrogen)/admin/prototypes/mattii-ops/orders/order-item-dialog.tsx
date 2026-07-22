"use client";

// order-item-dialog.tsx — เพิ่ม/แก้ไข/ลบ "รายการพรม" ในออเดอร์
// จุดขาย: เลือกแบบพรม → เลือกขนาด → ราคาต่อชิ้นเด้งอัตโนมัติ (สั่งตัดพิเศษคิดจาก price_per_sqm)

import { useMemo, useState } from "react";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CustomSelect } from "@/components/ui/custom-select";
import { Text } from "@/components/ui/typography";
import { notify } from "@/lib/toast";
import { EDGE_FINISH_LABEL } from "../_fixtures/labels";
import type { EdgeFinish, MattiiOrderItem } from "../_fixtures/types";
import {
  customCutPrice,
  fabricUsageOf,
  fmtMoney,
  lineTotalOf,
  useMattiiData,
} from "../_components";

const EDGE_OPTIONS = (Object.keys(EDGE_FINISH_LABEL) as EdgeFinish[]).map((e) => ({
  value: e as string,
  label: EDGE_FINISH_LABEL[e],
}));

export function OrderItemDialog({
  open,
  onOpenChange,
  orderId,
  item,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  orderId: string;
  /** null = เพิ่มรายการใหม่ */
  item: MattiiOrderItem | null;
}) {
  const { products, productSizes, addOrderItem, updateOrderItem, removeOrderItem } =
    useMattiiData();

  const [productId, setProductId] = useState(item?.product_id ?? "");
  const [sizeId, setSizeId] = useState(item?.product_size_id ?? "");
  const [width, setWidth] = useState(item?.width_cm ? String(item.width_cm) : "");
  const [length, setLength] = useState(item?.length_cm ? String(item.length_cm) : "");
  const [qty, setQty] = useState(String(item?.qty ?? 1));
  const [unitPrice, setUnitPrice] = useState(item ? String(item.unit_price) : "");
  const [pattern, setPattern] = useState(item?.pattern_name ?? "");
  const [edge, setEdge] = useState<EdgeFinish>(item?.edge_finish ?? "overlock");
  const [note, setNote] = useState(item?.spec_note ?? "");
  const [touched, setTouched] = useState(false);

  const product = products.find((p) => p.id === productId);
  const sizes = useMemo(
    () => productSizes.filter((s) => s.product_id === productId && s.is_active),
    [productSizes, productId],
  );
  const size = sizes.find((s) => s.id === sizeId);
  const isCustom = size?.size_kind === "custom_cut";

  const productOptions = [
    { value: "", label: "— เลือกแบบพรม —" },
    ...products.filter((p) => p.is_active).map((p) => ({ value: p.id, label: p.name })),
  ];
  const sizeOptions = [
    { value: "", label: productId ? "— เลือกขนาด —" : "เลือกแบบพรมก่อน" },
    ...sizes.map((s) => ({
      value: s.id,
      label: `${s.size_label} · ${fmtMoney(s.unit_price)}`,
    })),
  ];

  /** ราคาที่ระบบคำนวณให้ (auto) — แก้ทับได้ */
  function autoPriceFor(sizeIdNext: string, w: string, l: string): number {
    const s = productSizes.find((x) => x.id === sizeIdNext);
    if (!s) return 0;
    if (s.size_kind === "custom_cut" && s.price_per_sqm) {
      const wc = Number(w) || 0;
      const lc = Number(l) || 0;
      return wc > 0 && lc > 0 ? customCutPrice(wc, lc, s.price_per_sqm) : 0;
    }
    return s.unit_price;
  }

  const priceNum = Number(unitPrice) || 0;
  const qtyNum = Number(qty) || 0;
  const lineTotal = lineTotalOf(qtyNum, priceNum);

  const errors = {
    product: !productId ? "กรุณาเลือกแบบพรม" : "",
    size: !sizeId ? "กรุณาเลือกขนาด" : "",
    custom: isCustom && (!Number(width) || !Number(length)) ? "กรอกกว้าง × ยาว (ซม.)" : "",
    qty: qtyNum < 1 ? "จำนวนต้องอย่างน้อย 1 ผืน" : "",
    price: priceNum <= 0 ? "ราคาต่อผืนต้องมากกว่า 0" : "",
  };
  const invalid = Object.values(errors).some(Boolean);

  function handleProduct(v: string) {
    setProductId(v);
    setSizeId("");
    setUnitPrice("");
  }

  function handleSize(v: string) {
    setSizeId(v);
    const s = productSizes.find((x) => x.id === v);
    if (s && s.size_kind !== "custom_cut") {
      setWidth(s.width_cm ? String(s.width_cm) : "");
      setLength(s.length_cm ? String(s.length_cm) : "");
    }
    setUnitPrice(String(autoPriceFor(v, width, length)));
  }

  function handleDimension(which: "w" | "l", v: string) {
    const w = which === "w" ? v : width;
    const l = which === "l" ? v : length;
    if (which === "w") setWidth(v);
    else setLength(v);
    if (isCustom) setUnitPrice(String(autoPriceFor(sizeId, w, l)));
  }

  function handleSave() {
    setTouched(true);
    if (invalid) {
      notify.error("กรอกข้อมูลให้ครบก่อนบันทึก");
      return;
    }
    const wc = Number(width) || null;
    const lc = Number(length) || null;
    const usage = wc && lc ? fabricUsageOf(wc, lc) : (size?.fabric_usage_sqm ?? 0);

    if (item) {
      updateOrderItem(item.id, {
        product_id: productId,
        product_size_id: sizeId,
        item_name: product?.name ?? item.item_name,
        size_label: size?.size_label ?? item.size_label,
        width_cm: wc,
        length_cm: lc,
        fabric_type: product?.fabric_type ?? null,
        edge_finish: edge,
        pattern_name: pattern || null,
        qty: qtyNum,
        unit_price: priceNum,
        fabric_usage_sqm: usage,
        spec_note: note || null,
      });
      notify.updated("แก้ไขรายการแล้ว");
    } else {
      addOrderItem(orderId, {
        product_id: productId,
        product_size_id: sizeId,
        item_name: product?.name ?? "",
        size_label: size?.size_label ?? "",
        width_cm: wc,
        length_cm: lc,
        fabric_type: product?.fabric_type ?? null,
        edge_finish: edge,
        pattern_name: pattern || null,
        qty: qtyNum,
        unit_price: priceNum,
        unit_cost: size?.base_cost ?? 0,
        fabric_usage_sqm: usage,
        spec_note: note || null,
      });
      notify.created("เพิ่มรายการพรมแล้ว");
    }
    onOpenChange(false);
  }

  function handleDelete() {
    if (!item) return;
    removeOrderItem(item.id);
    notify.deleted("ลบรายการแล้ว");
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="xl">
        <DialogHeader>
          <DialogTitle>{item ? "แก้ไขรายการพรม" : "เพิ่มรายการพรม"}</DialogTitle>
        </DialogHeader>
        <DialogBody>
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <Label>แบบพรม *</Label>
                <CustomSelect
                  value={productId}
                  onChange={handleProduct}
                  options={productOptions}
                  className="mt-1"
                />
                {touched && errors.product && (
                  <Text className="mt-1 text-xs text-red-600">{errors.product}</Text>
                )}
              </div>
              <div>
                <Label>ขนาด *</Label>
                <CustomSelect
                  value={sizeId}
                  onChange={handleSize}
                  options={sizeOptions}
                  className="mt-1"
                />
                {touched && errors.size && (
                  <Text className="mt-1 text-xs text-red-600">{errors.size}</Text>
                )}
              </div>
            </div>

            {isCustom && (
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="mt-item-w">กว้าง (ซม.) *</Label>
                  <Input
                    id="mt-item-w"
                    type="number"
                    value={width}
                    onChange={(e) => handleDimension("w", e.target.value)}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label htmlFor="mt-item-l">ยาว (ซม.) *</Label>
                  <Input
                    id="mt-item-l"
                    type="number"
                    value={length}
                    onChange={(e) => handleDimension("l", e.target.value)}
                    className="mt-1"
                  />
                </div>
                {touched && errors.custom && (
                  <Text className="col-span-2 text-xs text-red-600">{errors.custom}</Text>
                )}
              </div>
            )}

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div>
                <Label htmlFor="mt-item-qty">จำนวน (ผืน) *</Label>
                <Input
                  id="mt-item-qty"
                  type="number"
                  value={qty}
                  onChange={(e) => setQty(e.target.value)}
                  className="mt-1"
                />
                {touched && errors.qty && (
                  <Text className="mt-1 text-xs text-red-600">{errors.qty}</Text>
                )}
              </div>
              <div>
                <Label htmlFor="mt-item-price">ราคาต่อผืน (฿) *</Label>
                <Input
                  id="mt-item-price"
                  type="number"
                  value={unitPrice}
                  onChange={(e) => setUnitPrice(e.target.value)}
                  className="mt-1"
                />
                <Text className="mt-1 text-xs text-gray-400">
                  ระบบเติมราคาจากตารางขนาดให้อัตโนมัติ — แก้ทับได้
                </Text>
                {touched && errors.price && (
                  <Text className="mt-1 text-xs text-red-600">{errors.price}</Text>
                )}
              </div>
              <div>
                <Label>การเก็บขอบ</Label>
                <CustomSelect
                  value={edge}
                  onChange={(v) => setEdge(v as EdgeFinish)}
                  options={EDGE_OPTIONS}
                  className="mt-1"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="mt-item-pattern">ชื่อลาย</Label>
                <Input
                  id="mt-item-pattern"
                  value={pattern}
                  onChange={(e) => setPattern(e.target.value)}
                  placeholder="เช่น ลายแมวส้มพื้นครีม"
                  className="mt-1"
                />
              </div>
              <div>
                <Label htmlFor="mt-item-note">โน้ตสเปกจากลูกค้า</Label>
                <Input
                  id="mt-item-note"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="เช่น ขอสีพื้นอ่อนกว่าตัวอย่าง"
                  className="mt-1"
                />
              </div>
            </div>

            <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm">
              <span className="text-gray-500">รวมรายการนี้</span>{" "}
              <span className="font-mono font-semibold tabular-nums text-gray-900">
                {fmtMoney(lineTotal)}
              </span>
            </div>
          </div>
        </DialogBody>
        <DialogFooter>
          {item && (
            <Button variant="destructive" className="mr-auto" onClick={handleDelete}>
              ลบรายการ
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
