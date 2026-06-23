"use client";

// room-types/page.tsx — ตั้งค่าประเภท/ราคา A/V/C (UI Plan หน้า #7)
// config 3 ประเภทคงที่ (GET/PATCH เท่านั้น — ไม่เพิ่ม/ลบประเภท) + role guard (เฉพาะ owner แก้)
// gate §4.1: room_type_config — owner (W) · manager/viewer (V) · housekeeper (none)

import { useState } from "react";
import { Tag, Pencil, Users2, BedDouble, DoorClosed } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/typography";
import {
  HotelShell,
  useHotelRole,
  useHotelData,
  fmtMoney,
  RoomTypeBadge,
  NoAccess,
} from "../_components";
import type { RoomTypeConfig } from "../_fixtures/types";
import { RoomTypeEditDialog } from "./edit-dialog";

export default function RoomTypesPage() {
  const { can } = useHotelRole();
  const canView = can("view", "room_type_config");
  const canWrite = can("write", "room_type_config"); // owner เท่านั้น

  const { roomTypeConfigs } = useHotelData();
  const [edit, setEdit] = useState<RoomTypeConfig | null>(null);

  if (!canView)
    return (
      <NoAccess title="ตั้งค่าประเภท/ราคา A/V/C" icon={<Tag className="h-6 w-6" />}>
        บทบาทแม่บ้านไม่สามารถดูการตั้งค่าประเภทห้องได้ — ลองสลับเป็นผู้จัดการ/เจ้าของ
      </NoAccess>
    );

  const sorted = [...roomTypeConfigs].sort((a, b) => a.room_type.localeCompare(b.room_type));

  return (
    <HotelShell
      title="ตั้งค่าประเภท/ราคา A/V/C"
      description="กำหนดราคามาตรฐานและรายละเอียดของแต่ละประเภทห้อง — ราคานี้ใช้คิดค่าห้องอัตโนมัติเวลาจอง"
      icon={<Tag className="h-6 w-6" />}
    >
      {!canWrite && (
        <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-500">
          ดูอย่างเดียว — การแก้ราคา/ประเภทห้องสงวนไว้สำหรับเจ้าของกิจการ
          (ลองสลับเป็นเจ้าของเพื่อแก้)
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {sorted.map((cfg) => (
          <div
            key={cfg.id}
            className="flex flex-col rounded-xl border border-gray-200 bg-white p-5 shadow-sm"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <RoomTypeBadge type={cfg.room_type} />
                </div>
                <Text className="mt-2 text-base font-medium text-gray-900">{cfg.label}</Text>
              </div>
              {canWrite && (
                <Button size="icon" variant="ghost" onClick={() => setEdit(cfg)} aria-label="แก้ไข">
                  <Pencil className="h-4 w-4" />
                </Button>
              )}
            </div>

            {/* ราคา */}
            <div className="mt-4 grid grid-cols-2 gap-3">
              <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2">
                <Text className="text-xs text-gray-500">ราคา/คืน</Text>
                <Text className="mt-0.5 font-mono text-lg font-semibold tabular-nums text-gray-900">
                  {fmtMoney(cfg.base_price_daily)}
                </Text>
              </div>
              <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2">
                <Text className="text-xs text-gray-500">ราคา/ชม.</Text>
                <Text className="mt-0.5 font-mono text-lg font-semibold tabular-nums text-gray-900">
                  {cfg.base_price_hourly != null ? fmtMoney(cfg.base_price_hourly) : "—"}
                </Text>
              </div>
            </div>

            {/* รายละเอียด */}
            <div className="mt-4 space-y-2 text-sm text-gray-600">
              <InfoRow
                icon={<Users2 className="h-4 w-4" />}
                label="รองรับ"
                value={`${cfg.capacity} คน`}
              />
              <InfoRow
                icon={<BedDouble className="h-4 w-4" />}
                label="เตียง"
                value={cfg.bed_type ?? "—"}
              />
              <InfoRow
                icon={<DoorClosed className="h-4 w-4" />}
                label="จำนวนห้อง"
                value={`${cfg.room_count} ห้อง`}
              />
            </div>

            {cfg.description && (
              <Text className="mt-4 border-t border-gray-100 pt-3 text-xs leading-relaxed text-gray-500">
                {cfg.description}
              </Text>
            )}
          </div>
        ))}
      </div>

      <RoomTypeEditDialog
        config={edit}
        open={edit !== null}
        onOpenChange={(v) => !v && setEdit(null)}
      />
    </HotelShell>
  );
}

function InfoRow({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="flex items-center gap-2 text-gray-500">
        <span className="text-gray-400">{icon}</span>
        {label}
      </span>
      <span className="font-medium text-gray-700">{value}</span>
    </div>
  );
}
