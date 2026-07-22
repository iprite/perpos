"use client";

// product-dialog.tsx — แก้/ลบสินค้าในคลัง (PATCH/DELETE /api/gov-procure/products/[id])
// ราคาในคลัง = ราคาที่ "คนยืนยันแล้ว" → **ไม่มีป้ายประมาณการ** (C-B2)

import { useEffect, useState } from "react";
import { Trash2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogBody,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Text } from "@/components/ui/typography";
import { ImageUpload } from "@/components/ui/image-upload";
import { toast } from "@/lib/toast";
import type { CatalogProduct } from "@/lib/gov-procure/catalog";
import { govApi } from "../../_components/api";
import { deleteImage, fetchProductImageUrl, uploadProductImage } from "./image-api";
import { fmtDateTime, fmtMoney, fmtNum } from "./format";

interface Form {
  name: string;
  brand_model: string;
  spec_line: string;
  size_line: string;
  bullets: string;
  care_notes: string;
  caution_notes: string;
  category: string;
  default_unit: string;
  last_unit_price: string;
}

function toForm(p: CatalogProduct): Form {
  return {
    name: p.name ?? "",
    brand_model: p.brand_model ?? "",
    spec_line: p.spec_line ?? "",
    size_line: p.size_line ?? "",
    bullets: (p.bullets ?? []).join("\n"),
    care_notes: (p.care_notes ?? []).join("\n"),
    caution_notes: (p.caution_notes ?? []).join("\n"),
    category: p.category ?? "",
    default_unit: p.default_unit ?? "",
    last_unit_price:
      typeof p.last_unit_price === "number" && Number.isFinite(p.last_unit_price)
        ? String(p.last_unit_price)
        : "",
  };
}

function lines(v: string): string[] {
  return v
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
}

