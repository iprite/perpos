"use client";

// booking-dialog.tsx — ฟอร์มจองใหม่ (shared) เรียกจาก dashboard/calendar/bookings/daily
// field จำเป็นเด่นบนสุด · field รองพับใน collapse (ปิด default) · default มาก (adults=1/daily/rate auto)
// overlap check (กันจองทับช่วงเวลาเดียวกัน) + คำนวณ room_total/grand_total สด

import { useMemo, useState } from "react";
import { ChevronDown, ChevronUp, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CustomSelect } from "@/components/ui/custom-select";
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
import { useHotelData, resolveRoomRate, type NewBookingInput } from "./data-context";
import { fmtMoney } from "./format";
import { ROOM_TYPE_LABEL, SOURCE_LABEL, PAYMENT_METHOD_LABEL } from "./badges";
import type { BookingSource, StayType, PaymentMethod } from "../_fixtures/types";

const SOURCE_OPTIONS = (Object.keys(SOURCE_LABEL) as BookingSource[]).map((s) => ({
  value: s,
  label: SOURCE_LABEL[s],
}));

const METHOD_OPTIONS = (Object.keys(PAYMENT_METHOD_LABEL) as PaymentMethod[]).map((m) => ({
  value: m,
  label: PAYMENT_METHOD_LABEL[m],
}));

function nightsBetween(checkIn: string, checkOut: string): number {
  const a = new Date(checkIn).getTime();
  const b = new Date(checkOut).getTime();
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 0;
  return Math.max(0, Math.round((b - a) / 86400000));
}

/** ช่วงวัน [s1,e1) ทับกับ [s2,e2) ไหม */
function overlaps(s1: string, e1: string, s2: string, e2: string): boolean {
  return s1 < e2 && s2 < e1;
}

interface FormState {
  room_id: string;
  guest_name: string;
  nationality: string;
  phone: string;
  stay_type: StayType;
  source: BookingSource;
  check_in_date: string;
  check_out_date: string;
  hours: string;
  adults: string;
  children: string;
  room_rate: string;
  extra_charges: string;
  discount: string;
  deposit: string;
  deposit_method: PaymentMethod;
  notes: string;
}

const emptyForm = (prefRoom?: string, prefDate?: string): FormState => ({
  room_id: prefRoom ?? "",
  guest_name: "",
  nationality: "",
  phone: "",
  stay_type: "daily",
  source: "walk_in",
  check_in_date: prefDate ?? "",
  check_out_date: "",
  hours: "",
  adults: "1",
  children: "0",
  room_rate: "",
  extra_charges: "0",
  discount: "0",
  deposit: "",
  deposit_method: "cash",
  notes: "",
});

