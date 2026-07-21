"use client";

// _employee-detail.tsx — แฟ้มพนักงาน 360° (client view)
// data มาจาก server (lib/hrm/*) ทั้งหมด — ไม่ fetch ตอน mount
// header โปรไฟล์ + การ์ดเตือนวันสำคัญ + Tabs 5 (ข้อมูล/เงินเดือน/ลา/เวลา/เอกสาร)
// ปุ่ม "แก้ข้อมูล" → Dialog → PATCH /api/hrm/employees (Bearer) → router.refresh() (gate canWrite)
// ตัด AI mock ออก — เอกสารแสดงรายการจริง, ปุ่มออกเอกสาร disabled (เลื่อน)

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Users,
  Pencil,
  Wallet,
  CalendarClock,
  Cake,
  FileSignature,
  IdCard,
  CalendarOff,
  CalendarDays,
  Clock,
  FileText,
  Landmark,
  Phone,
  CheckCircle2,
  Eye,
  Download,
} from "lucide-react";
import cn from "@core/utils/class-names";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CustomSelect } from "@/components/ui/custom-select";
import { ThaiDatePicker } from "@/components/ui/thai-date-picker";
import { Title } from "@/components/ui/typography";
import { Avatar } from "@/components/ui/avatar";
import { StatCard } from "@/components/ui/stat-card";
import { StatusBadge, type BadgeTone } from "@/components/ui/badge";
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
} from "@/components/ui/table";
import { toast } from "@/lib/toast";

import type {
  Employee,
  EmploymentType,
  PayrollRun,
  Payslip,
  LeaveRequest,
  LeaveType,
  Attendance,
  AttendanceStatus,
  HrmDocument,
  DocType,
  DocStatus,
} from "@/lib/hrm/types";
import type { LeaveBalanceRow } from "@/lib/hrm/leave";
import { fmtMoney, fmtNum, fmtDateTH, fmtPeriod, fullName } from "../../_components/format";
import { EmployeeStatusBadge, EmploymentTypeBadge } from "../../_components/badges";
import { hrmMutate } from "../../_components/api";

