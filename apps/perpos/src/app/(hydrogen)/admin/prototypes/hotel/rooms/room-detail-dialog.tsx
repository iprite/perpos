"use client";

// room-detail-dialog.tsx — รายละเอียดห้อง + เปลี่ยนสถานะ (ใน dialog เท่านั้น ตาม fold §5)
// role guard: owner/manager เปลี่ยน room_status ได้ · housekeeper เปลี่ยนได้แค่ housekeeping_status
// บันทึก = mock setRoomStatus / setHkStatus → toast

import { useEffect, useState } from "react";
import { DoorOpen, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CustomSelect } from "@/components/ui/custom-select";
import { Label } from "@/components/ui/label";
import { Text } from "@/components/ui/typography";
import {
  Dialog,
  DialogContent,
  DialogBody,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "@/lib/toast";
import {
  useHotelData,
  useHotelRole,
  fmtMoney,
  resolveRoomRate,
  RoomTypeBadge,
  RoomStatusBadge,
  HkStatusBadge,
  ROOM_TYPE_LABEL,
} from "../_components";
import type { Room, RoomStatus, HousekeepingStatus } from "../_fixtures/types";

const ROOM_STATUS_OPTIONS = [
  { value: "available", label: "ว่าง" },
  { value: "occupied", label: "มีแขกพัก" },
  { value: "reserved", label: "จองแล้ว" },
  { value: "maintenance", label: "ปิดซ่อม" },
  { value: "out_of_service", label: "หยุดขาย" },
];

const HK_STATUS_OPTIONS = [
  { value: "dirty", label: "รอทำความสะอาด" },
  { value: "cleaning", label: "กำลังทำ" },
  { value: "clean", label: "สะอาด" },
  { value: "inspected", label: "ตรวจแล้ว" },
];

export function RoomDetailDialog({
  room,
  open,
  onOpenChange,
}: {
  room: Room | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const { roomTypeConfigs, setRoomStatus, setHkStatus } = useHotelData();
  const { role, can } = useHotelRole();

  // owner/manager แก้ room_status ได้ (manager rooms=view แต่ fold อนุญาตเปลี่ยนสถานะห้อง)
  const canRoomStatus = role === "owner" || role === "manager";
  // housekeeper + owner/manager แก้ hk_status ได้ (housekeeper housekeeping=write)
  const canHkStatus = can("write", "housekeeping") || canRoomStatus;

  const [roomStatus, setRoomStatusLocal] = useState<RoomStatus>("available");
  const [hkStatus, setHkStatusLocal] = useState<HousekeepingStatus>("clean");

  // hooks ต้องอยู่ก่อน early-return — sync local state เมื่อเปิด/เปลี่ยนห้อง
  useEffect(() => {
    if (room) {
      setRoomStatusLocal(room.status);
      setHkStatusLocal(room.housekeeping_status);
    }
  }, [room]);

  if (!room) return null;

  const cfg = roomTypeConfigs.find((c) => c.room_type === room.room_type);
  const dailyRate = resolveRoomRate(room, roomTypeConfigs, "daily");
  const hourlyRate = resolveRoomRate(room, roomTypeConfigs, "hourly");
  const dirty = roomStatus !== room.status || hkStatus !== room.housekeeping_status;

  function handleSave() {
    if (!room) return;
    if (canRoomStatus && roomStatus !== room.status) setRoomStatus(room.id, roomStatus);
    if (canHkStatus && hkStatus !== room.housekeeping_status) setHkStatus(room.id, hkStatus);
    toast.success(`อัปเดตสถานะห้อง ${room.room_number} แล้ว`);
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>
            <span className="flex flex-wrap items-center gap-2">
              ห้อง {room.room_number}
              <RoomTypeBadge type={room.room_type} />
            </span>
          </DialogTitle>
        </DialogHeader>
        <DialogBody>
          <div className="space-y-5">
            {/* ข้อมูลห้อง */}
            <div className="grid grid-cols-2 gap-4">
              <Field label="ประเภท" value={ROOM_TYPE_LABEL[room.room_type]} />
              <Field label="ชั้น" value={room.floor != null ? `ชั้น ${room.floor}` : "—"} />
              <Field label="รองรับ" value={cfg ? `${cfg.capacity} คน` : "—"} />
              <Field label="เตียง" value={cfg?.bed_type ?? "—"} />
              <div>
                <Text className="text-xs text-gray-400">ราคา/คืน</Text>
                <Text className="mt-0.5 font-mono text-sm font-medium tabular-nums text-gray-900">
                  {fmtMoney(dailyRate)}
                  {room.price_override != null && (
                    <span className="ml-1 text-[11px] text-amber-600">(ราคาเฉพาะห้อง)</span>
                  )}
                </Text>
              </div>
              <div>
                <Text className="text-xs text-gray-400">ราคา/ชม.</Text>
                <Text className="mt-0.5 font-mono text-sm font-medium tabular-nums text-gray-900">
                  {fmtMoney(hourlyRate)}
                </Text>
              </div>
              {room.note && <Field label="หมายเหตุ" value={room.note} />}
            </div>

            {/* สถานะปัจจุบัน */}
            <div className="flex flex-wrap items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-4 py-3">
              <Text className="text-xs text-gray-500">สถานะปัจจุบัน:</Text>
              <RoomStatusBadge status={room.status} />
              <HkStatusBadge status={room.housekeeping_status} />
            </div>

            {/* เปลี่ยนสถานะ — ตาม role */}
            <div className="space-y-4">
              <div>
                <Label htmlFor="rs-status">สถานะห้อง</Label>
                <CustomSelect
                  className="mt-1"
                  value={roomStatus}
                  onChange={(v) => setRoomStatusLocal(v as RoomStatus)}
                  options={ROOM_STATUS_OPTIONS}
                  disabled={!canRoomStatus}
                />
                {!canRoomStatus && (
                  <p className="mt-1 text-xs text-gray-400">
                    บทบาทแม่บ้านเปลี่ยนได้เฉพาะสถานะแม่บ้าน — สถานะห้องต้องเป็นผู้จัดการ/เจ้าของ
                  </p>
                )}
              </div>
              <div>
                <Label htmlFor="hk-status">สถานะแม่บ้าน (ทำความสะอาด)</Label>
                <CustomSelect
                  className="mt-1"
                  value={hkStatus}
                  onChange={(v) => setHkStatusLocal(v as HousekeepingStatus)}
                  options={HK_STATUS_OPTIONS}
                  disabled={!canHkStatus}
                />
              </div>
            </div>
          </div>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            ปิด
          </Button>
          <Button onClick={handleSave} disabled={!dirty || (!canRoomStatus && !canHkStatus)}>
            <Save className="mr-1.5 h-4 w-4" /> บันทึกสถานะ
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <Text className="text-xs text-gray-400">{label}</Text>
      <Text className="mt-0.5 text-sm font-medium text-gray-900">{value}</Text>
    </div>
  );
}