export function BookingDialog({
  open,
  onOpenChange,
  prefillRoomId,
  prefillDate,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  prefillRoomId?: string;
  prefillDate?: string;
  onCreated?: (bookingId: string) => void;
}) {
  const { rooms, bookings, roomTypeConfigs, addBooking } = useHotelData();
  const [showMore, setShowMore] = useState(false);
  const [form, setForm] = useState<FormState>(() => emptyForm(prefillRoomId, prefillDate));

  // reset เมื่อเปิดใหม่ (prefill เปลี่ยน)
  const formKey = `${open}-${prefillRoomId}-${prefillDate}`;
  const [lastKey, setLastKey] = useState(formKey);
  if (open && formKey !== lastKey) {
    setLastKey(formKey);
    setForm(emptyForm(prefillRoomId, prefillDate));
    setShowMore(false);
  }

  const selectedRoom = rooms.find((r) => r.id === form.room_id) ?? null;

  // auto rate เมื่อเลือกห้อง/เปลี่ยน stay_type (ถ้ายังไม่ได้แก้ rate เอง)
  const autoRate = selectedRoom
    ? resolveRoomRate(selectedRoom, roomTypeConfigs, form.stay_type)
    : 0;

  function pickRoom(id: string) {
    const room = rooms.find((r) => r.id === id);
    const rate = room ? resolveRoomRate(room, roomTypeConfigs, form.stay_type) : 0;
    setForm((f) => ({ ...f, room_id: id, room_rate: rate ? String(rate) : "" }));
  }

  function pickStayType(v: StayType) {
    const room = rooms.find((r) => r.id === form.room_id);
    const rate = room ? resolveRoomRate(room, roomTypeConfigs, v) : 0;
    setForm((f) => ({ ...f, stay_type: v, room_rate: rate ? String(rate) : "" }));
  }

  const nights =
    form.stay_type === "daily" && form.check_in_date && form.check_out_date
      ? nightsBetween(form.check_in_date, form.check_out_date)
      : 0;
  const hours = form.stay_type === "hourly" ? Number(form.hours) || 0 : 0;
  const rate = Number(form.room_rate) || 0;
  const roomTotal = form.stay_type === "hourly" ? rate * hours : rate * nights;
  const grandTotal = roomTotal + (Number(form.extra_charges) || 0) - (Number(form.discount) || 0);

  // ── overlap check (กันจองทับช่วงเวลาเดียวกัน) ──
  const overlapError = useMemo(() => {
    if (!form.room_id || !form.check_in_date) return null;
    const newOut =
      form.stay_type === "daily" ? form.check_out_date || form.check_in_date : form.check_in_date;
    const newEnd = newOut > form.check_in_date ? newOut : addDay(form.check_in_date);
    for (const b of bookings) {
      if (b.room_id !== form.room_id) continue;
      if (b.status === "cancelled" || b.status === "no_show" || b.status === "checked_out")
        continue;
      const bEnd = b.check_out_date || addDay(b.check_in_date);
      if (overlaps(form.check_in_date, newEnd, b.check_in_date, bEnd)) {
        return `ห้องนี้มีจองทับช่วงเวลาอยู่แล้ว (${b.booking_code} · ${b.guest_name})`;
      }
    }
    return null;
  }, [form.room_id, form.check_in_date, form.check_out_date, form.stay_type, bookings]);

  // ห้องที่เลือกได้ (ไม่ปิดซ่อม/หยุดขาย)
  const roomOptions = rooms
    .filter((r) => r.status !== "maintenance" && r.status !== "out_of_service")
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((r) => ({
      value: r.id,
      label: `${r.room_number} · ${ROOM_TYPE_LABEL[r.room_type]}`,
    }));

  function handleSubmit() {
    if (!form.room_id) return toast.error("กรุณาเลือกห้อง");
    if (!form.guest_name.trim()) return toast.error("กรุณากรอกชื่อแขก");
    if (!form.check_in_date) return toast.error("กรุณาเลือกวันเข้าพัก");
    if (form.stay_type === "daily" && !form.check_out_date)
      return toast.error("กรุณาเลือกวันเช็คเอาท์");
    if (form.stay_type === "daily" && nights < 1)
      return toast.error("วันเช็คเอาท์ต้องหลังวันเข้าพัก");
    if (form.stay_type === "hourly" && hours < 1) return toast.error("กรุณากรอกจำนวนชั่วโมง");
    if (rate <= 0) return toast.error("กรุณากรอกราคาห้อง");
    if (overlapError) return toast.error(overlapError);

    const input: NewBookingInput = {
      room_id: form.room_id,
      guest_id: null,
      guest_name: form.guest_name.trim(),
      nationality: form.nationality.trim() || null,
      phone: form.phone.trim() || null,
      stay_type: form.stay_type,
      source: form.source,
      check_in_date: form.check_in_date,
      check_out_date: form.stay_type === "daily" ? form.check_out_date : form.check_in_date,
      nights: form.stay_type === "daily" ? nights : null,
      hours: form.stay_type === "hourly" ? hours : null,
      adults: Number(form.adults) || 1,
      children: Number(form.children) || 0,
      room_rate: rate,
      extra_charges: Number(form.extra_charges) || 0,
      discount: Number(form.discount) || 0,
      notes: form.notes.trim() || null,
      deposit:
        Number(form.deposit) > 0
          ? { amount: Number(form.deposit), method: form.deposit_method }
          : null,
    };
    const created = addBooking(input);
    toast.success(`สร้างการจอง ${created.booking_code} สำเร็จ — ${created.guest_name}`);
    onOpenChange(false);
    onCreated?.(created.id);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="xl">
        <DialogHeader>
          <DialogTitle>จองห้องใหม่</DialogTitle>
        </DialogHeader>
        <DialogBody>
          <div className="space-y-4">
            {/* ── field จำเป็น ── */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="bk-room">ห้อง *</Label>
                <CustomSelect
                  className="mt-1"
                  value={form.room_id}
                  onChange={pickRoom}
                  options={[{ value: "", label: "— เลือกห้องว่าง —" }, ...roomOptions]}
                />
              </div>
              <div>
                <Label htmlFor="bk-source">ช่องทางการจอง *</Label>
                <CustomSelect
                  className="mt-1"
                  value={form.source}
                  onChange={(v) => setForm((f) => ({ ...f, source: v as BookingSource }))}
                  options={SOURCE_OPTIONS}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="bk-guest">ชื่อแขก *</Label>
                <Input
                  id="bk-guest"
                  className="mt-1"
                  placeholder="ชื่อ-นามสกุล"
                  value={form.guest_name}
                  onChange={(e) => setForm((f) => ({ ...f, guest_name: e.target.value }))}
                />
              </div>
              <div>
                <Label htmlFor="bk-phone">เบอร์โทร</Label>
                <Input
                  id="bk-phone"
                  className="mt-1"
                  placeholder="081-234-5678"
                  value={form.phone}
                  onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                />
              </div>
            </div>

            <div>
              <Label htmlFor="bk-staytype">ประเภทการเข้าพัก</Label>
              <CustomSelect
                className="mt-1"
                value={form.stay_type}
                onChange={(v) => pickStayType(v as StayType)}
                options={[
                  { value: "daily", label: "รายคืน (Daily)" },
                  { value: "hourly", label: "รายชั่วโมง (Hourly)" },
                ]}
              />
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <Label>วันเข้าพัก *</Label>
                <ThaiDatePicker
                  value={form.check_in_date}
                  onChange={(iso) => setForm((f) => ({ ...f, check_in_date: iso }))}
                  placeholder="เลือกวันเข้าพัก"
                />
              </div>
              {form.stay_type === "daily" ? (
                <div>
                  <Label>วันเช็คเอาท์ *</Label>
                  <ThaiDatePicker
                    value={form.check_out_date}
                    onChange={(iso) => setForm((f) => ({ ...f, check_out_date: iso }))}
                    placeholder="เลือกวันเช็คเอาท์"
                  />
                </div>
              ) : (
                <div>
                  <Label htmlFor="bk-hours">จำนวนชั่วโมง *</Label>
                  <Input
                    id="bk-hours"
                    type="number"
                    className="mt-1"
                    placeholder="เช่น 6"
                    value={form.hours}
                    onChange={(e) => setForm((f) => ({ ...f, hours: e.target.value }))}
                  />
                </div>
              )}
            </div>

            <div>
              <Label htmlFor="bk-rate">
                ราคา{form.stay_type === "hourly" ? "/ชม." : "/คืน"} (฿) *
              </Label>
              <Input
                id="bk-rate"
                type="number"
                className="mt-1"
                value={form.room_rate}
                onChange={(e) => setForm((f) => ({ ...f, room_rate: e.target.value }))}
              />
              {selectedRoom && autoRate > 0 && (
                <p className="mt-1 text-xs text-gray-400">
                  ราคาฐานของห้องนี้ = {fmtMoney(autoRate)} (แก้ทับได้)
                </p>
              )}
            </div>

            {/* overlap error */}
            {overlapError && (
              <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{overlapError}</span>
              </div>
            )}

            {/* ── field รอง (collapse) ── */}
            <div className="rounded-lg border border-gray-200">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setShowMore((s) => !s)}
                className="flex w-full items-center justify-between rounded-b-none px-3 py-2.5 text-sm font-medium text-gray-600"
              >
                <span>รายละเอียดเพิ่มเติม (ผู้เข้าพัก / ค่าใช้จ่าย / มัดจำ)</span>
                {showMore ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </Button>
              {showMore && (
                <div className="space-y-4 border-t border-gray-100 px-3 py-3">
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                    <div>
                      <Label htmlFor="bk-adults">ผู้ใหญ่</Label>
                      <Input
                        id="bk-adults"
                        type="number"
                        className="mt-1"
                        value={form.adults}
                        onChange={(e) => setForm((f) => ({ ...f, adults: e.target.value }))}
                      />
                    </div>
                    <div>
                      <Label htmlFor="bk-children">เด็ก</Label>
                      <Input
                        id="bk-children"
                        type="number"
                        className="mt-1"
                        value={form.children}
                        onChange={(e) => setForm((f) => ({ ...f, children: e.target.value }))}
                      />
                    </div>
                    <div>
                      <Label htmlFor="bk-nat">สัญชาติ</Label>
                      <Input
                        id="bk-nat"
                        className="mt-1"
                        placeholder="Thai / Japanese …"
                        value={form.nationality}
                        onChange={(e) => setForm((f) => ({ ...f, nationality: e.target.value }))}
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div>
                      <Label htmlFor="bk-extra">ค่าใช้จ่ายเพิ่ม (฿)</Label>
                      <Input
                        id="bk-extra"
                        type="number"
                        className="mt-1"
                        value={form.extra_charges}
                        onChange={(e) => setForm((f) => ({ ...f, extra_charges: e.target.value }))}
                      />
                    </div>
                    <div>
                      <Label htmlFor="bk-discount">ส่วนลด (฿)</Label>
                      <Input
                        id="bk-discount"
                        type="number"
                        className="mt-1"
                        value={form.discount}
                        onChange={(e) => setForm((f) => ({ ...f, discount: e.target.value }))}
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div>
                      <Label htmlFor="bk-deposit">มัดจำตอนจอง (฿)</Label>
                      <Input
                        id="bk-deposit"
                        type="number"
                        className="mt-1"
                        placeholder="เว้นว่าง = ไม่รับมัดจำ"
                        value={form.deposit}
                        onChange={(e) => setForm((f) => ({ ...f, deposit: e.target.value }))}
                      />
                    </div>
                    <div>
                      <Label htmlFor="bk-depmethod">วิธีรับมัดจำ</Label>
                      <CustomSelect
                        className="mt-1"
                        value={form.deposit_method}
                        onChange={(v) =>
                          setForm((f) => ({ ...f, deposit_method: v as PaymentMethod }))
                        }
                        options={METHOD_OPTIONS}
                      />
                    </div>
                  </div>
                  <div>
                    <Label htmlFor="bk-notes">หมายเหตุ</Label>
                    <Input
                      id="bk-notes"
                      className="mt-1"
                      value={form.notes}
                      onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                    />
                  </div>
                </div>
              )}
            </div>

            {/* สรุปยอด */}
            <div className="rounded-lg bg-gray-50 px-3 py-3 text-sm">
              <div className="flex items-center justify-between text-gray-500">
                <span>
                  ค่าห้อง {fmtMoney(rate, { currency: false })} ×{" "}
                  {form.stay_type === "hourly" ? `${hours} ชม.` : `${nights} คืน`}
                </span>
                <span className="font-mono tabular-nums">{fmtMoney(roomTotal)}</span>
              </div>
              <div className="mt-2 flex items-center justify-between border-t border-gray-200 pt-2 font-semibold text-gray-900">
                <span>ยอดรวมทั้งสิ้น</span>
                <span className="font-mono tabular-nums text-primary">{fmtMoney(grandTotal)}</span>
              </div>
            </div>
          </div>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            ยกเลิก
          </Button>
          <Button onClick={handleSubmit} disabled={!!overlapError}>
            สร้างการจอง
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function addDay(iso: string): string {
  const d = new Date(iso);
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}
