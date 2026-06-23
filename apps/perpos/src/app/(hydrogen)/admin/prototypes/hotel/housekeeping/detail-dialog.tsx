"use client";

// detail-dialog.tsx — รายละเอียดงานแม่บ้าน + เปลี่ยน hk_status + มอบหมาย (ใน dialog, ไม่ inline ในแถว)
// ตาม fold §9: housekeeper เปลี่ยนสถานะได้ใน dialog · sync ห้อง+ห้องผ่าน setHkStatus

import { useState } from "react";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Text } from "@/components/ui/typography";
import { CustomSelect } from "@/components/ui/custom-select";
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
  fmtDateTH,
  fmtDateTimeTH,
  HkStatusBadge,
  RoomTypeBadge,
  hkStatusMeta,
} from "../_components";
import { assigneeLabel } from "./page";
import type { HousekeepingTask, HousekeepingStatus } from "../_fixtures/types";

const STATUS_FLOW: { value: HousekeepingStatus; label: string }[] = [
  { value: "dirty", label: "รอทำความสะอาด" },
  { value: "cleaning", label: "กำลังทำ" },
  { value: "clean", label: "สะอาด (รอตรวจ)" },
  { value: "inspected", label: "ตรวจแล้ว พร้อมขาย" },
];

const ASSIGNEE_OPTIONS = [
  { value: "", label: "ยังไม่มอบหมาย" },
  { value: "staff-hk-001", label: "พี่นวล (แม่บ้าน)" },
  { value: "staff-hk-002", label: "พี่แดง (แม่บ้าน)" },
];

export function HousekeepingDetailDialog({
  task,
  open,
  onOpenChange,
  canWrite,
}: {
  task: HousekeepingTask | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  canWrite: boolean;
}) {
  const { rooms, setHkStatus, updateHkTask } = useHotelData();

  const [status, setStatus] = useState<HousekeepingStatus>("dirty");
  const [assignee, setAssignee] = useState("");

  // reset เมื่อเปิดงานใหม่
  const key = `${open}-${task?.id}`;
  const [lastKey, setLastKey] = useState(key);
  if (open && task && key !== lastKey) {
    setLastKey(key);
    setStatus(task.status);
    setAssignee(task.assigned_to ?? "");
  }

  if (!task) return null;

  const room = rooms.find((r) => r.id === task.room_id);
  const dirty = status !== task.status || assignee !== (task.assigned_to ?? "");

  function handleSave() {
    if (!task) return;
    // อัปเดตงาน + sync ห้อง (setHkStatus คุม room.housekeeping_status + completed/started)
    if (status !== task.status) {
      setHkStatus(task.room_id, status);
    }
    updateHkTask(task.id, {
      status,
      assigned_to: assignee || null,
    });
    toast.success(
      `${room?.room_number ?? "ห้อง"} → ${hkStatusMeta(status).label}${
        assignee ? ` · มอบหมาย ${assigneeLabel(assignee)}` : ""
      }`,
    );
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>
            <span className="flex flex-wrap items-center gap-2">
              <Sparkles className="h-5 w-5 text-gray-400" />
              งานแม่บ้าน — {room?.room_number ?? "—"}
              {room && <RoomTypeBadge type={room.room_type} />}
            </span>
          </DialogTitle>
        </DialogHeader>
        <DialogBody>
          <div className="space-y-5">
            {/* สถานะปัจจุบัน */}
            <div className="flex flex-wrap items-center gap-4 rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-sm">
              <div>
                <Text className="text-xs text-gray-400">สถานะปัจจุบัน</Text>
                <div className="mt-1">
                  <HkStatusBadge status={task.status} />
                </div>
              </div>
              <div>
                <Text className="text-xs text-gray-400">วันที่งาน</Text>
                <Text className="mt-0.5 text-sm font-medium text-gray-900">
                  {fmtDateTH(task.task_date)}
                </Text>
              </div>
              <div>
                <Text className="text-xs text-gray-400">มอบหมายให้</Text>
                <Text className="mt-0.5 text-sm font-medium text-gray-900">
                  {task.assigned_to ? assigneeLabel(task.assigned_to) : "ยังไม่มอบหมาย"}
                </Text>
              </div>
            </div>

            {task.note && (
              <div>
                <Text className="text-xs text-gray-400">หมายเหตุ</Text>
                <Text className="mt-0.5 text-sm text-gray-700">{task.note}</Text>
              </div>
            )}

            {/* timeline */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <Text className="text-xs text-gray-400">เริ่มทำความสะอาด</Text>
                <Text className="mt-0.5 text-sm text-gray-700">
                  {task.started_at ? fmtDateTimeTH(task.started_at) : "—"}
                </Text>
              </div>
              <div>
                <Text className="text-xs text-gray-400">เสร็จ/ตรวจเมื่อ</Text>
                <Text className="mt-0.5 text-sm text-gray-700">
                  {task.completed_at ? fmtDateTimeTH(task.completed_at) : "—"}
                </Text>
              </div>
            </div>

            {/* แก้สถานะ + มอบหมาย */}
            {canWrite ? (
              <div className="space-y-4 rounded-lg border border-gray-200 p-4">
                <Text className="text-sm font-medium text-gray-900">อัปเดตงาน</Text>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <Label htmlFor="hk-status">เปลี่ยนสถานะ</Label>
                    <CustomSelect
                      className="mt-1"
                      value={status}
                      onChange={(v) => setStatus(v as HousekeepingStatus)}
                      options={STATUS_FLOW}
                    />
                  </div>
                  <div>
                    <Label htmlFor="hk-assignee">มอบหมายให้</Label>
                    <CustomSelect
                      className="mt-1"
                      value={assignee}
                      onChange={setAssignee}
                      options={ASSIGNEE_OPTIONS}
                    />
                  </div>
                </div>
              </div>
            ) : (
              <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-3 text-sm text-gray-500">
                บทบาทนี้ดูได้อย่างเดียว — ไม่สามารถแก้ไขสถานะงาน
              </div>
            )}
          </div>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            ปิด
          </Button>
          {canWrite && (
            <Button onClick={handleSave} disabled={!dirty}>
              บันทึก
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
