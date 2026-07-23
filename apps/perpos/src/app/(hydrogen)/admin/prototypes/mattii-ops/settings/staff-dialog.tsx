"use client";

// staff-dialog.tsx — เพิ่ม/แก้ไขทีมงาน (mattii_staff) · mock: อัปเดต state ของหน้า settings
// 🔒 owner-only §2.3: ช่อง "ค่าแรงต่อชั่วโมง" (hourly_rate) แสดงเฉพาะเจ้าของ

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
import { STAFF_ROLE_LABEL } from "../_fixtures/labels";
import type { MattiiStaff, StaffRole } from "../_fixtures/types";
import { useMattiiRole } from "../_components";

const ROLE_OPTIONS = (Object.keys(STAFF_ROLE_LABEL) as StaffRole[]).map((k) => ({
  value: k as string,
  label: STAFF_ROLE_LABEL[k],
}));

let seq = 1;

export function StaffDialog({
  open,
  staff,
  onOpenChange,
  onSubmit,
}: {
  open: boolean;
  /** null = เพิ่มทีมงานใหม่ */
  staff: MattiiStaff | null;
  onOpenChange: (v: boolean) => void;
  onSubmit: (next: MattiiStaff, mode: "create" | "update") => void;
}) {
  const { isOwner } = useMattiiRole();

  const [name, setName] = useState(staff?.display_name ?? "");
  const [role, setRole] = useState<StaffRole>(staff?.role ?? "sale");
  const [phone, setPhone] = useState(staff?.phone ?? "");
  const [lineId, setLineId] = useState(staff?.line_user_id ?? "");
  const [rate, setRate] = useState(String(staff?.hourly_rate ?? 130));
  const [status, setStatus] = useState(staff ? (staff.is_active ? "on" : "off") : "on");
  const [touched, setTouched] = useState(false);

  const errors = {
    name: !name.trim() ? "กรอกชื่อทีมงาน" : "",
    rate: isOwner && Number(rate) < 0 ? "ค่าแรงต้องไม่ติดลบ" : "",
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
      display_name: name.trim(),
      role,
      phone: phone.trim() || null,
      line_user_id: lineId.trim() || null,
      hourly_rate: Number(rate) || 0,
      is_active: status === "on",
      updated_at: now,
    };

    if (staff) {
      onSubmit({ ...staff, ...base }, "update");
      notify.updated(`อัปเดตข้อมูล ${base.display_name} แล้ว`);
    } else {
      onSubmit(
        {
          id: `stf-new-${Date.now()}-${seq++}`,
          org_id: MOCK_ORG_ID,
          profile_id: null,
          created_at: now,
          ...base,
        },
        "create",
      );
      notify.created(`เพิ่ม ${base.display_name} เข้าทีมแล้ว`);
    }
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>{staff ? "แก้ไขข้อมูลทีมงาน" : "เพิ่มทีมงาน"}</DialogTitle>
        </DialogHeader>
        <DialogBody>
          <div className="space-y-4">
            <div>
              <Label htmlFor="mt-stf-name">ชื่อ-สกุล *</Label>
              <Input
                id="mt-stf-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="เช่น พิมพ์ใจ สายชล"
                className="mt-1"
              />
              {touched && errors.name && (
                <Text className="mt-1 text-xs text-red-600">{errors.name}</Text>
              )}
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <Label>บทบาทในระบบ</Label>
                <CustomSelect
                  value={role}
                  onChange={(v) => setRole(v as StaffRole)}
                  options={ROLE_OPTIONS}
                  className="mt-1"
                />
                <Text className="mt-1 text-xs text-gray-400">
                  บทบาทกำหนดว่าเห็นเมนูไหนและแก้ไขอะไรได้ — ต้นทุน/กำไรเห็นเฉพาะเจ้าของ
                </Text>
              </div>
              <div>
                <Label htmlFor="mt-stf-phone">เบอร์โทร</Label>
                <Input
                  id="mt-stf-phone"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="081-234-5678"
                  className="mt-1"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="mt-stf-line">รหัสผู้ใช้ LINE (สำหรับแจ้งเตือนรายคน)</Label>
                <Input
                  id="mt-stf-line"
                  value={lineId}
                  onChange={(e) => setLineId(e.target.value)}
                  placeholder="ได้จากการพิมพ์ /link ในแชทกับบอท"
                  className="mt-1"
                />
                <Text className="mt-1 text-xs text-gray-400">
                  ไม่ผูก LINE = ยังใช้งานเว็บได้ แต่จะไม่ได้รับแจ้งเตือน
                </Text>
              </div>

              {/* 🔒 owner-only — ค่าแรงต่อชั่วโมง (ใช้คิดต้นทุนค่าแรงของออเดอร์) */}
              {isOwner && (
                <div>
                  <Label htmlFor="mt-stf-rate">ค่าแรงต่อชั่วโมง (฿)</Label>
                  <Input
                    id="mt-stf-rate"
                    type="number"
                    value={rate}
                    onChange={(e) => setRate(e.target.value)}
                    className="mt-1"
                  />
                  {touched && errors.rate && (
                    <Text className="mt-1 text-xs text-red-600">{errors.rate}</Text>
                  )}
                  <Text className="mt-1 text-xs text-gray-400">
                    ใช้คิดต้นทุนค่าแรงในรายงานกำไร — เห็นเฉพาะเจ้าของ
                  </Text>
                </div>
              )}
            </div>

            <div>
              <Label>สถานะการใช้งาน</Label>
              <SegmentedControl
                className="mt-1"
                value={status}
                onChange={setStatus}
                ariaLabel="สถานะการใช้งานของทีมงาน"
                options={[
                  { value: "on", label: "ใช้งานอยู่", activeClassName: "bg-green-600" },
                  { value: "off", label: "ปิดใช้งาน" },
                ]}
              />
              <Text className="mt-1 text-xs text-gray-400">
                ปิดใช้งานแทนการลบ — ประวัติงานเดิมของคนนี้ยังอยู่ครบ
              </Text>
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