export function ProductDialog({
  product,
  open,
  onOpenChange,
  orgId,
  canWrite,
  canDelete,
  onSaved,
  onDeleted,
  onImageChanged,
}: {
  product: CatalogProduct | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orgId: string;
  canWrite: boolean;
  canDelete: boolean;
  onSaved: (product: CatalogProduct) => void;
  onDeleted: (productId: string) => void;
  /** อัปโหลด/ลบรูปแล้ว → ให้ตารางขอ signed URL ใหม่ของสินค้าตัวนี้ */
  onImageChanged?: (productId: string) => void;
}) {
  const [form, setForm] = useState<Form | null>(null);
  const [imageUrl, setImageUrl] = useState<string | undefined>(undefined);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (!product) {
      setForm(null);
      setImageUrl(undefined);
      return;
    }
    setForm(toForm(product));
    setConfirmDelete(false);
    setImageUrl(undefined);
    if (product.image_path) {
      fetchProductImageUrl(orgId, product.id)
        .then((url) => setImageUrl(url))
        .catch(() => {
          /* รูปโหลดไม่ได้ → แสดงกล่องเปล่า */
        });
    }
  }, [product, orgId]);

  function set(key: keyof Form, value: string) {
    setForm((f) => (f ? { ...f, [key]: value } : f));
  }

  async function save() {
    if (!product || !form) return;
    if (!form.name.trim()) {
      toast.error("กรุณาระบุชื่อสินค้า");
      return;
    }
    setSaving(true);
    try {
      const price = form.last_unit_price.trim();
      const res = await govApi<{ product: CatalogProduct }>(
        `/api/gov-procure/products/${product.id}?orgId=${encodeURIComponent(orgId)}`,
        "PATCH",
        {
          name: form.name.trim(),
          brand_model: form.brand_model.trim(),
          spec_line: form.spec_line.trim(),
          size_line: form.size_line.trim(),
          bullets: lines(form.bullets),
          care_notes: lines(form.care_notes),
          caution_notes: lines(form.caution_notes),
          category: form.category.trim(),
          default_unit: form.default_unit.trim(),
          last_unit_price: price === "" ? null : Number(price),
        },
      );
      if (res.product) onSaved(res.product);
      toast.success("บันทึกสินค้าในคลังแล้ว");
      onOpenChange(false);
    } catch (e) {
      toast.error((e as Error).message || "บันทึกไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!product) return;
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    setSaving(true);
    try {
      await govApi(
        `/api/gov-procure/products/${product.id}?orgId=${encodeURIComponent(orgId)}`,
        "DELETE",
      );
      onDeleted(product.id);
      toast.success("ลบออกจากคลังแล้ว (แคตตาล็อกที่ใช้ไปแล้วไม่เปลี่ยนแปลง)");
      onOpenChange(false);
    } catch (e) {
      toast.error((e as Error).message || "ลบไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  }

  async function changeImage(dataUrl: string | null) {
    if (!product) return;
    setSaving(true);
    try {
      if (dataUrl) {
        await uploadProductImage(orgId, product.id, dataUrl);
        setImageUrl(await fetchProductImageUrl(orgId, product.id));
        toast.success("อัปโหลดรูปแล้ว");
      } else {
        await deleteImage(orgId, { productId: product.id });
        setImageUrl(undefined);
        toast.success("ลบรูปแล้ว");
      }
      onImageChanged?.(product.id);
    } catch (e) {
      toast.error((e as Error).message || "จัดการรูปไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="2xl">
        <DialogHeader>
          <DialogTitle>{product ? product.name : "สินค้าในคลัง"}</DialogTitle>
          {product && (
            <Text className="text-xs text-gray-500">
              ใช้ไปแล้ว {fmtNum(product.times_used)} ครั้ง · ใช้ล่าสุด{" "}
              {fmtDateTime(product.last_used_at)} · ราคาอัปเดต{" "}
              {fmtDateTime(product.price_updated_at)}
            </Text>
          )}
        </DialogHeader>

        <DialogBody>
          {!product || !form ? (
            <div className="animate-pulse space-y-3">
              <div className="h-5 w-1/3 rounded bg-gray-100" />
              <div className="h-24 rounded bg-gray-100" />
            </div>
          ) : (
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <Label htmlFor="prod-name">ชื่อสินค้า *</Label>
                  <Input
                    id="prod-name"
                    className="mt-1"
                    value={form.name}
                    readOnly={!canWrite}
                    onChange={(e) => set("name", e.target.value)}
                  />
                </div>
                <div>
                  <Label htmlFor="prod-brand">ยี่ห้อ / รุ่น</Label>
                  <Input
                    id="prod-brand"
                    className="mt-1"
                    value={form.brand_model}
                    readOnly={!canWrite}
                    onChange={(e) => set("brand_model", e.target.value)}
                  />
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <Label htmlFor="prod-spec">สเปกรุ่น</Label>
                  <Textarea
                    id="prod-spec"
                    className="mt-1"
                    rows={2}
                    value={form.spec_line}
                    readOnly={!canWrite}
                    onChange={(e) => set("spec_line", e.target.value)}
                  />
                </div>
                <div>
                  <Label htmlFor="prod-size">ขนาด / บรรจุ</Label>
                  <Textarea
                    id="prod-size"
                    className="mt-1"
                    rows={2}
                    value={form.size_line}
                    readOnly={!canWrite}
                    onChange={(e) => set("size_line", e.target.value)}
                  />
                </div>
              </div>

              <div>
                <Label htmlFor="prod-bullets">รายละเอียดสินค้า (บรรทัดละ 1 ข้อ)</Label>
                <Textarea
                  id="prod-bullets"
                  className="mt-1"
                  rows={6}
                  value={form.bullets}
                  readOnly={!canWrite}
                  onChange={(e) => set("bullets", e.target.value)}
                />
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <Label htmlFor="prod-care">วิธีดูแลรักษา</Label>
                  <Textarea
                    id="prod-care"
                    className="mt-1"
                    rows={3}
                    value={form.care_notes}
                    readOnly={!canWrite}
                    onChange={(e) => set("care_notes", e.target.value)}
                  />
                </div>
                <div>
                  <Label htmlFor="prod-caution">ข้อควรระวัง</Label>
                  <Textarea
                    id="prod-caution"
                    className="mt-1"
                    rows={3}
                    value={form.caution_notes}
                    readOnly={!canWrite}
                    onChange={(e) => set("caution_notes", e.target.value)}
                  />
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                <div>
                  <Label htmlFor="prod-category">หมวดหมู่</Label>
                  <Input
                    id="prod-category"
                    className="mt-1"
                    value={form.category}
                    readOnly={!canWrite}
                    onChange={(e) => set("category", e.target.value)}
                  />
                </div>
                <div>
                  <Label htmlFor="prod-unit">หน่วยตั้งต้น</Label>
                  <Input
                    id="prod-unit"
                    className="mt-1"
                    value={form.default_unit}
                    readOnly={!canWrite}
                    onChange={(e) => set("default_unit", e.target.value)}
                  />
                </div>
                <div>
                  <Label htmlFor="prod-price">ราคาล่าสุด (฿)</Label>
                  <Input
                    id="prod-price"
                    type="number"
                    className="mt-1 text-right tabular-nums"
                    value={form.last_unit_price}
                    readOnly={!canWrite}
                    onChange={(e) => set("last_unit_price", e.target.value)}
                  />
                  <Text className="mt-1 text-xs text-gray-500">
                    ราคาที่ทีมยืนยันแล้ว — ไม่ใช่ราคาประมาณการจาก AI
                  </Text>
                </div>
              </div>

              <div className="rounded-lg border border-gray-200 p-3">
                <Text className="mb-2 text-xs font-semibold text-gray-700">รูปสินค้า</Text>
                {canWrite ? (
                  <ImageUpload
                    value={imageUrl ?? null}
                    onChange={(v) => void changeImage(v)}
                    label="อัปโหลดรูป"
                    accept="image/png,image/jpeg,image/webp"
                    previewClassName="h-20 w-20"
                  />
                ) : imageUrl ? (
                  /* signed URL (อายุ 5 นาที) — ใช้ next/image ไม่ได้ */
                  <img
                    src={imageUrl}
                    alt={product.name}
                    className="h-20 w-20 rounded border border-gray-200 object-contain"
                  />
                ) : (
                  <Text className="text-xs text-gray-500">ยังไม่มีรูป</Text>
                )}
              </div>

              <Text className="text-xs text-gray-500">
                ราคาที่บันทึกไว้ล่าสุด {fmtMoney(product.last_unit_price)} —
                ชุดถัดไปที่ชื่อตรงกันจะดึงค่านี้ไปใช้อัตโนมัติ
              </Text>
            </div>
          )}
        </DialogBody>

        <DialogFooter>
          {canDelete && product && (
            <Button
              variant="destructive"
              className="mr-auto"
              disabled={saving}
              onClick={() => void remove()}
            >
              <Trash2 className="mr-1.5 h-4 w-4" />
              {confirmDelete ? "กดอีกครั้งเพื่อลบถาวร" : "ลบออกจากคลัง"}
            </Button>
          )}
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            ปิด
          </Button>
          {canWrite && (
            <Button disabled={saving} onClick={() => void save()}>
              {saving ? "กำลังบันทึก…" : "บันทึก"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
