"use client";

// machine-dialog.tsx — เพิ่ม/แก้ไขเครื่องผลิต (mattii_machines) · mock: อัปเดต state ของหน้า settings
// 🔒 owner-only §2.3: ช่อง "ค่าเครื่องต่อชั่วโมง" (hourly_cost) แสดงเฉพาะเจ้าของ

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
import { MACHINE_KIND_LABEL, MACHINE_STATUS_LABEL } from "../_fixtures/labels";
import type { MachineKind, MachineStatus, MattiiMachine } from "../_fixtures/types";
import { useMattiiRole } from "../_components";

const KIND_OPTIONS = (Object.keys(MACHINE_KIND_LABEL) as MachineKind[]).map((k) => ({
  value: k as string,
  label: MACHINE_KIND_LABEL[k],
}));

let seq = 1;

export function MachineDialog({
  open,
  machine,
  onOpenChange,
  onSubmit,
}: {
  open: boolean;
  /** null = เพิ่มเครื่องใหม่ */
  machine: MattiiMachine | null;
  onOpenChange: (v: boolean) => void;
  onSubmit: (next: MattiiMachine, mode: "create" | "update") => void;
}) {
  const { isOwner } = useMattiiRole();

  const [code, setCode] = useState(machine?.code ?? "");
  const [name, setName] = useState(machine?.name ?? "");
  const [kind, setKind] = useState<MachineKind>(machine?.machine_kind ?? "fabric_printer");
  const [capacity, setCapacity] = useState(String(machine?.capacity_per_day ?? 40));
  const [status, setStatus] = useState<MachineStatus>(machine?.status ?? "idle");
  const [cost, setCost] = useState(String(machine?.hourly_cost ?? 150));
  const [note, setNote] = useState(machine?.note ?? "");
  const [touched, setTouched] = useState(false);

  const errors = {
    code: !code.trim() ? "กรอกรหัสเครื่อง เช่น PRN-02" : "",
    name: !name.trim() ? "กรอกชื่อเครื่อง" : "",
    capacity: Number(capacity) <= 0 ? "กำลังผลิตต่อวันต้องมากกว่า 0" : "",
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
      machine_kind: kind,
      status,
      capacity_per_day: Number(capacity),
      hourly_cost: Number(cost) || 0,
      note: note.trim() || null,
      updated_at: now,
    };

    if (machine) {
      onSubmit({ ...machine, ...base }, "update");
      notify.updated(`อัปเดตเครื่อง ${base.name} แล้ว`);
    } else {
      onSubmit(
        { id: `mac-new-${Date.now()}-${seq++}`, org_id: MOCK_ORG_ID, created_at: now, ...base },
        "create",
      );
      notify.created(`เพิ่มเครื่อง ${base.name} แล้ว`);
    }
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="xl">
        <DialogHeader>
          <DialogTitle>{machine ? "แก้ไขเครื่องผลิต" : "เพิ่มเครื่องผลิต"}</DialogTitle>
        </DialogHeader>
        <DialogBody>
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div>
                <Label htmlFor="mt-mac-code">รหัสเครื่อง *</Label>
                <Input
                  id="mt-mac-code"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  placeholder="PRN-02"
                  className="mt-1"
                />
                {touched && errors.code && (
                  <Text className="mt-1 text-xs text-red-600">{errors.code}</Text>
                )}
              </div>
              <div className="sm:col-span-2">
                <Label htmlFor="mt-mac-name">ชื่อเครื่อง *</Label>
                <Input
                  id="mt-mac-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="เช่น เครื่องพิมพ์ผ้าซับลิเมชัน หน้ากว้าง 1.6 ม."
                  className="mt-1"
                />
                {touched && errors.name && (
                  <Text className="mt-1 text-xs text-red-600">{errors.name}</Text>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div>
                <Label>ประเภทเครื่อง</Label>
                <CustomSelect
                  value={kind}
                  onChange={(v) => setKind(v as MachineKind)}
                  options={KIND_OPTIONS}
                  className="mt-1"
                />
              </div>
              <div>
                <Label htmlFor="mt-mac-cap">กำลังผลิตต่อวัน (ผืน) *</Label>
                <Input
                  id="mt-mac-cap"
                  type="number"
                  value={capacity}
                  onChange={(e) => setCapacity(e.target.value)}
                  className="mt-1"
                />
                {touched && errors.capacity && (
                  <Text className="mt-1 text-xs text-red-600">{errors.capacity}</Text>
                )}
              </div>

              {/* 🔒 owner-only — ค่าเครื่องต่อชั่วโมง (ใช้คิดต้นทุนหมวด "ค่าเครื่อง") */}
              {isOwner && (
                <div>
                  <Label htmlFor="mt-mac-cost">ค่าเครื่องต่อชั่วโมง (฿)</Label>
                  <Input
                    id="mt-mac-cost"
                    type="number"
                    value={cost}
                    onChange={(e) => setCost(e.target.value)}
                    className="mt-1"
                  />
                  <Text className="mt-1 text-xs text-gray-400">
                    ใช้คิดต้นทุนหมวดค่าเครื่องในรายงานกำไร — เห็นเฉพาะเจ้าของ
                  </Text>
                </div>
              )}
            </div>

            <div>
              <Label>สถานะเครื่อง</Label>
              <SegmentedControl
                className="mt-1"
                value={status}
                onChange={(v) => setStatus(v)}
                ariaLabel="สถานะเครื่อง"
                options={[
                  {
                    value: "idle",
                    label: MACHINE_STATUS_LABEL.idle,
                    activeClassName: "bg-green-600",
                  },
                  { value: "running", label: MACHINE_STATUS_LABEL.running },
                  {
                    value: "maintenance",
                    label: MACHINE_STATUS_LABEL.maintenance,
                    activeClassName: "bg-amber-600",
                  },
                ]}
              />
              <Text className="mt-1 text-xs text-gray-400">
                ตั้งเป็น “ซ่อมบำรุง” แล้วระบบจะไม่นับกำลังผลิตของเครื่องนี้ในคิวงาน
              </Text>
            </div>

            <div>
              <Label htmlFor="mt-mac-note">โน้ต</Label>
              <Input
                id="mt-mac-note"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="เช่น เข้าซ่อมใบมีด คาดว่ากลับมาใช้ได้พรุ่งนี้"
                className="mt-1"
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
