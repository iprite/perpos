"use client";

// daily/page.tsx — บันทึกประจำวัน (to-do รายวัน) — P4b
// 3 ตาราง: ต้องเช็คอินวันนี้ / ต้องเช็คเอาท์วันนี้ / กำลังพัก + count เล็ก (ไม่ใส่ StatCard ใหญ่ซ้ำ dashboard)
// เลื่อนย้อน/หน้าวัน (ThaiDatePicker + ปุ่ม) · action เช็คอิน-เอาท์/รับชำระ ผ่าน detail dialog

import { useMemo, useState } from "react";
import { ClipboardList, ChevronLeft, ChevronRight, LogIn, LogOut, BedDouble } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ThaiDatePicker } from "@/components/ui/thai-date-picker";
import { Text } from "@/components/ui/typography";
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
  bookingOnDate,
  addDayIso,
  TODAY_ISO,
  fmtMoney,
  fmtDateTH,
  computeBalance,
  paymentsOf,
  RoomTypeBadge,
  BookingDetailDialog,
  PaymentDialog,
  NoAccess,
} from "../_components";
import type { Booking, RoomType } from "../_fixtures/types";

function addDayIsoN(iso: string, n: number): string {
  const d = new Date(iso);
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

export default function DailySheetPage() {
  const { can } = useHotelRole();
  const canView = can("view", "bookings");
  const { rooms, bookings, payments } = useHotelData();

  const [date, setDate] = useState(TODAY_ISO);
  const [detail, setDetail] = useState<Booking | null>(null);
  const [payFor, setPayFor] = useState<Booking | null>(null);

  // เช็คอินวันนั้น = reserved + check_in_date = date
  const arrivals = useMemo(
    () =>
      bookings
        .filter((b) => b.status === "reserved" && b.check_in_date === date)
        .sort((a, b) => a.booking_code.localeCompare(b.booking_code)),
    [bookings, date],
  );
  // เช็คเอาท์วันนั้น = checked_in + check_out_date = date
  const departures = useMemo(
    () =>
      bookings
        .filter((b) => b.status === "checked_in" && b.check_out_date === date)
        .sort((a, b) => a.booking_code.localeCompare(b.booking_code)),
    [bookings, date],
  );
  // กำลังพัก = checked_in และวันนั้นอยู่ในช่วงเข้าพัก (ไม่ใช่วันเช็คเอาท์)
  const staying = useMemo(
    () =>
      bookings
        .filter(
          (b) => b.status === "checked_in" && bookingOnDate(b, date) && b.check_out_date !== date,
        )
        .sort((a, b) => a.booking_code.localeCompare(b.booking_code)),
    [bookings, date],
  );

  if (!canView)
    return (
      <NoAccess title="บันทึกประจำวัน" icon={<ClipboardList className="h-6 w-6" />}>
        บทบาทนี้ไม่สามารถดูบันทึกประจำวันได้
      </NoAccess>
    );

  const roomNo = (id: string) => rooms.find((r) => r.id === id)?.room_number ?? "—";
  const roomType = (id: string) => rooms.find((r) => r.id === id)?.room_type;
  const balanceOf = (b: Booking) => computeBalance(b, paymentsOf(b.id, payments));

  const isToday = date === TODAY_ISO;

  return (
    <HotelShell
      title="บันทึกประจำวัน"
      description="งานที่ต้องลงมือของวัน — เช็คอิน / เช็คเอาท์ / แขกกำลังพัก"
      icon={<ClipboardList className="h-6 w-6" />}
    >
      {/* แถบเลือกวัน */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-gray-200 bg-white p-3">
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            onClick={() => setDate(addDayIsoN(date, -1))}
            aria-label="วันก่อนหน้า"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <div className="w-44">
            <ThaiDatePicker value={date} onChange={(iso) => iso && setDate(iso)} />
          </div>
          <Button
            variant="outline"
            size="icon"
            onClick={() => setDate(addDayIso(date))}
            aria-label="วันถัดไป"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
          {!isToday && (
            <Button variant="ghost" size="sm" onClick={() => setDate(TODAY_ISO)}>
              วันนี้
            </Button>
          )}
        </div>
        <Text className="text-sm font-medium text-gray-700">
          {fmtDateTH(date)}
          {isToday && <span className="ml-1.5 text-xs text-primary">(วันนี้)</span>}
        </Text>
      </div>

      {/* count เล็ก */}
      <div className="flex flex-wrap gap-2 text-xs">
        <Pill
          icon={<LogIn className="h-3.5 w-3.5 text-amber-600" />}
          label="ต้องเช็คอิน"
          n={arrivals.length}
        />
        <Pill
          icon={<LogOut className="h-3.5 w-3.5 text-blue-600" />}
          label="ต้องเช็คเอาท์"
          n={departures.length}
        />
        <Pill
          icon={<BedDouble className="h-3.5 w-3.5 text-gray-500" />}
          label="กำลังพัก"
          n={staying.length}
        />
      </div>

      {/* 1) ต้องเช็คอิน */}
      <Section
        title="ต้องเช็คอินวันนี้"
        icon={<LogIn className="h-4 w-4 text-amber-600" />}
        count={arrivals.length}
        rows={arrivals}
        roomNo={roomNo}
        roomType={roomType}
        balanceOf={balanceOf}
        onOpen={setDetail}
        empty="ไม่มีแขกที่ต้องเช็คอิน — เปิดรายการจองได้จากหน้า ‘การจอง’"
        amountLabel="ค้างชำระ"
      />

      {/* 2) ต้องเช็คเอาท์ */}
      <Section
        title="ต้องเช็คเอาท์วันนี้"
        icon={<LogOut className="h-4 w-4 text-blue-600" />}
        count={departures.length}
        rows={departures}
        roomNo={roomNo}
        roomType={roomType}
        balanceOf={balanceOf}
        onOpen={setDetail}
        empty="ไม่มีแขกที่ต้องเช็คเอาท์"
        amountLabel="ค้างชำระ"
      />

      {/* 3) กำลังพัก */}
      <Section
        title="แขกกำลังพัก"
        icon={<BedDouble className="h-4 w-4 text-gray-500" />}
        count={staying.length}
        rows={staying}
        roomNo={roomNo}
        roomType={roomType}
        balanceOf={balanceOf}
        onOpen={setDetail}
        empty="ไม่มีแขกพักในวันนี้"
        amountLabel="ค้างชำระ"
      />

      {/* dialogs */}
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

function Pill({ icon, label, n }: { icon: React.ReactNode; label: string; n: number }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-gray-200 bg-white px-3 py-1 font-medium text-gray-600">
      {icon}
      {label}
      <span className="ml-0.5 rounded-full bg-gray-100 px-1.5 text-gray-500">{n}</span>
    </span>
  );
}

function Section({
  title,
  icon,
  count,
  rows,
  roomNo,
  roomType,
  balanceOf,
  onOpen,
  empty,
  amountLabel,
}: {
  title: string;
  icon: React.ReactNode;
  count: number;
  rows: Booking[];
  roomNo: (id: string) => string;
  roomType: (id: string) => RoomType | undefined;
  balanceOf: (b: Booking) => number;
  onOpen: (b: Booking) => void;
  empty: string;
  amountLabel: string;
}) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white">
      <div className="flex items-center gap-2 border-b border-gray-100 px-4 py-3">
        {icon}
        <Text className="text-sm font-medium text-gray-900">{title}</Text>
        <span className="ml-auto rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-500">
          {count}
        </span>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>รหัส</TableHead>
            <TableHead>แขก</TableHead>
            <TableHead>ห้อง</TableHead>
            <TableHead>เข้า–ออก</TableHead>
            <TableHead align="right">{amountLabel}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length === 0 ? (
            <TableEmpty colSpan={5}>{empty}</TableEmpty>
          ) : (
            rows.map((b) => {
              const t = roomType(b.room_id);
              const bal = balanceOf(b);
              return (
                <TableRow key={b.id} clickable onClick={() => onOpen(b)}>
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
                  <TableCell
                    align="right"
                    tabular
                    className={bal > 0 ? "font-medium text-red-600" : "text-gray-400"}
                  >
                    {bal > 0 ? fmtMoney(bal) : "—"}
                  </TableCell>
                </TableRow>
              );
            })
          )}
        </TableBody>
      </Table>
    </div>
  );
}
