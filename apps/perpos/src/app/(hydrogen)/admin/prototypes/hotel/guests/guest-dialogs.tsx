"use client";

// guest-dialogs.tsx — GuestDetailDialog (ประวัติเข้าพัก) + GuestFormDialog (เพิ่มแขก)
// แยกไฟล์จาก page เพื่อกัน 32k cap + แยก concern · ทั้งสองใช้ DialogBody เสมอ (§13)

import { useMemo, useState } from "react";
import { UserPlus, CalendarCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CustomSelect } from "@/components/ui/custom-select";
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
import {
  useHotelData,
  fmtMoney,
  fmtStayRange,
  fmtDateTH,
  computeBalance,
  paymentsOf,
  BookingStatusBadge,
  RoomTypeBadge,
  SourceBadge,
} from "../_components";
import type { Guest, GuestIdType } from "../_fixtures/types";

const ID_TYPE_LABEL: Record<GuestIdType, string> = {
  national_id: "บัตรประชาชน",
  passport: "พาสปอร์ต",
  other: "อื่นๆ",
};

const ID_TYPE_OPTIONS = [
  { value: "national_id", label: "บัตรประชาชน" },
  { value: "passport", label: "พาสปอร์ต" },
  { value: "other", label: "อื่นๆ" },
];

/** ดึงจำนวนครั้งเข้าพักจริงของแขก (จับคู่ guest_id) — นับเฉพาะที่ไม่ยกเลิก/ไม่มาเข้าพัก */
export function stayCountOf(
  guestId: string,
  bookings: ReturnType<typeof useHotelData>["bookings"],
): number {
  return bookings.filter(
    (b) => b.guest_id === guestId && b.status !== "cancelled" && b.status !== "no_show",
  ).length;
}

