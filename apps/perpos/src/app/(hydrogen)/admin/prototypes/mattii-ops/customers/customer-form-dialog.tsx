"use client";

// customers/customer-form-dialog.tsx — เพิ่ม/แก้ไขลูกค้า (mock: เขียนลง client state ของหน้าลูกค้า)

import { useEffect, useState } from "react";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { CustomSelect } from "@/components/ui/custom-select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Text } from "@/components/ui/typography";
import { notify } from "@/lib/toast";
import { CHAT_CHANNEL_LABEL, CUSTOMER_TIER_LABEL } from "../_fixtures/labels";
import type { ChatChannel, CustomerTier, MattiiCustomer } from "../_fixtures/types";

export interface CustomerFormValues {
  display_name: string;
  full_name: string;
  phone: string;
  primary_channel: ChatChannel;
  tier: CustomerTier;
  address_line: string;
  subdistrict: string;
  district: string;
  province: string;
  postcode: string;
  note: string;
}

const EMPTY: CustomerFormValues = {
  display_name: "",
  full_name: "",
  phone: "",
  primary_channel: "line",
  tier: "new",
  address_line: "",
  subdistrict: "",
  district: "",
  province: "",
  postcode: "",
  note: "",
};

const CHANNEL_OPTIONS = (Object.keys(CHAT_CHANNEL_LABEL) as ChatChannel[]).map((c) => ({
  value: c as string,
  label: CHAT_CHANNEL_LABEL[c],
}));
const TIER_OPTIONS = (Object.keys(CUSTOMER_TIER_LABEL) as CustomerTier[]).map((t) => ({
  value: t as string,
  label: CUSTOMER_TIER_LABEL[t],
}));

export function CustomerFormDialog({
  open,
  editing,
  onOpenChange,
  onSubmit,
}: {
  open: boolean;
  /** null = เพิ่มลูกค้าใหม่ */
  editing: MattiiCustomer | null;
  onOpenChange: (v: boolean) => void;
  onSubmit: (values: CustomerFormValues) => void;
}) {
  const [form, setForm] = useState<CustomerFormValues>(EMPTY);
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    if (!open) return;
    setTouched(false);
    setForm(
      editing
        ? {
            display_name: editing.display_name,
            full_name: editing.full_name ?? "",
            phone: editing.phone ?? "",
            primary_channel: editing.primary_channel,
            tier: editing.tier,
            address_line: editing.address_line ?? "",
            subdistrict: editing.subdistrict ?? "",
            district: editing.district ?? "",
            province: editing.province ?? "",
            postcode: editing.postcode ?? "",
            note: editing.note ?? "",
          }
        : EMPTY,
    );
  }, [open, editing]);

  function setF<K extends keyof CustomerFormValues>(key: K, value: CustomerFormValues[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function handleSave() {
    setTouched(true);
    if (!form.display_name.trim()) {
      notify.error("กรอกชื่อที่แสดงของลูกค้าก่อนบันทึก");
      return;
    }
    onSubmit(form);
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="xl">
        <DialogHeader>
          <DialogTitle>{editing ? "แก้ไขข้อมูลลูกค้า" : "เพิ่มลูกค้าใหม่"}</DialogTitle>
        </DialogHeader>
        <DialogBody>
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="min-w-0">
                <Label htmlFor="mt-cus-name">ชื่อที่แสดง *</Label>
                <Input
                  id="mt-cus-name"
                  value={form.display_name}
                  onChange={(e) => setF("display_name", e.target.value)}
                  placeholder="เช่น ร้านกาแฟบ้านมะลิ"
                  className="mt-1"
                />
                {touched && !form.display_name.trim() && (
                  <Text className="mt-1 text-xs text-red-600">กรุณากรอกชื่อที่แสดง</Text>
                )}
              </div>
              <div className="min-w-0">
                <Label htmlFor="mt-cus-fullname">ชื่อ-นามสกุล (สำหรับจัดส่ง)</Label>
                <Input
                  id="mt-cus-fullname"
                  value={form.full_name}
                  onChange={(e) => setF("full_name", e.target.value)}
                  className="mt-1"
                />
              </div>
              <div className="min-w-0">
                <Label htmlFor="mt-cus-phone">เบอร์โทร</Label>
                <Input
                  id="mt-cus-phone"
                  value={form.phone}
                  onChange={(e) => setF("phone", e.target.value)}
                  placeholder="08x-xxx-xxxx"
                  className="mt-1"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="min-w-0">
                  <Label>ช่องทางหลัก</Label>
                  <CustomSelect
                    value={form.primary_channel}
                    onChange={(v) => setF("primary_channel", v as ChatChannel)}
                    options={CHANNEL_OPTIONS}
                    className="mt-1"
                  />
                </div>
                <div className="min-w-0">
                  <Label>ระดับลูกค้า</Label>
                  <CustomSelect
                    value={form.tier}
                    onChange={(v) => setF("tier", v as CustomerTier)}
                    options={TIER_OPTIONS}
                    className="mt-1"
                  />
                </div>
              </div>
            </div>

            <div>
              <Label htmlFor="mt-cus-addr">ที่อยู่จัดส่ง</Label>
              <Input
                id="mt-cus-addr"
                value={form.address_line}
                onChange={(e) => setF("address_line", e.target.value)}
                placeholder="บ้านเลขที่ / หมู่บ้าน / ถนน"
                className="mt-1"
              />
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
              <div className="min-w-0">
                <Label htmlFor="mt-cus-subdistrict">ตำบล/แขวง</Label>
                <Input
                  id="mt-cus-subdistrict"
                  value={form.subdistrict}
                  onChange={(e) => setF("subdistrict", e.target.value)}
                  className="mt-1"
                />
              </div>
              <div className="min-w-0">
                <Label htmlFor="mt-cus-district">อำเภอ/เขต</Label>
                <Input
                  id="mt-cus-district"
                  value={form.district}
                  onChange={(e) => setF("district", e.target.value)}
                  className="mt-1"
                />
              </div>
              <div className="min-w-0">
                <Label htmlFor="mt-cus-province">จังหวัด</Label>
                <Input
                  id="mt-cus-province"
                  value={form.province}
                  onChange={(e) => setF("province", e.target.value)}
                  className="mt-1"
                />
              </div>
              <div className="min-w-0">
                <Label htmlFor="mt-cus-postcode">รหัสไปรษณีย์</Label>
                <Input
                  id="mt-cus-postcode"
                  value={form.postcode}
                  onChange={(e) => setF("postcode", e.target.value)}
                  className="mt-1"
                />
              </div>
            </div>

            <div>
              <Label htmlFor="mt-cus-note">โน้ต</Label>
              <Input
                id="mt-cus-note"
                value={form.note}
                onChange={(e) => setF("note", e.target.value)}
                placeholder="เช่น ชอบโทนพาสเทล / เคยเคลมขอบพรม"
                className="mt-1"
              />
            </div>
          </div>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            ยกเลิก
          </Button>
          <Button onClick={handleSave}>{editing ? "บันทึกการแก้ไข" : "เพิ่มลูกค้า"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
