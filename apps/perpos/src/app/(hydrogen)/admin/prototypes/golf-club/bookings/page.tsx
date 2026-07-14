"use client";

// bookings/page.tsx — รายการจองทั้งหมด (list) — P4b Group A
// filter: SegmentedControl ประเภท (tee/range/ทั้งหมด) + CustomSelect สถานะ/ช่องทาง/ชำระ + ThaiDatePicker
// footer sum รายได้ตาม filter · row → detail dialog · empty / กรองไม่เจอ states · no_show badge icon

import { useMemo, useState } from "react";
import { ClipboardList, Plus, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/typography";
import { CustomSelect } from "@/components/ui/custom-select";
import { SegmentedControl } from "@/components/ui/segmented";
import { ThaiDatePicker } from "@/components/ui/thai-date-picker";
import {
  Table,
  TableHeader,
  TableBody,
  TableFooter,
  TableRow,
  TableHead,
  TableCell,
  TableEmpty,
} from "@/components/ui/table";
import {
  GolfShell,
  NoAccess,
  AccessLockBanner,
  useGolfRole,
  useGolfData,
  bookerName,
  formatAmount,
  fmtNum,
  fmtDateTH,
  bookingStatusMeta,
  paymentStatusMeta,
  BookingStatusBadge,
  PaymentStatusBadge,
  ChannelBadge,
  CHANNEL_LABEL,
} from "../_components";
import { BookingFormDialog } from "../_components/booking-form-dialog";
import { BookingDetailDialog } from "../_components/booking-detail-dialog";
import type {
  GolfBooking,
  GolfBookingChannel,
  GolfBookingStatus,
  GolfBookingType,
  GolfPaymentStatus,
} from "../_fixtures/types";

const STATUS_LIST: GolfBookingStatus[] = [
  "pending",
  "confirmed",
  "checked_in",
  "completed",
  "cancelled",
  "no_show",
];
const CHANNEL_LIST: GolfBookingChannel[] = ["line", "walk_in", "web", "phone"];
const PAYMENT_LIST: GolfPaymentStatus[] = ["unpaid", "deposit_paid", "paid", "refunded"];

function partySummary(b: GolfBooking): string {
  return b.booking_type === "driving_range" ? `${b.bucket_qty ?? 1} ตะกร้า` : `${b.party_size} คน`;
}

export default function BookingsListPage() {
  const { can, canWrite } = useGolfRole();
  const writable = canWrite("bookings");
  const { bookings, members, resources } = useGolfData();

  const [typeF, setTypeF] = useState<"all" | GolfBookingType>("all");
  const [statusF, setStatusF] = useState("");
  const [channelF, setChannelF] = useState("");
  const [payF, setPayF] = useState("");
  const [dateF, setDateF] = useState("");

  const [formOpen, setFormOpen] = useState(false);
  const [editBooking, setEditBooking] = useState<GolfBooking | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailBooking, setDetailBooking] = useState<GolfBooking | null>(null);

  const resourceName = (id: string) => resources.find((r) => r.id === id)?.name ?? "—";

  const filtered = useMemo(() => {
    return bookings
      .filter((b) => (typeF === "all" ? true : b.booking_type === typeF))
      .filter((b) => (statusF ? b.status === statusF : true))
      .filter((b) => (channelF ? b.channel === channelF : true))
      .filter((b) => (payF ? b.payment_status === payF : true))
      .filter((b) => (dateF ? b.booking_date === dateF : true))
      .sort(
        (a, b) =>
          b.booking_date.localeCompare(a.booking_date) || a.start_time.localeCompare(b.start_time),
      );
  }, [bookings, typeF, statusF, channelF, payF, dateF]);

  const revenue = useMemo(
    () => filtered.filter((b) => b.status !== "cancelled").reduce((s, b) => s + (b.total_amount ?? 0), 0),
    [filtered],
  );

  const hasFilter = !!(typeF !== "all" || statusF || channelF || payF || dateF);
  function clearFilters() {
    setTypeF("all");
    setStatusF("");
    setChannelF("");
    setPayF("");
    setDateF("");
  }

  const openDetail = (b: GolfBooking) => {
    setDetailBooking(b);
    setDetailOpen(true);
  };
  const openEdit = (b: GolfBooking) => {
    setEditBooking(b);
    setFormOpen(true);
  };
  const openCreate = () => {
    setEditBooking(null);
    setFormOpen(true);
  };

  if (!can("view", "bookings"))
    return (
      <NoAccess title="รายการจอง" icon={<ClipboardList className="h-6 w-6" />}>
        บทบาทนี้ไม่มีสิทธิ์ดูรายการจอง
      </NoAccess>
    );

  return (
    <GolfShell
      title="รายการจอง"
      description="ค้นหา/กรอง/จัดการการจองทุกช่องทาง — คลิกแถวเพื่อดูรายละเอียดและจัดการสถานะ"
      icon={<ClipboardList className="h-6 w-6" />}
      actions={
        writable ? (
          <Button onClick={openCreate}>
            <Plus className="mr-1.5 h-4 w-4" />
            เพิ่มการจอง
          </Button>
        ) : undefined
      }
    >
      {!writable && (
        <AccessLockBanner>
          โหมดดูอย่างเดียว — บทบาทนี้ดูรายการจองได้แต่สร้าง/แก้ไข/เปลี่ยนสถานะไม่ได้
        </AccessLockBanner>
      )}

      {/* filter bar */}
      <div className="flex flex-col gap-3 rounded-xl border border-gray-200 bg-white p-3">
        <SegmentedControl
          value={typeF}
          onChange={setTypeF}
          options={[
            { value: "all", label: "ทั้งหมด" },
            { value: "tee_time", label: "สนามกอล์ฟ" },
            { value: "driving_range", label: "ไดร์ฟกอล์ฟ" },
          ]}
        />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <Text className="mb-1 text-xs font-medium text-gray-500">สถานะ</Text>
            <CustomSelect
              value={statusF}
              onChange={setStatusF}
              options={[
                { value: "", label: "ทุกสถานะ" },
                ...STATUS_LIST.map((s) => ({ value: s, label: bookingStatusMeta(s).label })),
              ]}
            />
          </div>
          <div>
            <Text className="mb-1 text-xs font-medium text-gray-500">ช่องทาง</Text>
            <CustomSelect
              value={channelF}
              onChange={setChannelF}
              options={[
                { value: "", label: "ทุกช่องทาง" },
                ...CHANNEL_LIST.map((c) => ({ value: c, label: CHANNEL_LABEL[c] })),
              ]}
            />
          </div>
          <div>
            <Text className="mb-1 text-xs font-medium text-gray-500">การชำระ</Text>
            <CustomSelect
              value={payF}
              onChange={setPayF}
              options={[
                { value: "", label: "ทุกสถานะชำระ" },
                ...PAYMENT_LIST.map((p) => ({ value: p, label: paymentStatusMeta(p).label })),
              ]}
            />
          </div>
          <div>
            <Text className="mb-1 text-xs font-medium text-gray-500">วันเล่น</Text>
            <div className="flex items-center gap-1.5">
              <ThaiDatePicker value={dateF} onChange={setDateF} placeholder="ทุกวัน" />
              {dateF && (
                <Button size="icon" variant="ghost" onClick={() => setDateF("")} aria-label="ล้างวันที่">
                  <X className="h-4 w-4" />
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* table */}
      <Table className="shadow-sm">
        <TableHeader>
          <TableRow>
            <TableHead>เลขจอง</TableHead>
            <TableHead>วันเล่น</TableHead>
            <TableHead>ผู้จอง</TableHead>
            <TableHead>ทรัพยากร</TableHead>
            <TableHead align="center">จำนวน</TableHead>
            <TableHead align="center">ช่องทาง</TableHead>
            <TableHead align="center">สถานะ</TableHead>
            <TableHead align="center">ชำระ</TableHead>
            <TableHead align="right">ยอด (฿)</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {filtered.length === 0 ? (
            <TableEmpty colSpan={9}>
              <div className="flex flex-col items-center gap-2 py-8">
                <Search className="h-7 w-7 text-gray-300" />
                <span>{hasFilter ? "ไม่พบการจองตามตัวกรอง" : "ยังไม่มีการจอง"}</span>
                {hasFilter ? (
                  <Button size="sm" variant="outline" onClick={clearFilters}>
                    ล้างตัวกรอง
                  </Button>
                ) : (
                  writable && (
                    <Button size="sm" onClick={openCreate}>
                      <Plus className="mr-1.5 h-4 w-4" />
                      เพิ่มการจองแรก
                    </Button>
                  )
                )}
              </div>
            </TableEmpty>
          ) : (
            filtered.map((b) => (
              <TableRow key={b.id} clickable onClick={() => openDetail(b)}>
                <TableCell className="font-medium text-gray-900">{b.booking_ref ?? "—"}</TableCell>
                <TableCell className="text-gray-600">
                  <span className="tabular-nums">{fmtDateTH(b.booking_date)}</span>
                  <span className="ml-1 tabular-nums text-gray-400">{b.start_time}</span>
                </TableCell>
                <TableCell>{bookerName(b, members)}</TableCell>
                <TableCell className="text-gray-500">{resourceName(b.resource_id)}</TableCell>
                <TableCell align="center" className="tabular-nums">
                  {partySummary(b)}
                </TableCell>
                <TableCell align="center">
                  <ChannelBadge channel={b.channel} />
                </TableCell>
                <TableCell align="center">
                  <BookingStatusBadge status={b.status} />
                </TableCell>
                <TableCell align="center">
                  <PaymentStatusBadge status={b.payment_status} />
                </TableCell>
                <TableCell align="right" tabular>
                  {formatAmount(b.total_amount ?? 0, { currency: false })}
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
        {filtered.length > 0 && (
          <TableFooter>
            <TableRow>
              <TableCell className="text-gray-600">รวม {fmtNum(filtered.length)} รายการ</TableCell>
              <TableCell colSpan={7} className="text-right text-gray-500">
                รายได้ (ไม่รวมยกเลิก)
              </TableCell>
              <TableCell align="right" tabular className="text-primary">
                {formatAmount(revenue, { currency: false })}
              </TableCell>
            </TableRow>
          </TableFooter>
        )}
      </Table>

      <BookingFormDialog open={formOpen} onOpenChange={setFormOpen} editBooking={editBooking} />
      <BookingDetailDialog
        booking={detailBooking}
        open={detailOpen}
        onOpenChange={setDetailOpen}
        onEdit={openEdit}
      />
    </GolfShell>
  );
}
