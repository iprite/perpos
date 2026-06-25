"use client";

// _time-client.tsx — มุมมองเวลาทำงาน (client view, mutation จริง)
// initial มาจาก server (lib/hrm/time, เดือนปัจจุบัน) · เลือกพนักงาน → ตาราง attendance รายวัน + สรุป
// แก้/บันทึกรายวัน (upsert) → /api/hrm/time POST (Bearer) → router.refresh()
// gate ปุ่ม/แก้ไขด้วย canWrite (role จริงจาก server)

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Clock,
  CalendarCheck,
  AlarmClockOff,
  UserX,
  Timer,
  Pencil,
  CalendarPlus,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CustomSelect } from "@/components/ui/custom-select";
import { ThaiDatePicker } from "@/components/ui/thai-date-picker";
import { StatCard } from "@/components/ui/stat-card";
import { StatusBadge } from "@/components/ui/badge";
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

import type { Employee, Attendance, AttendanceStatus } from "@/lib/hrm/types";
import { summarizeAttendance } from "@/lib/hrm/time";
import { fmtNum, fmtTimeTH, fmtDateTH, fmtPeriod, fullName } from "../_components/format";
import { AttendanceStatusBadge } from "../_components/badges";
import { hrmMutate } from "../_components/api";

const NORMAL_CHECK_IN = "09:00"; // หลังเวลานี้ = สาย

const STATUS_OPTS = [
  { value: "present", label: "มาทำงาน" },
  { value: "absent", label: "ขาด" },
  { value: "leave", label: "ลา" },
  { value: "holiday", label: "วันหยุด" },
];

type EditForm = {
  work_date: string;
  status: AttendanceStatus;
  check_in: string;
  check_out: string;
  ot_hours: string;
  note: string;
};

const EMPTY_EDIT: EditForm = {
  work_date: "",
  status: "present",
  check_in: "",
  check_out: "",
  ot_hours: "0",
  note: "",
};

