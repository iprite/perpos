"use client";

// product-form-dialog.tsx — เพิ่ม/แก้ไข "แบบพรม" (mock: อัปเดต state ของหน้า products)
// ไม่มีข้อมูลต้นทุนในฟอร์มนี้ (ต้นทุนอยู่ระดับ "ขนาด" = base_cost 🔒 ใน size-dialog)

import { useState } from "react";
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
import { SegmentedControl } from "@/components/ui/segmented";
import { Text } from "@/components/ui/typography";
import { notify } from "@/lib/toast";
import { MOCK_ORG_ID } from "../_fixtures/helpers";
import { EDGE_FINISH_LABEL, RUG_CATEGORY_LABEL } from "../_fixtures/labels";
import type { EdgeFinish, MattiiProduct, RugCategory } from "../_fixtures/types";

const CATEGORY_OPTIONS = (Object.keys(RUG_CATEGORY_LABEL) as RugCategory[]).map((k) => ({
  value: k as string,
  label: RUG_CATEGORY_LABEL[k],
}));
const EDGE_OPTIONS = (Object.keys(EDGE_FINISH_LABEL) as EdgeFinish[]).map((k) => ({
  value: k as string,
  label: EDGE_FINISH_LABEL[k],
}));

let seq = 1;

export function ProductFormDialog({
  open,
  product,
  onOpenChange,
  onSubmit,
}: {
  open: boolean;
  /** null = เพิ่มแบบพรมใหม่ */
  product: MattiiProduct | null;
  onOpenChange: (v: boolean) => void;
  onSubmit: (next: MattiiProduct, mode: "create" | "update") => void;
}) {
  const [code, setCode] = useState(product?.code ?? "");
  const [name, setName] = useState(product?.name ?? "");
  const [category, setCategory] = useState<RugCategory>(product?.category ?? "doormat");
  const [fabric, setFabric] = useState(product?.fabric_type ?? "");
  const [backing, setBacking] = useState(product?.backing_type ?? "");
  const [edge, setEdge] = useState<EdgeFinish>(product?.edge_finish ?? "overlock");
  const [leadTime, setLeadTime] = useState(String(product?.default_lead_time_days ?? 3));
  const [note, setNote] = useState(product?.note ?? "");
  const [status, setStatus] = useState(product ? (product.is_active ? "on" : "off") : "on");
  const [touched, setTouched] = useState(false);

  const errors = {
    code: !code.trim() ? "กรอกรหัสแบบพรม เช่น RUG-DM-02" : "",
    name: !name.trim() ? "กรอกชื่อแบบพรม" : "",
    fabric: !fabric.trim() ? "ระบุวัสดุหน้าพรม" : "",
    leadTime: Number(leadTime) <= 0 ? "เวลาผลิตต้องมากกว่า 0 วัน" : "",
  };
  const invalid = Object.values(errors).some(Boolean);

  function handleSave() {
    setTouched(true);
    if (invalid) {
      notify.error("กรอกข้อมูลให้ครบก่อนบันทึก");
      return;
    }
    const now = new Date().toISOString();
    const base = {
      code: code.trim().toUpperCase(),
      name: name.trim(),
      category,
      fabric_type: fabric.trim(),
      backing_type: backing.trim() || null,
      edge_finish: edge,
      default_lead_time_days: Number(leadTime),
      note: note.trim() || null,
      is_active: status === "on",
      updated_at: now,
    };

    if (product) {
      onSubmit({ ...product, ...base }, "update");
      notify.updated(`อัปเดตแบบพรม ${base.name} แล้ว`);
    } else {
      onSubmit(
        {
          id: `prd-new-${Date.now()}-${seq++}`,
          org_id: MOCK_ORG_ID,
          print_method: "sublimation",
          option_schema: [],
          image_url: null,
          created_at: now,
          ...base,
        },
        "create",
      );
      notify.created(`เพิ่มแบบพรม ${base.name} แล้ว — ตั้งขนาด/ราคาต่อได้เลย`);
    }
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="xl">
        <DialogHeader>
          <DialogTitle>{product ? "แก้ไขแบบพรม" : "เพิ่มแบบพรม"}</DialogTitle>
        </DialogHeader>
        <DialogBody>
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div>
                <Label htmlFor="mt-prd-code">รหัส *</Label>
                <Input
                  id="mt-prd-code"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  placeholder="RUG-DM-02"
                  className="mt-1"
                />
                {touched && errors.code && (
                  <Text className="mt-1 text-xs text-red-600">{errors.code}</Text>
                )}
              </div>
              <div className="sm:col-span-2">
                <Label htmlFor="mt-prd-name">ชื่อแบบพรม *</Label>
                <Input
                  id="mt-prd-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="เช่น พรมเช็ดเท้ากำมะหยี่ พิมพ์ลายเต็มผืน"
                  className="mt-1"
                />
                {touched && errors.name && (
                  <Text className="mt-1 text-xs text-red-600">{errors.name}</Text>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <Label>ประเภทพรม</Label>
                <CustomSelect
                  value={category}
                  onChange={(v) => setCategory(v as RugCategory)}
                  options={CATEGORY_OPTIONS}
                  className="mt-1"
                />
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

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div>
                <Label htmlFor="mt-prd-fabric">วัสดุหน้าพรม *</Label>
                <Input
                  id="mt-prd-fabric"
                  value={fabric}
                  onChange={(e) => setFabric(e.target.value)}
                  placeholder="เช่น กำมะหยี่ (velvet)"
                  className="mt-1"
                />
                {touched && errors.fabric && (
                  <Text className="mt-1 text-xs text-red-600">{errors.fabric}</Text>
                )}
              </div>
              <div>
                <Label htmlFor="mt-prd-backing">ยางรองหลัง</Label>
                <Input
                  id="mt-prd-backing"
                  value={backing}
                  onChange={(e) => setBacking(e.target.value)}
                  placeholder="เช่น ยางกันลื่น PVC"
                  className="mt-1"
                />
              </div>
              <div>
                <Label htmlFor="mt-prd-lead">เวลาผลิตมาตรฐาน (วัน) *</Label>
                <Input
                  id="mt-prd-lead"
                  type="number"
                  value={leadTime}
                  onChange={(e) => setLeadTime(e.target.value)}
                  className="mt-1"
                />
                {touched && errors.leadTime && (
                  <Text className="mt-1 text-xs text-red-600">{errors.leadTime}</Text>
                )}
              </div>
            </div>

            <div>
              <Label htmlFor="mt-prd-note">โน้ตภายใน</Label>
              <Input
                id="mt-prd-note"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="เช่น แบบขายดี ลูกค้าส่งลายเองเป็นส่วนใหญ่"
                className="mt-1"
              />
            </div>

            <div>
              <Label>สถานะการขาย</Label>
              <SegmentedControl
                className="mt-1"
                value={status}
                onChange={setStatus}
                ariaLabel="สถานะการขาย"
                options={[
                  { value: "on", label: "เปิดขาย", activeClassName: "bg-green-600" },
                  { value: "off", label: "ปิดขาย" },
                ]}
              />
            </div>
          </div>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            ยกเลิก
          </Button>
          <Button onClick={handleSave}>บันทึก</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
