"use client";

// เวลาทำงาน (attendance — clock-in/out รายวัน) — prototype interactive
// guard super_admin อยู่ที่ layout.tsx แล้ว → หน้านี้เป็น client interactive
// จุดเด่น: แถบบันทึกเข้า-ออกงานวันนี้ (toggle จริง + toast) + ตาราง attendance รายวัน แก้ได้ผ่าน dialog
// ตัวเลขสรุปต่อคนป้อนเข้าเงินเดือน (มา/สาย/ขาด/OT) — เชื่อมโยง §4.9

import { useMemo, useState } from "react";
import {
  Clock,
  Search,
  CalendarCheck,
  AlarmClockOff,
  UserX,
  Timer,
  LogIn,
  LogOut,
  Pencil,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CustomSelect } from "@/components/ui/custom-select";
import { StatCard } from "@/components/ui/stat-card";
import { Avatar } from "@/components/ui/avatar";
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
import cn from "@core/utils/class-names";

import { MOCK_EMPLOYEES, MOCK_ATTENDANCE } from "../_fixtures";
import type { Attendance, AttendanceStatus } from "../_fixtures/types";
import {
  HrmShell,
  useHrmRole,
  fmtNum,
  fmtTimeTH,
  fmtDateTH,
  fullName,
  AttendanceStatusBadge,
} from "../_components";

// วันนี้ (อ้างอิงชุด fixture = 24 มิ.ย. 2026)
const TODAY = "2026-06-24";
const NORMAL_CHECK_IN = "09:00"; // หลังเวลานี้ = สาย

// เดือนที่มีในชุดข้อมูล (fixture = มิ.ย. 2026)
const MONTH_OPTS = [{ value: "2026-06", label: "มิถุนายน 2569" }];

const STATUS_OPTS = [
  { value: "present", label: "มาทำงาน" },
  { value: "absent", label: "ขาด" },
  { value: "leave", label: "ลา" },
  { value: "holiday", label: "วันหยุด" },
];

const ACTIVE_EMPLOYEES = MOCK_EMPLOYEES.filter((e) => e.status === "active");

// แปลงเวลา "HH:MM" → นาที (เทียบสาย)
function toMinutes(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}
// เวลา demo สมจริง — pin ช่วงเช้า/เย็น (ไม่ใช้เวลาเครื่องจริงซึ่งอาจได้ชั่วโมงแปลก ๆ ตอนพรีเซน)
// เข้า 08:40–08:49 (ก่อนเกณฑ์ 09:00 = ไม่สาย) · ออก 17:30–17:39
function demoCheckIn(): string {
  return `08:4${Math.floor(Math.random() * 10)}`;
}
function demoCheckOut(): string {
  return `17:3${Math.floor(Math.random() * 10)}`;
}

type EditForm = {
  status: AttendanceStatus;
  check_in: string;
  check_out: string;
  ot_hours: string;
  note: string;
};

