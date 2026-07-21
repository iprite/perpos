"use client";

// room-board.tsx — ผัง room board (A/V/C × สถานะ) แบบกดทำงานได้
// ห้องว่าง → คลิกเปิด BookingDialog (prefill ห้อง) · ห้องมีแขก/จอง → คลิกเปิด BookingDetailDialog
// ปิดซ่อม/หยุดขาย = กดไม่ได้ (disabled visual) · สีบอกสถานะ ≤4 โทน (จาก palette token)

import { DoorOpen, BedDouble, Wrench, Ban, Clock } from "lucide-react";
import cn from "@core/utils/class-names";
import { Text } from "@/components/ui/typography";
import { useHotelData } from "./data-context";
import { activeBookingForRoom } from "./booking-helpers";
import { TODAY_ISO } from "./format";
import { ROOM_TYPE_LABEL } from "./badges";
import type { Booking, Room, RoomType } from "../_fixtures/types";

const TYPE_ORDER: RoomType[] = ["A", "V", "C"];

// สถานะที่ใช้แสดง (รวม booking สด): available / occupied / reserved / maintenance / out_of_service
type Display = "available" | "occupied" | "reserved" | "maintenance" | "out_of_service";

const CELL: Record<Display, { box: string; dot: string; label: string }> = {
  available: {
    box: "border-green-200 bg-green-50 hover:border-green-400 hover:bg-green-100 text-green-800",
    dot: "bg-green-500",
    label: "ว่าง",
  },
  occupied: {
    box: "border-blue-200 bg-blue-50 hover:border-blue-400 text-blue-800",
    dot: "bg-blue-500",
    label: "มีแขก",
  },
  reserved: {
    box: "border-amber-200 bg-amber-50 hover:border-amber-400 text-amber-800",
    dot: "bg-amber-500",
    label: "จองแล้ว",
  },
  maintenance: {
    box: "border-gray-200 bg-gray-50 text-gray-400 cursor-not-allowed",
    dot: "bg-gray-300",
    label: "ปิดซ่อม",
  },
  out_of_service: {
    box: "border-gray-200 bg-gray-50 text-gray-400 cursor-not-allowed",
    dot: "bg-gray-300",
    label: "หยุดขาย",
  },
};

function displayStatus(room: Room, activeBooking: Booking | null): Display {
  if (room.status === "maintenance") return "maintenance";
  if (room.status === "out_of_service") return "out_of_service";
  if (activeBooking?.status === "checked_in") return "occupied";
  if (activeBooking?.status === "reserved") return "reserved";
  if (room.status === "occupied") return "occupied";
  if (room.status === "reserved") return "reserved";
  return "available";
}

export function RoomBoard({
  onBookRoom,
  onOpenBooking,
}: {
  /** คลิกห้องว่าง → เปิดฟอร์มจอง (prefill ห้อง) */
  onBookRoom: (roomId: string) => void;
  /** คลิกห้องที่มี booking → เปิด detail */
  onOpenBooking: (booking: Booking) => void;
}) {
  const { rooms, bookings } = useHotelData();

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 sm:p-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <DoorOpen className="h-5 w-5 text-gray-400" />
          <Text className="text-base font-medium text-gray-900">ผังห้องวันนี้</Text>
        </div>
        <Legend />
      </div>

      <div className="space-y-4">
        {TYPE_ORDER.map((type) => {
          const list = rooms
            .filter((r) => r.room_type === type)
            .sort((a, b) => a.sort_order - b.sort_order);
          if (list.length === 0) return null;
          return (
            <div key={type}>
              <Text className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">
                ห้อง {ROOM_TYPE_LABEL[type]} ({list.length})
              </Text>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
                {list.map((room) => {
                  const active = activeBookingForRoom(room.id, bookings, TODAY_ISO);
                  const ds = displayStatus(room, active);
                  const meta = CELL[ds];
                  const locked = ds === "maintenance" || ds === "out_of_service";
                  const open = () => {
                    if (locked) return;
                    if (active) onOpenBooking(active);
                    else onBookRoom(room.id);
                  };
                  return (
                    <div
                      key={room.id}
                      role={locked ? undefined : "button"}
                      tabIndex={locked ? undefined : 0}
                      onClick={open}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          open();
                        }
                      }}
                      className={cn(
                        "flex flex-col gap-1 rounded-lg border p-2.5 text-left transition-colors duration-150",
                        meta.box,
                        !locked && "cursor-pointer",
                      )}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-semibold">{room.room_number}</span>
                        <StatusIcon ds={ds} />
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className={cn("h-1.5 w-1.5 rounded-full", meta.dot)} />
                        <span className="truncate text-[11px]">
                          {active ? active.guest_name : meta.label}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function StatusIcon({ ds }: { ds: Display }) {
  if (ds === "occupied") return <BedDouble className="h-3.5 w-3.5" />;
  if (ds === "reserved") return <Clock className="h-3.5 w-3.5" />;
  if (ds === "maintenance") return <Wrench className="h-3.5 w-3.5" />;
  if (ds === "out_of_service") return <Ban className="h-3.5 w-3.5" />;
  return <DoorOpen className="h-3.5 w-3.5" />;
}

function Legend() {
  const items: { ds: Display; label: string }[] = [
    { ds: "available", label: "ว่าง" },
    { ds: "occupied", label: "มีแขก" },
    { ds: "reserved", label: "จองแล้ว" },
    { ds: "maintenance", label: "ปิดซ่อม/หยุดขาย" },
  ];
  return (
    <div className="flex flex-wrap items-center gap-3">
      {items.map((it) => (
        <span key={it.ds} className="flex items-center gap-1.5 text-[11px] text-gray-500">
          <span className={cn("h-2 w-2 rounded-full", CELL[it.ds].dot)} />
          {it.label}
        </span>
      ))}
    </div>
  );
}
