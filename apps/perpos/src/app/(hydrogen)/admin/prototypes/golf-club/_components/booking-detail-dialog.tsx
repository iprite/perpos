"use client";

// booking-detail-dialog.tsx — ดูจอง + lifecycle actions ตาม state + role + payment mock + AI-2
// owner: ui Group A · mode: view | pay | cancel (ในตัว dialog เดียว — ไม่ nested dialog)
// pending→ยืนยัน/ยกเลิก · confirmed→เช็คอิน/ยกเลิก/no-show · checked_in→จบรอบ
// breakdown ค่าบริการ (right-align tabular) · แถบ payment + "รับชำระ" · ประวัติ member · AI-2 "อธิบายด้วย AI"

import { useMemo, useState, type ReactNode } from "react";
import {
  CheckCircle2,
  LogIn,
  Flag,
  Ban,
  UserX,
  Wallet,
  Pencil,
  Sparkles,
  Loader2,
  Lightbulb,
  ArrowLeft,
  History,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Text } from "@/components/ui/typography";
import {
  Dialog,
  DialogContent,
  DialogBody,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "@/lib/toast";
import cn from "@core/utils/class-names";
import { useGolfData, bookerName } from "./data-context";
import { useGolfRole } from "./role-context";
import { formatAmount, fmtNum } from "./money";
import { fmtDateTH, dowTH } from "./format";
import {
  BookingStatusBadge,
  PaymentStatusBadge,
  ChannelBadge,
  TIER_LABEL,
} from "./badges";
import { PaymentMock, defaultPaymentValue, amountToPay, type PaymentMockValue } from "./payment-mock";
import {
  golfRiskHigh,
  golfRiskMedium,
  golfRiskLow,
  type GolfNoShowRisk,
} from "../_fixtures/ai-mocks";
import type { GolfBooking, GolfMember } from "../_fixtures/types";

/** map booking → canned AI-2 risk (anchor) หรือสังเคราะห์จาก rule */
function resolveRisk(b: GolfBooking, member: GolfMember | null): GolfNoShowRisk {
  if (b.booking_ref === golfRiskHigh.booking_ref) return golfRiskHigh;
  if (b.booking_ref === golfRiskMedium.booking_ref) return golfRiskMedium;
  if (b.booking_ref === golfRiskLow.booking_ref) return golfRiskLow;

  const noShow = member?.no_show_count ?? 0;
  const highSignal = noShow >= 3 || (b.channel === "line" && b.status === "pending" && b.payment_status === "unpaid");
  const lowSignal = noShow === 0 && (b.payment_status === "paid" || b.status === "confirmed" || b.status === "checked_in");
  const level: "high" | "medium" | "low" = highSignal ? "high" : lowSignal ? "low" : "medium";

  const reason =
    level === "high"
      ? `ประวัติไม่มาตามนัด ${noShow} ครั้ง และ${b.payment_status === "unpaid" ? "ยังไม่ชำระมัดจำ" : "คิวยังไม่ยืนยัน"} — เสี่ยงหลุดช่อง`
      : level === "low"
        ? "ชำระ/ยืนยันแล้วและไม่มีประวัติ no-show — ความเสี่ยงต่ำ"
        : "มีสัญญาณเสี่ยงบางส่วน (ยังไม่ยืนยัน/ชำระบางส่วน) — ควรติดตามยืนยัน";
  const suggest =
    level === "high"
      ? ["ขอมัดจำก่อนยืนยันคิว", "ส่งข้อความยืนยันซ้ำผ่าน LINE", "เตรียม waitlist ช่วงพีค"]
      : level === "low"
        ? ["ไม่ต้องดำเนินการเพิ่ม — พร้อมต้อนรับตามคิว"]
        : ["ส่งเตือนยืนยันคิวก่อนถึงวันเล่น", "ถ้าไม่ยืนยันคืนนี้ ค่อยติดตามทาง LINE"];
  return {
    booking_ref: b.booking_ref ?? "",
    member_id: b.member_id,
    member_name: member?.display_name ?? b.contact_name ?? "ลูกค้า",
    input: {
      risk_level: level,
      no_show_count: noShow,
      no_show_rate_pct: 0,
      total_bookings: 0,
      channel: b.channel,
      payment_status: b.payment_status,
      booking_status: b.status,
      slot_label: `${b.start_time}`,
      band_util_pct: 0,
    },
    output: { risk_level: level, reason, suggest, confidence: level === "low" ? 0.9 : 0.82 },
  };
}

const RISK_META: Record<"high" | "medium" | "low", { label: string; cls: string }> = {
  high: { label: "เสี่ยงสูง", cls: "border-red-200 bg-red-50 text-red-700" },
  medium: { label: "เสี่ยงปานกลาง", cls: "border-amber-200 bg-amber-50 text-amber-700" },
  low: { label: "เสี่ยงต่ำ", cls: "border-green-200 bg-green-50 text-green-700" },
};

export function BookingDetailDialog({
  booking,
  open,
  onOpenChange,
  onEdit,
}: {
  booking: GolfBooking | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** เปิดฟอร์มแก้ไข (page เป็นผู้ wire) */
  onEdit?: (b: GolfBooking) => void;
}) {
  const { resources, members, bookings, confirmBooking, checkInBooking, completeBooking, cancelBooking, markNoShow, receivePayment } =
    useGolfData();
  const { canWrite } = useGolfRole();
  const writable = canWrite("bookings");

  const [mode, setMode] = useState<"view" | "pay" | "cancel">("view");
  const [cancelReason, setCancelReason] = useState("");
  const [payment, setPayment] = useState<PaymentMockValue>(() => defaultPaymentValue(0));

  // AI-2
  const [aiLoading, setAiLoading] = useState(false);
  const [aiResult, setAiResult] = useState<GolfNoShowRisk | null>(null);

  // reset เมื่อเปิด booking ใหม่
  const key = `${open}-${booking?.id ?? ""}`;
  const [lastKey, setLastKey] = useState(key);
  if (open && key !== lastKey) {
    setLastKey(key);
    setMode("view");
    setCancelReason("");
    setAiResult(null);
    setAiLoading(false);
  }

  const member = useMemo(
    () => (booking?.member_id ? members.find((m) => m.id === booking.member_id) ?? null : null),
    [booking, members],
  );

  const memberStat = useMemo(() => {
    if (!member) return null;
    const mine = bookings.filter((b) => b.member_id === member.id);
    return {
      total: mine.length,
      completed: mine.filter((b) => b.status === "completed").length,
      noShow: member.no_show_count,
      points: member.points_balance,
    };
  }, [member, bookings]);

  if (!booking) return null;

  const resource = resources.find((r) => r.id === booking.resource_id);
  const total = booking.total_amount ?? 0;
  const paid = booking.paid_amount ?? 0;
  const balance = Math.max(0, total - paid);

  function act(fn: () => void, msg: string) {
    fn();
    toast.success(msg);
    onOpenChange(false);
  }

  function openReceive() {
    setPayment(defaultPaymentValue(balance));
    setMode("pay");
  }

  function confirmReceive() {
    const pay = amountToPay(payment, balance);
    if (pay <= 0) return toast.error("กรุณาระบุยอดที่รับชำระ");
    const newPaid = paid + pay;
    const status = newPaid >= total ? "paid" : "deposit_paid";
    receivePayment(booking!.id, { amount: pay, method: payment.method, status });
    toast.success(`รับชำระ ${formatAmount(pay)} — ${booking!.booking_ref ?? ""} สำเร็จ`);
    onOpenChange(false);
  }

  function confirmCancel() {
    if (!cancelReason.trim()) return toast.error("กรุณาระบุเหตุผลการยกเลิก");
    cancelBooking(booking!.id, cancelReason.trim());
    toast.success(`ยกเลิก ${booking!.booking_ref ?? ""} แล้ว`);
    onOpenChange(false);
  }

  function runAi() {
    setAiLoading(true);
    setAiResult(null);
    setTimeout(() => {
      setAiResult(resolveRisk(booking!, member));
      setAiLoading(false);
    }, 1000);
  }

  const isTee = booking.booking_type === "tee_time";
  const title = booking.booking_ref ?? (isTee ? "การจองสนาม" : "การจองไดร์ฟ");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="xl">
        <DialogHeader>
          <DialogTitle>
            <span className="flex flex-wrap items-center gap-2">
              {mode === "pay" ? "รับชำระเงิน" : mode === "cancel" ? "ยกเลิกการจอง" : title}
              {mode === "view" && <BookingStatusBadge status={booking.status} />}
            </span>
          </DialogTitle>
        </DialogHeader>

        <DialogBody>
          {mode === "pay" ? (
            <div className="space-y-4">
              <div className="rounded-lg bg-gray-50 px-3 py-2.5 text-sm text-gray-600">
                {bookerName(booking, members)} · ยอดรวม {formatAmount(total)} · ยอดค้าง{" "}
                <span className="font-mono font-semibold tabular-nums text-red-600">
                  {formatAmount(balance)}
                </span>
              </div>
              <PaymentMock total={balance} value={payment} onChange={setPayment} allowDeposit />
            </div>
          ) : mode === "cancel" ? (
            <div className="space-y-3">
              <Text className="text-sm text-gray-600">
                ยกเลิกการจอง {booking.booking_ref} ของ {bookerName(booking, members)}?
                {paid > 0 && " — ยอดที่ชำระแล้วจะถูกทำเครื่องหมายคืนเงิน (mock)"}
              </Text>
              <div>
                <Label htmlFor="bd-reason">เหตุผลการยกเลิก *</Label>
                <Input
                  id="bd-reason"
                  className="mt-1"
                  placeholder="เช่น ลูกค้าติดธุระ / ฝนตกหนัก"
                  value={cancelReason}
                  onChange={(e) => setCancelReason(e.target.value)}
                />
              </div>
            </div>
          ) : (
            <div className="space-y-5">
              {/* ข้อมูลจอง */}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label="ผู้จอง" value={bookerName(booking, members)} />
                <Field
                  label="ประเภท / ทรัพยากร"
                  value={`${isTee ? "สนามกอล์ฟ" : "ไดร์ฟกอล์ฟ"} · ${resource?.name ?? "—"}`}
                />
                <Field
                  label="วัน-เวลา"
                  value={`${dowTH(booking.booking_date)} ${fmtDateTH(booking.booking_date)} · ${booking.start_time}${booking.end_time ? `–${booking.end_time}` : ""} น.`}
                />
                <Field
                  label="จำนวน"
                  value={isTee ? `${booking.party_size} คน` : `${booking.bucket_qty ?? 1} ตะกร้า`}
                />
                <div>
                  <Text className="text-xs text-gray-400">ช่องทาง</Text>
                  <div className="mt-0.5">
                    <ChannelBadge channel={booking.channel} />
                  </div>
                </div>
                {booking.contact_phone && <Field label="เบอร์โทร" value={booking.contact_phone} />}
                {booking.notes && <Field label="หมายเหตุ" value={booking.notes} />}
                {booking.cancel_reason && (
                  <Field label="เหตุผลยกเลิก" value={booking.cancel_reason} />
                )}
              </div>

              {/* breakdown ค่าบริการ */}
              <div>
                <Text className="mb-1.5 text-sm font-semibold text-gray-900">ค่าบริการ</Text>
                <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-sm">
                  <div className="space-y-1">
                    {booking.items.map((it) => (
                      <div key={it.id} className="flex items-center justify-between text-gray-600">
                        <span>
                          {it.description}
                          <span className="ml-1 text-gray-400">@ {fmtNum(it.unit_price)}</span>
                        </span>
                        <span className="font-mono tabular-nums text-gray-700">
                          {formatAmount(it.line_total)}
                        </span>
                      </div>
                    ))}
                  </div>
                  <div className="mt-2 flex items-center justify-between border-t border-gray-200 pt-2 font-semibold text-gray-900">
                    <span>ยอดรวม</span>
                    <span className="font-mono tabular-nums">{formatAmount(total)}</span>
                  </div>
                </div>
              </div>

              {/* payment bar */}
              <div className="rounded-lg border border-gray-200 bg-white px-4 py-3 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Wallet className="h-4 w-4 text-gray-400" />
                    <span className="text-gray-600">สถานะชำระ</span>
                    <PaymentStatusBadge status={booking.payment_status} />
                  </div>
                  <div className="text-xs text-gray-500">
                    ชำระแล้ว{" "}
                    <span className="font-mono tabular-nums text-gray-900">{formatAmount(paid)}</span>
                    {balance > 0 && (
                      <>
                        {" · ค้าง "}
                        <span className="font-mono tabular-nums text-red-600">
                          {formatAmount(balance)}
                        </span>
                      </>
                    )}
                  </div>
                </div>
              </div>

              {/* ประวัติ member */}
              {member && memberStat && (
                <div className="rounded-lg border border-gray-200 bg-white px-4 py-3">
                  <div className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-gray-900">
                    <History className="h-4 w-4 text-gray-400" />
                    ประวัติสมาชิก · {member.display_name}
                    {member.tier !== "none" && (
                      <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">
                        {TIER_LABEL[member.tier]}
                      </span>
                    )}
                  </div>
                  <div className="grid grid-cols-3 gap-3 text-center">
                    <MemberMetric label="จองทั้งหมด" value={`${fmtNum(memberStat.total)}`} />
                    <MemberMetric
                      label="ไม่มาตามนัด"
                      value={`${fmtNum(memberStat.noShow)}`}
                      danger={memberStat.noShow > 0}
                    />
                    <MemberMetric label="แต้มสะสม" value={`${fmtNum(memberStat.points)}`} />
                  </div>
                </div>
              )}

              {/* AI-2 */}
              <div className="rounded-xl border border-gray-200 bg-white p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-center gap-2">
                    <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
                      <Sparkles className="h-4 w-4" />
                    </span>
                    <div>
                      <Text className="text-sm font-semibold text-gray-900">
                        วิเคราะห์ความเสี่ยงไม่มาตามนัด
                      </Text>
                      <Text className="text-xs text-gray-500">
                        AI อธิบายความเสี่ยง no-show + แนะ action
                      </Text>
                    </div>
                  </div>
                  <Button size="sm" variant="outline" onClick={runAi} disabled={aiLoading}>
                    {aiLoading ? (
                      <>
                        <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                        กำลังวิเคราะห์…
                      </>
                    ) : (
                      <>
                        <Sparkles className="mr-1.5 h-4 w-4" />
                        อธิบายด้วย AI
                      </>
                    )}
                  </Button>
                </div>

                {aiLoading && (
                  <div className="mt-3 animate-pulse space-y-2">
                    <div className="h-4 w-3/4 rounded bg-gray-100" />
                    <div className="h-4 w-full rounded bg-gray-100" />
                  </div>
                )}

                {aiResult && !aiLoading && (
                  <div className="mt-3 space-y-3">
                    <div
                      className={cn(
                        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium",
                        RISK_META[aiResult.output.risk_level].cls,
                      )}
                    >
                      <UserX className="h-3.5 w-3.5" />
                      {RISK_META[aiResult.output.risk_level].label}
                    </div>
                    <p className="text-sm leading-relaxed text-gray-700">{aiResult.output.reason}</p>
                    <div className="rounded-lg border border-blue-200 bg-blue-50 p-3">
                      <div className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-blue-700">
                        <Lightbulb className="h-3.5 w-3.5" />
                        คำแนะนำ
                      </div>
                      <ul className="space-y-1">
                        {aiResult.output.suggest.map((s, i) => (
                          <li key={i} className="flex gap-2 text-xs text-blue-800">
                            <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-blue-500" />
                            {s}
                          </li>
                        ))}
                      </ul>
                    </div>
                    <Text className="text-[11px] text-gray-400">
                      ความเชื่อมั่น {Math.round(aiResult.output.confidence * 100)}% · AI สรุปจากสัญญาณที่ระบบคำนวณ (ตรวจทานก่อนตัดสินใจ)
                    </Text>
                  </div>
                )}
              </div>
            </div>
          )}
        </DialogBody>

        <DialogFooter>
          {mode === "pay" ? (
            <>
              <Button variant="ghost" className="mr-auto" onClick={() => setMode("view")}>
                <ArrowLeft className="mr-1.5 h-4 w-4" />
                ย้อนกลับ
              </Button>
              <Button onClick={confirmReceive}>บันทึกการชำระ</Button>
            </>
          ) : mode === "cancel" ? (
            <>
              <Button variant="ghost" className="mr-auto" onClick={() => setMode("view")}>
                <ArrowLeft className="mr-1.5 h-4 w-4" />
                ย้อนกลับ
              </Button>
              <Button variant="destructive" onClick={confirmCancel}>
                ยืนยันยกเลิก
              </Button>
            </>
          ) : (
            <>
              {writable && (booking.status === "pending" || booking.status === "confirmed") && (
                <Button
                  variant="destructive"
                  className="mr-auto"
                  onClick={() => setMode("cancel")}
                >
                  <Ban className="mr-1.5 h-4 w-4" />
                  ยกเลิก
                </Button>
              )}

              {writable && balance > 0 && booking.status !== "cancelled" && booking.status !== "no_show" && (
                <Button variant="outline" onClick={openReceive}>
                  <Wallet className="mr-1.5 h-4 w-4" />
                  รับชำระ
                </Button>
              )}

              {writable && onEdit && (booking.status === "pending" || booking.status === "confirmed") && (
                <Button
                  variant="outline"
                  onClick={() => {
                    onEdit(booking);
                    onOpenChange(false);
                  }}
                >
                  <Pencil className="mr-1.5 h-4 w-4" />
                  แก้ไข
                </Button>
              )}

              {writable && booking.status === "pending" && (
                <Button
                  onClick={() =>
                    act(() => confirmBooking(booking.id), `ยืนยัน ${booking.booking_ref ?? ""} แล้ว`)
                  }
                >
                  <CheckCircle2 className="mr-1.5 h-4 w-4" />
                  ยืนยันการจอง
                </Button>
              )}

              {writable && booking.status === "confirmed" && (
                <>
                  <Button
                    variant="outline"
                    onClick={() =>
                      act(() => markNoShow(booking.id), `ทำเครื่องหมายไม่มาตามนัด ${booking.booking_ref ?? ""}`)
                    }
                  >
                    <UserX className="mr-1.5 h-4 w-4" />
                    ไม่มาตามนัด
                  </Button>
                  <Button
                    onClick={() =>
                      act(() => checkInBooking(booking.id), `เช็คอิน ${booking.booking_ref ?? ""} สำเร็จ`)
                    }
                  >
                    <LogIn className="mr-1.5 h-4 w-4" />
                    เช็คอิน
                  </Button>
                </>
              )}

              {writable && booking.status === "checked_in" && (
                <Button
                  onClick={() =>
                    act(() => completeBooking(booking.id), `จบรอบ ${booking.booking_ref ?? ""} — บันทึกรายได้ + แต้ม`)
                  }
                >
                  <Flag className="mr-1.5 h-4 w-4" />
                  จบรอบ
                </Button>
              )}

              <Button variant="ghost" onClick={() => onOpenChange(false)}>
                ปิด
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div>
      <Text className="text-xs text-gray-400">{label}</Text>
      <Text className="mt-0.5 text-sm font-medium text-gray-900">{value}</Text>
    </div>
  );
}

function MemberMetric({ label, value, danger }: { label: string; value: string; danger?: boolean }) {
  return (
    <div className="rounded-lg bg-gray-50 px-2 py-2">
      <div className={cn("text-lg font-semibold tabular-nums", danger ? "text-red-600" : "text-gray-900")}>
        {value}
      </div>
      <div className="text-[11px] text-gray-500">{label}</div>
    </div>
  );
}
