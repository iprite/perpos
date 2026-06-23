"use client";

// payments/page.tsx — การรับชำระ — payment list + AR ค้างชำระ + filter + KPI + รับชำระ (reuse PaymentDialog)
// gate §4.1: payments — owner/manager (W·A) · housekeeper (none) · viewer (V)

import { useMemo, useState } from "react";
import { Wallet, Search, Banknote, AlertCircle, ReceiptText } from "lucide-react";
import { Input } from "@/components/ui/input";
import { CustomSelect } from "@/components/ui/custom-select";
import { ThaiDatePicker } from "@/components/ui/thai-date-picker";
import { Button } from "@/components/ui/button";
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
  fmtDateTimeTH,
  fmtDateTH,
  computeBalance,
  paymentsOf,
  TODAY_ISO,
  PaymentKindBadge,
  PAYMENT_METHOD_LABEL,
  PaymentDialog,
  BookingDetailDialog,
  NoAccess,
} from "../_components";
import type { Booking, Payment, PaymentKind, PaymentMethod } from "../_fixtures/types";

const KIND_OPTIONS = [
  { value: "", label: "ทุกประเภท" },
  { value: "deposit", label: "มัดจำ" },
  { value: "balance", label: "ชำระส่วนที่เหลือ" },
  { value: "extra", label: "ค่าใช้จ่ายเพิ่ม" },
  { value: "refund", label: "คืนเงิน" },
];

const METHOD_OPTIONS = [
  { value: "", label: "ทุกช่องทาง" },
  ...(Object.keys(PAYMENT_METHOD_LABEL) as PaymentMethod[]).map((m) => ({
    value: m,
    label: PAYMENT_METHOD_LABEL[m],
  })),
];

