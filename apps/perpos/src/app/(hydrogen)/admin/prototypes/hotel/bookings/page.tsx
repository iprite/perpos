"use client";

// bookings/page.tsx — การจอง (★ pattern page) — list + filter + StatCard + detail dialog + status-action
// gate §4.1: bookings — owner/manager (W·A) · housekeeper (none) · viewer (V)

import { useMemo, useState } from "react";
import { CalendarCheck, Plus, Search, CalendarClock, LogIn, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CustomSelect } from "@/components/ui/custom-select";
import { ThaiDatePicker } from "@/components/ui/thai-date-picker";
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
  fmtDateTH,
  fmtDuration,
  computeBalance,
  paymentsOf,
  BookingStatusBadge,
  RoomTypeBadge,
  SourceBadge,
  SOURCE_LABEL,
  BookingDialog,
  PaymentDialog,
  BookingDetailDialog,
  NoAccess,
} from "../_components";
import type { Booking, BookingSource } from "../_fixtures/types";

const STATUS_OPTIONS = [
  { value: "", label: "ทุกสถานะ" },
  { value: "reserved", label: "จองแล้ว" },
  { value: "checked_in", label: "เข้าพักอยู่" },
  { value: "checked_out", label: "เช็คเอาท์แล้ว" },
  { value: "cancelled", label: "ยกเลิก" },
  { value: "no_show", label: "ไม่มาเข้าพัก" },
];

const SOURCE_OPTIONS = [
  { value: "", label: "ทุกช่องทาง" },
  ...(Object.keys(SOURCE_LABEL) as BookingSource[]).map((s) => ({
    value: s,
    label: SOURCE_LABEL[s],
  })),
];

const STAY_OPTIONS = [
  { value: "", label: "ทุกประเภท" },
  { value: "daily", label: "รายคืน" },
  { value: "hourly", label: "รายชั่วโมง" },
];