// แปลงเวลา "HH:MM" → นาที (เทียบสาย)
function toMinutes(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

export function TimeClient({
  employees,
  initialAttendance,
  orgId,
  canWrite,
  year,
  month,
}: {
  employees: Employee[];
  initialAttendance: Attendance[];
  orgId: string;
  canWrite: boolean;
  year: number;
  month: number;
}) {
  const router = useRouter();
  const monthStr = `${year}-${String(month).padStart(2, "0")}`;
  const monthOpts = [{ value: monthStr, label: fmtPeriod(year, month) }];

  const [empId, setEmpId] = useState<string>(employees[0]?.id ?? "");

  // dialog แก้/เพิ่มรายวัน
  const [editOpen, setEditOpen] = useState(false);
  const [isNew, setIsNew] = useState(false);
  const [form, setForm] = useState<EditForm>(EMPTY_EDIT);
  const [saving, setSaving] = useState(false);

  const empById = useMemo(() => new Map(employees.map((e) => [e.id, e])), [employees]);
  const selectedEmp = empById.get(empId);

  // ── KPI ทั้งเดือน (ทุกคน) ──
  const kpi = useMemo(() => {
    const summary = summarizeAttendance(initialAttendance);
    let present = 0;
    let late = 0;
    let absent = 0;
    let ot = 0;
    for (const s of Array.from(summary.values())) {
      present += s.present_days;
      late += s.late_count;
      absent += s.absent_days;
      ot += s.ot_hours;
    }
    return { present, late, absent, ot };
  }, [initialAttendance]);

  // ── attendance รายวันของพนักงานที่เลือก ──
  const dailyRows = useMemo(
    () =>
      initialAttendance
        .filter((r) => r.employee_id === empId)
        .slice()
        .sort((a, b) => a.work_date.localeCompare(b.work_date)),
    [initialAttendance, empId],
  );

  // ── สรุปเดือนของพนักงานที่เลือก ──
  const summary = useMemo(() => {
    const m = summarizeAttendance(dailyRows).get(empId);
    return (
      m ?? {
        employee_id: empId,
        present_days: 0,
        absent_days: 0,
        leave_days: 0,
        holiday_days: 0,
        late_count: 0,
        ot_hours: 0,
      }
    );
  }, [dailyRows, empId]);

  function openEdit(rec: Attendance) {
    setIsNew(false);
    setForm({
      work_date: rec.work_date,
      status: rec.status,
      check_in: rec.check_in ?? "",
      check_out: rec.check_out ?? "",
      ot_hours: String(rec.ot_hours),
      note: rec.note ?? "",
    });
    setEditOpen(true);
  }

  function openAdd() {
    setIsNew(true);
    setForm({ ...EMPTY_EDIT, work_date: `${monthStr}-01` });
    setEditOpen(true);
  }

  async function submitEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!empId) return toast.error("กรุณาเลือกพนักงาน");
    if (!form.work_date) return toast.error("กรุณาเลือกวันที่");
    const ot = Number(form.ot_hours);
    if (Number.isNaN(ot) || ot < 0) return toast.error("ชั่วโมง OT ต้องเป็นตัวเลขไม่ติดลบ");

    const isPresent = form.status === "present";
    const late =
      isPresent && !!form.check_in && toMinutes(form.check_in) > toMinutes(NORMAL_CHECK_IN);

    setSaving(true);
    try {
      await hrmMutate("/api/hrm/time", "POST", {
        orgId,
        employee_id: empId,
        work_date: form.work_date,
        status: form.status,
        check_in: isPresent ? form.check_in || null : null,
        check_out: isPresent ? form.check_out || null : null,
        is_late: late,
        ot_hours: ot,
        note: form.note.trim() || null,
      });
      setEditOpen(false);
      toast.success(`บันทึกเวลาทำงานวันที่ ${fmtDateTH(form.work_date)} เรียบร้อย`);
      router.refresh();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-5">
      {/* KPI ทั้งเดือน */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          icon={<CalendarCheck className="h-4 w-4" />}
          label="วันมาทำงานรวม"
          value={`${fmtNum(kpi.present)} วัน`}
          sub="ทุกคนรวมเดือนนี้"
          tone="positive"
          valueColored
        />
        <StatCard
          icon={<AlarmClockOff className="h-4 w-4" />}
          label="มาสายรวม"
          value={`${fmtNum(kpi.late)} ครั้ง`}
          sub={`เกณฑ์เข้างาน ${NORMAL_CHECK_IN} น.`}
          tone={kpi.late > 0 ? "warning" : "neutral"}
          valueColored={kpi.late > 0}
        />
        <StatCard
          icon={<UserX className="h-4 w-4" />}
          label="ขาดรวม"
          value={`${fmtNum(kpi.absent)} วัน`}
          sub="บันทึกว่าขาดงาน"
          tone={kpi.absent > 0 ? "negative" : "neutral"}
          valueColored={kpi.absent > 0}
        />
        <StatCard
          icon={<Timer className="h-4 w-4" />}
          label="OT รวมเดือนนี้"
          value={`${fmtNum(kpi.ot, 1)} ชม.`}
          sub="ทุกคน · ป้อนเข้ารอบเงินเดือน"
          tone="info"
        />
      </div>

      {/* ── เลือกพนักงาน + เดือน ── */}
      <div className="flex flex-col gap-2 rounded-xl border border-gray-200 bg-white p-3 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <CustomSelect
            value={empId}
            onChange={setEmpId}
            options={employees.map((e) => ({
              value: e.id,
              label: `${e.employee_code} · ${fullName(e)}`,
            }))}
            className="sm:w-64"
          />
          <CustomSelect
            value={monthStr}
            onChange={() => {}}
            options={monthOpts}
            disabled
            className="sm:w-44"
          />
        </div>
        {canWrite && (
          <Button size="sm" onClick={openAdd} disabled={!empId}>
            <CalendarPlus className="mr-1.5 h-4 w-4" />
            บันทึกเวลาวันใหม่
          </Button>
        )}
      </div>

      {/* ── สรุปต่อคน → ป้อนเข้าเงินเดือน ── */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        <SummaryPill
          label="มาทำงาน"
          value={`${fmtNum(summary.present_days)} วัน`}
          tone="positive"
        />
        <SummaryPill label="มาสาย" value={`${fmtNum(summary.late_count)} ครั้ง`} tone="warning" />
        <SummaryPill label="ขาด" value={`${fmtNum(summary.absent_days)} วัน`} tone="negative" />
        <SummaryPill label="ลา" value={`${fmtNum(summary.leave_days)} วัน`} tone="info" />
        <SummaryPill label="OT รวม" value={`${fmtNum(summary.ot_hours, 1)} ชม.`} tone="primary" />
      </div>
      <Text className="text-xs text-gray-400">
        ตัวเลขสรุปของ {selectedEmp ? fullName(selectedEmp) : "—"} เดือนนี้
        จะถูกป้อนเข้ารอบเงินเดือนอัตโนมัติ (หักขาด/คิด OT) — ลดการกรอกซ้ำและความผิดพลาด
      </Text>

      {/* ── ตาราง attendance รายวัน — title เหนือตาราง ── */}
      <div>
        <div className="mb-2.5 px-1 text-sm font-semibold text-gray-900">
          เวลาทำงานรายวัน — {fmtPeriod(year, month)}
        </div>
        <Table stickyHeader maxHeight="52vh" className="shadow-sm">
          <TableHeader sticky>
            <TableRow>
              <TableHead>วันที่</TableHead>
              <TableHead align="center">สถานะ</TableHead>
              <TableHead align="center">เข้า</TableHead>
              <TableHead align="center">ออก</TableHead>
              <TableHead align="center">สาย</TableHead>
              <TableHead align="right">OT (ชม.)</TableHead>
              <TableHead>หมายเหตุ</TableHead>
              {canWrite && <TableHead align="center">แก้ไข</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {dailyRows.length === 0 ? (
              <TableEmpty colSpan={canWrite ? 8 : 7}>
                <div className="flex flex-col items-center justify-center py-10 text-center">
                  <div className="mb-3 rounded-full bg-gray-100 p-4">
                    <Clock className="h-7 w-7 text-gray-400" />
                  </div>
                  <p className="text-sm font-medium text-gray-700">ยังไม่มีบันทึกเวลาทำงาน</p>
                  <p className="mt-1 text-sm text-gray-500">
                    เลือกพนักงานคนอื่น หรือเริ่มบันทึกเวลาทำงานวันใหม่
                  </p>
                  {canWrite && empId && (
                    <Button size="sm" className="mt-4" onClick={openAdd}>
                      <CalendarPlus className="mr-1.5 h-4 w-4" />
                      บันทึกเวลาวันใหม่
                    </Button>
                  )}
                </div>
              </TableEmpty>
            ) : (
              dailyRows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="whitespace-nowrap text-gray-700">
                    {fmtDateTH(r.work_date)}
                  </TableCell>
                  <TableCell align="center">
                    <AttendanceStatusBadge status={r.status} />
                  </TableCell>
                  <TableCell align="center" tabular className="text-gray-600">
                    {fmtTimeTH(r.check_in) || "—"}
                  </TableCell>
                  <TableCell align="center" tabular className="text-gray-600">
                    {fmtTimeTH(r.check_out) || "—"}
                  </TableCell>
                  <TableCell align="center">
                    {r.is_late ? <StatusBadge tone="warning">สาย</StatusBadge> : "—"}
                  </TableCell>
                  <TableCell align="right" tabular>
                    {r.ot_hours > 0 ? fmtNum(r.ot_hours, 1) : "—"}
                  </TableCell>
                  <TableCell wrap className="text-gray-500">
                    {r.note ?? "—"}
                  </TableCell>
                  {canWrite && (
                    <TableCell align="center">
                      <Button
                        variant="ghost"
                        size="sm"
                        aria-label={`แก้ไขเวลาทำงานวันที่ ${fmtDateTH(r.work_date)}`}
                        onClick={() => openEdit(r)}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  )}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* dialog แก้/เพิ่มรายวัน */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent size="lg">
          <DialogHeader>
            <DialogTitle>
              {isNew ? "บันทึกเวลาทำงานวันใหม่" : "แก้ไขเวลาทำงาน"}
              {!isNew && form.work_date && (
                <span className="ml-2 text-sm font-normal text-gray-400">
                  {fmtDateTH(form.work_date)}
                </span>
              )}
            </DialogTitle>
          </DialogHeader>
          <form className="flex min-h-0 flex-1 flex-col" onSubmit={submitEdit}>
            <DialogBody>
              <div className="space-y-4">
                {isNew && (
                  <div>
                    <Label htmlFor="att-date">วันที่ *</Label>
                    <div className="mt-1">
                      <ThaiDatePicker
                        value={form.work_date}
                        onChange={(iso) => setForm((f) => ({ ...f, work_date: iso }))}
                        placeholder="เลือกวันที่"
                      />
                    </div>
                  </div>
                )}
                <div>
                  <Label htmlFor="att-status">สถานะ</Label>
                  <CustomSelect
                    value={form.status}
                    onChange={(v) => setForm((f) => ({ ...f, status: v as AttendanceStatus }))}
                    options={STATUS_OPTS}
                    className="mt-1 w-full"
                  />
                </div>
                {form.status === "present" && (
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div>
                      <Label htmlFor="att-in">เวลาเข้า</Label>
                      <Input
                        id="att-in"
                        type="time"
                        className="mt-1"
                        value={form.check_in}
                        onChange={(e) => setForm((f) => ({ ...f, check_in: e.target.value }))}
                      />
                    </div>
                    <div>
                      <Label htmlFor="att-out">เวลาออก</Label>
                      <Input
                        id="att-out"
                        type="time"
                        className="mt-1"
                        value={form.check_out}
                        onChange={(e) => setForm((f) => ({ ...f, check_out: e.target.value }))}
                      />
                    </div>
                  </div>
                )}
                <div>
                  <Label htmlFor="att-ot">ชั่วโมง OT</Label>
                  <Input
                    id="att-ot"
                    type="number"
                    step="0.5"
                    min="0"
                    className="mt-1"
                    value={form.ot_hours}
                    onChange={(e) => setForm((f) => ({ ...f, ot_hours: e.target.value }))}
                  />
                </div>
                <div>
                  <Label htmlFor="att-note">หมายเหตุ</Label>
                  <Input
                    id="att-note"
                    className="mt-1"
                    value={form.note}
                    onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
                    placeholder="เช่น รถติด / ลาป่วยมีใบรับรอง"
                  />
                </div>
                <p className="text-xs text-gray-400">
                  เกณฑ์มาสาย = เข้างานหลัง {NORMAL_CHECK_IN} น. (ระบบคำนวณให้อัตโนมัติ)
                </p>
              </div>
            </DialogBody>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setEditOpen(false)}>
                ยกเลิก
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? "กำลังบันทึก…" : "บันทึก"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── chip สรุปต่อคน ───
function SummaryPill({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "positive" | "negative" | "warning" | "info" | "primary";
}) {
  const toneClass: Record<string, string> = {
    positive: "text-green-600",
    negative: "text-red-600",
    warning: "text-amber-600",
    info: "text-blue-600",
    primary: "text-primary",
  };
  return (
    <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2">
      <div className="text-xs text-gray-500">{label}</div>
      <div className={`mt-0.5 text-sm font-semibold tabular-nums ${toneClass[tone]}`}>{value}</div>
    </div>
  );
}
