"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { backendUrl } from "@/lib/backend";
import { toast } from "@/lib/toast";
import { Button } from "@/components/ui/button";
import { PageShell } from "@/components/ui/page-shell";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CustomSelect } from "@/components/ui/custom-select";
import { ThaiDatePicker } from "@/components/ui/thai-date-picker";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogBody,
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
  TableLoading,
} from "@/components/ui/table";
import { StatusBadge } from "@/components/ui/badge";
import { SegmentedControl } from "@/components/ui/segmented";
import { usePagination, TablePager } from "@/components/ui/table-pager";
import { FilterBar, FilterClear } from "@/components/ui/filter-bar";
import {
  DEPOSIT_RATE_MODE_OPTIONS,
  depositAmountForMode,
  depositRateModeOf,
  type DepositRateMode,
} from "@/lib/tmc/deposit";
import {
  Plus,
  Pencil,
  Trash2,
  AlertTriangle,
  BedDouble,
  LayoutGrid,
  Rows3,
  Filter,
} from "lucide-react";
import { NON_REVENUE_STAY_TYPES, stayRevenueOf } from "@/lib/tmc/stay-types";

const TMC_ORG_ID = "1f52618c-09c4-49c5-a929-ea5060f26e7d";
const SAV_ACCOUNT_ID = "a4ee27ea-6568-4097-abd7-a91fbf4805d0"; // กสิกร ออมทรัพย์
const CUR_ACCOUNT_ID = "273463cc-2475-439c-acfe-f054be5ffee4"; // กสิกร กระแสรายวัน
const DEPOSIT_ACCOUNT_OPTIONS = [
  { value: SAV_ACCOUNT_ID, label: "กสิกร ออมทรัพย์" },
  { value: CUR_ACCOUNT_ID, label: "กสิกร กระแสรายวัน" },
];
const PROPERTY_CODES = ["TMC1", "TMC2", "TMC3-4", "TMC5", "TMC6", "TMC7", "ส่วนกลาง"];
const BOOKING_CHANNELS = [
  "Line",
  "Agoda",
  "Booking.com",
  "Airbnb",
  "Walk-in",
  "IG",
  "Call",
  "Friend",
  "อินฟลู",
  "อื่นๆ",
];
const GROUP_TYPES = ["Family", "Couple", "Friend", "Solo"];
const STAY_TYPES = [
  { value: "paid", label: "ชำระเงิน" },
  { value: "influencer", label: "อินฟลูเอนเซอร์ (ฟรี)" },
  { value: "management", label: "ผู้บริหาร (ฟรี)" },
  { value: "free", label: "ฟรี (อื่นๆ)" },
  { value: "deposit_only", label: "มัดจำอย่างเดียว" },
];
const BUTLER_OPTIONS = ["1 ครั้ง", "2 ครั้ง", "3 ครั้ง", "มากกว่า 3 ครั้ง"];
const THAI_MONTHS = [
  "ม.ค.",
  "ก.พ.",
  "มี.ค.",
  "เม.ย.",
  "พ.ค.",
  "มิ.ย.",
  "ก.ค.",
  "ส.ค.",
  "ก.ย.",
  "ต.ค.",
  "พ.ย.",
  "ธ.ค.",
];

function monthLabel(ym: string) {
  const [y, m] = ym.split("-");
  return `${THAI_MONTHS[Number(m) - 1]} ${Number(y) + 543}`;
}

const PROPERTY_FILTER_OPTIONS = [
  { value: "", label: "ทุกแปลง" },
  ...PROPERTY_CODES.map((c) => ({ value: c, label: c })),
];
const PROPERTY_FORM_OPTIONS = [
  { value: "", label: "เลือก" },
  ...PROPERTY_CODES.map((c) => ({ value: c, label: c })),
];
const STAY_TYPE_OPTIONS = STAY_TYPES.map((s) => ({ value: s.value, label: s.label }));
const BOOKING_CHANNEL_OPTIONS = BOOKING_CHANNELS.map((c) => ({ value: c, label: c }));
const GROUP_TYPE_OPTIONS = GROUP_TYPES.map((g) => ({ value: g, label: g }));
const BUTLER_OPTIONS_SELECT = [
  { value: "", label: "—" },
  ...BUTLER_OPTIONS.map((o) => ({ value: o, label: o })),
];

// ── Types ─────────────────────────────────────────────────────────────────────

type Stay = {
  id: string;
  booking_group_id: string;
  check_in: string;
  check_out: string;
  check_in_time: string | null;
  check_out_time: string | null;
  nights: number;
  property_code: string | null;
  booking_channel: string | null;
  stay_type: string;
  room_rate: number | null;
  promotion_pct: number | null;
  group_type: string | null;
  group_size: number | null;
  butler_service_visit: string | null;
  food_amount: number | null;
  drink_amount: number | null;
  mookata_amount: number | null;
  bbq_amount: number | null;
  activity_detail: string | null;
  deposit_amount: number | null;
  deposit_received: number | null;
  deposit_returned: number | null;
  deposit_account_id: string | null;
  deposit_received_date: string | null;
  deposit_returned_date: string | null;
  feedback: string | null;
  issues: string | null;
  damaged_items: string | null;
  tmc_guests: {
    id: string;
    first_name: string;
    last_name: string | null;
    nickname: string | null;
    tel: string | null;
  } | null;
};

// ── Form state ────────────────────────────────────────────────────────────────

