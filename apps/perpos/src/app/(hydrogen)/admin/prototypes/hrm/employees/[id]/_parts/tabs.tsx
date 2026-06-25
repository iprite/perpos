"use client";

// _parts/tabs.tsx — เนื้อหาแต่ละ tab ของแฟ้มพนักงาน 360°
// แยกจาก page.tsx เพื่อไม่ให้ไฟล์ยาวเกิน · แต่ละ tab รับ employee/employeeId แล้ว filter fixtures เอง
// 5 tab: ข้อมูลส่วนตัว · เงินเดือน · การลา · เวลาทำงาน · เอกสาร

import { useMemo, useState } from "react";
import {
  Wallet,
  CalendarOff,
  Clock,
  FileText,
  Download,
  Eye,
  IdCard,
  Landmark,
  Phone,
  CalendarDays,
  CheckCircle2,
  Sparkles,
  FileSignature,
} from "lucide-react";

import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { StatCard } from "@/components/ui/stat-card";
import { StatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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

import {
  MOCK_PAYSLIPS,
  MOCK_PAYROLL_RUNS,
  MOCK_LEAVE_REQUESTS,
  MOCK_LEAVE_TYPES,
  MOCK_LEAVE_BALANCES,
  MOCK_ATTENDANCE,
  MOCK_HRM_DOCUMENTS,
  MOCK_AI_SALARY_CERT_DRAFT,
  summarizeAttendanceByEmployee,
} from "../../../_fixtures";
import type { Employee } from "../../../_fixtures/types";
import {
  fmtMoney,
  fmtNum,
  fmtDateTH,
  fmtTimeTH,
  fmtPeriod,
  LeaveStatusBadge,
  AttendanceStatusBadge,
  DocTypeBadge,
  DocStatusBadge,
} from "../../../_components";

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

// ─── 1. ข้อมูลส่วนตัว (§4.1 ครบ) ───
export function PersonalTab({ employee }: { employee: Employee }) {
  const e = employee;
  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-gray-900">
          <IdCard className="h-4 w-4 text-gray-400" />
          ข้อมูลตัวบุคคล
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="รหัสพนักงาน" value={e.employee_code} />
          <Field label="ชื่อ-นามสกุล" value={`${e.first_name} ${e.last_name}`} />
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

// ─── 2. เงินเดือน (payslips ของคนนี้) ───
export function PayrollTab({ employeeId }: { employeeId: string }) {
  const runById = useMemo(() => new Map(MOCK_PAYROLL_RUNS.map((r) => [r.id, r])), []);
  const slips = useMemo(
    () =>
      MOCK_PAYSLIPS.filter((p) => p.employee_id === employeeId)
        .slice()
        .sort((a, b) => (a.run_id < b.run_id ? 1 : -1)),
    [employeeId],
  );
  if (slips.length === 0)
    return <EmptyTab icon={<Wallet className="h-7 w-7" />} text="ยังไม่มีสลิปเงินเดือน" />;

  const latestNet = slips[0]?.net_pay ?? 0;
  const totalOtAmount = slips.reduce((s, p) => s + p.ot_amount, 0);

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
          label="ค่า OT สะสม (ในชุดข้อมูล)"
          value={fmtMoney(totalOtAmount)}
          tone="info"
        />
        <StatCard
          icon={<FileText className="h-4 w-4" />}
          label="จำนวนรอบที่มีสลิป"
          value={fmtNum(slips.length)}
          tone="neutral"
        />
      </div>

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <Table stickyHeader maxHeight="48vh">
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

// ─── 3. การลา (leave_requests + วันคงเหลือ) ───
export function LeaveTab({ employeeId }: { employeeId: string }) {
  const typeById = useMemo(() => new Map(MOCK_LEAVE_TYPES.map((t) => [t.id, t])), []);
  const requests = useMemo(
    () =>
      MOCK_LEAVE_REQUESTS.filter((l) => l.employee_id === employeeId)
        .slice()
        .sort((a, b) => (a.start_date < b.start_date ? 1 : -1)),
    [employeeId],
  );
  const balance = useMemo(
    () => MOCK_LEAVE_BALANCES.find((b) => b.employee_id === employeeId),
    [employeeId],
  );

  return (
    <div className="space-y-4">
      {/* วันคงเหลือ */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatCard
          icon={<CalendarOff className="h-4 w-4" />}
          label="ลาป่วยคงเหลือ"
          value={`${fmtNum(balance?.sick_remaining ?? 0)} วัน`}
          sub={`ใช้ไป ${fmtNum(balance?.sick_used ?? 0)} วัน`}
          tone="info"
        />
        <StatCard
          icon={<CalendarOff className="h-4 w-4" />}
          label="ลากิจคงเหลือ"
          value={`${fmtNum(balance?.personal_remaining ?? 0)} วัน`}
          sub={`ใช้ไป ${fmtNum(balance?.personal_used ?? 0)} วัน`}
          tone="neutral"
        />
        <StatCard
          icon={<CalendarOff className="h-4 w-4" />}
          label="ลาพักร้อนคงเหลือ"
          value={`${fmtNum(balance?.vacation_remaining ?? 0)} วัน`}
          sub={`ใช้ไป ${fmtNum(balance?.vacation_used ?? 0)} วัน`}
          tone="positive"
        />
      </div>

      {requests.length === 0 ? (
        <EmptyTab icon={<CalendarOff className="h-7 w-7" />} text="ยังไม่มีประวัติการลา" />
      ) : (
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
          <Table>
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
              {requests.map((l) => {
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
                      <LeaveStatusBadge status={l.status} />
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

// ─── 4. เวลาทำงาน (attendance ของคนนี้ + สรุป) ───
export function TimeTab({ employeeId }: { employeeId: string }) {
  const rows = useMemo(
    () =>
      MOCK_ATTENDANCE.filter((a) => a.employee_id === employeeId)
        .slice()
        .sort((a, b) => (a.work_date < b.work_date ? 1 : -1)),
    [employeeId],
  );
  const sum = useMemo(() => summarizeAttendanceByEmployee(employeeId), [employeeId]);

  if (rows.length === 0)
    return <EmptyTab icon={<Clock className="h-7 w-7" />} text="ยังไม่มีบันทึกเวลาทำงาน" />;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          icon={<CheckCircle2 className="h-4 w-4" />}
          label="มาทำงาน"
          value={`${fmtNum(sum.present_days)} วัน`}
          tone="positive"
        />
        <StatCard
          icon={<Clock className="h-4 w-4" />}
          label="มาสาย"
          value={`${fmtNum(sum.late_count)} ครั้ง`}
          tone={sum.late_count > 0 ? "warning" : "neutral"}
        />
        <StatCard
          icon={<CalendarOff className="h-4 w-4" />}
          label="ขาด"
          value={`${fmtNum(sum.absent_days)} วัน`}
          tone={sum.absent_days > 0 ? "negative" : "neutral"}
        />
        <StatCard
          icon={<Clock className="h-4 w-4" />}
          label="OT รวม"
          value={`${fmtNum(sum.total_ot_hours, 1)} ชม.`}
          tone="info"
        />
      </div>

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <Table stickyHeader maxHeight="48vh">
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
            {rows.map((r) => (
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
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

// ─── 5. เอกสาร (MOCK_HRM_DOCUMENTS ของคนนี้) + AI ร่างหนังสือรับรองเงินเดือน (§6.3) ───
export function DocumentsTab({ employeeId }: { employeeId: string }) {
  const docs = useMemo(
    () =>
      MOCK_HRM_DOCUMENTS.filter((d) => d.employee_id === employeeId)
        .slice()
        .sort((a, b) => ((a.created_at ?? "") < (b.created_at ?? "") ? 1 : -1)),
    [employeeId],
  );

  // AI ร่างหนังสือรับรองเงินเดือน — จำลอง loading → เปิด dialog ร่าง
  const [drafting, setDrafting] = useState(false);
  const [draftOpen, setDraftOpen] = useState(false);

  function generateDraft() {
    setDrafting(true);
    setTimeout(() => {
      setDrafting(false);
      setDraftOpen(true);
    }, 1200);
  }

  return (
    <div className="space-y-4">
      <AiSalaryCertCard
        drafting={drafting}
        onGenerate={generateDraft}
        draftOpen={draftOpen}
        onCloseDraft={() => setDraftOpen(false)}
      />

      {docs.length === 0 ? (
        <EmptyTab icon={<FileText className="h-7 w-7" />} text="ยังไม่มีเอกสารของพนักงานคนนี้" />
      ) : (
        <div className="space-y-3">
          {docs.map((d) => (
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
                    <DocTypeBadge type={d.doc_type} />
                    <DocStatusBadge status={d.status} />
                    {d.issued_date && (
                      <span className="text-xs text-gray-400">
                        ออกเมื่อ {fmtDateTH(d.issued_date)}
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={d.status === "draft"}
                  onClick={() => toast.success(`เปิดดูเอกสาร "${d.title}" (ตัวอย่าง)`)}
                >
                  <Eye className="mr-1.5 h-4 w-4" />
                  ดู
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={d.status === "draft"}
                  onClick={() => toast.success(`ดาวน์โหลดเอกสาร "${d.title}" (ตัวอย่าง)`)}
                >
                  <Download className="mr-1.5 h-4 w-4" />
                  ดาวน์โหลด
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── AI ร่างหนังสือรับรองเงินเดือน (mock §6.3) ───
// pattern การ์ด AI เดียวกับ dashboard: header ชิปไอคอน Sparkles + ป้าย "AI" + ปุ่มกระตุ้น
function AiSalaryCertCard({
  drafting,
  onGenerate,
  draftOpen,
  onCloseDraft,
}: {
  drafting: boolean;
  onGenerate: () => void;
  draftOpen: boolean;
  onCloseDraft: () => void;
}) {
  const draft = MOCK_AI_SALARY_CERT_DRAFT;
  return (
    <div className="rounded-xl border border-blue-100 bg-blue-50/30">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-blue-100 px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
            <FileSignature className="h-4 w-4" />
          </span>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-gray-900">
                ร่างหนังสือรับรองเงินเดือนด้วย AI
              </span>
              <StatusBadge tone="info">AI</StatusBadge>
            </div>
            <div className="text-xs text-gray-400">
              ดึงข้อมูลพนักงาน + เงินเดือน ร่างหนังสือพร้อมใช้ — ตรวจทานก่อนออกจริง
            </div>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={onGenerate} disabled={drafting}>
          <Sparkles className="mr-1.5 h-4 w-4" />
          {drafting ? "กำลังร่าง…" : "ร่างด้วย AI"}
        </Button>
      </div>
      {drafting && (
        <div className="p-4">
          <div className="animate-pulse space-y-2">
            <div className="h-4 w-1/3 rounded bg-blue-100/50" />
            <div className="h-24 rounded bg-blue-100/50" />
            <p className="pt-1 text-center text-sm text-gray-400">AI กำลังร่างหนังสือรับรอง…</p>
          </div>
        </div>
      )}

      {/* Dialog แสดงร่าง */}
      <Dialog open={draftOpen} onOpenChange={(o) => !o && onCloseDraft()}>
        <DialogContent size="2xl">
          <DialogHeader>
            <DialogTitle>
              <span className="flex flex-wrap items-center gap-2">
                ร่างหนังสือรับรองเงินเดือน
                <StatusBadge tone="info">AI</StatusBadge>
              </span>
            </DialogTitle>
          </DialogHeader>
          <DialogBody>
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-500">
                <span>
                  พนักงาน: <span className="font-medium text-gray-700">{draft.employee_name}</span>
                </span>
                <span>
                  วัตถุประสงค์: <span className="font-medium text-gray-700">{draft.purpose}</span>
                </span>
              </div>
              {draft.requires_confirmation && (
                <div className="flex items-start gap-2 rounded-lg border border-amber-100 bg-amber-50/50 px-3 py-2 text-xs text-amber-700">
                  <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <span>
                    ตรวจทานก่อนออกเอกสารจริง — AI ร่างจากข้อมูลในระบบ ({draft._ai_model})
                    อาจมีจุดที่ต้องแก้
                  </span>
                </div>
              )}
              <div className="rounded-lg border border-gray-200 bg-white px-4 py-3">
                <Text className="whitespace-pre-line text-sm leading-relaxed text-gray-700">
                  {draft.doc_text}
                </Text>
              </div>
            </div>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={onCloseDraft}>
              ปิด
            </Button>
            <Button onClick={() => toast.success("ออกหนังสือรับรองเป็น PDF เรียบร้อย (ตัวอย่าง)")}>
              <FileText className="mr-1.5 h-4 w-4" />
              ออกเป็น PDF (ตัวอย่าง)
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
