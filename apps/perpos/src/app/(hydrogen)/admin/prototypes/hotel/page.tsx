"use client";

// page.tsx — แดชบอร์ด (เต็ม) — P4b
// 5 KPI (occupancy / ห้องว่าง / รายได้วันนี้ / เช็คอิน-เช็คเอาท์ / ค้างชำระ — ไม่มี ADR/RevPAR)
// + room board (กดจอง/ดู) + กล่องสรุปด้วย AI (H1 Mock) + รายการเช็คอิน/เช็คเอาท์วันนี้

import { useMemo, useState } from "react";
import {
  LayoutDashboard,
  Plus,
  BedDouble,
  Percent,
  Banknote,
  AlertCircle,
  LogIn,
  LogOut,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { StatCard } from "@/components/ui/stat-card";
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
  fmtMoney,
  fmtDateTH,
  computeBalance,
  paymentsOf,
  TODAY_ISO,
  BookingDialog,
  BookingDetailDialog,
  PaymentDialog,
  RoomBoard,
  AiSummaryBox,
  RoomTypeBadge,
  BookingStatusBadge,
} from "./_components";
import { aiSummaryToday } from "./_fixtures/ai-mocks";
import type { Booking, RoomType } from "./_fixtures/types";

export default function HotelDashboardPage() {
  const { can } = useHotelRole();
  const canBook = can("write", "bookings");
  const { rooms, bookings, payments } = useHotelData();

  const [createOpen, setCreateOpen] = useState(false);
  const [prefillRoom, setPrefillRoom] = useState<string | undefined>(undefined);
  const [detail, setDetail] = useState<Booking | null>(null);
  const [payFor, setPayFor] = useState<Booking | null>(null);

  const kpi = useMemo(() => {
    const sellable = rooms.filter(
      (r) => r.status !== "maintenance" && r.status !== "out_of_service",
    ).length;
    const occupied = rooms.filter((r) => r.status === "occupied" || r.status === "reserved").length;
    const available = rooms.filter((r) => r.status === "available").length;
    const occupancy = sellable > 0 ? Math.round((occupied / sellable) * 100) : 0;

    const revenueToday = payments
      .filter((p) => p.paid_at.startsWith(TODAY_ISO) && p.kind !== "refund")
      .reduce((s, p) => s + p.amount, 0);

    let outstanding = 0;
    for (const b of bookings) {
      if (b.status === "cancelled" || b.status === "no_show") continue;
      const bal = computeBalance(b, paymentsOf(b.id, payments));
      if (bal > 0) outstanding += bal;
    }
    return { occupancy, available, sellable, revenueToday, outstanding };
  }, [rooms, bookings, payments]);

  // รายการเช็คอินวันนี้ = reserved + check_in_date วันนี้ · เช็คเอาท์วันนี้ = checked_in + check_out_date วันนี้
  const checkinsToday = useMemo(
    () =>
      bookings
        .filter((b) => b.status === "reserved" && b.check_in_date === TODAY_ISO)
        .sort((a, b) => a.booking_code.localeCompare(b.booking_code)),
    [bookings],
  );
  const checkoutsToday = useMemo(
    () =>
      bookings
        .filter((b) => b.status === "checked_in" && b.check_out_date === TODAY_ISO)
        .sort((a, b) => a.booking_code.localeCompare(b.booking_code)),
    [bookings],
  );

  const roomNo = (id: string) => rooms.find((r) => r.id === id)?.room_number ?? "—";
  const roomType = (id: string) => rooms.find((r) => r.id === id)?.room_type;

  function openBook(roomId: string) {
    setPrefillRoom(roomId);
    setCreateOpen(true);
  }

  return (
    <HotelShell
      title="แดชบอร์ด"
      description="ภาพรวมโรงแรมวันนี้ (23 มิ.ย. 2569)"
      icon={<LayoutDashboard className="h-6 w-6" />}
      actions={
        canBook ? (
          <Button
            onClick={() => {
              setPrefillRoom(undefined);
              setCreateOpen(true);
            }}
          >
            <Plus className="mr-1.5 h-4 w-4" /> จองใหม่
          </Button>
        ) : undefined
      }
    >
      {/* KPI */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <StatCard
          icon={<Percent className="h-4 w-4" />}
          label="อัตราเข้าพักวันนี้"
          value={`${kpi.occupancy}%`}
          sub={`ขายได้ ${kpi.sellable} ห้อง`}
          tone="info"
          valueColored
        />
        <StatCard
          icon={<BedDouble className="h-4 w-4" />}
          label="ห้องว่างวันนี้"
          value={String(kpi.available)}
          tone="primary"
        />
        <StatCard
          icon={<Banknote className="h-4 w-4" />}
          label="รายได้วันนี้"
          value={fmtMoney(kpi.revenueToday)}
          tone="positive"
          valueColored
        />
        <StatCard
          icon={<LogIn className="h-4 w-4" />}
          label="เช็คอิน / เช็คเอาท์วันนี้"
          value={`${checkinsToday.length} / ${checkoutsToday.length}`}
          tone="neutral"
        />
        <StatCard
          icon={<AlertCircle className="h-4 w-4" />}
          label="ค้างชำระรวม"
          value={fmtMoney(kpi.outstanding)}
          tone={kpi.outstanding > 0 ? "negative" : "positive"}
          valueColored
        />
      </div>

      {/* AI summary (H1 Mock) */}
      <AiSummaryBox data={aiSummaryToday} />

      {/* room board */}
      <RoomBoard onBookRoom={openBook} onOpenBooking={(b) => setDetail(b)} />

      {/* รายการเช็คอิน / เช็คเอาท์วันนี้ */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <ArrivalsCard
          title="ต้องเช็คอินวันนี้"
          icon={<LogIn className="h-4 w-4 text-amber-600" />}
          rows={checkinsToday}
          roomNo={roomNo}
          roomType={roomType}
          onOpen={(b) => setDetail(b)}
          emptyText="ไม่มีแขกที่ต้องเช็คอินวันนี้"
        />
        <ArrivalsCard
          title="ต้องเช็คเอาท์วันนี้"
          icon={<LogOut className="h-4 w-4 text-blue-600" />}
          rows={checkoutsToday}
          roomNo={roomNo}
          roomType={roomType}
          onOpen={(b) => setDetail(b)}
          emptyText="ไม่มีแขกที่ต้องเช็คเอาท์วันนี้"
        />
      </div>

      {/* dialogs */}
      <BookingDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        prefillRoomId={prefillRoom}
        prefillDate={TODAY_ISO}
      />
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

function ArrivalsCard({
  title,
  icon,
  rows,
  roomNo,
  roomType,
  onOpen,
  emptyText,
}: {
  title: string;
  icon: React.ReactNode;
  rows: Booking[];
  roomNo: (id: string) => string;
  roomType: (id: string) => RoomType | undefined;
  onOpen: (b: Booking) => void;
  emptyText: string;
}) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white">
      <div className="flex items-center gap-2 border-b border-gray-100 px-4 py-3">
        {icon}
        <Text className="text-sm font-medium text-gray-900">{title}</Text>
        <span className="ml-auto rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-500">
          {rows.length}
        </span>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>แขก</TableHead>
            <TableHead>ห้อง</TableHead>
            <TableHead>วันที่</TableHead>
            <TableHead align="center">สถานะ</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length === 0 ? (
            <TableEmpty colSpan={4}>{emptyText}</TableEmpty>
          ) : (
            rows.map((b) => {
              const t = roomType(b.room_id);
              return (
                <TableRow key={b.id} clickable onClick={() => onOpen(b)}>
                  <TableCell className="font-medium text-gray-900">{b.guest_name}</TableCell>
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
                  <TableCell align="center">
                    <BookingStatusBadge status={b.status} />
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