const emptyForm = {
  // guest (add only)
  firstName: "",
  lastName: "",
  nickname: "",
  tel: "",
  // stay
  propertyCode: "",
  propertyCodes: [] as string[],
  // รายละเอียดรายห้อง (เมื่อเลือก ≥2 ห้อง) — ว่าง = ใช้วันที่หลักของ booking
  roomDetails: [] as { code: string; checkIn: string; checkOut: string; rate: string }[],
  checkIn: "",
  checkOut: "",
  checkInTime: "15:00",
  checkOutTime: "12:00",
  bookingChannel: "Line",
  stayType: "paid",
  roomRate: "",
  promotionPct: "",
  depositAmount: "", // อัตราค่ามัดจำที่ตกลง (5,000 / 10,000 / อื่นๆ)
  depositReceived: "",
  depositReturned: "",
  depositAccountId: SAV_ACCOUNT_ID,
  depositReceivedDate: "",
  depositReturnedDate: "",
  groupSize: "",
  groupType: "Family",
  butlerServiceVisit: "",
  foodAmount: "",
  drinkAmount: "",
  mookataAmount: "",
  bbqAmount: "",
  activityDetail: "",
  feedback: "",
  issues: "",
  damagedItems: "",
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(n: number | null) {
  if (!n && n !== 0) return "—";
  return n.toLocaleString("th-TH");
}
function stayTypeLabel(t: string) {
  return STAY_TYPES.find((s) => s.value === t)?.label ?? t;
}
function guestDisplayName(g: Stay["tmc_guests"]) {
  if (!g) return "ไม่ระบุชื่อ";
  return g.nickname ?? `${g.first_name} ${g.last_name ?? ""}`.trim();
}
function shortDate(iso: string) {
  return new Date(iso).toLocaleDateString("th-TH", { day: "numeric", month: "short" });
}
function stayTypeTone(t: string) {
  return t === "paid" ? "success" : t === "influencer" ? "info" : "neutral";
}
function extraRevenueOf(s: Stay) {
  return (
    (s.food_amount ?? 0) + (s.drink_amount ?? 0) + (s.mookata_amount ?? 0) + (s.bbq_amount ?? 0)
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function TmcStaysPage() {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [stays, setStays] = useState<Stay[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterProperty, setFilterProperty] = useState("");
  const [filterMonth, setFilterMonth] = useState("");
  const [view, setView] = useState<"card" | "table">("card");
  const [showFilters, setShowFilters] = useState(false);
  const hasFilter = !!filterProperty || !!filterMonth;
  const [availableMonths, setAvailableMonths] = useState<string[]>([]);

  // Add / Edit form
  const [showForm, setShowForm] = useState(false);
  const [editingStay, setEditingStay] = useState<Stay | null>(null); // null = add mode
  const [form, setForm] = useState(emptyForm);
  // โหมดของช่อง "อัตราค่ามัดจำ" — ค่าจริงอยู่ที่ form.depositAmount
  const [depositRateMode, setDepositRateMode] = useState<DepositRateMode>("none");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");

  // Delete confirmation
  const [deleteTarget, setDeleteTarget] = useState<Stay | null>(null);
  const [deleteReason, setDeleteReason] = useState("");
  const [deleting, setDeleting] = useState(false);

  const headers = useCallback(async () => {
    const { data } = await supabase.auth.getSession();
    return {
      "Content-Type": "application/json",
      Authorization: `Bearer ${data.session?.access_token ?? ""}`,
    };
  }, [supabase]);

  // Fetch distinct months once on mount
  useEffect(() => {
    async function fetchMonths() {
      const h = await headers();
      const res = await fetch(backendUrl(`/tmc/stays?orgId=${TMC_ORG_ID}&limit=500`), {
        headers: h,
      });
      const data: Stay[] = await res.json();
      if (Array.isArray(data) && data.length > 0) {
        const months = Array.from(new Set(data.map((s) => s.check_in.slice(0, 7))))
          .sort()
          .reverse();
        setAvailableMonths(months);
      }
    }
    fetchMonths();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const monthOptions = useMemo(
    () => [
      { value: "", label: "ทุกเดือน" },
      ...availableMonths.map((ym) => ({ value: ym, label: monthLabel(ym) })),
    ],
    [availableMonths],
  );

  const load = useCallback(async () => {
    setLoading(true);
    const h = await headers();
    const p = new URLSearchParams({ orgId: TMC_ORG_ID, limit: "200" });
    if (filterProperty) p.set("propertyCode", filterProperty);
    if (filterMonth) {
      const [y, m] = filterMonth.split("-");
      p.set("from", `${y}-${m}-01`);
      const last = new Date(Number(y), Number(m), 0).getDate();
      p.set("to", `${y}-${m}-${last}`);
    }
    const res = await fetch(backendUrl(`/tmc/stays?${p}`), { headers: h });
    setStays(await res.json());
    setLoading(false);
  }, [headers, filterProperty, filterMonth]);

  useEffect(() => {
    load();
  }, [load]);

  // ── Open add form ──────────────────────────────────────────────────────────
  function openAdd() {
    setEditingStay(null);
    setForm(emptyForm);
    setDepositRateMode("none");
    setFormError("");
    setShowForm(true);
  }

  // ── Open edit form — แก้ทั้ง booking (ทุกห้องในกลุ่ม) ─────────────────────
  async function openEdit(stay: Stay) {
    // ดึงทุกแถวของ booking นี้ (list ที่โหลดอยู่อาจถูกกรองจนเห็นไม่ครบทุกห้อง)
    let group: Stay[] = [stay];
    try {
      const h = await headers();
      const p = new URLSearchParams({ orgId: TMC_ORG_ID, bookingGroupId: stay.booking_group_id });
      const res = await fetch(backendUrl(`/tmc/stays?${p}`), { headers: h });
      if (res.ok) {
        const rows = (await res.json()) as Stay[];
        if (rows.length > 0) group = rows;
      }
    } catch {
      // ใช้แถวเดียวที่มีถ้าดึงกลุ่มไม่สำเร็จ
    }
    const sum = (pick: (s: Stay) => number | null) => {
      const vals = group.map(pick).filter((v): v is number => v != null);
      return vals.length > 0 ? vals.reduce((a, b) => a + b, 0) : null;
    };
    const firstNonNull = <T,>(pick: (s: Stay) => T | null) =>
      group.map(pick).find((v) => v != null && v !== "") ?? null;

    const totalRate = sum((s) => s.room_rate);
    // อัตราค่ามัดจำ = ค่าของ booking (เก็บเท่ากันทุกห้อง) — ห้าม sum
    const depositRate = firstNonNull((s) => s.deposit_amount);
    const depositAmount = depositRate != null ? String(depositRate) : "";
    const totalReceived = sum((s) => s.deposit_received);
    const totalReturned = sum((s) => s.deposit_returned);

    setEditingStay(stay);
    setDepositRateMode(depositRateModeOf(depositAmount));
    setForm({
      firstName: stay.tmc_guests?.first_name ?? "",
      lastName: stay.tmc_guests?.last_name ?? "",
      nickname: stay.tmc_guests?.nickname ?? "",
      tel: stay.tmc_guests?.tel ?? "",
      propertyCode: stay.property_code ?? "",
      propertyCodes: group.map((s) => s.property_code).filter((c): c is string => !!c),
      roomDetails: group
        .filter((s) => !!s.property_code)
        .map((s) => ({
          code: s.property_code as string,
          checkIn: s.check_in,
          checkOut: s.check_out,
          rate: s.room_rate != null ? String(s.room_rate) : "",
        })),
      checkIn: stay.check_in,
      checkOut: stay.check_out,
      checkInTime: stay.check_in_time ?? "15:00",
      checkOutTime: stay.check_out_time ?? "12:00",
      bookingChannel: stay.booking_channel ?? "Line",
      stayType: stay.stay_type,
      roomRate: totalRate != null ? String(totalRate) : "",
      promotionPct: stay.promotion_pct != null ? String(stay.promotion_pct) : "",
      depositAmount,
      depositReceived: totalReceived != null ? String(totalReceived) : "",
      depositReturned: totalReturned != null ? String(totalReturned) : "",
      depositAccountId: stay.deposit_account_id ?? SAV_ACCOUNT_ID,
      depositReceivedDate: firstNonNull((s) => s.deposit_received_date) ?? "",
      depositReturnedDate: firstNonNull((s) => s.deposit_returned_date) ?? "",
      groupSize: stay.group_size != null ? String(stay.group_size) : "",
      groupType: stay.group_type ?? "Family",
      butlerServiceVisit: firstNonNull((s) => s.butler_service_visit) ?? "",
      foodAmount: String(firstNonNull((s) => s.food_amount) ?? "") || "",
      drinkAmount: String(firstNonNull((s) => s.drink_amount) ?? "") || "",
      mookataAmount: String(firstNonNull((s) => s.mookata_amount) ?? "") || "",
      bbqAmount: String(firstNonNull((s) => s.bbq_amount) ?? "") || "",
      activityDetail: firstNonNull((s) => s.activity_detail) ?? "",
      feedback: firstNonNull((s) => s.feedback) ?? "",
      issues: firstNonNull((s) => s.issues) ?? "",
      damagedItems: firstNonNull((s) => s.damaged_items) ?? "",
    });
    setFormError("");
    setShowForm(true);
  }

  // ── Save (add or edit) ─────────────────────────────────────────────────────
  async function handleSave() {
    if (form.propertyCodes.length === 0) return;
    if (!editingStay && !form.firstName) return;
    const multi = form.propertyCodes.length > 1;
    // payload รายห้อง — ห้องที่ไม่ได้กรอกวันที่เอง = ใช้วันที่หลักของ booking
    const rooms = form.propertyCodes.map((code) => {
      const d = form.roomDetails.find((r) => r.code === code);
      return {
        code,
        checkIn: d?.checkIn || form.checkIn,
        checkOut: d?.checkOut || form.checkOut,
        roomRate: multi ? d?.rate || null : form.roomRate || null,
      };
    });
    for (const r of rooms) {
      if (!r.checkIn || !r.checkOut) {
        setFormError(`ต้องระบุวันเช็คอิน-เช็คเอาต์ของห้อง ${r.code}`);
        return;
      }
      if (r.checkOut <= r.checkIn) {
        setFormError(`ห้อง ${r.code}: วันเช็คเอาท์ต้องอยู่หลังวันเช็คอิน (อย่างน้อย 1 คืน)`);
        return;
      }
      // ค่าห้องว่าง = รายได้หายจากรายงานแบบเงียบ ๆ → บังคับกรอกเมื่อเป็นการเข้าพักที่คิดเงิน
      if (!NON_REVENUE_STAY_TYPES.has(form.stayType) && r.roomRate === null) {
        setFormError(
          `ต้องระบุค่าห้องของ ${r.code} — เว้นว่างได้เฉพาะการเข้าพักที่ไม่คิดค่าห้อง (ฟรี/อินฟลูฯ/ผู้บริหาร)`,
        );
        return;
      }
    }
    setSaving(true);
    setFormError("");
    try {
      const h = await headers();
      if (editingStay) {
        // Update
        const res = await fetch(backendUrl("/tmc/stays"), {
          method: "PUT",
          headers: h,
          body: JSON.stringify({
            bookingGroupId: editingStay.booking_group_id,
            orgId: TMC_ORG_ID,
            ...form,
            rooms,
          }),
        });
        if (!res.ok) {
          const d = (await res.json()) as { error?: string };
          setFormError(d.error ?? "เกิดข้อผิดพลาด");
          return;
        }
      } else {
        // Create
        const res = await fetch(backendUrl("/tmc/stays"), {
          method: "POST",
          headers: h,
          body: JSON.stringify({ orgId: TMC_ORG_ID, ...form, rooms }),
        });
        if (!res.ok) {
          const d = (await res.json()) as { error?: string };
          setFormError(d.error ?? "เกิดข้อผิดพลาด");
          return;
        }
      }
      toast.success(editingStay ? "แก้ไขการเข้าพักแล้ว" : "เพิ่มการเข้าพักแล้ว");
      setShowForm(false);
      setForm(emptyForm);
      setEditingStay(null);
      load();
    } catch {
      setFormError("Network error");
      toast.error("เกิดข้อผิดพลาดในการเชื่อมต่อ");
    } finally {
      setSaving(false);
    }
  }

  // ── Delete ─────────────────────────────────────────────────────────────────
  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const h = await headers();
      const p = new URLSearchParams({ id: deleteTarget.id, orgId: TMC_ORG_ID });
      if (deleteReason) p.set("note", deleteReason);
      const res = await fetch(backendUrl(`/tmc/stays?${p}`), { method: "DELETE", headers: h });
      if (!res.ok) {
        const d = (await res.json()) as { error?: string };
        toast.error(d.error ?? "ลบไม่สำเร็จ");
        return;
      }
      setDeleteTarget(null);
      setDeleteReason("");
      toast.success("ลบการเข้าพักแล้ว");
      load();
    } catch {
      toast.error("เกิดข้อผิดพลาดในการเชื่อมต่อ");
    } finally {
      setDeleting(false);
    }
  }

  // ── Derived stats ──────────────────────────────────────────────────────────
  // ประเภทที่ไม่คิดเงินไม่นับเป็นรายได้ แม้จะกรอกค่าห้องไว้ (lib/tmc/stay-types.ts)
  const totalRevenue = stays.reduce((s, st) => s + stayRevenueOf(st), 0);
  // หน่วยหลักของธุรกิจห้องพัก = "ห้อง×คืน" ไม่ใช่จำนวนครั้งที่จอง (1 ครั้งอาจพักหลายคืน)
  const totalStayNights = stays.reduce((s, st) => s + (st.nights ?? 0), 0);
  const paidStays = stays.filter((s) => s.stay_type === "paid");
  const influStays = stays.filter((s) => s.stay_type === "influencer");

  const isEditMode = editingStay !== null;

  // ── รายห้อง: วันที่/ยอดต่อห้อง (หลายห้องใน booking เดียวไม่จำเป็นต้องวันเดียวกัน) ──
  const multiRoom = form.propertyCodes.length > 1;
  const effectiveRoom = (code: string) => {
    const d = form.roomDetails.find((r) => r.code === code);
    return {
      checkIn: d?.checkIn || form.checkIn,
      checkOut: d?.checkOut || form.checkOut,
      rate: d?.rate ?? "",
    };
  };
  const roomNights = (ci: string, co: string) =>
    ci && co && co > ci
      ? Math.round((new Date(co).getTime() - new Date(ci).getTime()) / 86_400_000)
      : 0;
  // ค่าห้องบังคับเมื่อเป็นการเข้าพักที่มีรายได้ — ประเภทฟรี/อินฟลูฯ/ผู้บริหาร เว้นว่างได้
  const needsRate = !NON_REVENUE_STAY_TYPES.has(form.stayType);
  const rateFilled = (code: string) =>
    multiRoom ? effectiveRoom(code).rate !== "" : form.roomRate !== "";
  const roomsValid =
    form.propertyCodes.length > 0 &&
    form.propertyCodes.every((code) => {
      const r = effectiveRoom(code);
      return (
        !!r.checkIn && !!r.checkOut && r.checkOut > r.checkIn && (!needsRate || rateFilled(code))
      );
    });
  const totalRoomRate = multiRoom
    ? form.propertyCodes.reduce((s, code) => s + (Number(effectiveRoom(code).rate) || 0), 0)
    : Number(form.roomRate) || 0;
  const totalNights = form.propertyCodes.reduce((s, code) => {
    const r = effectiveRoom(code);
    return s + roomNights(r.checkIn, r.checkOut);
  }, 0);

  // แบ่งหน้า — ใช้ร่วมกันทั้งมุมมองการ์ดและตาราง
  const pager = usePagination(stays, {
    pageSize: view === "table" ? 20 : 12,
    resetKey: view,
  });

  // ── Form body (shared between add + edit) ──────────────────────────────────
  const formBody = (
    <DialogBody className="space-y-5">
      {/* Guest — editable in both add and edit mode */}
      <div>
        <p className="mb-3 text-sm font-semibold text-slate-700">👤 ข้อมูลลูกค้า</p>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>{isEditMode ? "ชื่อ" : "ชื่อ *"}</Label>
            <Input
              placeholder="คุณ..."
              value={form.firstName}
              onChange={(e) => setForm((f) => ({ ...f, firstName: e.target.value }))}
            />
          </div>
          <div className="space-y-1.5">
            <Label>นามสกุล</Label>
            <Input
              value={form.lastName}
              onChange={(e) => setForm((f) => ({ ...f, lastName: e.target.value }))}
            />
          </div>
          <div className="space-y-1.5">
            <Label>ชื่อเล่น</Label>
            <Input
              value={form.nickname}
              onChange={(e) => setForm((f) => ({ ...f, nickname: e.target.value }))}
            />
          </div>
          <div className="space-y-1.5">
            <Label>เบอร์โทร</Label>
            <Input
              value={form.tel}
              onChange={(e) => setForm((f) => ({ ...f, tel: e.target.value }))}
            />
          </div>
        </div>
      </div>

      {/* Stay Info */}
      <div>
        <p className="mb-3 text-sm font-semibold text-slate-700">🏠 ข้อมูลการเข้าพัก</p>
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2 space-y-1.5">
            <Label>
              แปลงที่จอง *{" "}
              <span className="text-xs font-normal text-slate-400">(เลือกได้มากกว่า 1 แปลง)</span>
            </Label>
            <div className="mt-1 grid grid-cols-4 gap-2 sm:grid-cols-6">
              {PROPERTY_CODES.filter((code) => code !== "ส่วนกลาง").map((code) => {
                const isSelected = form.propertyCodes.includes(code);
                return (
                  <button
                    key={code}
                    type="button"
                    onClick={() => {
                      setForm((f) => {
                        const exist = f.propertyCodes.includes(code);
                        const next = exist
                          ? f.propertyCodes.filter((c) => c !== code)
                          : [...f.propertyCodes, code];
                        const details = exist
                          ? f.roomDetails.filter((d) => d.code !== code)
                          : [...f.roomDetails, { code, checkIn: "", checkOut: "", rate: "" }];
                        return { ...f, propertyCodes: next, roomDetails: details };
                      });
                    }}
                    className={`rounded-lg border px-3 py-2 text-center text-sm font-medium transition-all ${
                      isSelected
                        ? "border-blue-600 bg-blue-600 text-white shadow-sm"
                        : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                    }`}
                  >
                    {code}
                  </button>
                );
              })}
            </div>
            {multiRoom && (
              <div className="mt-2 space-y-2 rounded-lg border border-slate-200 p-3">
                <p className="text-xs font-medium text-slate-500">
                  วันที่ + ยอดรายห้อง — ห้องที่ไม่กรอกใช้วันเช็คอิน-เช็คเอาต์หลักด้านล่าง
                </p>
                {form.propertyCodes.map((code) => {
                  const r = effectiveRoom(code);
                  const nights = roomNights(r.checkIn, r.checkOut);
                  const badRange = !!r.checkIn && !!r.checkOut && r.checkOut <= r.checkIn;
                  const setDetail = (
                    patch: Partial<{ checkIn: string; checkOut: string; rate: string }>,
                  ) =>
                    setForm((f) => ({
                      ...f,
                      roomDetails: f.roomDetails.map((d) =>
                        d.code === code ? { ...d, ...patch } : d,
                      ),
                    }));
                  return (
                    <div
                      key={code}
                      className="grid grid-cols-2 items-center gap-2 sm:grid-cols-[3.5rem_1fr_1fr_7rem_3.5rem]"
                    >
                      <span className="text-sm font-medium text-slate-700">{code}</span>
                      <ThaiDatePicker
                        value={r.checkIn}
                        onChange={(v) => setDetail({ checkIn: v })}
                        placeholder="เช็คอิน"
                      />
                      <ThaiDatePicker
                        value={r.checkOut}
                        onChange={(v) => setDetail({ checkOut: v })}
                        placeholder="เช็คเอาต์"
                      />
                      <Input
                        type="number"
                        placeholder={needsRate ? "ยอดห้อง *" : "ยอดห้อง"}
                        value={r.rate}
                        onChange={(e) => setDetail({ rate: e.target.value })}
                      />
                      <span
                        className={`text-xs ${badRange ? "text-red-600" : "text-gray-500"} text-right`}
                      >
                        {badRange ? "วันผิด" : `${nights} คืน`}
                      </span>
                    </div>
                  );
                })}
                <p className="text-xs text-slate-500">
                  รวม {totalNights} คืน · ยอดรวม {totalRoomRate.toLocaleString("th-TH")} บาท
                </p>
              </div>
            )}
          </div>
          <div className="space-y-1.5">
            <Label>ประเภท</Label>
            <CustomSelect
              value={form.stayType}
              onChange={(v) => setForm((f) => ({ ...f, stayType: v }))}
              options={STAY_TYPE_OPTIONS}
            />
          </div>
          <div className="space-y-1.5">
            <Label>{multiRoom ? "เช็คอิน (ค่าเริ่มต้นทุกห้อง)" : "เช็คอิน *"}</Label>
            <ThaiDatePicker
              value={form.checkIn}
              onChange={(v) => setForm((f) => ({ ...f, checkIn: v }))}
            />
          </div>
          <div className="space-y-1.5">
            <Label>{multiRoom ? "เช็คเอาต์ (ค่าเริ่มต้นทุกห้อง)" : "เช็คเอาต์ *"}</Label>
            <ThaiDatePicker
              value={form.checkOut}
              onChange={(v) => setForm((f) => ({ ...f, checkOut: v }))}
            />
            {form.checkIn && form.checkOut && (
              <p
                className={`text-xs ${form.checkOut <= form.checkIn ? "text-red-600" : "text-gray-500"}`}
              >
                {form.checkOut <= form.checkIn
                  ? "วันเช็คเอาท์ต้องอยู่หลังวันเช็คอิน"
                  : `= เข้าพัก ${Math.round((new Date(form.checkOut).getTime() - new Date(form.checkIn).getTime()) / 86_400_000)} คืน`}
              </p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label>เวลาเช็คอิน</Label>
            <Input
              type="time"
              value={form.checkInTime}
              onChange={(e) => setForm((f) => ({ ...f, checkInTime: e.target.value }))}
            />
          </div>
          <div className="space-y-1.5">
            <Label>เวลาเช็คเอาต์</Label>
            <Input
              type="time"
              value={form.checkOutTime}
              onChange={(e) => setForm((f) => ({ ...f, checkOutTime: e.target.value }))}
            />
          </div>
          <div className="space-y-1.5">
            <Label>ช่องทางจอง</Label>
            <CustomSelect
              value={form.bookingChannel}
              onChange={(v) => setForm((f) => ({ ...f, bookingChannel: v }))}
              options={BOOKING_CHANNEL_OPTIONS}
            />
          </div>
          <div className="space-y-1.5">
            <Label>มากับใคร</Label>
            <CustomSelect
              value={form.groupType}
              onChange={(v) => setForm((f) => ({ ...f, groupType: v }))}
              options={GROUP_TYPE_OPTIONS}
            />
          </div>
        </div>
      </div>

      {/* Revenue */}
      <div>
        <p className="mb-3 text-sm font-semibold text-slate-700">💰 ยอดเงิน</p>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>{needsRate ? "ยอดที่พัก (บาท) *" : "ยอดที่พัก (บาท)"}</Label>
            {multiRoom ? (
              <>
                <Input type="number" value={totalRoomRate || ""} disabled readOnly />
                <p className="text-xs text-gray-500">รวมจากยอดรายห้องด้านบนอัตโนมัติ</p>
              </>
            ) : (
              <Input
                type="number"
                value={form.roomRate}
                onChange={(e) => setForm((f) => ({ ...f, roomRate: e.target.value }))}
              />
            )}
          </div>
          <div className="space-y-1.5">
            <Label>ส่วนลด (%)</Label>
            <Input
              type="number"
              value={form.promotionPct}
              onChange={(e) => setForm((f) => ({ ...f, promotionPct: e.target.value }))}
            />
          </div>
          <div className="space-y-1.5">
            <Label>จำนวนคน</Label>
            <Input
              type="number"
              value={form.groupSize}
              onChange={(e) => setForm((f) => ({ ...f, groupSize: e.target.value }))}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Butler Service</Label>
            <CustomSelect
              value={form.butlerServiceVisit}
              onChange={(v) => setForm((f) => ({ ...f, butlerServiceVisit: v }))}
              options={BUTLER_OPTIONS_SELECT}
            />
          </div>
          <div className="space-y-1.5">
            <Label>🍽️ ยอดอาหาร</Label>
            <Input
              type="number"
              value={form.foodAmount}
              onChange={(e) => setForm((f) => ({ ...f, foodAmount: e.target.value }))}
            />
          </div>
          <div className="space-y-1.5">
            <Label>🥤 เครื่องดื่ม</Label>
            <Input
              type="number"
              value={form.drinkAmount}
              onChange={(e) => setForm((f) => ({ ...f, drinkAmount: e.target.value }))}
            />
          </div>
          <div className="space-y-1.5">
            <Label>🥩 หมูกระทะ</Label>
            <Input
              type="number"
              value={form.mookataAmount}
              onChange={(e) => setForm((f) => ({ ...f, mookataAmount: e.target.value }))}
            />
          </div>
          <div className="space-y-1.5">
            <Label>🔥 บาร์บีคิว</Label>
            <Input
              type="number"
              value={form.bbqAmount}
              onChange={(e) => setForm((f) => ({ ...f, bbqAmount: e.target.value }))}
            />
          </div>
          <div className="col-span-2 space-y-1.5">
            <Label>Activity</Label>
            <Input
              placeholder="เช่น ส่องสัตว์, ตักบาตร"
              value={form.activityDetail}
              onChange={(e) => setForm((f) => ({ ...f, activityDetail: e.target.value }))}
            />
          </div>
        </div>
      </div>

      {/* Deposit */}
      <div className="rounded-xl border border-amber-100 bg-amber-50 p-4">
        <p className="mb-3 text-sm font-semibold text-amber-800">
          💵 เงินมัดจำ
          <span className="ml-2 text-xs font-normal text-amber-600">บันทึกลงบัญชีอัตโนมัติ</span>
        </p>
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2 space-y-1.5">
            <Label>อัตราค่ามัดจำที่ตกลง (บาท)</Label>
            <SegmentedControl
              size="md"
              value={depositRateMode}
              onChange={(mode) => {
                setDepositRateMode(mode);
                setForm((f) => ({
                  ...f,
                  depositAmount: depositAmountForMode(mode, f.depositAmount),
                }));
              }}
              options={DEPOSIT_RATE_MODE_OPTIONS}
            />
            {depositRateMode === "other" && (
              <Input
                type="number"
                placeholder="ระบุจำนวนเงิน"
                value={form.depositAmount}
                onChange={(e) => setForm((f) => ({ ...f, depositAmount: e.target.value }))}
              />
            )}
            <p className="text-xs text-amber-600">
              อัตราที่ตกลงกับลูกค้ารายนี้ (ลูกค้าก่อนปรับราคายังคิด 5,000)
            </p>
          </div>
          <div className="space-y-1.5">
            <Label>รับเงินมัดจำ (บาท)</Label>
            <Input
              type="number"
              placeholder="0"
              value={form.depositReceived}
              onChange={(e) => setForm((f) => ({ ...f, depositReceived: e.target.value }))}
            />
          </div>
          <div className="space-y-1.5">
            <Label>วันที่รับเงินมัดจำ</Label>
            <ThaiDatePicker
              value={form.depositReceivedDate}
              onChange={(v) => setForm((f) => ({ ...f, depositReceivedDate: v }))}
              placeholder="เลือกวันที่"
            />
          </div>
          <div className="space-y-1.5">
            <Label>คืนเงินมัดจำ (บาท)</Label>
            <Input
              type="number"
              placeholder="0"
              value={form.depositReturned}
              onChange={(e) => setForm((f) => ({ ...f, depositReturned: e.target.value }))}
            />
          </div>
          <div className="space-y-1.5">
            <Label>วันที่คืนเงินมัดจำ</Label>
            <ThaiDatePicker
              value={form.depositReturnedDate}
              onChange={(v) => setForm((f) => ({ ...f, depositReturnedDate: v }))}
              placeholder="เลือกวันที่"
            />
          </div>
          <div className="col-span-2 space-y-1.5">
            <Label>บันทึกเข้าบัญชี</Label>
            <CustomSelect
              value={form.depositAccountId}
              onChange={(v) => setForm((f) => ({ ...f, depositAccountId: v }))}
              options={DEPOSIT_ACCOUNT_OPTIONS}
            />
          </div>
        </div>
      </div>

      {/* CRM */}
      <div>
        <p className="mb-3 text-sm font-semibold text-slate-700">⭐ CRM</p>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Feedback</Label>
            <textarea
              rows={2}
              className="flex w-full resize-none rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 ring-offset-white placeholder:text-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
              value={form.feedback}
              onChange={(e) => setForm((f) => ({ ...f, feedback: e.target.value }))}
            />
          </div>
          <div className="space-y-1.5">
            <Label>ปัญหา</Label>
            <Input
              value={form.issues}
              onChange={(e) => setForm((f) => ({ ...f, issues: e.target.value }))}
            />
          </div>
          <div className="space-y-1.5">
            <Label>ของเสียหาย</Label>
            <Input
              value={form.damagedItems}
              onChange={(e) => setForm((f) => ({ ...f, damagedItems: e.target.value }))}
            />
          </div>
        </div>
      </div>

      {formError && <p className="text-sm text-red-600">{formError}</p>}
    </DialogBody>
  );

  return (
    <PageShell
      width="full"
      icon={<BedDouble className="h-6 w-6" />}
      title="การเข้าพัก"
      description="TMC Management"
      actions={
        <>
          <SegmentedControl
            value={view}
            onChange={setView}
            ariaLabel="รูปแบบการแสดงผล"
            options={[
              { value: "card", label: "การ์ด", icon: <LayoutGrid className="h-4 w-4" /> },
              { value: "table", label: "ตาราง", icon: <Rows3 className="h-4 w-4" /> },
            ]}
          />
          <Button
            variant={showFilters || hasFilter ? "secondary" : "outline"}
            size="icon"
            title="ตัวกรอง"
            className="relative"
            onClick={() => setShowFilters((v) => !v)}
          >
            <Filter className="h-4 w-4" />
            {hasFilter && (
              <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-amber-500" />
            )}
          </Button>
          <Button onClick={openAdd}>
            <Plus className="h-4 w-4" /> บันทึกเข้าพัก
          </Button>
        </>
      }
    >
      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <div className="rounded-xl border bg-white p-4">
          <p className="text-xs text-slate-500">เข้าพักทั้งหมด</p>
          <p className="text-2xl font-bold text-slate-800">
            {totalStayNights} <span className="text-sm font-normal text-slate-400">คืน</span>
          </p>
          <p className="mt-0.5 text-xs text-slate-400">{stays.length} ครั้ง</p>
        </div>
        <div className="rounded-xl border bg-white p-4">
          <p className="text-xs text-slate-500">รายได้รวม</p>
          <p className="text-xl font-bold text-green-600">{fmt(totalRevenue)}</p>
        </div>
        <div className="rounded-xl border bg-white p-4">
          <p className="text-xs text-slate-500">ชำระเงิน</p>
          <p className="text-2xl font-bold text-blue-600">{paidStays.length}</p>
        </div>
        <div className="rounded-xl border bg-white p-4">
          <p className="text-xs text-slate-500">อินฟลูเอนเซอร์</p>
          <p className="text-2xl font-bold text-purple-600">{influStays.length}</p>
        </div>
      </div>

      {/* Filters — ซ่อนไว้หลัง icon ด้านบน */}
      {showFilters && (
        <FilterBar>
          <CustomSelect
            value={filterProperty}
            onChange={setFilterProperty}
            options={PROPERTY_FILTER_OPTIONS}
            className="w-32"
          />
          <CustomSelect
            value={filterMonth}
            onChange={setFilterMonth}
            options={monthOptions}
            className="w-36"
          />
          <FilterClear
            disabled={!hasFilter}
            onClick={() => {
              setFilterProperty("");
              setFilterMonth("");
            }}
          />
        </FilterBar>
      )}

      {/* ── มุมมองตาราง ─────────────────────────────────────────────────── */}
      {view === "table" && (
        <div className="space-y-3">
          <Table stickyHeader fillViewport>
            <TableHeader sticky>
              <TableRow>
                <TableHead>แปลง</TableHead>
                <TableHead>ลูกค้า</TableHead>
                <TableHead>ช่วงเข้าพัก</TableHead>
                <TableHead align="center">ประเภท</TableHead>
                <TableHead>ช่องทาง / กลุ่ม</TableHead>
                <TableHead align="right">ยอดที่พัก</TableHead>
                <TableHead align="right">อาหาร/เครื่องดื่ม</TableHead>
                <TableHead align="right">มัดจำ</TableHead>
                <TableHead>หมายเหตุ</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableLoading colSpan={9} />
              ) : pager.rows.length === 0 ? (
                <TableEmpty colSpan={9}>ยังไม่มีข้อมูลการเข้าพัก</TableEmpty>
              ) : (
                pager.rows.map((stay) => {
                  const extra = extraRevenueOf(stay);
                  return (
                    <TableRow key={stay.id} clickable onClick={() => openEdit(stay)}>
                      <TableCell>
                        <span className="font-medium text-gray-900">
                          {stay.property_code ?? "—"}
                        </span>
                      </TableCell>
                      <TableCell>
                        <div className="font-medium text-gray-900">
                          {guestDisplayName(stay.tmc_guests)}
                        </div>
                        {stay.tmc_guests?.tel && (
                          <div className="text-xs text-gray-500">{stay.tmc_guests.tel}</div>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="text-gray-900">
                          {shortDate(stay.check_in)} <span className="text-gray-400">→</span>{" "}
                          {shortDate(stay.check_out)}
                        </div>
                        <div className="text-xs text-gray-500">{stay.nights} คืน</div>
                      </TableCell>
                      <TableCell align="center">
                        <StatusBadge tone={stayTypeTone(stay.stay_type)}>
                          {stayTypeLabel(stay.stay_type)}
                        </StatusBadge>
                      </TableCell>
                      <TableCell>
                        <div className="text-gray-700">{stay.booking_channel ?? "—"}</div>
                        <div className="text-xs text-gray-500">
                          {[
                            stay.group_type,
                            stay.group_size ? `${stay.group_size} คน` : null,
                            stay.butler_service_visit
                              ? `บัตเลอร์ ${stay.butler_service_visit}`
                              : null,
                          ]
                            .filter(Boolean)
                            .join(" · ") || "—"}
                        </div>
                      </TableCell>
                      <TableCell align="right" tabular>
                        {stay.room_rate != null ? (
                          <span className="font-medium text-green-600">{fmt(stay.room_rate)}</span>
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
                      </TableCell>
                      <TableCell align="right" tabular>
                        {extra > 0 ? (
                          <>
                            <div>{fmt(extra)}</div>
                            <div className="text-xs text-gray-500">
                              {[
                                stay.food_amount ? `🍽️ ${fmt(stay.food_amount)}` : null,
                                stay.drink_amount ? `🥤 ${fmt(stay.drink_amount)}` : null,
                                stay.mookata_amount ? `🥩 ${fmt(stay.mookata_amount)}` : null,
                                stay.bbq_amount ? `🔥 ${fmt(stay.bbq_amount)}` : null,
                              ]
                                .filter(Boolean)
                                .join("  ")}
                            </div>
                          </>
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
                      </TableCell>
                      <TableCell align="right" tabular>
                        {stay.deposit_received || stay.deposit_amount ? (
                          <>
                            {stay.deposit_received ? (
                              <div className="text-amber-700">{fmt(stay.deposit_received)}</div>
                            ) : null}
                            {stay.deposit_returned ? (
                              <div className="text-xs text-gray-500">
                                คืน {fmt(stay.deposit_returned)}
                              </div>
                            ) : null}
                            {stay.deposit_amount ? (
                              <div className="text-xs text-gray-500">
                                อัตรา {fmt(stay.deposit_amount)}
                              </div>
                            ) : null}
                          </>
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
                      </TableCell>
                      <TableCell wrap className="max-w-xs">
                        {stay.feedback || stay.issues || stay.damaged_items ? (
                          <div className="space-y-0.5 text-xs">
                            {stay.feedback && <p className="text-gray-600">💬 {stay.feedback}</p>}
                            {stay.issues && <p className="text-orange-600">⚠️ {stay.issues}</p>}
                            {stay.damaged_items && (
                              <p className="text-red-600">🔧 {stay.damaged_items}</p>
                            )}
                          </div>
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
          <TablePager pager={pager} unit="รายการ" />
        </div>
      )}

      {/* Stays Grid */}
      {view === "card" &&
        (loading ? (
          <div className="p-8 text-center text-slate-400">กำลังโหลด...</div>
        ) : stays.length === 0 ? (
          <div className="p-8 text-center text-slate-400">ยังไม่มีข้อมูลการเข้าพัก</div>
        ) : (
          <div className="space-y-3">
            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
              {pager.rows.map((stay) => {
                const guest = stay.tmc_guests;
                const name = guestDisplayName(guest);
                const extraRevenue = extraRevenueOf(stay);
                return (
                  <div
                    key={stay.id}
                    className="space-y-3 rounded-xl border bg-white p-4 transition-shadow hover:shadow-md"
                  >
                    <div className="flex items-start justify-between">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-bold text-blue-700">
                            {stay.property_code ?? "—"}
                          </span>
                          <span
                            className={`rounded-full px-2 py-0.5 text-xs ${
                              stay.stay_type === "paid"
                                ? "bg-green-100 text-green-700"
                                : stay.stay_type === "influencer"
                                  ? "bg-purple-100 text-purple-700"
                                  : "bg-slate-100 text-slate-600"
                            }`}
                          >
                            {stayTypeLabel(stay.stay_type)}
                          </span>
                        </div>
                        <p className="mt-1 truncate font-semibold text-slate-800">{name}</p>
                        {guest?.tel && <p className="text-xs text-slate-400">{guest.tel}</p>}
                      </div>
                      {/* Action buttons */}
                      <div className="ml-2 flex shrink-0 items-center gap-1">
                        {stay.room_rate != null && (
                          <p className="mr-1 text-sm font-bold text-green-600">
                            {fmt(stay.room_rate)}
                          </p>
                        )}
                        <button
                          onClick={() => openEdit(stay)}
                          title="แก้ไข"
                          className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-blue-50 hover:text-blue-600"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => {
                            setDeleteTarget(stay);
                            setDeleteReason("");
                          }}
                          title="ลบ"
                          className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-red-50 hover:text-red-600"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600">
                      <span>
                        {new Date(stay.check_in).toLocaleDateString("th-TH", {
                          day: "numeric",
                          month: "short",
                        })}
                      </span>
                      <span className="text-slate-300">→</span>
                      <span>
                        {new Date(stay.check_out).toLocaleDateString("th-TH", {
                          day: "numeric",
                          month: "short",
                        })}
                      </span>
                      <span className="ml-auto text-slate-400">{stay.nights} คืน</span>
                    </div>

                    <div className="flex flex-wrap gap-2 text-xs text-slate-500">
                      {stay.booking_channel && (
                        <span className="rounded bg-slate-100 px-2 py-0.5">
                          {stay.booking_channel}
                        </span>
                      )}
                      {stay.group_type && (
                        <span className="rounded bg-slate-100 px-2 py-0.5">{stay.group_type}</span>
                      )}
                      {stay.group_size && (
                        <span className="rounded bg-slate-100 px-2 py-0.5">
                          {stay.group_size} คน
                        </span>
                      )}
                      {stay.butler_service_visit && (
                        <span className="rounded bg-indigo-50 px-2 py-0.5 text-indigo-600">
                          บัตเลอร์ {stay.butler_service_visit}
                        </span>
                      )}
                    </div>

                    {extraRevenue > 0 && (
                      <div className="flex flex-wrap gap-2 text-xs text-slate-500">
                        {stay.food_amount ? <span>🍽️ {fmt(stay.food_amount)}</span> : null}
                        {stay.drink_amount ? <span>🥤 {fmt(stay.drink_amount)}</span> : null}
                        {stay.mookata_amount ? <span>🥩 {fmt(stay.mookata_amount)}</span> : null}
                        {stay.bbq_amount ? <span>🔥 {fmt(stay.bbq_amount)}</span> : null}
                      </div>
                    )}

                    {(stay.deposit_received || stay.deposit_returned || stay.deposit_amount) && (
                      <div className="flex flex-wrap gap-2 text-xs">
                        {stay.deposit_amount ? (
                          <span className="rounded-full border border-amber-200 bg-white px-2 py-0.5 text-amber-700">
                            อัตรามัดจำ {fmt(stay.deposit_amount)}
                          </span>
                        ) : null}
                        {stay.deposit_received ? (
                          <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-amber-700">
                            💵 มัดจำ {fmt(stay.deposit_received)}
                          </span>
                        ) : null}
                        {stay.deposit_returned ? (
                          <span className="rounded-full border border-slate-200 bg-slate-100 px-2 py-0.5 text-slate-500">
                            ↩ คืน {fmt(stay.deposit_returned)}
                          </span>
                        ) : null}
                      </div>
                    )}

                    {(stay.feedback || stay.issues || stay.damaged_items) && (
                      <div className="space-y-1 border-t pt-2 text-xs">
                        {stay.feedback && <p className="text-slate-600">💬 {stay.feedback}</p>}
                        {stay.issues && <p className="text-orange-600">⚠️ {stay.issues}</p>}
                        {stay.damaged_items && (
                          <p className="text-red-600">🔧 {stay.damaged_items}</p>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            <TablePager pager={pager} unit="รายการ" />
          </div>
        ))}

      {/* ── Add / Edit Dialog ────────────────────────────────────────────── */}
      <Dialog
        open={showForm}
        onOpenChange={(open) => {
          if (!open) {
            setShowForm(false);
            setEditingStay(null);
          }
        }}
      >
        <DialogContent size="xl">
          <DialogHeader>
            <DialogTitle>
              {isEditMode
                ? `แก้ไขการเข้าพัก — ${guestDisplayName(editingStay.tmc_guests)}`
                : "บันทึกการเข้าพัก"}
            </DialogTitle>
          </DialogHeader>
          {formBody}
          <DialogFooter>
            {isEditMode && (
              <Button
                variant="destructive"
                className="mr-auto"
                onClick={() => {
                  const target = editingStay;
                  setShowForm(false);
                  setEditingStay(null);
                  setDeleteReason("");
                  setDeleteTarget(target);
                }}
              >
                <Trash2 className="h-4 w-4" /> ลบ
              </Button>
            )}
            <Button
              variant="outline"
              onClick={() => {
                setShowForm(false);
                setEditingStay(null);
              }}
            >
              ยกเลิก
            </Button>
            <Button
              onClick={handleSave}
              disabled={saving || !roomsValid || (!isEditMode && !form.firstName)}
            >
              {saving ? "กำลังบันทึก…" : isEditMode ? "บันทึกการแก้ไข" : "บันทึก"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Delete Confirmation Dialog ───────────────────────────────────── */}
      <Dialog
        open={!!deleteTarget}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
      >
        <DialogContent size="md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <AlertTriangle className="h-5 w-5" /> ยืนยันการลบ
            </DialogTitle>
          </DialogHeader>
          <DialogBody>
            {deleteTarget && (
              <div className="space-y-4">
                <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm">
                  <p className="font-semibold text-red-800">
                    {guestDisplayName(deleteTarget.tmc_guests)}
                  </p>
                  <p className="mt-0.5 text-red-600">
                    {deleteTarget.property_code} ·{" "}
                    {new Date(deleteTarget.check_in).toLocaleDateString("th-TH", {
                      day: "numeric",
                      month: "short",
                      year: "2-digit",
                    })}
                    {" → "}
                    {new Date(deleteTarget.check_out).toLocaleDateString("th-TH", {
                      day: "numeric",
                      month: "short",
                      year: "2-digit",
                    })}
                    {" · "}
                    {deleteTarget.nights} คืน
                  </p>
                  {deleteTarget.room_rate != null && (
                    <p className="mt-0.5 text-xs text-red-600">
                      ยอด {fmt(deleteTarget.room_rate)} บาท
                    </p>
                  )}
                </div>
                <div className="space-y-1.5">
                  <Label>
                    เหตุผลในการลบ{" "}
                    <span className="font-normal text-slate-400">(บันทึกใน audit log)</span>
                  </Label>
                  <Input
                    placeholder="เช่น บันทึกซ้ำ, ข้อมูลผิดพลาด..."
                    value={deleteReason}
                    onChange={(e) => setDeleteReason(e.target.value)}
                  />
                </div>
                <p className="text-xs text-slate-400">
                  การกระทำนี้ไม่สามารถย้อนกลับได้ ข้อมูลที่ถูกลบจะถูกบันทึกใน audit log
                </p>
              </div>
            )}
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>
              ยกเลิก
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
              {deleting ? "กำลังลบ…" : "ลบรายการนี้"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}
