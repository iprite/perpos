"use client";

// housekeeping/page.tsx — แม่บ้าน — task list ตามสถานะ + filter + detail dialog เปลี่ยน hk_status/มอบหมาย
// gate §4.1: housekeeping — owner/manager/housekeeper (W) · viewer (V)

import { useMemo, useState } from "react";
import { Sparkles, Search, Brush, CheckCircle2, Clock } from "lucide-react";
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
  fmtDateTH,
  fmtDateTimeTH,
  HkStatusBadge,
  RoomTypeBadge,
  NoAccess,
} from "../_components";
import { HousekeepingDetailDialog } from "./detail-dialog";
import type { HousekeepingTask, HousekeepingStatus } from "../_fixtures/types";

const STATUS_OPTIONS = [
  { value: "", label: "ทุกสถานะ" },
  { value: "dirty", label: "รอทำความสะอาด" },
  { value: "cleaning", label: "กำลังทำ" },
  { value: "clean", label: "สะอาด (รอตรวจ)" },
  { value: "inspected", label: "ตรวจแล้ว" },
];

const DATE_OPTIONS = [
  { value: "today", label: "เฉพาะวันนี้" },
  { value: "all", label: "ทั้งหมด" },
];

const TODAY = "2026-06-23";

export default function HousekeepingPage() {
  const { can } = useHotelRole();
  const canView = can("view", "housekeeping");
  const canWrite = can("write", "housekeeping");

  const { rooms, housekeeping } = useHotelData();

  const [search, setSearch] = useState("");
  const [statusF, setStatusF] = useState("");
  const [dateF, setDateF] = useState("today");
  const [detail, setDetail] = useState<HousekeepingTask | null>(null);

  const roomOf = (id: string) => rooms.find((r) => r.id === id);

  // ── filter (ทำงานจริง) ──
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const findRoom = (id: string) => rooms.find((r) => r.id === id);
    return housekeeping
      .filter((t) => {
        if (statusF && t.status !== statusF) return false;
        if (dateF === "today" && t.task_date !== TODAY) return false;
        if (q) {
          const r = findRoom(t.room_id);
          const hay = `${r?.room_number ?? ""} ${t.note ?? ""}`.toLowerCase();
          if (!hay.includes(q)) return false;
        }
        return true;
      })
      .sort((a, b) => {
        // เรียง dirty→cleaning→clean→inspected (งานเร่งด่วนขึ้นก่อน)
        const order: Record<HousekeepingStatus, number> = {
          dirty: 0,
          cleaning: 1,
          clean: 2,
          inspected: 3,
        };
        const d = order[a.status] - order[b.status];
        if (d !== 0) return d;
        return (findRoom(a.room_id)?.room_number ?? "").localeCompare(
          findRoom(b.room_id)?.room_number ?? "",
        );
      });
  }, [housekeeping, rooms, search, statusF, dateF]);

  // ── KPI (เฉพาะวันนี้) ──
  const kpi = useMemo(() => {
    const today = housekeeping.filter((t) => t.task_date === TODAY);
    const count = (s: HousekeepingStatus) => today.filter((t) => t.status === s).length;
    return {
      dirty: count("dirty"),
      cleaning: count("cleaning"),
      clean: count("clean"),
      inspected: count("inspected"),
    };
  }, [housekeeping]);

  if (!canView)
    return (
      <NoAccess title="แม่บ้าน" icon={<Sparkles className="h-6 w-6" />}>
        บทบาทนี้ไม่สามารถดูงานแม่บ้านได้
      </NoAccess>
    );

  return (
    <HotelShell
      title="แม่บ้าน"
      description="งานทำความสะอาดห้องพักวันนี้ — มอบหมาย ติดตาม และอัปเดตสถานะ"
      icon={<Sparkles className="h-6 w-6" />}
    >
      {/* KPI */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          icon={<Brush className="h-4 w-4" />}
          label="รอทำความสะอาด"
          value={String(kpi.dirty)}
          tone="negative"
          valueColored
        />
        <StatCard
          icon={<Clock className="h-4 w-4" />}
          label="กำลังทำ"
          value={String(kpi.cleaning)}
          tone="warning"
          valueColored
        />
        <StatCard
          icon={<Sparkles className="h-4 w-4" />}
          label="สะอาด (รอตรวจ)"
          value={String(kpi.clean)}
          tone="info"
          valueColored
        />
        <StatCard
          icon={<CheckCircle2 className="h-4 w-4" />}
          label="ตรวจแล้ว พร้อมขาย"
          value={String(kpi.inspected)}
          tone="positive"
          valueColored
        />
      </div>

      {/* filter bar */}
      <div className="rounded-xl border border-gray-200 bg-white p-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <Input
              className="pl-9"
              placeholder="ค้นหา เลขห้อง / หมายเหตุ"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <CustomSelect value={statusF} onChange={setStatusF} options={STATUS_OPTIONS} />
          <CustomSelect value={dateF} onChange={setDateF} options={DATE_OPTIONS} />
        </div>
      </div>

      {/* task table */}
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>ห้อง</TableHead>
            <TableHead>วันที่งาน</TableHead>
            <TableHead align="center">สถานะ</TableHead>
            <TableHead>มอบหมายให้</TableHead>
            <TableHead>หมายเหตุ</TableHead>
            <TableHead>อัปเดตล่าสุด</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {filtered.length === 0 ? (
            <TableEmpty colSpan={6}>
              <div className="flex flex-col items-center gap-2 py-6">
                <Sparkles className="h-8 w-8 text-gray-300" />
                <span>ไม่พบงานแม่บ้านตามเงื่อนไข</span>
                <span className="text-xs text-gray-400">
                  งานจะถูกสร้างอัตโนมัติเมื่อมีแขกเช็คเอาท์
                </span>
              </div>
            </TableEmpty>
          ) : (
            filtered.map((t) => {
              const r = roomOf(t.room_id);
              return (
                <TableRow key={t.id} clickable onClick={() => setDetail(t)}>
                  <TableCell>
                    <span className="flex items-center gap-2">
                      <span className="font-medium text-gray-900">{r?.room_number ?? "—"}</span>
                      {r && <RoomTypeBadge type={r.room_type} />}
                    </span>
                  </TableCell>
                  <TableCell className="text-gray-500">{fmtDateTH(t.task_date)}</TableCell>
                  <TableCell align="center">
                    <HkStatusBadge status={t.status} />
                  </TableCell>
                  <TableCell className={t.assigned_to ? "" : "text-gray-400"}>
                    {t.assigned_to ? assigneeLabel(t.assigned_to) : "ยังไม่มอบหมาย"}
                  </TableCell>
                  <TableCell wrap className="max-w-xs text-gray-500">
                    {t.note ?? "—"}
                  </TableCell>
                  <TableCell className="text-gray-400">{fmtDateTimeTH(t.updated_at)}</TableCell>
                </TableRow>
              );
            })
          )}
        </TableBody>
      </Table>

      <HousekeepingDetailDialog
        task={detail}
        open={detail !== null}
        onOpenChange={(v) => !v && setDetail(null)}
        canWrite={canWrite}
      />
    </HotelShell>
  );
}

/** map staff id → label ไทย (mock) */
export function assigneeLabel(id: string): string {
  const map: Record<string, string> = {
    "staff-hk-001": "พี่นวล (แม่บ้าน)",
    "staff-hk-002": "พี่แดง (แม่บ้าน)",
  };
  return map[id] ?? id;
}