export default function PaymentsPage() {
  const { can } = useHotelRole();
  const canView = can("view", "payments");

  const { rooms, bookings, payments } = useHotelData();

  // tab: รายการรับชำระ | AR ค้างชำระ
  const [tab, setTab] = useState<"list" | "ar">("list");

  // filter (payment list)
  const [search, setSearch] = useState("");
  const [kindF, setKindF] = useState("");
  const [methodF, setMethodF] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  // dialogs
  const [payFor, setPayFor] = useState<Booking | null>(null);
  const [detail, setDetail] = useState<Booking | null>(null);

  const bookingOf = (id: string) => bookings.find((b) => b.id === id) ?? null;
  const roomNoOf = (booking: Booking | null) =>
    booking ? (rooms.find((r) => r.id === booking.room_id)?.room_number ?? "—") : "—";

  // ── payment list (filter ทำงานจริง) ──
  const filteredPayments = useMemo(() => {
    const q = search.trim().toLowerCase();
    const findBooking = (id: string) => bookings.find((b) => b.id === id) ?? null;
    const roomNo = (b: Booking | null) =>
      b ? (rooms.find((r) => r.id === b.room_id)?.room_number ?? "—") : "—";
    return payments
      .filter((p) => {
        if (kindF && p.kind !== kindF) return false;
        if (methodF && p.method !== methodF) return false;
        const day = p.paid_at.slice(0, 10);
        if (fromDate && day < fromDate) return false;
        if (toDate && day > toDate) return false;
        if (q) {
          const b = findBooking(p.booking_id);
          const hay =
            `${b?.booking_code ?? ""} ${b?.guest_name ?? ""} ${roomNo(b)} ${p.reference ?? ""}`.toLowerCase();
          if (!hay.includes(q)) return false;
        }
        return true;
      })
      .sort((a, b) => b.paid_at.localeCompare(a.paid_at));
  }, [payments, bookings, rooms, search, kindF, methodF, fromDate, toDate]);

  // ── AR: ยอดค้างชำระต่อ booking ──
  const arRows = useMemo(() => {
    return bookings
      .filter((b) => b.status !== "cancelled" && b.status !== "no_show")
      .map((b) => {
        const bp = paymentsOf(b.id, payments);
        return { booking: b, balance: computeBalance(b, bp), paidIn: bp };
      })
      .filter((r) => r.balance > 0)
      .sort((a, b) => b.balance - a.balance);
  }, [bookings, payments]);

  // ── KPI ──
  const kpi = useMemo(() => {
    const receivedToday = payments
      .filter((p) => p.paid_at.startsWith(TODAY_ISO) && p.kind !== "refund")
      .reduce((s, p) => s + p.amount, 0);
    const refundToday = payments
      .filter((p) => p.paid_at.startsWith(TODAY_ISO) && p.kind === "refund")
      .reduce((s, p) => s + p.amount, 0);
    const outstandingTotal = arRows.reduce((s, r) => s + r.balance, 0);
    return {
      receivedToday,
      refundToday,
      outstandingTotal,
      outstandingCount: arRows.length,
    };
  }, [payments, arRows]);

  if (!canView)
    return (
      <NoAccess title="การรับชำระ" icon={<Wallet className="h-6 w-6" />}>
        บทบาทแม่บ้านไม่สามารถดูการรับชำระได้ — ลองสลับเป็นผู้จัดการ/เจ้าของ
      </NoAccess>
    );

  const tabs = (
    <div className="inline-flex rounded-lg border border-gray-200 bg-white p-1">
      <Button
        size="sm"
        variant={tab === "list" ? "secondary" : "ghost"}
        onClick={() => setTab("list")}
      >
        <ReceiptText className="mr-1.5 h-4 w-4" /> รายการรับชำระ
      </Button>
      <Button size="sm" variant={tab === "ar" ? "secondary" : "ghost"} onClick={() => setTab("ar")}>
        <AlertCircle className="mr-1.5 h-4 w-4" /> ยอดค้างชำระ ({kpi.outstandingCount})
      </Button>
    </div>
  );

  return (
    <HotelShell
      title="การรับชำระ"
      description="รายการรับชำระทั้งหมด + ติดตามยอดค้างชำระ (AR) ต่อการจอง"
      icon={<Wallet className="h-6 w-6" />}
      tabs={tabs}
    >
      {/* KPI */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon={<Banknote className="h-4 w-4" />}
          label="รับชำระวันนี้"
          value={fmtMoney(kpi.receivedToday)}
          tone="positive"
          valueColored
        />
        <StatCard
          icon={<ReceiptText className="h-4 w-4" />}
          label="คืนเงินวันนี้"
          value={
            kpi.refundToday > 0
              ? `−${fmtMoney(kpi.refundToday, { currency: false })} ฿`
              : fmtMoney(0)
          }
          tone={kpi.refundToday > 0 ? "negative" : "neutral"}
          valueColored={kpi.refundToday > 0}
        />
        <StatCard
          icon={<AlertCircle className="h-4 w-4" />}
          label="ค้างชำระรวม"
          value={fmtMoney(kpi.outstandingTotal)}
          tone={kpi.outstandingTotal > 0 ? "negative" : "positive"}
          valueColored
        />
        <StatCard
          icon={<Wallet className="h-4 w-4" />}
          label="จำนวนรายการค้าง"
          value={String(kpi.outstandingCount)}
          sub="การจองที่ยังค้างชำระ"
          tone="warning"
        />
      </div>

      {tab === "list" ? (
        <>
          {/* filter bar */}
          <div className="rounded-xl border border-gray-200 bg-white p-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                <Input
                  className="pl-9"
                  placeholder="ค้นหา รหัสจอง / ชื่อแขก / ห้อง / เลขอ้างอิง"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              <CustomSelect value={kindF} onChange={setKindF} options={KIND_OPTIONS} />
              <CustomSelect value={methodF} onChange={setMethodF} options={METHOD_OPTIONS} />
              <ThaiDatePicker value={fromDate} onChange={setFromDate} placeholder="ชำระตั้งแต่" />
              <ThaiDatePicker value={toDate} onChange={setToDate} placeholder="ถึงวันที่" />
            </div>
          </div>

          {/* payment table */}
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>วันที่/เวลา</TableHead>
                <TableHead>รหัสจอง</TableHead>
                <TableHead>แขก</TableHead>
                <TableHead>ห้อง</TableHead>
                <TableHead align="center">ประเภท</TableHead>
                <TableHead>ช่องทาง</TableHead>
                <TableHead>อ้างอิง</TableHead>
                <TableHead align="right">ยอด</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredPayments.length === 0 ? (
                <TableEmpty colSpan={8}>
                  <div className="flex flex-col items-center gap-2 py-6">
                    <Wallet className="h-8 w-8 text-gray-300" />
                    <span>ไม่พบรายการรับชำระตามเงื่อนไข</span>
                  </div>
                </TableEmpty>
              ) : (
                filteredPayments.map((p) => {
                  const b = bookingOf(p.booking_id);
                  const isRefund = p.kind === "refund";
                  return (
                    <TableRow
                      key={p.id}
                      clickable={!!b}
                      onClick={b ? () => setDetail(b) : undefined}
                    >
                      <TableCell className="text-gray-500">{fmtDateTimeTH(p.paid_at)}</TableCell>
                      <TableCell className="font-medium text-gray-900">
                        {b?.booking_code ?? "—"}
                      </TableCell>
                      <TableCell>{b?.guest_name ?? "—"}</TableCell>
                      <TableCell>{roomNoOf(b)}</TableCell>
                      <TableCell align="center">
                        <PaymentKindBadge kind={p.kind} />
                      </TableCell>
                      <TableCell className="text-gray-500">
                        {PAYMENT_METHOD_LABEL[p.method]}
                      </TableCell>
                      <TableCell className="text-gray-400">{p.reference ?? "—"}</TableCell>
                      <TableCell
                        align="right"
                        tabular
                        className={
                          isRefund ? "font-medium text-red-600" : "font-medium text-green-600"
                        }
                      >
                        {isRefund
                          ? `−${fmtMoney(p.amount, { currency: false })} ฿`
                          : fmtMoney(p.amount)}
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </>
      ) : (
        /* ── AR ยอดค้างชำระ ── */
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>รหัสจอง</TableHead>
              <TableHead>แขก</TableHead>
              <TableHead>ห้อง</TableHead>
              <TableHead>เข้าพัก</TableHead>
              <TableHead align="right">ยอดรวม</TableHead>
              <TableHead align="right">ชำระแล้ว</TableHead>
              <TableHead align="right">ค้างชำระ</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {arRows.length === 0 ? (
              <TableEmpty colSpan={7}>
                <div className="flex flex-col items-center gap-2 py-6">
                  <Banknote className="h-8 w-8 text-gray-300" />
                  <span>เยี่ยม! ไม่มียอดค้างชำระคงเหลือ</span>
                </div>
              </TableEmpty>
            ) : (
              arRows.map(({ booking: b, balance }) => {
                const paid = b.grand_total - balance;
                return (
                  <TableRow key={b.id} clickable onClick={() => setDetail(b)}>
                    <TableCell className="font-medium text-gray-900">{b.booking_code}</TableCell>
                    <TableCell>{b.guest_name}</TableCell>
                    <TableCell>{roomNoOf(b)}</TableCell>
                    <TableCell className="text-gray-500">{fmtDateTH(b.check_in_date)}</TableCell>
                    <TableCell align="right" tabular>
                      {fmtMoney(b.grand_total)}
                    </TableCell>
                    <TableCell align="right" tabular className="text-gray-500">
                      {fmtMoney(paid)}
                    </TableCell>
                    <TableCell align="right" tabular className="font-semibold text-red-600">
                      {fmtMoney(balance)}
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      )}

      {/* dialogs */}
      <PaymentDialog
        open={payFor !== null}
        onOpenChange={(v) => !v && setPayFor(null)}
        booking={payFor}
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
    </HotelShell>
  );
}
