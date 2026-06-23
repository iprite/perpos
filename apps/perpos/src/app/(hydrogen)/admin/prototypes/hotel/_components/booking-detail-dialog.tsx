"use client";

// booking-detail-dialog.tsx — รายละเอียดการจอง + action ตามสถานะ+role (shared)
// reserved → [ยกเลิก][ไม่มาเข้าพัก][รับชำระ][เช็คอิน] · checked_in → [รับชำระ][เช็คเอาท์]
// checked_out → [รับชำระเพิ่ม] · payment list + ยอดค้าง · ปุ่มซ่อนตาม role (viewer read-only)

import { LogIn, LogOut, XCircle, UserX, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/typography";
import {
  Dialog,
  DialogContent,
  DialogBody,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
  TableEmpty,
} from "@/components/ui/table";
import { toast } from "@/lib/toast";
import { useHotelData } from "./data-context";
import { useHotelRole } from "./role-context";
import { computeBalance, paymentsOf } from "./money";
import { fmtMoney, fmtStayRange, fmtDuration, fmtDateTimeTH } from "./format";
import {
  BookingStatusBadge,
  RoomTypeBadge,
  SourceBadge,
  PaymentKindBadge,
  PAYMENT_METHOD_LABEL,
} from "./badges";
import type { Booking } from "../_fixtures/types";

export function BookingDetailDialog({
  booking,
  open,
  onOpenChange,
  onOpenPayment,
}: {
  booking: Booking | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** เปิด payment-dialog สำหรับ booking นี้ */
  onOpenPayment: (b: Booking) => void;
}) {
  const { rooms, payments, checkIn, checkOut, cancelBooking, markNoShow } = useHotelData();
  const { can } = useHotelRole();
  const canWrite = can("write", "bookings");

  if (!booking) return null;

  const room = rooms.find((r) => r.id === booking.room_id);
  const bp = paymentsOf(booking.id, payments).sort((a, b) => b.paid_at.localeCompare(a.paid_at));
  const balance = computeBalance(booking, bp);

  function act(fn: () => void, msg: string) {
    fn();
    toast.success(msg);
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="xl">
        <DialogHeader>
          <DialogTitle>
            <span className="flex flex-wrap items-center gap-2">
              {booking.booking_code}
              <BookingStatusBadge status={booking.status} />
            </span>
          </DialogTitle>
        </DialogHeader>
        <DialogBody>
          <div className="space-y-5">
            {/* แขก + ห้อง */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="แขก" value={booking.guest_name} />
              <Field label="เบอร์โทร" value={booking.phone ?? "—"} />
              <Field label="สัญชาติ" value={booking.nationality ?? "—"} />
              <div>
                <Text className="text-xs text-gray-400">ห้อง</Text>
                <div className="mt-0.5 flex items-center gap-2">
                  <span className="text-sm font-medium text-gray-900">
                    {room?.room_number ?? "—"}
                  </span>
                  {room && <RoomTypeBadge type={room.room_type} />}
                </div>
              </div>
              <div>
                <Text className="text-xs text-gray-400">ช่องทาง</Text>
                <div className="mt-0.5">
                  <SourceBadge source={booking.source} />
                </div>
              </div>
              <Field
                label="เข้าพัก"
                value={`${fmtStayRange(booking.check_in_date, booking.check_out_date)} · ${fmtDuration(
                  booking.stay_type,
                  booking.nights,
                  booking.hours,
                )}`}
              />
              <Field
                label="ผู้เข้าพัก"
                value={`ผู้ใหญ่ ${booking.adults} · เด็ก ${booking.children}`}
              />
              {booking.notes && <Field label="หมายเหตุ" value={booking.notes} />}
            </div>

            {/* ยอดเงิน */}
            <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-sm">
              <Row
                label={`ค่าห้อง (${fmtDuration(booking.stay_type, booking.nights, booking.hours)})`}
                value={fmtMoney(booking.room_total)}
              />
              {booking.extra_charges > 0 && (
                <Row label="ค่าใช้จ่ายเพิ่ม" value={fmtMoney(booking.extra_charges)} />
              )}
              {booking.discount > 0 && (
                <Row
                  label="ส่วนลด"
                  value={`−${fmtMoney(booking.discount, { currency: false })} ฿`}
                />
              )}
              <div className="mt-2 flex items-center justify-between border-t border-gray-200 pt-2 font-semibold text-gray-900">
                <span>ยอดรวมทั้งสิ้น</span>
                <span className="font-mono tabular-nums">{fmtMoney(booking.grand_total)}</span>
              </div>
              <div className="mt-1 flex items-center justify-between">
                <span className="text-gray-500">ยอดค้างชำระ</span>
                <span
                  className={`font-mono font-semibold tabular-nums ${
                    balance > 0 ? "text-red-600" : "text-green-600"
                  }`}
                >
                  {fmtMoney(balance)}
                </span>
              </div>
            </div>

            {/* payment list */}
            <div>
              <Text className="mb-2 text-sm font-medium text-gray-900">ประวัติการชำระ</Text>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>วันที่</TableHead>
                    <TableHead>ประเภท</TableHead>
                    <TableHead>ช่องทาง</TableHead>
                    <TableHead align="right">ยอด</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {bp.length === 0 ? (
                    <TableEmpty colSpan={4}>ยังไม่มีการชำระ</TableEmpty>
                  ) : (
                    bp.map((p) => (
                      <TableRow key={p.id}>
                        <TableCell>{fmtDateTimeTH(p.paid_at)}</TableCell>
                        <TableCell>
                          <PaymentKindBadge kind={p.kind} />
                        </TableCell>
                        <TableCell className="text-gray-500">
                          {PAYMENT_METHOD_LABEL[p.method]}
                        </TableCell>
                        <TableCell
                          align="right"
                          tabular
                          className={p.kind === "refund" ? "text-red-600" : "text-green-600"}
                        >
                          {p.kind === "refund"
                            ? `−${fmtMoney(p.amount, { currency: false })} ฿`
                            : fmtMoney(p.amount)}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </div>
        </DialogBody>
        <DialogFooter>
          {/* action ตามสถานะ + role */}
          {canWrite && booking.status === "reserved" && (
            <>
              <Button
                variant="destructive"
                className="mr-auto"
                onClick={() =>
                  act(() => cancelBooking(booking.id), `ยกเลิก ${booking.booking_code} แล้ว`)
                }
              >
                <XCircle className="mr-1.5 h-4 w-4" /> ยกเลิก
              </Button>
              <Button
                variant="outline"
                onClick={() =>
                  act(
                    () => markNoShow(booking.id),
                    `ทำเครื่องหมายไม่มาเข้าพัก ${booking.booking_code}`,
                  )
                }
              >
                <UserX className="mr-1.5 h-4 w-4" /> ไม่มาเข้าพัก
              </Button>
              <Button variant="outline" onClick={() => onOpenPayment(booking)}>
                <Wallet className="mr-1.5 h-4 w-4" /> รับชำระ
              </Button>
              <Button
                onClick={() =>
                  act(() => checkIn(booking.id), `เช็คอิน ${booking.booking_code} สำเร็จ`)
                }
              >
                <LogIn className="mr-1.5 h-4 w-4" /> เช็คอิน
              </Button>
            </>
          )}
          {canWrite && booking.status === "checked_in" && (
            <>
              <Button variant="outline" onClick={() => onOpenPayment(booking)}>
                <Wallet className="mr-1.5 h-4 w-4" /> รับชำระ
              </Button>
              <Button
                onClick={() =>
                  act(() => checkOut(booking.id), `เช็คเอาท์ ${booking.booking_code} สำเร็จ`)
                }
              >
                <LogOut className="mr-1.5 h-4 w-4" /> เช็คเอาท์
              </Button>
            </>
          )}
          {canWrite && booking.status === "checked_out" && balance > 0 && (
            <Button variant="outline" onClick={() => onOpenPayment(booking)}>
              <Wallet className="mr-1.5 h-4 w-4" /> รับชำระเพิ่ม
            </Button>
          )}
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            ปิด
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <Text className="text-xs text-gray-400">{label}</Text>
      <Text className="mt-0.5 text-sm font-medium text-gray-900">{value}</Text>
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between text-gray-500">
      <span>{label}</span>
      <span className="font-mono tabular-nums text-gray-700">{value}</span>
    </div>
  );
}
