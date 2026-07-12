"use client";

// booking-form-dialog.tsx — สร้าง/แก้จอง (2 step: กรอก → ชำระเงิน mock) — owner: ui Group A
// tee: member/walk-in + party 1-4 + แคดดี้/รถ · range: ตะกร้า 30/50/100 + จำนวน
// auto price + โชว์ที่มาราคา (§3.9) · conflict guard slot เต็ม (toast) · payment optional (จ่ายทีหลัง)
// mutation ผ่าน useGolfData (add/update) + toast ทุกครั้ง

import { useMemo, useState } from "react";
import { AlertTriangle, ArrowRight, ArrowLeft, User, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Text } from "@/components/ui/typography";
import { CustomSelect } from "@/components/ui/custom-select";
import { SegmentedControl } from "@/components/ui/segmented";
import { ThaiDatePicker } from "@/components/ui/thai-date-picker";
import {
  Dialog,
  DialogContent,
  DialogBody,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "@/lib/toast";
import { useGolfData, type NewBooking } from "./data-context";
import { formatAmount, fmtNum } from "./money";
import { fmtDateTH, dowTH, TODAY_ISO } from "./format";
import { CHANNEL_LABEL, TIER_LABEL } from "./badges";
import {
  generateSlots,
  slotBookings,
  remainingSeats,
  seatsUsed,
  parseTime,
  toTimeStr,
} from "./slot-grid";
import { quoteBooking } from "./pricing";
import {
  PaymentMock,
  defaultPaymentValue,
  resolvePaymentResult,
  type PaymentMockValue,
} from "./payment-mock";
import type {
  GolfBooking,
  GolfBookingChannel,
  GolfBookingType,
  GolfMember,
} from "../_fixtures/types";

export interface BookingFormPrefill {
  type?: GolfBookingType;
  resourceId?: string;
  date?: string;
  time?: string;
  /** เปิดจากโปรไฟล์สมาชิก → prefill ผู้จอง = สมาชิกรายนี้ */
  memberId?: string;
}

type BookerMode = "member" | "walk_in";

interface FormState {
  booking_type: GolfBookingType;
  channel: GolfBookingChannel;
  date: string;
  resource_id: string;
  time: string;
  bookerMode: BookerMode;
  member_id: string;
  contact_name: string;
  contact_phone: string;
  party_size: number;
  caddie_count: number;
  cart_count: number;
  bucket_price_item_id: string;
  bucket_qty: number;
  notes: string;
}

const BUCKET_IDS = ["bucket-s", "bucket-m", "bucket-l"];

function genRef(dateISO: string): string {
  const compact = dateISO.replace(/-/g, "");
  const n = String(Math.floor(Math.random() * 900) + 100);
  return `GC-${compact}-${n}`;
}

function seedForm(prefill: BookingFormPrefill | undefined, defBay: string): FormState {
  const type = prefill?.type ?? "tee_time";
  return {
    booking_type: type,
    channel: "walk_in",
    date: prefill?.date ?? TODAY_ISO,
    resource_id: prefill?.resourceId ?? (type === "driving_range" ? defBay : "res-course-a"),
    time: prefill?.time ?? "",
    bookerMode: "member",
    member_id: prefill?.memberId ?? "",
    contact_name: "",
    contact_phone: "",
    party_size: 1,
    caddie_count: 0,
    cart_count: 0,
    bucket_price_item_id: "bucket-m",
    bucket_qty: 1,
    notes: "",
  };
}

function seedFromBooking(b: GolfBooking): FormState {
  return {
    booking_type: b.booking_type,
    channel: b.channel,
    date: b.booking_date,
    resource_id: b.resource_id,
    time: b.start_time,
    bookerMode: b.member_id ? "member" : "walk_in",
    member_id: b.member_id ?? "",
    contact_name: b.contact_name ?? "",
    contact_phone: b.contact_phone ?? "",
    party_size: b.party_size,
    caddie_count: b.caddie_count ?? 0,
    cart_count: b.cart_count ?? 0,
    bucket_price_item_id: b.bucket_price_item_id ?? "bucket-m",
    bucket_qty: b.bucket_qty ?? 1,
    notes: b.notes ?? "",
  };
}

export function BookingFormDialog({
  open,
  onOpenChange,
  prefill,
  editBooking,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  prefill?: BookingFormPrefill;
  /** ถ้ามี = โหมดแก้ไข (ไม่มี step ชำระ — ใช้ "รับชำระ" ใน detail แทน) */
  editBooking?: GolfBooking | null;
  onSaved?: (b: GolfBooking) => void;
}) {
  const { resources, members, priceItems, plans, bookings, addBooking, updateBooking } =
    useGolfData();

  const isEdit = !!editBooking;
  const courses = useMemo(
    () => resources.filter((r) => r.resource_type === "course" && r.status !== "inactive"),
    [resources],
  );
  const bays = useMemo(
    () => resources.filter((r) => r.resource_type === "bay" && r.status !== "inactive"),
    [resources],
  );
  const defBay = bays[0]?.id ?? "";

  const [step, setStep] = useState<"form" | "pay">("form");
  const [form, setForm] = useState<FormState>(() =>
    editBooking ? seedFromBooking(editBooking) : seedForm(prefill, defBay),
  );
  const [payment, setPayment] = useState<PaymentMockValue>(() => defaultPaymentValue(0));

  // reset เมื่อเปิดใหม่ (prefill/edit เปลี่ยน) — pattern เดียวกับ hotel booking-dialog
  const key = `${open}-${editBooking?.id ?? ""}-${prefill?.resourceId ?? ""}-${prefill?.date ?? ""}-${prefill?.time ?? ""}-${prefill?.memberId ?? ""}`;
  const [lastKey, setLastKey] = useState(key);
  if (open && key !== lastKey) {
    setLastKey(key);
    setForm(editBooking ? seedFromBooking(editBooking) : seedForm(prefill, defBay));
    setStep("form");
  }

  const isTee = form.booking_type === "tee_time";
  const member: GolfMember | null =
    form.bookerMode === "member" ? members.find((m) => m.id === form.member_id) ?? null : null;

  // timeslots ตามทรัพยากร
  const timeSlots = useMemo(() => {
    const r = resources.find((x) => x.id === form.resource_id);
    if (!r) return [];
    const step = isTee ? r.tee_interval_min ?? 10 : 60;
    return generateSlots(r.open_time ?? "06:00", r.close_time ?? "18:00", step);
  }, [resources, form.resource_id, isTee]);

  // auto price
  const quote = useMemo(
    () =>
      quoteBooking(
        {
          booking_type: form.booking_type,
          booking_date: form.date,
          member,
          party_size: form.party_size,
          caddie_count: form.caddie_count,
          cart_count: form.cart_count,
          bucket_price_item_id: form.bucket_price_item_id,
          bucket_qty: form.bucket_qty,
        },
        priceItems,
        plans,
      ),
    [form, member, priceItems, plans],
  );

  // conflict guard (ยกเว้นตัวเองตอน edit)
  const conflict = useMemo(() => {
    if (!form.resource_id || !form.time) return null;
    const r = resources.find((x) => x.id === form.resource_id);
    if (!r) return null;
    if (r.status === "maintenance") return `${r.name} ปิดซ่อม — จองไม่ได้`;
    const others = slotBookings(bookings, form.resource_id, form.date, form.time).filter(
      (b) => b.id !== editBooking?.id,
    );
    const max = r.max_party_size ?? (isTee ? 4 : 1);
    const need = isTee ? Math.max(1, form.party_size) : 1;
    const remaining = remainingSeats(others, max);
    if (need > remaining) {
      const used = seatsUsed(others);
      return isTee
        ? `ช่วงเวลานี้เหลือ ${remaining} ที่ (จองแล้ว ${used}/${max}) — ลดจำนวนผู้เล่นหรือเลือกเวลาอื่น`
        : `${r.name} ช่วงเวลานี้ถูกจองแล้ว — เลือก bay/เวลาอื่น`;
    }
    return null;
  }, [resources, bookings, form.resource_id, form.date, form.time, form.party_size, isTee, editBooking]);

  function validate(): string | null {
    if (!form.resource_id) return "กรุณาเลือกทรัพยากร";
    if (!form.time) return "กรุณาเลือกเวลา";
    if (form.bookerMode === "member" && !form.member_id) return "กรุณาเลือกสมาชิก";
    if (form.bookerMode === "walk_in" && !form.contact_name.trim())
      return "กรุณากรอกชื่อผู้จอง";
    if (conflict) return conflict;
    return null;
  }

  function buildBooking(paymentResult: {
    payment_status: GolfBooking["payment_status"];
    paid_amount: number;
    payment_method: GolfBooking["payment_method"];
  }): NewBooking {
    const derivedStatus: GolfBooking["status"] =
      form.channel === "line" || form.channel === "web" ? "pending" : "confirmed";
    const endTime = isTee ? null : toTimeStr(parseTime(form.time) + 60);
    return {
      booking_ref: editBooking?.booking_ref ?? genRef(form.date),
      booking_type: form.booking_type,
      resource_id: form.resource_id,
      member_id: form.bookerMode === "member" ? form.member_id : null,
      contact_name: form.bookerMode === "walk_in" ? form.contact_name.trim() : null,
      contact_phone: form.bookerMode === "walk_in" ? form.contact_phone.trim() || null : null,
      booking_date: form.date,
      start_time: form.time,
      end_time: endTime,
      party_size: isTee ? Math.max(1, form.party_size) : 1,
      status: editBooking?.status ?? derivedStatus,
      channel: form.channel,
      caddie_count: isTee ? form.caddie_count : 0,
      cart_count: isTee ? form.cart_count : 0,
      bucket_qty: isTee ? null : Math.max(1, form.bucket_qty),
      bucket_price_item_id: isTee ? null : form.bucket_price_item_id,
      total_amount: quote.total,
      deposit_amount: paymentResult.payment_status === "deposit_paid" ? paymentResult.paid_amount : (editBooking?.deposit_amount ?? 0),
      paid_amount: paymentResult.paid_amount,
      payment_status: paymentResult.payment_status,
      payment_method: paymentResult.payment_method,
      notes: form.notes.trim() || null,
      created_by: null,
      checked_in_at: editBooking?.checked_in_at ?? null,
      cancelled_at: editBooking?.cancelled_at ?? null,
      cancel_reason: editBooking?.cancel_reason ?? null,
      items: quote.items,
    };
  }

  function goPay() {
    const err = validate();
    if (err) return toast.error(err);
    setPayment(defaultPaymentValue(quote.total));
    setStep("pay");
  }

  function saveEdit() {
    const err = validate();
    if (err) return toast.error(err);
    const data = buildBooking({
      payment_status: editBooking!.payment_status,
      paid_amount: editBooking!.paid_amount ?? 0,
      payment_method: editBooking!.payment_method,
    });
    updateBooking(editBooking!.id, data);
    toast.success(`บันทึกการแก้ไข ${editBooking!.booking_ref ?? ""} แล้ว`);
    onOpenChange(false);
    onSaved?.({ ...editBooking!, ...data });
  }

  function finish(payLater: boolean) {
    const result = payLater
      ? { payment_status: "unpaid" as const, paid_amount: 0, payment_method: null }
      : resolvePaymentResult(payment, quote.total);
    const created = addBooking(buildBooking(result));
    const payMsg = payLater
      ? "บันทึกแบบยังไม่ชำระ (จ่ายทีหลัง)"
      : `รับชำระ ${formatAmount(result.paid_amount)}`;
    toast.success(`สร้างการจอง ${created.booking_ref ?? ""} — ${payMsg}`);
    onOpenChange(false);
    onSaved?.(created);
  }

  const bookerName = member?.display_name ?? form.contact_name;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="xl">
        <DialogHeader>
          <DialogTitle>
            {isEdit ? "แก้ไขการจอง" : step === "pay" ? "ชำระเงิน (จำลอง)" : "สร้างการจองใหม่"}
          </DialogTitle>
        </DialogHeader>
        <DialogBody>
          {step === "form" ? (
            <div className="space-y-4">
              {/* ประเภท + ช่องทาง */}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <Label>ประเภทการจอง</Label>
                  <SegmentedControl
                    className="mt-1"
                    fullWidth
                    value={form.booking_type}
                    onChange={(v) =>
                      setForm((f) => ({
                        ...f,
                        booking_type: v,
                        resource_id: v === "driving_range" ? defBay : "res-course-a",
                        time: "",
                      }))
                    }
                    options={[
                      { value: "tee_time", label: "สนามกอล์ฟ" },
                      { value: "driving_range", label: "ไดร์ฟกอล์ฟ" },
                    ]}
                  />
                </div>
                <div>
                  <Label htmlFor="bf-channel">ช่องทาง</Label>
                  <CustomSelect
                    className="mt-1"
                    value={form.channel}
                    onChange={(v) => setForm((f) => ({ ...f, channel: v as GolfBookingChannel }))}
                    options={(Object.keys(CHANNEL_LABEL) as GolfBookingChannel[]).map((c) => ({
                      value: c,
                      label: CHANNEL_LABEL[c],
                    }))}
                  />
                </div>
              </div>

              {/* วัน + ทรัพยากร + เวลา */}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div>
                  <Label>วันเล่น *</Label>
                  <ThaiDatePicker
                    value={form.date}
                    onChange={(iso) => setForm((f) => ({ ...f, date: iso || TODAY_ISO }))}
                  />
                </div>
                <div>
                  <Label htmlFor="bf-res">{isTee ? "สนาม *" : "Bay *"}</Label>
                  <CustomSelect
                    className="mt-1"
                    value={form.resource_id}
                    onChange={(v) => setForm((f) => ({ ...f, resource_id: v, time: "" }))}
                    options={(isTee ? courses : bays).map((r) => ({
                      value: r.id,
                      label: r.status === "maintenance" ? `${r.name} (ปิดซ่อม)` : r.name,
                    }))}
                  />
                </div>
                <div>
                  <Label htmlFor="bf-time">เวลา *</Label>
                  <CustomSelect
                    className="mt-1"
                    value={form.time}
                    onChange={(v) => setForm((f) => ({ ...f, time: v }))}
                    options={[
                      { value: "", label: "— เลือกเวลา —" },
                      ...timeSlots.map((t) => ({ value: t, label: t })),
                    ]}
                  />
                </div>
              </div>

              {/* ผู้จอง */}
              <div>
                <Label>ผู้จอง</Label>
                <SegmentedControl
                  className="mt-1"
                  value={form.bookerMode}
                  onChange={(v) => setForm((f) => ({ ...f, bookerMode: v }))}
                  options={[
                    { value: "member", label: "สมาชิก/ลูกค้า", icon: <User className="h-4 w-4" /> },
                    { value: "walk_in", label: "Walk-in", icon: <Users className="h-4 w-4" /> },
                  ]}
                />
              </div>

              {form.bookerMode === "member" ? (
                <div>
                  <Label htmlFor="bf-member">เลือกสมาชิก *</Label>
                  <CustomSelect
                    className="mt-1"
                    value={form.member_id}
                    onChange={(v) => setForm((f) => ({ ...f, member_id: v }))}
                    options={[
                      { value: "", label: "— เลือกสมาชิก —" },
                      ...members
                        .filter((m) => m.status === "active")
                        .map((m) => ({
                          value: m.id,
                          label: `${m.display_name}${m.tier !== "none" ? ` · ${TIER_LABEL[m.tier]}` : ""}`,
                        })),
                    ]}
                  />
                  {member && member.no_show_count > 0 && (
                    <Text className="mt-1 text-xs text-amber-600">
                      ประวัติไม่มาตามนัด {member.no_show_count} ครั้ง — พิจารณาขอมัดจำก่อน
                    </Text>
                  )}
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <Label htmlFor="bf-name">ชื่อผู้จอง *</Label>
                    <Input
                      id="bf-name"
                      className="mt-1"
                      placeholder="ชื่อ-นามสกุล"
                      value={form.contact_name}
                      onChange={(e) => setForm((f) => ({ ...f, contact_name: e.target.value }))}
                    />
                  </div>
                  <div>
                    <Label htmlFor="bf-phone">เบอร์โทร</Label>
                    <Input
                      id="bf-phone"
                      className="mt-1"
                      placeholder="08x-xxx-xxxx"
                      value={form.contact_phone}
                      onChange={(e) => setForm((f) => ({ ...f, contact_phone: e.target.value }))}
                    />
                  </div>
                </div>
              )}

              {/* tee: party + แคดดี้ + รถ */}
              {isTee ? (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                  <div>
                    <Label htmlFor="bf-party">จำนวนผู้เล่น (flight)</Label>
                    <CustomSelect
                      className="mt-1"
                      value={String(form.party_size)}
                      onChange={(v) => setForm((f) => ({ ...f, party_size: Number(v) }))}
                      options={[1, 2, 3, 4].map((n) => ({ value: String(n), label: `${n} คน` }))}
                    />
                  </div>
                  <div>
                    <Label htmlFor="bf-caddie">แคดดี้</Label>
                    <Input
                      id="bf-caddie"
                      type="number"
                      min={0}
                      className="mt-1"
                      value={form.caddie_count}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, caddie_count: Math.max(0, Number(e.target.value) || 0) }))
                      }
                    />
                  </div>
                  <div>
                    <Label htmlFor="bf-cart">รถกอล์ฟ</Label>
                    <Input
                      id="bf-cart"
                      type="number"
                      min={0}
                      className="mt-1"
                      value={form.cart_count}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, cart_count: Math.max(0, Number(e.target.value) || 0) }))
                      }
                    />
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <Label>ขนาดตะกร้า</Label>
                    <SegmentedControl
                      className="mt-1"
                      fullWidth
                      value={form.bucket_price_item_id}
                      onChange={(v) => setForm((f) => ({ ...f, bucket_price_item_id: v }))}
                      options={BUCKET_IDS.filter((id) => priceItems.some((p) => p.id === id)).map(
                        (id) => {
                          const p = priceItems.find((x) => x.id === id)!;
                          return { value: id, label: `${p.bucket_size} ลูก` };
                        },
                      )}
                    />
                  </div>
                  <div>
                    <Label htmlFor="bf-bucketqty">จำนวนตะกร้า</Label>
                    <Input
                      id="bf-bucketqty"
                      type="number"
                      min={1}
                      className="mt-1"
                      value={form.bucket_qty}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, bucket_qty: Math.max(1, Number(e.target.value) || 1) }))
                      }
                    />
                  </div>
                </div>
              )}

              <div>
                <Label htmlFor="bf-notes">หมายเหตุ</Label>
                <Input
                  id="bf-notes"
                  className="mt-1"
                  placeholder="คำขอพิเศษ (ถ้ามี)"
                  value={form.notes}
                  onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                />
              </div>

              {/* conflict */}
              {conflict && (
                <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>{conflict}</span>
                </div>
              )}

              {/* สรุปราคา + ที่มา */}
              <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 text-sm">
                {quote.greenFeeSource && (
                  <div className="mb-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs text-blue-700">
                    ที่มาราคากรีนฟี: {quote.greenFeeSource}
                  </div>
                )}
                <div className="space-y-1">
                  {quote.items.map((it) => (
                    <div key={it.id} className="flex items-center justify-between text-gray-600">
                      <span>
                        {it.description}
                        <span className="ml-1 text-gray-400">
                          @ {fmtNum(it.unit_price)}
                        </span>
                      </span>
                      <span className="font-mono tabular-nums text-gray-700">
                        {formatAmount(it.line_total)}
                      </span>
                    </div>
                  ))}
                </div>
                <div className="mt-2 flex items-center justify-between border-t border-gray-200 pt-2 font-semibold text-gray-900">
                  <span>ยอดรวม</span>
                  <span className="font-mono tabular-nums text-primary">
                    {formatAmount(quote.total)}
                  </span>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {/* สรุปการจองก่อนชำระ */}
              <div className="rounded-xl border border-gray-200 bg-white p-4 text-sm">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-gray-900">{bookerName || "ลูกค้า"}</span>
                  <span className="text-xs text-gray-500">
                    {isTee ? "สนามกอล์ฟ" : "ไดร์ฟกอล์ฟ"}
                  </span>
                </div>
                <Text className="mt-1 text-xs text-gray-500">
                  {dowTH(form.date)} {fmtDateTH(form.date)} · {form.time} น. ·{" "}
                  {isTee ? `${form.party_size} คน` : `${form.bucket_qty} ตะกร้า`}
                </Text>
              </div>
              <PaymentMock total={quote.total} value={payment} onChange={setPayment} allowDeposit />
              <Text className="text-xs text-gray-400">
                * ระบบจำลอง — ไม่มีการตัดเงินจริง. เลือก “จ่ายทีหลัง” เพื่อบันทึกจองแบบยังไม่ชำระ (รับชำระย้อนหลังได้)
              </Text>
            </div>
          )}
        </DialogBody>
        <DialogFooter>
          {isEdit ? (
            <>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                ยกเลิก
              </Button>
              <Button onClick={saveEdit} disabled={!!conflict}>
                บันทึกการแก้ไข
              </Button>
            </>
          ) : step === "form" ? (
            <>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                ยกเลิก
              </Button>
              <Button onClick={goPay} disabled={!!conflict}>
                ถัดไป: ชำระเงิน
                <ArrowRight className="ml-1.5 h-4 w-4" />
              </Button>
            </>
          ) : (
            <>
              <Button variant="ghost" className="mr-auto" onClick={() => setStep("form")}>
                <ArrowLeft className="mr-1.5 h-4 w-4" />
                ย้อนกลับ
              </Button>
              <Button variant="outline" onClick={() => finish(true)}>
                จ่ายทีหลัง
              </Button>
              <Button onClick={() => finish(false)}>ยืนยันชำระ &amp; บันทึก</Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
