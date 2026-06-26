"use client";

// product-dialog.tsx (production) — ฟอร์มเพิ่ม/แก้ไขสินค้าและบริการ (A6)
//   ต่างจาก prototype: mutator = API จริง (async) → toast ตามผล (error ภาษาไทยจาก API)
//   consume mutator: addProduct / updateProduct / deleteProduct (data-provider, back agent)
// ช่อง: ประเภท (good/service) · รหัส · ชื่อ * · หน่วย · ราคาต่อหน่วย · สถานะ · รายละเอียด
// ปุ่มลบ = mr-auto (โหมดแก้ไข) · form ครอบ DialogBody+DialogFooter (DESIGN §13)

import { useEffect, useState } from "react";
import { Trash2, Package, Wrench } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SegmentedControl } from "@/components/ui/segmented";
import {
  Dialog,
  DialogContent,
  DialogBody,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "@/lib/toast";
import { useAccountingData, type ProductInput } from "./data-provider";
import type { AccProduct, AccProductKind } from "@/lib/accounting/types";

const KIND_OPTIONS: { value: AccProductKind; label: string; icon: React.ReactNode }[] = [
  { value: "good", label: "สินค้า", icon: <Package className="h-4 w-4" /> },
  { value: "service", label: "บริการ", icon: <Wrench className="h-4 w-4" /> },
];

const STATUS_OPTIONS: {
  value: "active" | "inactive";
  label: string;
  activeClassName?: string;
}[] = [
  { value: "active", label: "ใช้งาน", activeClassName: "bg-green-600" },
  { value: "inactive", label: "ปิด" },
];

export function ProductDialog({
  open,
  onOpenChange,
  product,
  canWrite,
  defaultName,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** product ที่จะแก้ไข (null = เพิ่มใหม่) */
  product: AccProduct | null;
  canWrite: boolean;
  /** prefill ช่องชื่อตอนสร้าง (มาจากคำที่พิมพ์ใน typeahead ของ document-dialog) */
  defaultName?: string;
  /** callback หลังสร้างสำเร็จ — ส่ง input กลับให้ผู้เรียก auto-fill บรรทัด */
  onCreated?: (input: ProductInput) => void;
}) {
  const { addProduct, updateProduct, deleteProduct } = useAccountingData();
  const isEdit = product !== null;
  const readOnly = !canWrite;

  const [kind, setKind] = useState<AccProduct["kind"]>("service");
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [unit, setUnit] = useState("");
  const [unitPrice, setUnitPrice] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);

  const key = `${open}-${product?.id ?? "new"}`;
  const [lastKey, setLastKey] = useState("");
  useEffect(() => {
    if (!open || key === lastKey) return;
    setLastKey(key);
    setSaving(false);
    if (product) {
      setKind(product.kind);
      setCode(product.code ?? "");
      setName(product.name);
      setUnit(product.unit ?? "");
      setUnitPrice(String(product.unit_price));
      setIsActive(product.is_active);
      setDescription(product.description ?? "");
    } else {
      setKind("service");
      setCode("");
      setName(defaultName ?? "");
      setUnit("");
      setUnitPrice("");
      setIsActive(true);
      setDescription("");
    }
  }, [open, key, lastKey, product, defaultName]);

  async function handleSubmit() {
    if (!name.trim()) {
      toast.error("กรุณากรอกชื่อสินค้า/บริการ");
      return;
    }
    if (!unit.trim()) {
      toast.error("กรุณากรอกหน่วยนับ");
      return;
    }
    const price = Number(unitPrice);
    if (!unitPrice.trim() || Number.isNaN(price) || price < 0) {
      toast.error("ราคาต่อหน่วยต้องเป็นตัวเลขไม่ติดลบ");
      return;
    }
    const payload: ProductInput = {
      kind,
      code: code.trim() || null,
      name: name.trim(),
      unit: unit.trim() || null,
      unit_price: price,
      is_active: isActive,
      description: description.trim() || null,
    };
    setSaving(true);
    const result =
      isEdit && product ? await updateProduct(product.id, payload) : await addProduct(payload);
    setSaving(false);
    if (!result.ok) {
      toast.error(result.error ?? "บันทึกไม่สำเร็จ");
      return;
    }
    toast.success(isEdit ? `แก้ไข ${payload.name} สำเร็จ` : `เพิ่ม ${payload.name} สำเร็จ`);
    if (!isEdit) onCreated?.(payload);
    onOpenChange(false);
  }

  async function handleDelete() {
    if (!product) return;
    setSaving(true);
    const result = await deleteProduct(product.id);
    setSaving(false);
    if (!result.ok) {
      toast.error(result.error ?? "ลบไม่สำเร็จ");
      return;
    }
    toast.success(`ลบ ${product.name} แล้ว`);
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="xl">
        <DialogHeader>
          <DialogTitle>
            {readOnly
              ? "รายละเอียดสินค้า/บริการ"
              : isEdit
                ? "แก้ไขสินค้า/บริการ"
                : "เพิ่มสินค้าและบริการ"}
          </DialogTitle>
        </DialogHeader>
        <form
          className="flex min-h-0 flex-1 flex-col"
          onSubmit={(e) => {
            e.preventDefault();
            void handleSubmit();
          }}
        >
          <DialogBody>
            <div className="space-y-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <Label>ประเภท *</Label>
                  <div className="mt-1">
                    <SegmentedControl
                      value={kind}
                      onChange={setKind}
                      options={KIND_OPTIONS}
                      fullWidth
                      ariaLabel="ประเภทสินค้า/บริการ"
                    />
                  </div>
                </div>
                <div>
                  <Label>สถานะ</Label>
                  <div className="mt-1">
                    <SegmentedControl
                      value={isActive ? "active" : "inactive"}
                      onChange={(v) => setIsActive(v === "active")}
                      options={STATUS_OPTIONS}
                      fullWidth
                      ariaLabel="สถานะการใช้งาน"
                    />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <Label htmlFor="prd-code">รหัสสินค้า/SKU</Label>
                  <Input
                    id="prd-code"
                    className="mt-1"
                    placeholder="เช่น SVC-001 / PRD-001"
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    disabled={readOnly}
                  />
                </div>
                <div>
                  <Label htmlFor="prd-unit">หน่วยนับ *</Label>
                  <Input
                    id="prd-unit"
                    className="mt-1"
                    placeholder="เช่น ชิ้น / ชั่วโมง / งาน / เดือน"
                    value={unit}
                    onChange={(e) => setUnit(e.target.value)}
                    disabled={readOnly}
                  />
                </div>
              </div>

              <div>
                <Label htmlFor="prd-name">ชื่อสินค้า/บริการ *</Label>
                <Input
                  id="prd-name"
                  className="mt-1"
                  placeholder="เช่น ออกแบบโลโก้และ Brand Identity"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  disabled={readOnly}
                />
              </div>

              <div>
                <Label htmlFor="prd-price">ราคาต่อหน่วย (฿) *</Label>
                <Input
                  id="prd-price"
                  type="number"
                  min={0}
                  step="0.01"
                  className="mt-1"
                  placeholder="0.00"
                  value={unitPrice}
                  onChange={(e) => setUnitPrice(e.target.value)}
                  disabled={readOnly}
                />
              </div>

              <div>
                <Label htmlFor="prd-desc">รายละเอียด</Label>
                <Input
                  id="prd-desc"
                  className="mt-1"
                  placeholder="คำอธิบายสินค้า/บริการ (ใช้แสดงในเอกสารขาย)"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  disabled={readOnly}
                />
              </div>
            </div>
          </DialogBody>
          <DialogFooter>
            {isEdit && !readOnly && (
              <Button
                type="button"
                variant="destructive"
                className="mr-auto"
                disabled={saving}
                onClick={() => void handleDelete()}
              >
                <Trash2 className="mr-1.5 h-4 w-4" /> ลบ
              </Button>
            )}
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {readOnly ? "ปิด" : "ยกเลิก"}
            </Button>
            {!readOnly && (
              <Button type="submit" disabled={saving}>
                {saving ? "กำลังบันทึก…" : isEdit ? "บันทึกการแก้ไข" : "เพิ่มสินค้า/บริการ"}
              </Button>
            )}
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