export default function BookingsPage() {
  const { can } = useHotelRole();
  const canView = can("view", "bookings");
  const canWrite = can("write", "bookings");

  const { rooms, bookings, payments } = useHotelData();

  const [search, setSearch] = useState("");
  const [statusF, setStatusF] = useState("");
  const [sourceF, setSourceF] = useState("");
  const [stayF, setStayF] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  const [createOpen, setCreateOpen] = useState(false);
  const [detail, setDetail] = useState<Booking | null>(null);
  const [payFor, setPayFor] = useState<Booking | null>(null);

  // ── filter (ทำงานจริงบน client state) ──
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return bookings
      .filter((b) => {
        if (statusF && b.status !== statusF) return false;
        if (sourceF && b.source !== sourceF) return false;
        if (stayF && b.stay_type !== stayF) return false;
        if (fromDate && b.check_in_date < fromDate) return false;
        if (toDate && b.check_in_date > toDate) return false;
        if (q) {
          const room = rooms.find((r) => r.id === b.room_id);
          const hay = `${b.booking_code} ${b.guest_name} ${room?.room_number ?? ""}`.toLowerCase();
          if (!hay.includes(q)) return false;
        }
        return true;
      })
      .sort((a, b) => b.check_in_date.localeCompare(a.check_in_date));
  }, [bookings, rooms, search, statusF, sourceF, stayF, fromDate, toDate]);

  // ── KPI (จาก fixture จริง) ──
  const kpi = useMemo(() => {
    const reserved = bookings.filter((b) => b.status === "reserved").length;
    const checkedIn = bookings.filter((b) => b.status === "checked_in").length;
    let outstanding = 0;
    for (const b of bookings) {
      if (b.status === "cancelled" || b.status === "no_show") continue;
      const bal = computeBalance(b, paymentsOf(b.id, payments));
      if (bal > 0) outstanding += bal;
    }
    return { total: bookings.length, reserved, checkedIn, outstanding };
  }, [bookings, payments]);

  if (!canView)
    return (
      <NoAccess title="การจอง" icon={<CalendarCheck className="h-6 w-6" />}>
        บทบาทแม่บ้านไม่สามารถดูรายการจองได้ — ลองสลับเป็นผู้จัดการ/เจ้าของ
      </NoAccess>
    );

  const roomNo = (id: string) => rooms.find((r) => r.id === id)?.room_number ?? "—";
  const roomType = (id: string) => rooms.find((r) => r.id === id)?.room_type;

  return (
    <HotelShell
      title="การจอง"
      description="รายการจองทั้งหมด — กรอง/ค้นหา เช็คอิน-เช็คเอาท์ รับชำระ"
      icon={<CalendarCheck className="h-6 w-6" />}
      actions={
        canWrite ? (
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="mr-1.5 h-4 w-4" /> จองใหม่
          </Button>
        ) : undefined
      }
    >
      {/* KPI */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon={<CalendarCheck className="h-4 w-4" />}
          label="จองทั้งหมด"
          value={String(kpi.total)}
          tone="primary"
        />
        <StatCard
          icon={<CalendarClock className="h-4 w-4" />}
          label="จองแล้ว (รอเช็คอิน)"
          value={String(kpi.reserved)}
          tone="warning"
          valueColored
        />
        <StatCard
          icon={<LogIn className="h-4 w-4" />}
          label="เข้าพักอยู่"
          value={String(kpi.checkedIn)}
          tone="info"
          valueColored
        />
        <StatCard
          icon={<AlertCircle className="h-4 w-4" />}
          label="ค้างชำระรวม"
          value={fmtMoney(kpi.outstanding)}
          tone={kpi.outstanding > 0 ? "negative" : "positive"}
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
              placeholder="ค้นหา รหัสจอง / ชื่อแขก / ห้อง"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <CustomSelect value={statusF} onChange={setStatusF} options={STATUS_OPTIONS} />
          <CustomSelect value={sourceF} onChange={setSourceF} options={SOURCE_OPTIONS} />
          <CustomSelect value={stayF} onChange={setStayF} options={STAY_OPTIONS} />
          <ThaiDatePicker value={fromDate} onChange={setFromDate} placeholder="เข้าพักตั้งแต่" />
          <ThaiDatePicker value={toDate} onChange={setToDate} placeholder="ถึงวันที่" />
        </div>
      </div>

      {/* table */}
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>รหัสจอง</TableHead>
            <TableHead>แขก</TableHead>
            <TableHead>ห้อง</TableHead>
            <TableHead>เข้า–ออก</TableHead>
            <TableHead align="center">ระยะ</TableHead>
            <TableHead align="center">ช่องทาง</TableHead>
            <TableHead align="right">ยอดรวม</TableHead>
            <TableHead align="right">ค้างชำระ</TableHead>
            <TableHead align="center">สถานะ</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {filtered.length === 0 ? (
            <TableEmpty colSpan={9}>
              <div className="flex flex-col items-center gap-2 py-6">
                <CalendarCheck className="h-8 w-8 text-gray-300" />
                <span>ไม่พบการจองตามเงื่อนไข</span>
                {canWrite && (
                  <Button size="sm" className="mt-1" onClick={() => setCreateOpen(true)}>
                    <Plus className="mr-1.5 h-4 w-4" /> จองใหม่
                  </Button>
                )}
              </div>
            </TableEmpty>
          ) : (
            filtered.map((b) => {
              const bal = computeBalance(b, paymentsOf(b.id, payments));
              const t = roomType(b.room_id);
              return (
                <TableRow key={b.id} clickable onClick={() => setDetail(b)}>
                  <TableCell className="font-medium text-gray-900">{b.booking_code}</TableCell>
                  <TableCell>{b.guest_name}</TableCell>
                  <TableCell>
                    <span className="flex items-center gap-2">
                      {roomNo(b.room_id)}
                      {t && <RoomTypeBadge type={t} />}
                    </span>
                  </TableCell>
                  <TableCell className="text-gray-500">
                    {fmtDateTH(b.check_in_date)}
                    {b.check_out_date ? ` – ${fmtDateTH(b.check_out_date)}` : ""}
                  </TableCell>
                  <TableCell align="center" className="text-gray-500">
                    {fmtDuration(b.stay_type, b.nights, b.hours)}
                  </TableCell>
                  <TableCell align="center">
                    <SourceBadge source={b.source} />
                  </TableCell>
                  <TableCell align="right" tabular>
                    {fmtMoney(b.grand_total)}
                  </TableCell>
                  <TableCell
                    align="right"
                    tabular
                    className={bal > 0 ? "font-medium text-red-600" : "text-gray-400"}
                  >
                    {bal > 0 ? fmtMoney(bal) : "—"}
                  </TableCell>
                  <TableCell align="center">
                    <BookingStatusBadge status={b.status} />
                  </TableCell>
                </TableRow>
              );
            })
          )}
        </TableBody>
      </Table>

      {/* dialogs */}
      <BookingDialog open={createOpen} onOpenChange={setCreateOpen} />
      <BookingDetailDialog
        booking={detail}
        open={detail !== null}
        onOpenChange={(v) => !v && setDetail(null)}
        onOpenPayment={(b) => {
          setDetail(null);
          setPayFor(b);
        }}
      />
      <PaymentDialog
        open={payFor !== null}
        onOpenChange={(v) => !v && setPayFor(null)}
        booking={payFor}
      />
    </HotelShell>
  );
}
