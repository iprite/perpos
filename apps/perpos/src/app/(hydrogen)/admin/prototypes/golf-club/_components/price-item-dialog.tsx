"use client";

// price-item-dialog.tsx — สร้าง/แก้ไขรายการราคาใน catalog
// matrix: category / applies_to / day_type (weekday/weekend/all) / member_type (member/guest/vip/all)
// PRICING RULE (LOCKED §3.3): ราคาฐาน = member_type='all' · ส่วนลดสมาชิกมาจาก plan (ไม่ซ้อน)
// mutators: addPriceItem / updatePriceItem / deletePriceItem · เงิน tabular

import { useEffect, useState } from "react";
import { Save, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CustomSelect } from "@/components/ui/custom-select";
import { SegmentedControl } from "@/components/ui/segmented";
import {
  Dialog,
  DialogContent,
  DialogBody,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { notify } from "@/lib/toast";
import { useGolfData } from "./data-context";
import type {
  GolfPriceItem,
  GolfPriceCategory,
  GolfPriceAppliesTo,
  GolfDayType,
  GolfPriceMemberType,
} from "../_fixtures/types";

export const CATEGORY_LABEL: Record<GolfPriceCategory, string> = {
  green_fee: "กรีนฟี",
  caddie: "แคดดี้",
  cart: "รถกอล์ฟ",
  range_bucket: "ตะกร้าลูกไดร์ฟ",
  other: "อื่น ๆ",
};
export const DAY_TYPE_LABEL: Record<GolfDayType, string> = {
  weekday: "วันธรรมดา",
  weekend: "วันหยุด",
  all: "ทุกวัน",
};
export const APPLIES_TO_LABEL: Record<GolfPriceAppliesTo, string> = {
  tee_time: "สนาม (tee-time)",
  driving_range: "ไดร์ฟ",
  both: "ทั้งสองอย่าง",
};
export const PRICE_MEMBER_LABEL: Record<GolfPriceMemberType, string> = {
  all: "ทุกคน (ราคาฐาน)",
  member: "สมาชิก (fallback)",
  vip: "VIP",
  guest: "บุคคลทั่วไป",
};

const CATEGORY_OPTIONS = (Object.keys(CATEGORY_LABEL) as GolfPriceCategory[]).map((v) => ({
  value: v,
  label: CATEGORY_LABEL[v],
}));
const APPLIES_OPTIONS = (Object.keys(APPLIES_TO_LABEL) as GolfPriceAppliesTo[]).map((v) => ({
  value: v,
  label: APPLIES_TO_LABEL[v],
}));
const DAY_OPTIONS = (Object.keys(DAY_TYPE_LABEL) as GolfDayType[]).map((v) => ({
  value: v,
  label: DAY_TYPE_LABEL[v],
}));
const MEMBER_OPTIONS = (Object.keys(PRICE_MEMBER_LABEL) as GolfPriceMemberType[]).map((v) => ({
  value: v,
  label: PRICE_MEMBER_LABEL[v],
}));

interface FormState {
  name: string;
  category: GolfPriceCategory;
  appliesTo: GolfPriceAppliesTo;
  dayType: GolfDayType;
  memberType: GolfPriceMemberType;
  price: string;
  unit: string;
  bucketSize: string;
  active: boolean;
}

const EMPTY: FormState = {
  name: "",
  category: "green_fee",
  appliesTo: "tee_time",
  dayType: "all",
  memberType: "all",
  price: "",
  unit: "ต่อคน",
  bucketSize: "",
  active: true,
};

function toForm(p: GolfPriceItem): FormState {
  return {
    name: p.name,
    category: p.category,
    appliesTo: p.applies_to,
    dayType: p.day_type,
    memberType: p.member_type,
    price: String(p.price),
    unit: p.unit ?? "",
    bucketSize: p.bucket_size != null ? String(p.bucket_size) : "",
    active: p.is_active,
  };
}

export function PriceItemDialog({
  item,
  open,
  onOpenChange,
}: {
  /** null = สร้างใหม่ */
  item: GolfPriceItem | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const { addPriceItem, updatePriceItem, deletePriceItem } = useGolfData();
  const [f, setF] = useState<FormState>(EMPTY);
  const [err, setErr] = useState(false);

  useEffect(() => {
    if (open) {
      setF(item ? toForm(item) : EMPTY);
      setErr(false);
    }
  }, [open, item]);

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) =>
    setF((prev) => ({ ...prev, [k]: v }));

  const isBucket = f.category === "range_bucket";

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const price = Number(f.price);
    if (!f.name.trim() || !Number.isFinite(price) || price < 0) {
      setErr(true);
      return;
    }
    const payload = {
      category: f.category,
      name: f.name.trim(),
      applies_to: f.appliesTo,
      day_type: f.dayType,
      member_type: f.memberType,
      price,
      unit: f.unit.trim() || null,
      bucket_size: isBucket && f.bucketSize.trim() ? Number(f.bucketSize) : null,
      is_active: f.active,
    };
    if (item) {
      updatePriceItem(item.id, payload);
      notify.saved(`บันทึกราคา ${payload.name} แล้ว`);
    } else {
      addPriceItem(payload);
      notify.created(`เพิ่มราคา ${payload.name} แล้ว`);
    }
    onOpenChange(false);
  }

  function handleDelete() {
    if (!item) return;
    deletePriceItem(item.id);
    notify.deleted(`ลบราคา ${item.name} แล้ว`);
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="xl">
        <DialogHeader>
          <DialogTitle>{item ? "แก้ไขรายการราคา" : "เพิ่มรายการราคา"}</DialogTitle>
        </DialogHeader>
        <form className="flex min-h-0 flex-1 flex-col" onSubmit={handleSubmit}>
          <DialogBody>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <Label htmlFor="pi-name">ชื่อรายการ *</Label>
                <Input
                  id="pi-name"
                  className={`mt-1 ${err && !f.name.trim() ? "border-red-500 focus:ring-red-500" : ""}`}
                  placeholder="เช่น กรีนฟี 18 หลุม (วันหยุด)"
                  value={f.name}
                  onChange={(e) => set("name", e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="pi-cat">หมวดหมู่</Label>
                <CustomSelect
                  className="mt-1"
                  value={f.category}
                  onChange={(v) => set("category", v as GolfPriceCategory)}
                  options={CATEGORY_OPTIONS}
                />
              </div>
              <div>
                <Label htmlFor="pi-applies">ใช้กับ</Label>
                <CustomSelect
                  className="mt-1"
                  value={f.appliesTo}
                  onChange={(v) => set("appliesTo", v as GolfPriceAppliesTo)}
                  options={APPLIES_OPTIONS}
                />
              </div>
              <div>
                <Label htmlFor="pi-day">วัน</Label>
                <CustomSelect
                  className="mt-1"
                  value={f.dayType}
                  onChange={(v) => set("dayType", v as GolfDayType)}
                  options={DAY_OPTIONS}
                />
              </div>
              <div>
                <Label htmlFor="pi-member">กลุ่มลูกค้า</Label>
                <CustomSelect
                  className="mt-1"
                  value={f.memberType}
                  onChange={(v) => set("memberType", v as GolfPriceMemberType)}
                  options={MEMBER_OPTIONS}
                />
              </div>
              <div>
                <Label htmlFor="pi-price">ราคา (฿) *</Label>
                <Input
                  id="pi-price"
                  type="number"
                  min={0}
                  className={`mt-1 ${err && !(Number(f.price) >= 0 && f.price !== "") ? "border-red-500 focus:ring-red-500" : ""}`}
                  value={f.price}
                  onChange={(e) => set("price", e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="pi-unit">หน่วย</Label>
                <Input
                  id="pi-unit"
                  className="mt-1"
                  placeholder="เช่น ต่อคน / ต่อตะกร้า"
                  value={f.unit}
                  onChange={(e) => set("unit", e.target.value)}
                />
              </div>
              {isBucket && (
                <div>
                  <Label htmlFor="pi-bucket">จำนวนลูกต่อตะกร้า</Label>
                  <Input
                    id="pi-bucket"
                    type="number"
                    min={0}
                    className="mt-1"
                    placeholder="เช่น 100"
                    value={f.bucketSize}
                    onChange={(e) => set("bucketSize", e.target.value)}
                  />
                </div>
              )}
              <div className="sm:col-span-2">
                <Label>สถานะ</Label>
                <SegmentedControl
                  className="mt-1"
                  value={f.active ? "active" : "inactive"}
                  onChange={(v) => set("active", v === "active")}
                  options={[
                    { value: "active", label: "ใช้งาน" },
                    { value: "inactive", label: "เลิกใช้" },
                  ]}
                  fullWidth
                />
              </div>

              <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5 text-xs text-gray-500 sm:col-span-2">
                กติกาส่วนลด: ราคาฐาน = กลุ่ม “ทุกคน (ราคาฐาน)” · สมาชิกที่มีแพ็กเกจได้ส่วนลดจาก
                แพ็กเกจ (ไม่ซ้อนกับราค่า fallback สมาชิก/VIP)
              </div>

              {err && (
                <p className="text-xs text-red-600 sm:col-span-2">
                  กรุณากรอกชื่อรายการและราคาให้ถูกต้อง
                </p>
              )}
            </div>
          </DialogBody>
          <DialogFooter>
            {item && (
              <Button type="button" variant="destructive" className="mr-auto" onClick={handleDelete}>
                <Trash2 className="mr-1.5 h-4 w-4" /> ลบรายการ
              </Button>
            )}
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              ยกเลิก
            </Button>
            <Button type="submit">
              <Save className="mr-1.5 h-4 w-4" /> บันทึก
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