// ───────────────────────── local helpers (ไม่อยู่ใน foundation format.ts) ─────────────────────────
function calcAge(birth?: string | null): number | null {
  if (!birth) return null;
  const b = new Date(birth);
  if (Number.isNaN(b.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - b.getFullYear();
  if (
    now.getMonth() < b.getMonth() ||
    (now.getMonth() === b.getMonth() && now.getDate() < b.getDate())
  )
    age -= 1;
  return age;
}

function tenureText(startIso?: string | null): string {
  if (!startIso) return "—";
  const start = new Date(startIso);
  if (Number.isNaN(start.getTime())) return "—";
  const now = new Date();
  let months = (now.getFullYear() - start.getFullYear()) * 12 + (now.getMonth() - start.getMonth());
  if (now.getDate() < start.getDate()) months -= 1;
  if (months < 0) months = 0;
  const y = Math.floor(months / 12);
  const m = months % 12;
  if (y === 0 && m === 0) return "น้อยกว่า 1 เดือน";
  return [y > 0 ? `${y} ปี` : "", m > 0 ? `${m} เดือน` : ""].filter(Boolean).join(" ") || "—";
}

function daysUntilFixed(dateStr?: string | null): number | null {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.ceil((d.getTime() - today.getTime()) / 86400000);
}

function fmtTimeTH(iso?: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) {
    // อาจเป็น "HH:MM:SS" ตรง ๆ
    return typeof iso === "string" ? iso.slice(0, 5) : "";
  }
  return d.toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" });
}

function reminderTone(daysLeft: number): BadgeTone {
  if (daysLeft <= 7) return "danger";
  if (daysLeft <= 21) return "warning";
  return "info";
}

// ── attendance/doc badges (local — ไม่อยู่ใน foundation badges.tsx) ──
const ATT_META: Record<AttendanceStatus, { tone: BadgeTone; label: string }> = {
  present: { tone: "success", label: "มาทำงาน" },
  absent: { tone: "danger", label: "ขาด" },
  leave: { tone: "warning", label: "ลา" },
  holiday: { tone: "neutral", label: "วันหยุด" },
};
const DOC_TYPE_LABEL: Record<DocType, string> = {
  payslip: "สลิปเงินเดือน",
  salary_cert: "หนังสือรับรองเงินเดือน",
  contract: "สัญญาจ้าง",
  other: "อื่น ๆ",
};
const DOC_STATUS_META: Record<DocStatus, { tone: BadgeTone; label: string }> = {
  draft: { tone: "neutral", label: "ฉบับร่าง" },
  issued: { tone: "success", label: "ออกแล้ว" },
};

// ───────────────────────── reminders ─────────────────────────
type Reminder = { icon: React.ReactNode; label: string; date: string; daysLeft: number };
function buildReminders(e: Employee): Reminder[] {
  const out: Reminder[] = [];
  const probLeft = daysUntilFixed(e.probation_end_date);
  if (e.probation_end_date && probLeft != null && probLeft >= 0 && probLeft <= 30) {
    out.push({
      icon: <CalendarClock className="h-4 w-4" />,
      label: "ครบกำหนดทดลองงาน",
      date: e.probation_end_date,
      daysLeft: probLeft,
    });
  }
  const contractLeft = daysUntilFixed(e.contract_end_date);
  if (e.contract_end_date && contractLeft != null && contractLeft >= 0 && contractLeft <= 30) {
    out.push({
      icon: <FileSignature className="h-4 w-4" />,
      label: "สัญญาจ้างหมดอายุ",
      date: e.contract_end_date,
      daysLeft: contractLeft,
    });
  }
  if (e.birth_date) {
    const b = new Date(e.birth_date);
    if (!Number.isNaN(b.getTime())) {
      const now = new Date();
      const next = new Date(now.getFullYear(), b.getMonth(), b.getDate());
      if (next < new Date(now.getFullYear(), now.getMonth(), now.getDate()))
        next.setFullYear(now.getFullYear() + 1);
      const iso = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}-${String(next.getDate()).padStart(2, "0")}`;
      const left = daysUntilFixed(iso);
      if (left != null && left >= 0 && left <= 30)
        out.push({
          icon: <Cake className="h-4 w-4" />,
          label: "วันเกิด",
          date: iso,
          daysLeft: left,
        });
    }
  }
  return out;
}

type TabKey = "personal" | "payroll" | "leave" | "time" | "documents";
const TABS: { key: TabKey; label: string; icon: React.ReactNode }[] = [
  { key: "personal", label: "ข้อมูลส่วนตัว", icon: <IdCard className="h-4 w-4" /> },
  { key: "payroll", label: "เงินเดือน", icon: <Wallet className="h-4 w-4" /> },
  { key: "leave", label: "การลา", icon: <CalendarOff className="h-4 w-4" /> },
  { key: "time", label: "เวลาทำงาน", icon: <Clock className="h-4 w-4" /> },
  { key: "documents", label: "เอกสาร", icon: <FileText className="h-4 w-4" /> },
];

const TYPE_FORM_OPTS = [
  { value: "monthly", label: "รายเดือน" },
  { value: "daily", label: "รายวัน" },
  { value: "contract", label: "สัญญาจ้าง" },
];

type EditForm = {
  employee_code: string;
  first_name: string;
  last_name: string;
  department_tag: string;
  position: string;
  employment_type: EmploymentType;
  base_salary: string;
  phone: string;
  birth_date: string;
  start_date: string;
  bank_name: string;
  bank_account: string;
};

export function EmployeeDetail({
  employee,
  runs,
  payslips,
  leaveRequests,
  leaveTypes,
  balances,
  attendance,
  attendanceMonth,
  documents,
  orgId,
  orgSlug,
  canWrite,
}: {
  employee: Employee;
  runs: PayrollRun[];
  payslips: Payslip[];
  leaveRequests: LeaveRequest[];
  leaveTypes: LeaveType[];
  balances: LeaveBalanceRow[];
  attendance: Attendance[];
  attendanceMonth: { year: number; month: number };
  documents: HrmDocument[];
  orgId: string;
  orgSlug: string;
  canWrite: boolean;
}) {
  const router = useRouter();
  const base = `/${orgSlug}/hrm`;
  const e = employee;

  const [tab, setTab] = useState<TabKey>("personal");
  const reminders = useMemo(() => buildReminders(e), [e]);
  const age = calcAge(e.birth_date);

  // ── edit dialog ──
  const [editOpen, setEditOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<EditForm>(() => toForm(e));

  function openEdit() {
    setForm(toForm(e));
    setEditOpen(true);
  }

  async function submitEdit(ev: React.FormEvent) {
    ev.preventDefault();
    if (!form.first_name.trim() || !form.last_name.trim()) {
      toast.error("กรุณากรอกชื่อ-นามสกุล");
      return;
    }
    const salary = Number(form.base_salary);
    if (!form.base_salary || Number.isNaN(salary) || salary <= 0) {
      toast.error("กรุณากรอกเงินเดือน/ค่าจ้างฐานให้ถูกต้อง");
      return;
    }
    setSaving(true);
    try {
      await hrmMutate("/api/hrm/employees", "PATCH", {
        orgId,
        id: e.id,
        employee_code: form.employee_code.trim(),
        first_name: form.first_name.trim(),
        last_name: form.last_name.trim(),
        department_tag: form.department_tag.trim(),
        position: form.position.trim(),
        employment_type: form.employment_type,
        base_salary: salary,
        phone: form.phone.trim(),
        birth_date: form.birth_date,
        start_date: form.start_date,
        bank_name: form.bank_name.trim(),
        bank_account: form.bank_account.trim(),
      });
      setEditOpen(false);
      toast.success(`แก้ข้อมูล ${form.first_name} เรียบร้อย`);
      router.refresh();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-5">
      {/* action bar */}
      <div className="flex items-center justify-between gap-2">
        {canWrite && (
          <Button variant="secondary" onClick={openEdit}>
            <Pencil className="mr-1.5 h-4 w-4" />
            แก้ข้อมูล
          </Button>
        )}
      </div>

      {/* Header โปรไฟล์ */}
      <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
          <Avatar name={fullName(e)} className="h-16 w-16 text-lg" />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <Title className="text-lg font-semibold text-gray-900">{fullName(e)}</Title>
              <span className="font-mono text-xs text-gray-400">{e.employee_code}</span>
              <EmploymentTypeBadge type={e.employment_type} />
              <EmployeeStatusBadge status={e.status} />
            </div>
            <div className="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-sm text-gray-600">
              <span className="flex items-center gap-1.5">
                <Wallet className="h-3.5 w-3.5 text-gray-400" />
                {e.employment_type === "daily"
                  ? `${fmtMoney(e.base_salary)}/วัน`
                  : `${fmtMoney(e.base_salary)}/เดือน`}
              </span>
              <span>อายุ {age ?? "—"} ปี</span>
              <span>อายุงาน {tenureText(e.start_date)}</span>
              <span>เริ่มงาน {fmtDateTH(e.start_date) || "—"}</span>
            </div>

            {reminders.length > 0 && (
              <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                {reminders.map((r) => (
                  <div
                    key={r.label}
                    className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700"
                  >
                    <span className="shrink-0">{r.icon}</span>
                    <span className="min-w-0 flex-1">
                      <b>{r.label}</b> · {fmtDateTH(r.date)}
                    </span>
                    <StatusBadge tone={reminderTone(r.daysLeft)}>อีก {r.daysLeft} วัน</StatusBadge>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Tab nav */}
      <div className="flex gap-1 overflow-x-auto rounded-xl border border-gray-200 bg-white p-1.5 shadow-sm">
        {TABS.map((t) => (
          <Button
            key={t.key}
            variant="ghost"
            size="sm"
            onClick={() => setTab(t.key)}
            className={cn(
              "shrink-0 gap-1.5",
              tab === t.key
                ? "bg-primary/10 font-medium text-primary hover:bg-primary/10"
                : "text-gray-600 hover:bg-gray-50 hover:text-gray-900",
            )}
          >
            {t.icon}
            {t.label}
          </Button>
        ))}
      </div>

      {/* Tab content */}
      <div>
        {tab === "personal" && <PersonalTab e={e} />}
        {tab === "payroll" && <PayrollTab payslips={payslips} runs={runs} />}
        {tab === "leave" && (
          <LeaveTab requests={leaveRequests} types={leaveTypes} balances={balances} />
        )}
        {tab === "time" && <TimeTab rows={attendance} month={attendanceMonth} />}
        {tab === "documents" && <DocumentsTab docs={documents} />}
      </div>

      {/* ── Dialog แก้ข้อมูล ── */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent size="xl">
          <DialogHeader>
            <DialogTitle>แก้ข้อมูลพนักงาน</DialogTitle>
          </DialogHeader>
          <form className="flex min-h-0 flex-1 flex-col" onSubmit={submitEdit}>
            <DialogBody>
              <div className="space-y-5">
                <div>
                  <div className="mb-2 text-sm font-semibold text-gray-900">ข้อมูลพนักงาน</div>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <Group label="รหัสพนักงาน *" htmlFor="e-code">
                      <Input
                        id="e-code"
                        className="mt-1"
                        value={form.employee_code}
                        onChange={(ev) =>
                          setForm((f) => ({ ...f, employee_code: ev.target.value }))
                        }
                      />
                    </Group>
                    <Group label="เบอร์โทร" htmlFor="e-phone">
                      <Input
                        id="e-phone"
                        className="mt-1"
                        value={form.phone}
                        onChange={(ev) => setForm((f) => ({ ...f, phone: ev.target.value }))}
                      />
                    </Group>
                    <Group label="ชื่อ *" htmlFor="e-fn">
                      <Input
                        id="e-fn"
                        className="mt-1"
                        value={form.first_name}
                        onChange={(ev) => setForm((f) => ({ ...f, first_name: ev.target.value }))}
                      />
                    </Group>
                    <Group label="นามสกุล *" htmlFor="e-ln">
                      <Input
                        id="e-ln"
                        className="mt-1"
                        value={form.last_name}
                        onChange={(ev) => setForm((f) => ({ ...f, last_name: ev.target.value }))}
                      />
                    </Group>
                    <Group label="วันเกิด" htmlFor="e-bd">
                      <div className="mt-1">
                        <ThaiDatePicker
                          value={form.birth_date}
                          onChange={(iso) => setForm((f) => ({ ...f, birth_date: iso }))}
                          placeholder="เลือกวันเกิด"
                        />
                      </div>
                    </Group>
                  </div>
                </div>

                <div>
                  <div className="mb-2 text-sm font-semibold text-gray-900">ตำแหน่ง & การจ้าง</div>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <Group label="แผนก" htmlFor="e-dept">
                      <Input
                        id="e-dept"
                        className="mt-1"
                        value={form.department_tag}
                        onChange={(ev) =>
                          setForm((f) => ({ ...f, department_tag: ev.target.value }))
                        }
                      />
                    </Group>
                    <Group label="ตำแหน่ง" htmlFor="e-pos">
                      <Input
                        id="e-pos"
                        className="mt-1"
                        value={form.position}
                        onChange={(ev) => setForm((f) => ({ ...f, position: ev.target.value }))}
                      />
                    </Group>
                    <Group label="ประเภทจ้าง" htmlFor="e-type">
                      <CustomSelect
                        value={form.employment_type}
                        onChange={(v) =>
                          setForm((f) => ({ ...f, employment_type: v as EmploymentType }))
                        }
                        options={TYPE_FORM_OPTS}
                        className="mt-1 w-full"
                      />
                    </Group>
                    <Group
                      label={
                        form.employment_type === "daily"
                          ? "ค่าจ้างรายวัน (฿) *"
                          : "เงินเดือนฐาน (฿) *"
                      }
                      htmlFor="e-salary"
                    >
                      <Input
                        id="e-salary"
                        type="number"
                        className="mt-1"
                        value={form.base_salary}
                        onChange={(ev) => setForm((f) => ({ ...f, base_salary: ev.target.value }))}
                      />
                    </Group>
                    <Group label="วันเริ่มงาน" htmlFor="e-start">
                      <div className="mt-1">
                        <ThaiDatePicker
                          value={form.start_date}
                          onChange={(iso) => setForm((f) => ({ ...f, start_date: iso }))}
                          placeholder="เลือกวันเริ่มงาน"
                        />
                      </div>
                    </Group>
                  </div>
                </div>

                <div>
                  <div className="mb-2 text-sm font-semibold text-gray-900">บัญชีรับเงินเดือน</div>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <Group label="ธนาคาร" htmlFor="e-bank">
                      <Input
                        id="e-bank"
                        className="mt-1"
                        value={form.bank_name}
                        onChange={(ev) => setForm((f) => ({ ...f, bank_name: ev.target.value }))}
                      />
                    </Group>
                    <Group label="เลขบัญชี" htmlFor="e-acct">
                      <Input
                        id="e-acct"
                        className="mt-1"
                        value={form.bank_account}
                        onChange={(ev) => setForm((f) => ({ ...f, bank_account: ev.target.value }))}
                      />
                    </Group>
                  </div>
                </div>
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

function toForm(e: Employee): EditForm {
  return {
    employee_code: e.employee_code,
    first_name: e.first_name,
    last_name: e.last_name,
    department_tag: e.department_tag ?? "",
    position: e.position ?? "",
    employment_type: e.employment_type,
    base_salary: String(e.base_salary ?? ""),
    phone: e.phone ?? "",
    birth_date: e.birth_date ?? "",
    start_date: e.start_date ?? "",
    bank_name: e.bank_name ?? "",
    bank_account: e.bank_account ?? "",
  };
}

function Group({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
    </div>
  );
}

function EmptyTab({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <div className="mb-3 rounded-full bg-gray-100 p-4 text-gray-400">{icon}</div>
      <p className="text-sm text-gray-500">{text}</p>
    </div>
  );
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-2">
      <div className="text-xs text-gray-500">{label}</div>
      <div className="mt-0.5 text-sm font-medium text-gray-900">{value || "—"}</div>
    </div>
  );
}

// ─── 1. ข้อมูลส่วนตัว ───
function PersonalTab({ e }: { e: Employee }) {
  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-gray-900">
          <IdCard className="h-4 w-4 text-gray-400" />
          ข้อมูลตัวบุคคล
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="รหัสพนักงาน" value={e.employee_code} />
          <Field label="ชื่อ-นามสกุล" value={fullName(e)} />
          <Field
            label="เบอร์โทร"
            value={
              e.phone ? (
                <span className="flex items-center gap-1.5">
                  <Phone className="h-3.5 w-3.5 text-gray-400" />
                  {e.phone}
                </span>
              ) : (
                "—"
              )
            }
          />
          <Field label="เลขประจำตัวผู้เสียภาษี" value={e.tax_id} />
          <Field label="เลขประกันสังคม" value={e.ssn} />
          <Field label="วันเกิด" value={fmtDateTH(e.birth_date)} />
        </div>
      </section>

      <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-gray-900">
          <CalendarDays className="h-4 w-4 text-gray-400" />
          การจ้างงาน
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="แผนก" value={e.department_tag} />
          <Field label="ตำแหน่ง" value={e.position} />
          <Field
            label={e.employment_type === "daily" ? "ค่าจ้างรายวัน" : "เงินเดือนฐาน"}
            value={
              e.employment_type === "daily"
                ? `${fmtMoney(e.base_salary)}/วัน`
                : fmtMoney(e.base_salary)
            }
          />
          <Field label="วันเริ่มงาน" value={fmtDateTH(e.start_date)} />
          <Field label="สิ้นสุดทดลองงาน" value={fmtDateTH(e.probation_end_date)} />
          <Field label="สิ้นสุดสัญญา" value={fmtDateTH(e.contract_end_date)} />
        </div>
      </section>

      <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-gray-900">
          <Landmark className="h-4 w-4 text-gray-400" />
          บัญชีรับเงินเดือน
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="ธนาคาร" value={e.bank_name} />
          <Field label="เลขบัญชี" value={e.bank_account} />
        </div>
      </section>
    </div>
  );
}

// ─── 2. เงินเดือน ───
function PayrollTab({ payslips, runs }: { payslips: Payslip[]; runs: PayrollRun[] }) {
  const runById = useMemo(() => new Map(runs.map((r) => [r.id, r])), [runs]);
  const slips = useMemo(
    () =>
      payslips.slice().sort((a, b) => {
        const ra = runById.get(a.run_id);
        const rb = runById.get(b.run_id);
        const ka = ra ? ra.period_year * 100 + ra.period_month : 0;
        const kb = rb ? rb.period_year * 100 + rb.period_month : 0;
        return kb - ka;
      }),
    [payslips, runById],
  );

  if (slips.length === 0)
    return <EmptyTab icon={<Wallet className="h-7 w-7" />} text="ยังไม่มีสลิปเงินเดือน" />;

  const latestNet = slips[0]?.net_pay ?? 0;
  const totalOt = slips.reduce((s, p) => s + (p.ot_amount || 0), 0);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatCard
          icon={<Wallet className="h-4 w-4" />}
          label="เงินสุทธิรอบล่าสุด"
          value={fmtMoney(latestNet)}
          tone="positive"
          valueColored
        />
        <StatCard
          icon={<Clock className="h-4 w-4" />}
          label="ค่า OT สะสม (ในระบบ)"
          value={fmtMoney(totalOt)}
          tone="info"
        />
        <StatCard
          icon={<FileText className="h-4 w-4" />}
          label="จำนวนรอบที่มีสลิป"
          value={fmtNum(slips.length)}
          tone="neutral"
        />
      </div>

      <div>
        <Table stickyHeader maxHeight="48vh" className="shadow-sm">
          <TableHeader sticky>
            <TableRow>
              <TableHead>รอบจ่าย</TableHead>
              <TableHead align="right">เงินได้รวม</TableHead>
              <TableHead align="right">OT</TableHead>
              <TableHead align="right">หักรวม</TableHead>
              <TableHead align="right">สุทธิ</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {slips.map((p) => {
              const run = runById.get(p.run_id);
              return (
                <TableRow key={p.id}>
                  <TableCell className="whitespace-nowrap text-gray-700">
                    {run ? fmtPeriod(run.period_year, run.period_month) : p.run_id}
                  </TableCell>
                  <TableCell align="right" tabular>
                    {fmtMoney(p.gross)}
                  </TableCell>
                  <TableCell align="right" tabular className="text-gray-500">
                    {p.ot_amount > 0 ? fmtMoney(p.ot_amount) : "—"}
                  </TableCell>
                  <TableCell align="right" tabular className="text-red-600">
                    {fmtMoney(-p.total_deductions)}
                  </TableCell>
                  <TableCell align="right" tabular>
                    <span className="font-semibold text-gray-900">{fmtMoney(p.net_pay)}</span>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

// ─── 3. การลา ───
function LeaveTab({
  requests,
  types,
  balances,
}: {
  requests: LeaveRequest[];
  types: LeaveType[];
  balances: LeaveBalanceRow[];
}) {
  const typeById = useMemo(() => new Map(types.map((t) => [t.id, t])), [types]);
  const sorted = useMemo(
    () => requests.slice().sort((a, b) => (a.start_date < b.start_date ? 1 : -1)),
    [requests],
  );

  return (
    <div className="space-y-4">
      {/* วันคงเหลือ */}
      {balances.length > 0 && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {balances.slice(0, 3).map((b) => (
            <StatCard
              key={b.leave_type_id}
              icon={<CalendarOff className="h-4 w-4" />}
              label={`${b.leave_type_name}คงเหลือ`}
              value={b.remaining_days == null ? "ไม่จำกัด" : `${fmtNum(b.remaining_days)} วัน`}
              sub={`ใช้ไป ${fmtNum(b.used_days)} วัน`}
              tone="info"
            />
          ))}
        </div>
      )}

      {sorted.length === 0 ? (
        <EmptyTab icon={<CalendarOff className="h-7 w-7" />} text="ยังไม่มีประวัติการลา" />
      ) : (
        <div>
          <Table className="shadow-sm">
            <TableHeader>
              <TableRow>
                <TableHead>ประเภท</TableHead>
                <TableHead align="center">ตั้งแต่</TableHead>
                <TableHead align="center">ถึง</TableHead>
                <TableHead align="right">จำนวนวัน</TableHead>
                <TableHead>เหตุผล</TableHead>
                <TableHead align="center">สถานะ</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sorted.map((l) => {
                const lt = typeById.get(l.leave_type_id);
                return (
                  <TableRow key={l.id}>
                    <TableCell className="text-gray-700">{lt?.name ?? "—"}</TableCell>
                    <TableCell align="center" className="whitespace-nowrap text-gray-600">
                      {fmtDateTH(l.start_date)}
                    </TableCell>
                    <TableCell align="center" className="whitespace-nowrap text-gray-600">
                      {fmtDateTH(l.end_date)}
                    </TableCell>
                    <TableCell align="right" tabular>
                      {fmtNum(l.days)}
                    </TableCell>
                    <TableCell wrap className="text-gray-500">
                      {l.reason ?? "—"}
                    </TableCell>
                    <TableCell align="center">
                      <StatusBadge tone={leaveTone(l.status)}>{LEAVE_LABEL[l.status]}</StatusBadge>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

const LEAVE_LABEL: Record<LeaveRequest["status"], string> = {
  pending: "รออนุมัติ",
  approved: "อนุมัติ",
  rejected: "ไม่อนุมัติ",
  cancelled: "ยกเลิก",
};
function leaveTone(s: LeaveRequest["status"]): BadgeTone {
  if (s === "approved") return "success";
  if (s === "pending") return "warning";
  if (s === "rejected") return "danger";
  return "neutral";
}

// ─── 4. เวลาทำงาน ───
function TimeTab({ rows, month }: { rows: Attendance[]; month: { year: number; month: number } }) {
  const sorted = useMemo(
    () => rows.slice().sort((a, b) => (a.work_date < b.work_date ? 1 : -1)),
    [rows],
  );
  const sum = useMemo(() => {
    return rows.reduce(
      (acc, r) => {
        if (r.status === "present") acc.present += 1;
        else if (r.status === "absent") acc.absent += 1;
        if (r.is_late) acc.late += 1;
        acc.ot += Number(r.ot_hours || 0);
        return acc;
      },
      { present: 0, absent: 0, late: 0, ot: 0 },
    );
  }, [rows]);

  return (
    <div className="space-y-4">
      <p className="px-1 text-xs text-gray-400">
        แสดงข้อมูลเวลาทำงานเดือน {fmtPeriod(month.year, month.month)}
      </p>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          icon={<CheckCircle2 className="h-4 w-4" />}
          label="มาทำงาน"
          value={`${fmtNum(sum.present)} วัน`}
          tone="positive"
        />
        <StatCard
          icon={<Clock className="h-4 w-4" />}
          label="มาสาย"
          value={`${fmtNum(sum.late)} ครั้ง`}
          tone={sum.late > 0 ? "warning" : "neutral"}
        />
        <StatCard
          icon={<CalendarOff className="h-4 w-4" />}
          label="ขาด"
          value={`${fmtNum(sum.absent)} วัน`}
          tone={sum.absent > 0 ? "negative" : "neutral"}
        />
        <StatCard
          icon={<Clock className="h-4 w-4" />}
          label="OT รวม"
          value={`${fmtNum(sum.ot, 1)} ชม.`}
          tone="info"
        />
      </div>

      {sorted.length === 0 ? (
        <EmptyTab icon={<Clock className="h-7 w-7" />} text="ยังไม่มีบันทึกเวลาทำงานในเดือนนี้" />
      ) : (
        <div>
          <Table stickyHeader maxHeight="48vh" className="shadow-sm">
            <TableHeader sticky>
              <TableRow>
                <TableHead>วันที่</TableHead>
                <TableHead align="center">สถานะ</TableHead>
                <TableHead align="center">เข้า</TableHead>
                <TableHead align="center">ออก</TableHead>
                <TableHead align="center">สาย</TableHead>
                <TableHead align="right">OT (ชม.)</TableHead>
                <TableHead>หมายเหตุ</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sorted.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="whitespace-nowrap text-gray-700">
                    {fmtDateTH(r.work_date)}
                  </TableCell>
                  <TableCell align="center">
                    <StatusBadge tone={ATT_META[r.status].tone}>
                      {ATT_META[r.status].label}
                    </StatusBadge>
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
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

// ─── 5. เอกสาร (รายการจริง — ออกเอกสารเลื่อน/disabled) ───
function DocumentsTab({ docs }: { docs: HrmDocument[] }) {
  const sorted = useMemo(
    () => docs.slice().sort((a, b) => ((a.created_at ?? "") < (b.created_at ?? "") ? 1 : -1)),
    [docs],
  );

  if (sorted.length === 0)
    return (
      <EmptyTab icon={<FileText className="h-7 w-7" />} text="ยังไม่มีเอกสารของพนักงานคนนี้" />
    );

  return (
    <div className="space-y-3">
      {sorted.map((d) => (
        <div
          key={d.id}
          className="flex flex-col gap-3 rounded-xl border border-gray-200 bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between"
        >
          <div className="flex min-w-0 items-start gap-3">
            <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gray-100 text-gray-500">
              <FileText className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <div className="truncate text-sm font-medium text-gray-900">{d.title}</div>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <StatusBadge tone="neutral">{DOC_TYPE_LABEL[d.doc_type]}</StatusBadge>
                <StatusBadge tone={DOC_STATUS_META[d.status].tone}>
                  {DOC_STATUS_META[d.status].label}
                </StatusBadge>
                {d.issued_date && (
                  <span className="text-xs text-gray-400">ออกเมื่อ {fmtDateTH(d.issued_date)}</span>
                )}
              </div>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Button variant="outline" size="sm" disabled title="กำลังพัฒนา">
              <Eye className="mr-1.5 h-4 w-4" />
              ดู
            </Button>
            <Button variant="secondary" size="sm" disabled title="กำลังพัฒนา">
              <Download className="mr-1.5 h-4 w-4" />
              ดาวน์โหลด
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}