// ════════════════════════════════════════════════════════════════════
// GuestDetailDialog — แสดงข้อมูลแขก + ประวัติเข้าพัก (โชว์คุณค่า "แขกประจำ")
// ════════════════════════════════════════════════════════════════════
export function GuestDetailDialog({
  guest,
  open,
  onOpenChange,
}: {
  guest: Guest | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const { rooms, bookings, payments } = useHotelData();

  const history = useMemo(() => {
    if (!guest) return [];
    return bookings
      .filter((b) => b.guest_id === guest.id)
      .sort((a, b) => b.check_in_date.localeCompare(a.check_in_date));
  }, [guest, bookings]);

  if (!guest) return null;

  const stays = history.filter((b) => b.status !== "cancelled" && b.status !== "no_show");
  const totalSpent = stays.reduce((sum, b) => sum + b.grand_total, 0);
  const isRegular = stays.length >= 2;
  const roomNo = (id: string) => rooms.find((r) => r.id === id)?.room_number ?? "—";
  const roomType = (id: string) => rooms.find((r) => r.id === id)?.room_type;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="2xl">
        <DialogHeader>
          <DialogTitle>
            <span className="flex flex-wrap items-center gap-2">
              {guest.full_name}
              {isRegular && (
                <span className="inline-flex items-center rounded-full border border-green-200 bg-green-50 px-2.5 py-0.5 text-xs font-medium text-green-700">
                  แขกประจำ
                </span>
              )}
            </span>
          </DialogTitle>
        </DialogHeader>
        <DialogBody>
          <div className="space-y-5">
            {/* ข้อมูลแขก */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="สัญชาติ" value={guest.nationality ?? "—"} />
              <Field label="เบอร์โทร" value={guest.phone ?? "—"} />
              <Field
                label="เอกสาร"
                value={
                  guest.id_type
                    ? `${ID_TYPE_LABEL[guest.id_type]} · ${guest.id_number ?? "—"}`
                    : "—"
                }
              />
              <Field label="อีเมล" value={guest.email ?? "—"} />
              {guest.address && <Field label="ที่อยู่" value={guest.address} />}
              {guest.note && <Field label="หมายเหตุ" value={guest.note} />}
            </div>

            {/* สรุปการเข้าพัก */}
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3">
                <Text className="text-xs text-gray-500">จำนวนครั้งเข้าพัก</Text>
                <Text className="mt-0.5 text-xl font-semibold tabular-nums text-gray-900">
                  {stays.length} ครั้ง
                </Text>
              </div>
              <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3">
                <Text className="text-xs text-gray-500">ยอดใช้จ่ายสะสม</Text>
                <Text className="mt-0.5 font-mono text-xl font-semibold tabular-nums text-green-600">
                  {fmtMoney(totalSpent)}
                </Text>
              </div>
            </div>

            {/* ประวัติเข้าพัก */}
            <div>
              <Text className="mb-2 text-sm font-medium text-gray-900">ประวัติการเข้าพัก</Text>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>รหัสจอง</TableHead>
                    <TableHead>ช่วงเข้าพัก</TableHead>
                    <TableHead>ห้อง</TableHead>
                    <TableHead align="center">ช่องทาง</TableHead>
                    <TableHead align="right">ยอดรวม</TableHead>
                    <TableHead align="center">สถานะ</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {history.length === 0 ? (
                    <TableEmpty colSpan={6}>ยังไม่มีประวัติเข้าพัก</TableEmpty>
                  ) : (
                    history.map((b) => {
                      const t = roomType(b.room_id);
                      const bal = computeBalance(b, paymentsOf(b.id, payments));
                      return (
                        <TableRow key={b.id}>
                          <TableCell className="font-medium text-gray-900">
                            {b.booking_code}
                          </TableCell>
                          <TableCell className="text-gray-500">
                            {fmtStayRange(b.check_in_date, b.check_out_date)}
                          </TableCell>
                          <TableCell>
                            <span className="flex items-center gap-2">
                              {roomNo(b.room_id)}
                              {t && <RoomTypeBadge type={t} />}
                            </span>
                          </TableCell>
                          <TableCell align="center">
                            <SourceBadge source={b.source} />
                          </TableCell>
                          <TableCell
                            align="right"
                            tabular
                            className={bal > 0 ? "text-red-600" : undefined}
                          >
                            {fmtMoney(b.grand_total)}
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
          </div>
        </DialogBody>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            ปิด
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ════════════════════════════════════════════════════════════════════
// GuestFormDialog — เพิ่มแขกใหม่ (mock addGuest)
// ════════════════════════════════════════════════════════════════════
const EMPTY_FORM = {
  full_name: "",
  nationality: "Thai",
  phone: "",
  email: "",
  id_type: "national_id" as GuestIdType,
  id_number: "",
  address: "",
  note: "",
};

export function GuestFormDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const { addGuest } = useHotelData();
  const [form, setForm] = useState(EMPTY_FORM);
  const [err, setErr] = useState(false);

  function close() {
    setForm(EMPTY_FORM);
    setErr(false);
    onOpenChange(false);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.full_name.trim()) {
      setErr(true);
      return;
    }
    addGuest({
      full_name: form.full_name.trim(),
      nationality: form.nationality.trim() || null,
      phone: form.phone.trim() || null,
      email: form.email.trim() || null,
      id_type: form.id_type,
      id_number: form.id_number.trim() || null,
      address: form.address.trim() || null,
      note: form.note.trim() || null,
    });
    toast.success(`เพิ่มแขก ${form.full_name.trim()} แล้ว`);
    close();
  }

  return (
    <Dialog open={open} onOpenChange={(v) => (v ? onOpenChange(true) : close())}>
      <DialogContent size="xl">
        <DialogHeader>
          <DialogTitle>
            <span className="flex items-center gap-2">
              <UserPlus className="h-5 w-5" /> เพิ่มแขกใหม่
            </span>
          </DialogTitle>
        </DialogHeader>
        <form className="flex min-h-0 flex-1 flex-col" onSubmit={handleSubmit}>
          <DialogBody>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <Label htmlFor="g-name">ชื่อ-นามสกุล *</Label>
                <Input
                  id="g-name"
                  className={`mt-1 ${err ? "border-red-500 focus:ring-red-500" : ""}`}
                  placeholder="กรอกชื่อแขก"
                  value={form.full_name}
                  onChange={(e) => {
                    setForm((f) => ({ ...f, full_name: e.target.value }));
                    if (err) setErr(false);
                  }}
                />
                {err && <p className="mt-1 text-xs text-red-600">กรุณากรอกชื่อแขก</p>}
              </div>
              <div>
                <Label htmlFor="g-nat">สัญชาติ</Label>
                <Input
                  id="g-nat"
                  className="mt-1"
                  placeholder="เช่น Thai"
                  value={form.nationality}
                  onChange={(e) => setForm((f) => ({ ...f, nationality: e.target.value }))}
                />
              </div>
              <div>
                <Label htmlFor="g-phone">เบอร์โทร</Label>
                <Input
                  id="g-phone"
                  className="mt-1"
                  placeholder="08X-XXX-XXXX"
                  value={form.phone}
                  onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                />
              </div>
              <div>
                <Label htmlFor="g-idtype">ประเภทเอกสาร</Label>
                <CustomSelect
                  className="mt-1"
                  value={form.id_type}
                  onChange={(v) => setForm((f) => ({ ...f, id_type: v as GuestIdType }))}
                  options={ID_TYPE_OPTIONS}
                />
              </div>
              <div>
                <Label htmlFor="g-idnum">เลขเอกสาร</Label>
                <Input
                  id="g-idnum"
                  className="mt-1"
                  placeholder="เลขบัตร / พาสปอร์ต"
                  value={form.id_number}
                  onChange={(e) => setForm((f) => ({ ...f, id_number: e.target.value }))}
                />
              </div>
              <div>
                <Label htmlFor="g-email">อีเมล</Label>
                <Input
                  id="g-email"
                  className="mt-1"
                  placeholder="email@example.com"
                  value={form.email}
                  onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                />
              </div>
              <div className="sm:col-span-2">
                <Label htmlFor="g-addr">ที่อยู่</Label>
                <Input
                  id="g-addr"
                  className="mt-1"
                  placeholder="ที่อยู่"
                  value={form.address}
                  onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
                />
              </div>
              <div className="sm:col-span-2">
                <Label htmlFor="g-note">หมายเหตุ</Label>
                <Input
                  id="g-note"
                  className="mt-1"
                  placeholder="เช่น ชอบห้องเงียบ / แขกประจำ"
                  value={form.note}
                  onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
                />
              </div>
            </div>
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={close}>
              ยกเลิก
            </Button>
            <Button type="submit">
              <CalendarCheck className="mr-1.5 h-4 w-4" /> บันทึก
            </Button>
          </DialogFooter>
        </form>
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
