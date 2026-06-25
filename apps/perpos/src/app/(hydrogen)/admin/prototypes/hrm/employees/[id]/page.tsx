"use client";

// แฟ้มพนักงาน 360° — หน้าสำคัญที่สุดของกลุ่ม employees
// header โปรไฟล์ + การ์ดเตือนวันสำคัญ + tabs (ข้อมูลส่วนตัว/เงินเดือน/การลา/เวลาทำงาน/เอกสาร)
// client interactive · guard อยู่ที่ layout.tsx แล้ว

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  Users,
  Pencil,
  Wallet,
  CalendarClock,
  Cake,
  FileSignature,
  IdCard,
  CalendarOff,
  Clock,
  FileText,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Title } from "@/components/ui/typography";
import { Avatar } from "@/components/ui/avatar";
import { StatusBadge, type BadgeTone } from "@/components/ui/badge";
import { toast } from "@/lib/toast";
import cn from "@core/utils/class-names";

import { MOCK_EMPLOYEES } from "../../_fixtures";
import {
  HrmShell,
  useHrmRole,
  fmtMoney,
  fmtDateTH,
  calcAge,
  fullName,
  daysUntil,
  EmployeeStatusBadge,
  EmploymentTypeBadge,
} from "../../_components";
import { PersonalTab, PayrollTab, LeaveTab, TimeTab, DocumentsTab } from "./_parts/tabs";

const BASE = "/admin/prototypes/hrm";

type TabKey = "personal" | "payroll" | "leave" | "time" | "documents";

const TABS: { key: TabKey; label: string; icon: React.ReactNode }[] = [
  { key: "personal", label: "ข้อมูลส่วนตัว", icon: <IdCard className="h-4 w-4" /> },
  { key: "payroll", label: "เงินเดือน", icon: <Wallet className="h-4 w-4" /> },
  { key: "leave", label: "การลา", icon: <CalendarOff className="h-4 w-4" /> },
  { key: "time", label: "เวลาทำงาน", icon: <Clock className="h-4 w-4" /> },
  { key: "documents", label: "เอกสาร", icon: <FileText className="h-4 w-4" /> },
];

// อายุงานเป็นข้อความ "X ปี Y เดือน"
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
  return [y > 0 ? `${y} ปี` : "", m > 0 ? `${m} เดือน` : ""].filter(Boolean).join(" ");
}

// การ์ดเตือนวันสำคัญของพนักงานคนนี้
type Reminder = { icon: React.ReactNode; label: string; date: string; daysLeft: number };
function buildReminders(e: (typeof MOCK_EMPLOYEES)[number]): Reminder[] {
  const out: Reminder[] = [];
  const probLeft = daysUntil(e.probation_end_date);
  if (e.probation_end_date && probLeft != null && probLeft >= 0 && probLeft <= 30) {
    out.push({
      icon: <CalendarClock className="h-4 w-4" />,
      label: "ครบกำหนดทดลองงาน",
      date: e.probation_end_date,
      daysLeft: probLeft,
    });
  }
  const contractLeft = daysUntil(e.contract_end_date);
  if (e.contract_end_date && contractLeft != null && contractLeft >= 0 && contractLeft <= 30) {
    out.push({
      icon: <FileSignature className="h-4 w-4" />,
      label: "สัญญาจ้างหมดอายุ",
      date: e.contract_end_date,
      daysLeft: contractLeft,
    });
  }
  // วันเกิด (ภายใน 30 วัน — เทียบเฉพาะวัน/เดือนปีนี้)
  if (e.birth_date) {
    const b = new Date(e.birth_date);
    if (!Number.isNaN(b.getTime())) {
      const now = new Date();
      const nextBday = new Date(now.getFullYear(), b.getMonth(), b.getDate());
      if (nextBday < new Date(now.getFullYear(), now.getMonth(), now.getDate())) {
        nextBday.setFullYear(now.getFullYear() + 1);
      }
      const bdayLeft = daysUntil(
        `${nextBday.getFullYear()}-${String(nextBday.getMonth() + 1).padStart(2, "0")}-${String(
          nextBday.getDate(),
        ).padStart(2, "0")}`,
      );
      if (bdayLeft != null && bdayLeft >= 0 && bdayLeft <= 30) {
        out.push({
          icon: <Cake className="h-4 w-4" />,
          label: "วันเกิด",
          date: `${nextBday.getFullYear()}-${String(nextBday.getMonth() + 1).padStart(2, "0")}-${String(
            nextBday.getDate(),
          ).padStart(2, "0")}`,
          daysLeft: bdayLeft,
        });
      }
    }
  }
  return out;
}

