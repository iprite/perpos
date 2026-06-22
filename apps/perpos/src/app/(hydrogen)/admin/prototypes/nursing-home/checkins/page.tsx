"use client";

// เช็คอิน-เอาท์เวร — บันทึกเวลาเข้า/ออกของพนักงานต่อกะ (interactive)
// shift_checkins: nurse/caregiver = W (เช็คอิน/เช็คเอาท์ตัวเอง), owner/admin_staff = V (ดูอย่างเดียว)

import { useMemo, useState } from "react";
import { LogIn, LogOut, UserCheck, ListChecks, Sparkles } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { CustomSelect } from "@/components/ui/custom-select";
import { StatCard } from "@/components/ui/stat-card";
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
import {
  Dialog,
  DialogContent,
  DialogBody,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { toast } from "@/lib/toast";

import { SHIFT_CHECKINS, STAFF, SHIFTS } from "../_fixtures";
import type { ShiftCheckin } from "../_fixtures/types";
import {
  NursingShell,
  useNursingRole,
  CheckinStatusBadge,
  fmtDateTimeTH,
  fmtTimeTH,
  fullName,
} from "../_components";

const TODAY = "2026-06-22";
const SHIFT_TYPE_LABEL: Record<string, string> = {
  morning: "เช้า",
  afternoon: "บ่าย",
  night: "ดึก",
};

export default function CheckinsPage() {
  const { can } = useNursingRole();
  const canWrite = can("write", "shift_checkins");

  const [rows, setRows] = useState<ShiftCheckin[]>(SHIFT_CHECKINS);
  const [loading, setLoading] = useState(false);
  const [day, setDay] = useState<"today" | "all">("today");
  const [staffFilter, setStaffFilter] = useState("");
  const [checkinDlg, setCheckinDlg] = useState(false);

  const staffById = (id: string) => STAFF.find((s) => s.id === id);
  const shiftById = (id?: string | null) => (id ? SHIFTS.find((s) => s.id === id) : undefined);

  function shiftLabel(c: ShiftCheckin): string {
    const sh = shiftById(c.shift_id);
    if (!sh) return "—";
    return `${SHIFT_TYPE_LABEL[sh.shift_type] ?? sh.shift_type} · ${sh.start_time}–${sh.end_time}`;
  }
  function isToday(iso: string) {
    return iso.slice(0, 10) === TODAY;
  }

  const filtered = useMemo(() => {
    return rows
      .filter((c) => (day === "today" ? isToday(c.checkin_at) : true))
      .filter((c) => (staffFilter ? c.staff_id === staffFilter : true))
      .sort((a, b) => b.checkin_at.localeCompare(a.checkin_at));
  }, [rows, day, staffFilter]);

  // KPI — คำนวณจากข้อมูลจริง
  const onDuty = rows.filter((c) => c.status === "checked_in").length;
  const checkedInToday = rows.filter((c) => isToday(c.checkin_at)).length;

  function addCheckin(staffId: string, shiftId: string) {
    const now = new Date().toISOString();
    setRows((prev) => [
      {
        id: `sci-new-${Date.now()}`,
        staff_id: staffId,
        shift_id: shiftId || null,
        checkin_at: now,
        checkout_at: null,
        status: "checked_in",
        note: null,
        created_at: now,
      },
      ...prev,
    ]);
    const s = staffById(staffId);
    toast.success(`เช็คอิน ${s ? fullName(s) : staffId} แล้ว`);
  }
  function checkout(id: string) {
    setRows((prev) =>
      prev.map((c) =>
        c.id === id ? { ...c, status: "checked_out", checkout_at: new Date().toISOString() } : c,
      ),
    );
    toast.success("เช็คเอาท์แล้ว");
  }

  return (
    <NursingShell
      title="เช็คอิน-เอาท์เวร"
      icon={<UserCheck className="h-6 w-6" />}
      description="บันทึกเวลาเข้า–ออกเวรของพนักงาน — เห็นว่าใครกำลังเข้าเวรอยู่ตอนนี้ ลดข้อพิพาทเวลาทำงาน"
      actions={
        canWrite ? (
          <Button onClick={() => setCheckinDlg(true)}>
            <LogIn className="mr-1.5 h-4 w-4" /> เช็คอิน
          </Button>
        ) : undefined
      }
    >
      {/* KPI */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <StatCard
          icon={<UserCheck className="h-4 w-4" />}
          label="กำลังเข้าเวรตอนนี้"
          value={String(onDuty)}
          sub="คนที่เช็คอินแล้วยังไม่ออก"
          tone="positive"
          valueColored
        />
        <StatCard
          icon={<ListChecks className="h-4 w-4" />}
          label="เช็คอินวันนี้รวม"
          value={String(checkedInToday)}
          sub="22 มิ.ย. 2569"
          tone="info"
        />
      </div>

      {/* note → สรุปส่งเวร (AI) อยู่หน้าตารางเวร */}
      <div className="flex items-center gap-2 rounded-lg border border-blue-100 bg-blue-50/40 px-3 py-2 text-xs text-gray-600">
        <Sparkles className="h-4 w-4 shrink-0 text-blue-600" />
        <span>
          ต้องการสรุปส่งเวรด้วย AI?{" "}
          <Link
            href="../shifts"
            className="font-medium text-primary underline-offset-2 hover:underline"
          >
            ไปที่หน้าตารางเวร
          </Link>{" "}
          แล้วกดปุ่ม “สรุปส่งเวร (AI)”
        </span>
      </div>

      {/* filter bar */}
      <div className="flex flex-wrap items-center gap-2">
        <CustomSelect
          className="w-40"
          value={day}
          onChange={(v) => setDay(v as "today" | "all")}
          options={[
            { value: "today", label: "วันนี้" },
            { value: "all", label: "ทั้งหมด" },
          ]}
        />
        <CustomSelect
          className="w-56"
          value={staffFilter}
          onChange={setStaffFilter}
          options={[
            { value: "", label: "พนักงานทุกคน" },
            ...STAFF.map((s) => ({ value: s.id, label: fullName(s) })),
          ]}
        />
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setLoading((l) => !l)}
          className="ml-auto text-xs text-gray-400"
        >
          {loading ? "หยุดจำลองโหลด" : "จำลอง loading"}
        </Button>
      </div>

      {/* ตาราง */}
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
        <Table stickyHeader maxHeight="64vh">
          <TableHeader sticky>
            <TableRow>
              <TableHead>พนักงาน</TableHead>
              <TableHead>กะ / วัน</TableHead>
              <TableHead align="center">เวลาเข้า</TableHead>
              <TableHead align="center">เวลาออก</TableHead>
              <TableHead align="center">สถานะ</TableHead>
              <TableHead align="right">จัดการ</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableLoading colSpan={6} />
            ) : filtered.length === 0 ? (
              <TableEmpty colSpan={6}>
                {day === "today" ? "ยังไม่มีการเช็คอินวันนี้" : "ยังไม่มีข้อมูลเช็คอิน"}
              </TableEmpty>
            ) : (
              filtered.map((c) => {
                const sh = shiftById(c.shift_id);
                const s = staffById(c.staff_id);
                return (
                  <TableRow key={c.id}>
                    <TableCell>
                      <div className="text-sm font-medium text-gray-900">
                        {s ? fullName(s) : c.staff_id}
                      </div>
                      {s && <div className="text-[11px] text-gray-400">{s.code}</div>}
                    </TableCell>
                    <TableCell>
                      <div className="text-sm text-gray-700">{shiftLabel(c)}</div>
                      {sh && <div className="text-[11px] text-gray-400">{sh.shift_date}</div>}
                    </TableCell>
                    <TableCell align="center">
                      <span className="font-mono text-sm tabular-nums text-gray-700">
                        {fmtTimeTH(c.checkin_at)}
                      </span>
                    </TableCell>
                    <TableCell align="center">
                      {c.checkout_at ? (
                        <span className="font-mono text-sm tabular-nums text-gray-700">
                          {fmtTimeTH(c.checkout_at)}
                        </span>
                      ) : (
                        <span className="text-gray-300">—</span>
                      )}
                    </TableCell>
                    <TableCell align="center">
                      <CheckinStatusBadge status={c.status} />
                    </TableCell>
                    <TableCell align="right">
                      {canWrite && c.status === "checked_in" ? (
                        <Button variant="outline" size="sm" onClick={() => checkout(c.id)}>
                          <LogOut className="mr-1 h-3.5 w-3.5" /> เช็คเอาท์
                        </Button>
                      ) : (
                        <span
                          className="text-[11px] text-gray-400"
                          title={fmtDateTimeTH(c.checkout_at)}
                        >
                          {c.status === "checked_out" ? "เสร็จสิ้น" : "—"}
                        </span>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      <CheckinDialog open={checkinDlg} onClose={() => setCheckinDlg(false)} onSave={addCheckin} />
    </NursingShell>
  );
}

function CheckinDialog({
  open,
  onClose,
  onSave,
}: {
  open: boolean;
  onClose: () => void;
  onSave: (staffId: string, shiftId: string) => void;
}) {
  const activeStaff = STAFF.filter((s) => s.employment_status === "active");
  const todayShifts = SHIFTS.filter((s) => s.shift_date === TODAY);
  const [staffId, setStaffId] = useState("");
  const [shiftId, setShiftId] = useState("");

  // reset เมื่อเปิดใหม่
  const [wasOpen, setWasOpen] = useState(false);
  if (open && !wasOpen) {
    setWasOpen(true);
    setStaffId("");
    setShiftId("");
  }
  if (!open && wasOpen) setWasOpen(false);

  function submit() {
    if (!staffId) {
      toast.error("กรุณาเลือกพนักงาน");
      return;
    }
    onSave(staffId, shiftId);
    onClose();
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle>เช็คอินเข้าเวร</DialogTitle>
        </DialogHeader>
        <DialogBody>
          <div className="space-y-4">
            <div>
              <Label htmlFor="ci-staff">พนักงาน *</Label>
              <CustomSelect
                className="mt-1"
                value={staffId}
                onChange={setStaffId}
                options={[
                  { value: "", label: "— เลือกพนักงาน —" },
                  ...activeStaff.map((s) => ({ value: s.id, label: fullName(s) })),
                ]}
              />
            </div>
            <div>
              <Label htmlFor="ci-shift">กะวันนี้ (ไม่บังคับ)</Label>
              <CustomSelect
                className="mt-1"
                value={shiftId}
                onChange={setShiftId}
                options={[
                  { value: "", label: "— ไม่ระบุกะ —" },
                  ...todayShifts.map((s) => {
                    const st = STAFF.find((x) => x.id === s.staff_id);
                    return {
                      value: s.id,
                      label: `${SHIFT_TYPE_LABEL[s.shift_type] ?? s.shift_type} ${s.start_time}–${s.end_time}${st ? ` · ${st.first_name}` : ""}`,
                    };
                  }),
                ]}
              />
            </div>
            <p className="text-xs text-gray-400">เวลาเข้าจะบันทึกเป็นเวลาปัจจุบันอัตโนมัติ</p>
          </div>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            ยกเลิก
          </Button>
          <Button onClick={submit}>
            <LogIn className="mr-1.5 h-4 w-4" /> เช็คอิน
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