export default function TimePage() {
  const { can } = useHrmRole();
  const canWrite = can("write", "time");

  // state จาก fixture
  const [records, setRecords] = useState<Attendance[]>(MOCK_ATTENDANCE);

  // clock-in/out วันนี้
  const [q, setQ] = useState("");

  // ตาราง attendance รายคน
  const [empId, setEmpId] = useState<string>(ACTIVE_EMPLOYEES[0]?.id ?? "");
  const [month] = useState<string>("2026-06");

  // dialog แก้รายวัน
  const [editTarget, setEditTarget] = useState<{ employeeId: string; date: string } | null>(null);
  const [form, setForm] = useState<EditForm>({
    status: "present",
    check_in: "",
    check_out: "",
    ot_hours: "0",
    note: "",
  });
  const [saving, setSaving] = useState(false);

  const empById = useMemo(() => new Map(MOCK_EMPLOYEES.map((e) => [e.id, e])), []);

  // ── record ของวันนี้ ต่อพนักงาน ──
  const todayByEmp = useMemo(() => {
    const map = new Map<string, Attendance>();
    for (const r of records) {
      if (r.work_date === TODAY) map.set(r.employee_id, r);
    }
    return map;
  }, [records]);

  // ── KPI วันนี้ + OT เดือนนี้ ──
  const kpi = useMemo(() => {
    let present = 0;
    let late = 0;
    let absent = 0;
    for (const e of ACTIVE_EMPLOYEES) {
      const rec = todayByEmp.get(e.id);
      if (rec?.status === "present") present += 1;
      if (rec?.is_late) late += 1;
      if (rec?.status === "absent") absent += 1;
    }
    const otThisMonth = records
      .filter((r) => r.work_date.startsWith(month))
      .reduce((s, r) => s + r.ot_hours, 0);
    return { present, late, absent, otThisMonth };
  }, [todayByEmp, records, month]);

  // ── รายชื่อ clock-in/out วันนี้ (filter ด้วย q) ──
  const clockList = useMemo(() => {
    const term = q.trim().toLowerCase();
    return ACTIVE_EMPLOYEES.filter((e) => {
      if (!term) return true;
      const hay =
        `${e.first_name} ${e.last_name} ${e.employee_code} ${e.position ?? ""}`.toLowerCase();
      return hay.includes(term);
    });
  }, [q]);

  // ── attendance รายวันของพนักงานที่เลือก ──
  const dailyRows = useMemo(() => {
    return records
      .filter((r) => r.employee_id === empId && r.work_date.startsWith(month))
      .slice()
      .sort((a, b) => a.work_date.localeCompare(b.work_date));
  }, [records, empId, month]);

  // ── สรุปเดือนของพนักงานที่เลือก (จาก state ปัจจุบัน) ──
  const summary = useMemo(() => {
    const rows = records.filter((r) => r.employee_id === empId && r.work_date.startsWith(month));
    return {
      present: rows.filter((r) => r.status === "present").length,
      late: rows.filter((r) => r.is_late).length,
      absent: rows.filter((r) => r.status === "absent").length,
      leave: rows.filter((r) => r.status === "leave").length,
      ot: rows.reduce((s, r) => s + r.ot_hours, 0),
    };
  }, [records, empId, month]);

  // ── บันทึกเข้างานวันนี้ ──
  function clockIn(employeeId: string) {
    const at = demoCheckIn();
    const late = toMinutes(at) > toMinutes(NORMAL_CHECK_IN);
    const emp = empById.get(employeeId);
    setRecords((prev) => {
      const existing = prev.find((r) => r.employee_id === employeeId && r.work_date === TODAY);
      if (existing) {
        return prev.map((r) =>
          r.id === existing.id ? { ...r, status: "present", check_in: at, is_late: late } : r,
        );
      }
      const rec: Attendance = {
        id: `att-${employeeId}-today`,
        org_id: "org-demo",
        employee_id: employeeId,
        work_date: TODAY,
        status: "present",
        check_in: at,
        check_out: null,
        is_late: late,
        ot_hours: 0,
        note: null,
        created_at: `${TODAY}T00:00:00Z`,
      };
      return [...prev, rec];
    });
    toast.success(`บันทึกเข้างาน ${emp ? fullName(emp) : ""} เวลา ${at}${late ? " (สาย)" : ""}`);
  }

  // ── บันทึกออกงานวันนี้ ──
  function clockOut(employeeId: string) {
    const at = demoCheckOut();
    const emp = empById.get(employeeId);
    setRecords((prev) =>
      prev.map((r) =>
        r.employee_id === employeeId && r.work_date === TODAY ? { ...r, check_out: at } : r,
      ),
    );
    toast.success(`บันทึกออกงาน ${emp ? fullName(emp) : ""} เวลา ${at}`);
  }

  // ── เปิด dialog แก้รายวัน ──
  function openEdit(rec: Attendance) {
    setEditTarget({ employeeId: rec.employee_id, date: rec.work_date });
    setForm({
      status: rec.status,
      check_in: rec.check_in ?? "",
      check_out: rec.check_out ?? "",
      ot_hours: String(rec.ot_hours),
      note: rec.note ?? "",
    });
  }

  function submitEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editTarget) return;
    const ot = Number(form.ot_hours);
    if (Number.isNaN(ot) || ot < 0) {
      toast.error("ชั่วโมง OT ต้องเป็นตัวเลขไม่ติดลบ");
      return;
    }
    setSaving(true);
    setTimeout(() => {
      const isPresent = form.status === "present";
      const late =
        isPresent && !!form.check_in && toMinutes(form.check_in) > toMinutes(NORMAL_CHECK_IN);
      setRecords((prev) =>
        prev.map((r) =>
          r.employee_id === editTarget.employeeId && r.work_date === editTarget.date
            ? {
                ...r,
                status: form.status,
                check_in: isPresent ? form.check_in || null : null,
                check_out: isPresent ? form.check_out || null : null,
                is_late: late,
                ot_hours: ot,
                note: form.note.trim() || null,
              }
            : r,
        ),
      );
      setSaving(false);
      setEditTarget(null);
      toast.success(`บันทึกเวลาทำงานวันที่ ${fmtDateTH(editTarget.date)} เรียบร้อย`);
    }, 600);
  }

  const selectedEmp = empById.get(empId);

  return (
    <HrmShell
      title="เวลาทำงาน"
      description="บันทึกเข้า-ออกงานรายวัน — สรุปมา/สาย/ขาด/OT ป้อนเข้ารอบเงินเดือนอัตโนมัติ"
      icon={<Clock className="h-6 w-6" />}
    >
      {/* KPI */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          icon={<CalendarCheck className="h-4 w-4" />}
          label="มาทำงานวันนี้"
          value={`${fmtNum(kpi.present)}/${fmtNum(ACTIVE_EMPLOYEES.length)}`}
          sub="จากพนักงานที่ทำงานอยู่"
          tone="positive"
          valueColored
        />
        <StatCard
          icon={<AlarmClockOff className="h-4 w-4" />}
          label="มาสายวันนี้"
          value={fmtNum(kpi.late)}
          sub={`เกณฑ์เข้างาน ${NORMAL_CHECK_IN} น.`}
          tone={kpi.late > 0 ? "warning" : "neutral"}
          valueColored={kpi.late > 0}
        />
        <StatCard
          icon={<UserX className="h-4 w-4" />}
          label="ขาดวันนี้"
          value={fmtNum(kpi.absent)}
          sub="บันทึกว่าขาดงาน"
          tone={kpi.absent > 0 ? "negative" : "neutral"}
          valueColored={kpi.absent > 0}
        />
        <StatCard
          icon={<Timer className="h-4 w-4" />}
          label="OT รวมเดือนนี้"
          value={`${fmtNum(kpi.otThisMonth, 1)} ชม.`}
          sub="ทุกคน · ป้อนเข้ารอบเงินเดือน"
          tone="info"
        />
      </div>

      {/* ── แถบ clock-in/out วันนี้ ── */}
      <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="flex flex-col gap-2 border-b border-gray-100 px-5 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Clock className="h-4 w-4" />
            </span>
            <div>
              <div className="text-sm font-semibold text-gray-900">บันทึกเข้า-ออกงานวันนี้</div>
              <div className="text-xs text-gray-400">{fmtDateTH(TODAY)}</div>
            </div>
          </div>
          <div className="relative sm:w-64">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="ค้นหาชื่อ/รหัส/ตำแหน่ง…"
              className="pl-9"
            />
          </div>
        </div>

        {clockList.length === 0 ? (
          <div className="px-5 py-10 text-center text-sm text-gray-400">
            ไม่พบพนักงานตามที่ค้นหา
          </div>
        ) : (
          <ul className="divide-y divide-gray-100">
            {clockList.map((e) => {
              const rec = todayByEmp.get(e.id);
              const checkedIn = !!rec?.check_in && rec.status === "present";
              const checkedOut = !!rec?.check_out;
              return (
                <li
                  key={e.id}
                  className="flex flex-col gap-3 px-5 py-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <Avatar name={fullName(e)} className="h-9 w-9 text-xs" />
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium text-gray-900">
                        {fullName(e)}
                      </div>
                      <div className="truncate text-xs text-gray-500">
                        {e.position ?? "—"} · {e.department_tag ?? "—"}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    {/* เวลาเข้า/ออกล่าสุด */}
                    <div className="flex items-center gap-3 text-xs tabular-nums">
                      <span className="flex items-center gap-1 text-gray-500">
                        <LogIn className="h-3.5 w-3.5 text-gray-400" />
                        {checkedIn ? fmtTimeTH(rec?.check_in) : "—"}
                        {rec?.is_late && (
                          <StatusBadge tone="warning" className="ml-0.5">
                            สาย
                          </StatusBadge>
                        )}
                      </span>
                      <span className="flex items-center gap-1 text-gray-500">
                        <LogOut className="h-3.5 w-3.5 text-gray-400" />
                        {checkedOut ? fmtTimeTH(rec?.check_out) : "—"}
                      </span>
                    </div>

                    {/* ปุ่ม toggle */}
                    {canWrite ? (
                      !checkedIn ? (
                        <Button size="sm" onClick={() => clockIn(e.id)}>
                          <LogIn className="mr-1.5 h-4 w-4" />
                          บันทึกเข้างาน
                        </Button>
                      ) : !checkedOut ? (
                        <Button size="sm" variant="outline" onClick={() => clockOut(e.id)}>
                          <LogOut className="mr-1.5 h-4 w-4" />
                          บันทึกออกงาน
                        </Button>
                      ) : (
                        <StatusBadge tone="success">ครบแล้ว</StatusBadge>
                      )
                    ) : (
                      <StatusBadge tone={checkedIn ? "success" : "neutral"}>
                        {checkedIn ? "เข้างานแล้ว" : "ยังไม่เข้า"}
                      </StatusBadge>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* ── ตาราง attendance รายวัน + สรุปต่อคน ── */}
      <div className="space-y-3 rounded-xl border border-gray-200 bg-white p-3 shadow-sm sm:p-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-gray-900">ตารางเวลาทำงานรายวัน</span>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <CustomSelect
              value={empId}
              onChange={setEmpId}
              options={ACTIVE_EMPLOYEES.map((e) => ({
                value: e.id,
                label: `${e.employee_code} · ${fullName(e)}`,
              }))}
              className="sm:w-64"
            />
            <div className="flex flex-col gap-1">
              <CustomSelect
                value={month}
                onChange={() => {}}
                options={MONTH_OPTS}
                disabled
                className="sm:w-44"
              />
              <Text as="span" className="text-[11px] text-gray-400">
                ชุดตัวอย่าง: มิ.ย. 2569
              </Text>
            </div>
          </div>
        </div>

        {/* สรุปต่อคน → ป้อนเข้าเงินเดือน */}
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
          <SummaryPill label="มาทำงาน" value={`${fmtNum(summary.present)} วัน`} tone="positive" />
          <SummaryPill label="มาสาย" value={`${fmtNum(summary.late)} ครั้ง`} tone="warning" />
          <SummaryPill label="ขาด" value={`${fmtNum(summary.absent)} วัน`} tone="negative" />
          <SummaryPill label="ลา" value={`${fmtNum(summary.leave)} วัน`} tone="info" />
          <SummaryPill label="OT รวม" value={`${fmtNum(summary.ot, 1)} ชม.`} tone="primary" />
        </div>
        <Text className="text-xs text-gray-400">
          ตัวเลขสรุปของ {selectedEmp ? fullName(selectedEmp) : "—"} เดือนนี้
          จะถูกป้อนเข้ารอบเงินเดือนอัตโนมัติ (หักขาด/คิด OT) — ลดการกรอกซ้ำและความผิดพลาด
        </Text>

        <div>
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
                      เลือกพนักงานคนอื่น หรือเริ่มบันทึกเข้า-ออกงานด้านบน
                    </p>
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
      </div>

      {/* dialog แก้รายวัน */}
      <Dialog open={!!editTarget} onOpenChange={(o) => !o && setEditTarget(null)}>
        <DialogContent size="lg">
          <DialogHeader>
            <DialogTitle>
              แก้ไขเวลาทำงาน
              {editTarget && (
                <span className="ml-2 text-sm font-normal text-gray-400">
                  {fmtDateTH(editTarget.date)}
                </span>
              )}
            </DialogTitle>
          </DialogHeader>
          <form className="flex min-h-0 flex-1 flex-col" onSubmit={submitEdit}>
            <DialogBody>
              <div className="space-y-4">
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
              <Button type="button" variant="outline" onClick={() => setEditTarget(null)}>
                ยกเลิก
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? "กำลังบันทึก…" : "บันทึก"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </HrmShell>
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
      <div className={cn("mt-0.5 text-sm font-semibold tabular-nums", toneClass[tone])}>
        {value}
      </div>
    </div>
  );
}