function reminderTone(daysLeft: number): BadgeTone {
  if (daysLeft <= 7) return "danger";
  if (daysLeft <= 21) return "warning";
  return "info";
}

export default function EmployeeProfilePage() {
  const params = useParams();
  const router = useRouter();
  const id = String(params?.id ?? "");
  const { can } = useHrmRole();
  const canWrite = can("write", "employees");

  const employee = useMemo(() => MOCK_EMPLOYEES.find((e) => e.id === id), [id]);

  const [tab, setTab] = useState<TabKey>("personal");

  // จำลอง loading skeleton ครั้งแรก
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const t = setTimeout(() => setLoading(false), 500);
    return () => clearTimeout(t);
  }, []);

  const reminders = useMemo(() => (employee ? buildReminders(employee) : []), [employee]);

  // ── ไม่พบพนักงาน ──
  if (!employee) {
    return (
      <HrmShell title="ไม่พบพนักงาน" icon={<Users className="h-6 w-6" />}>
        <div className="flex flex-col items-center justify-center rounded-xl border border-gray-200 bg-white py-16 text-center shadow-sm">
          <div className="mb-3 rounded-full bg-gray-100 p-4">
            <Users className="h-8 w-8 text-gray-400" />
          </div>
          <p className="text-sm font-medium text-gray-700">ไม่พบพนักงานรหัส {id}</p>
          <p className="mt-1 text-sm text-gray-500">พนักงานอาจถูกลบ หรือลิงก์ไม่ถูกต้อง</p>
          <Button className="mt-4" onClick={() => router.push(`${BASE}/employees`)}>
            <ArrowLeft className="mr-1.5 h-4 w-4" />
            กลับรายชื่อพนักงาน
          </Button>
        </div>
      </HrmShell>
    );
  }

  const age = calcAge(employee.birth_date);

  return (
    <HrmShell
      title={fullName(employee)}
      description={`${employee.position ?? "—"} · ${employee.department_tag ?? "ไม่ระบุแผนก"} · รหัส ${employee.employee_code}`}
      icon={<Users className="h-6 w-6" />}
      actions={
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => router.push(`${BASE}/employees`)}>
            <ArrowLeft className="mr-1.5 h-4 w-4" />
            รายชื่อ
          </Button>
          {canWrite && (
            <Button
              variant="secondary"
              onClick={() => toast.success("เปิดฟอร์มแก้ไขข้อมูลพนักงาน (ตัวอย่าง)")}
            >
              <Pencil className="mr-1.5 h-4 w-4" />
              แก้ข้อมูล
            </Button>
          )}
        </div>
      }
    >
      {loading ? (
        <div className="animate-pulse space-y-4">
          <div className="h-32 rounded-xl bg-gray-100" />
          <div className="h-10 rounded-lg bg-gray-100" />
          <div className="h-64 rounded-xl bg-gray-100" />
        </div>
      ) : (
        <>
          {/* Header โปรไฟล์ */}
          <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
              <Avatar name={fullName(employee)} className="h-16 w-16 text-lg" />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <Title className="text-lg font-semibold text-gray-900">
                    {fullName(employee)}
                  </Title>
                  <span className="font-mono text-xs text-gray-400">{employee.employee_code}</span>
                  <EmploymentTypeBadge type={employee.employment_type} />
                  <EmployeeStatusBadge status={employee.status} />
                </div>
                <div className="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-sm text-gray-600">
                  <span className="flex items-center gap-1.5">
                    <Wallet className="h-3.5 w-3.5 text-gray-400" />
                    {employee.employment_type === "daily"
                      ? `${fmtMoney(employee.base_salary)}/วัน`
                      : `${fmtMoney(employee.base_salary)}/เดือน`}
                  </span>
                  <span>อายุ {age ?? "—"} ปี</span>
                  <span>อายุงาน {tenureText(employee.start_date)}</span>
                  <span>เริ่มงาน {fmtDateTH(employee.start_date)}</span>
                </div>

                {/* การ์ดเตือนวันสำคัญของคนนี้ */}
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
                        <StatusBadge tone={reminderTone(r.daysLeft)}>
                          อีก {r.daysLeft} วัน
                        </StatusBadge>
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
            {tab === "personal" && <PersonalTab employee={employee} />}
            {tab === "payroll" && <PayrollTab employeeId={employee.id} />}
            {tab === "leave" && <LeaveTab employeeId={employee.id} />}
            {tab === "time" && <TimeTab employeeId={employee.id} />}
            {tab === "documents" && <DocumentsTab employeeId={employee.id} />}
          </div>
        </>
      )}
    </HrmShell>
  );
}
