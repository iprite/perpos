"use client";

// guests/page.tsx — ทะเบียนแขก (UI Plan หน้า #5)
// list + filter/search + row-clickable→detail (ประวัติเข้าพัก) + เพิ่มแขก + KPI "แขกประจำ"
// gate §4.1: guests — owner/manager (W) · viewer (V) · housekeeper (none)

import { useMemo, useState } from "react";
import { Users, UserPlus, Search, Repeat, Globe } from "lucide-react";
import { Button } from "@/components/ui/button";
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
import { HotelShell, useHotelRole, useHotelData, NoAccess } from "../_components";
import type { Guest } from "../_fixtures/types";
import { GuestDetailDialog, GuestFormDialog, stayCountOf } from "./guest-dialogs";

const NAT_FILTER = [
  { value: "", label: "ทุกสัญชาติ" },
  { value: "Thai", label: "ไทย" },
  { value: "foreign", label: "ต่างชาติ" },
];

const TYPE_FILTER = [
  { value: "", label: "แขกทั้งหมด" },
  { value: "regular", label: "แขกประจำ (≥2 ครั้ง)" },
  { value: "new", label: "แขกใหม่ / ครั้งแรก" },
];

export default function GuestsPage() {
  const { can } = useHotelRole();
  const canView = can("view", "guests");
  const canWrite = can("write", "guests");

  const { guests, bookings } = useHotelData();

  const [search, setSearch] = useState("");
  const [natF, setNatF] = useState("");
  const [typeF, setTypeF] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [detail, setDetail] = useState<Guest | null>(null);

  // map: guest_id → จำนวนครั้งเข้าพัก
  const stayCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const g of guests) m.set(g.id, stayCountOf(g.id, bookings));
    return m;
  }, [guests, bookings]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return guests
      .filter((g) => {
        const count = stayCounts.get(g.id) ?? 0;
        if (natF === "Thai" && g.nationality !== "Thai") return false;
        if (natF === "foreign" && (g.nationality === "Thai" || !g.nationality)) return false;
        if (typeF === "regular" && count < 2) return false;
        if (typeF === "new" && count >= 2) return false;
        if (q) {
          const hay = `${g.full_name} ${g.nationality ?? ""} ${g.phone ?? ""} ${
            g.id_number ?? ""
          }`.toLowerCase();
          if (!hay.includes(q)) return false;
        }
        return true;
      })
      .sort((a, b) => (stayCounts.get(b.id) ?? 0) - (stayCounts.get(a.id) ?? 0));
  }, [guests, stayCounts, search, natF, typeF]);

  const kpi = useMemo(() => {
    let regulars = 0;
    let foreign = 0;
    for (const g of guests) {
      if ((stayCounts.get(g.id) ?? 0) >= 2) regulars++;
      if (g.nationality && g.nationality !== "Thai") foreign++;
    }
    return { total: guests.length, regulars, foreign };
  }, [guests, stayCounts]);

  if (!canView)
    return (
      <NoAccess title="ทะเบียนแขก" icon={<Users className="h-6 w-6" />}>
        บทบาทแม่บ้านไม่สามารถดูทะเบียนแขกได้ — ลองสลับเป็นผู้จัดการ/เจ้าของ
      </NoAccess>
    );

  return (
    <HotelShell
      title="ทะเบียนแขก"
      description="ฐานข้อมูลแขก — ค้นหา ดูประวัติเข้าพัก รู้จักแขกประจำ"
      icon={<Users className="h-6 w-6" />}
      actions={
        canWrite ? (
          <Button onClick={() => setCreateOpen(true)}>
            <UserPlus className="mr-1.5 h-4 w-4" /> เพิ่มแขก
          </Button>
        ) : undefined
      }
    >
      {/* KPI */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatCard
          icon={<Users className="h-4 w-4" />}
          label="แขกทั้งหมด"
          value={String(kpi.total)}
          tone="primary"
        />
        <StatCard
          icon={<Repeat className="h-4 w-4" />}
          label="แขกประจำ (≥2 ครั้ง)"
          value={String(kpi.regulars)}
          sub="ฐานลูกค้าที่กลับมาซ้ำ — ดูแลให้ดีคือรายได้ประจำ"
          tone="positive"
          valueColored
        />
        <StatCard
          icon={<Globe className="h-4 w-4" />}
          label="แขกต่างชาติ"
          value={String(kpi.foreign)}
          tone="info"
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
              placeholder="ค้นหา ชื่อ / เบอร์ / เลขเอกสาร"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <CustomSelect value={natF} onChange={setNatF} options={NAT_FILTER} />
          <CustomSelect value={typeF} onChange={setTypeF} options={TYPE_FILTER} />
        </div>
      </div>

      {/* table */}
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>ชื่อแขก</TableHead>
            <TableHead>สัญชาติ</TableHead>
            <TableHead>เอกสาร</TableHead>
            <TableHead>เบอร์โทร</TableHead>
            <TableHead align="right">เข้าพัก (ครั้ง)</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {filtered.length === 0 ? (
            <TableEmpty colSpan={5}>
              <div className="flex flex-col items-center gap-2 py-6">
                <Users className="h-8 w-8 text-gray-300" />
                <span>ไม่พบแขกตามเงื่อนไข</span>
                {canWrite && (
                  <Button size="sm" className="mt-1" onClick={() => setCreateOpen(true)}>
                    <UserPlus className="mr-1.5 h-4 w-4" /> เพิ่มแขกคนแรก
                  </Button>
                )}
              </div>
            </TableEmpty>
          ) : (
            filtered.map((g) => {
              const count = stayCounts.get(g.id) ?? 0;
              const idLabel =
                g.id_type === "passport"
                  ? "พาสปอร์ต"
                  : g.id_type === "national_id"
                    ? "บัตรประชาชน"
                    : g.id_type === "other"
                      ? "อื่นๆ"
                      : "—";
              return (
                <TableRow key={g.id} clickable onClick={() => setDetail(g)}>
                  <TableCell>
                    <span className="flex items-center gap-2">
                      <span className="font-medium text-gray-900">{g.full_name}</span>
                      {count >= 2 && (
                        <span className="inline-flex items-center rounded-full border border-green-200 bg-green-50 px-2 py-0.5 text-[11px] font-medium text-green-700">
                          แขกประจำ
                        </span>
                      )}
                    </span>
                  </TableCell>
                  <TableCell className="text-gray-500">{g.nationality ?? "—"}</TableCell>
                  <TableCell className="text-gray-500">
                    {idLabel}
                    {g.id_number ? ` · ${g.id_number}` : ""}
                  </TableCell>
                  <TableCell className="text-gray-500">{g.phone ?? "—"}</TableCell>
                  <TableCell align="right" tabular className="font-medium text-gray-900">
                    {count}
                  </TableCell>
                </TableRow>
              );
            })
          )}
        </TableBody>
      </Table>

      {/* dialogs */}
      <GuestFormDialog open={createOpen} onOpenChange={setCreateOpen} />
      <GuestDetailDialog
        guest={detail}
        open={detail !== null}
        onOpenChange={(v) => !v && setDetail(null)}
      />
    </HotelShell>
  );
}
