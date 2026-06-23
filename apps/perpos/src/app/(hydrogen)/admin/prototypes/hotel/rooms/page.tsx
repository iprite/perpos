"use client";

// rooms/page.tsx — ห้อง & สถานะ (UI Plan หน้า #6)
// board/list + filter ประเภท/สถานะ + row-clickable→detail dialog (เปลี่ยนสถานะใน dialog เท่านั้น)
// gate §4.1: rooms — owner (W) · manager/viewer (V) · housekeeper (V, แก้ hk_status ใน dialog)

import { useMemo, useState } from "react";
import { DoorOpen, Search, BedDouble, CheckCircle2, Wrench } from "lucide-react";
import { Input } from "@/components/ui/input";
import { CustomSelect } from "@/components/ui/custom-select";
import { StatCard } from "@/components/ui/stat-card";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
  TableEmpty,
} from "@/components/ui/table";
import {
  HotelShell,
  useHotelRole,
  useHotelData,
  fmtMoney,
  resolveRoomRate,
  RoomTypeBadge,
  RoomStatusBadge,
  HkStatusBadge,
  ROOM_TYPE_LABEL,
} from "../_components";
import type { Room } from "../_fixtures/types";
import { RoomDetailDialog } from "./room-detail-dialog";

const TYPE_OPTIONS = [
  { value: "", label: "ทุกประเภท" },
  { value: "A", label: ROOM_TYPE_LABEL.A },
  { value: "V", label: ROOM_TYPE_LABEL.V },
  { value: "C", label: ROOM_TYPE_LABEL.C },
];

const STATUS_OPTIONS = [
  { value: "", label: "ทุกสถานะห้อง" },
  { value: "available", label: "ว่าง" },
  { value: "occupied", label: "มีแขกพัก" },
  { value: "reserved", label: "จองแล้ว" },
  { value: "maintenance", label: "ปิดซ่อม" },
  { value: "out_of_service", label: "หยุดขาย" },
];

const HK_OPTIONS = [
  { value: "", label: "ทุกสถานะแม่บ้าน" },
  { value: "dirty", label: "รอทำความสะอาด" },
  { value: "cleaning", label: "กำลังทำ" },
  { value: "clean", label: "สะอาด" },
  { value: "inspected", label: "ตรวจแล้ว" },
];

export default function RoomsPage() {
  const { can } = useHotelRole();
  const canView = can("view", "rooms"); // ทุก role = view ขึ้นไป

  const { rooms, roomTypeConfigs } = useHotelData();

  const [search, setSearch] = useState("");
  const [typeF, setTypeF] = useState("");
  const [statusF, setStatusF] = useState("");
  const [hkF, setHkF] = useState("");
  const [detail, setDetail] = useState<Room | null>(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rooms
      .filter((r) => {
        if (typeF && r.room_type !== typeF) return false;
        if (statusF && r.status !== statusF) return false;
        if (hkF && r.housekeeping_status !== hkF) return false;
        if (q && !r.room_number.toLowerCase().includes(q)) return false;
        return true;
      })
      .sort((a, b) => a.sort_order - b.sort_order);
  }, [rooms, search, typeF, statusF, hkF]);

  const kpi = useMemo(() => {
    const available = rooms.filter((r) => r.status === "available").length;
    const occupied = rooms.filter((r) => r.status === "occupied").length;
    const dirty = rooms.filter((r) => r.housekeeping_status === "dirty").length;
    const closed = rooms.filter(
      (r) => r.status === "maintenance" || r.status === "out_of_service",
    ).length;
    const occRate = rooms.length ? Math.round((occupied / rooms.length) * 100) : 0;
    return { total: rooms.length, available, occupied, dirty, closed, occRate };
  }, [rooms]);

  if (!canView) return null;

  return (
    <HotelShell
      title="ห้อง & สถานะ"
      description="ผังห้องทั้งหมด — สถานะห้องและงานแม่บ้านในมุมเดียว · คลิกห้องเพื่อจัดการสถานะ"
      icon={<DoorOpen className="h-6 w-6" />}
    >
      {/* KPI */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon={<CheckCircle2 className="h-4 w-4" />}
          label="ห้องว่าง (พร้อมขาย)"
          value={String(kpi.available)}
          sub={`จากทั้งหมด ${kpi.total} ห้อง`}
          tone="positive"
          valueColored
        />
        <StatCard
          icon={<BedDouble className="h-4 w-4" />}
          label="มีแขกพัก"
          value={String(kpi.occupied)}
          sub={`อัตราเข้าพัก ${kpi.occRate}%`}
          tone="info"
          valueColored
        />
        <StatCard
          icon={<DoorOpen className="h-4 w-4" />}
          label="รอทำความสะอาด"
          value={String(kpi.dirty)}
          tone={kpi.dirty > 0 ? "warning" : "neutral"}
          valueColored
        />
        <StatCard
          icon={<Wrench className="h-4 w-4" />}
          label="ปิดซ่อม / หยุดขาย"
          value={String(kpi.closed)}
          tone={kpi.closed > 0 ? "negative" : "neutral"}
          valueColored
        />
      </div>

      {/* filter bar */}
      <div className="rounded-xl border border-gray-200 bg-white p-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <Input
              className="pl-9"
              placeholder="ค้นหาเลขห้อง"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <CustomSelect value={typeF} onChange={setTypeF} options={TYPE_OPTIONS} />
          <CustomSelect value={statusF} onChange={setStatusF} options={STATUS_OPTIONS} />
          <CustomSelect value={hkF} onChange={setHkF} options={HK_OPTIONS} />
        </div>
      </div>

      {/* table */}
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>เลขห้อง</TableHead>
            <TableHead align="center">ประเภท</TableHead>
            <TableHead align="center">ชั้น</TableHead>
            <TableHead align="right">ราคา/คืน</TableHead>
            <TableHead align="center">สถานะห้อง</TableHead>
            <TableHead align="center">สถานะแม่บ้าน</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {filtered.length === 0 ? (
            <TableEmpty colSpan={6}>
              <div className="flex flex-col items-center gap-2 py-6">
                <DoorOpen className="h-8 w-8 text-gray-300" />
                <span>ไม่พบห้องตามเงื่อนไข</span>
              </div>
            </TableEmpty>
          ) : (
            filtered.map((r) => (
              <TableRow key={r.id} clickable onClick={() => setDetail(r)}>
                <TableCell className="font-medium text-gray-900">{r.room_number}</TableCell>
                <TableCell align="center">
                  <RoomTypeBadge type={r.room_type} />
                </TableCell>
                <TableCell align="center" className="text-gray-500">
                  {r.floor != null ? r.floor : "—"}
                </TableCell>
                <TableCell align="right" tabular>
                  {fmtMoney(resolveRoomRate(r, roomTypeConfigs, "daily"))}
                </TableCell>
                <TableCell align="center">
                  <RoomStatusBadge status={r.status} />
                </TableCell>
                <TableCell align="center">
                  <HkStatusBadge status={r.housekeeping_status} />
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>

      {/* dialog */}
      <RoomDetailDialog
        room={detail}
        open={detail !== null}
        onOpenChange={(v) => !v && setDetail(null)}
      />
    </HotelShell>
  );
}
