"use client";

// เงินเดือน (payroll) — prototype interactive
// guard super_admin อยู่ที่ layout.tsx แล้ว → หน้านี้เป็น client interactive
// หัวใจ = workflow ทำรอบเงินเดือน เดินครบเส้น (draft→pending_approval→approved→paid)
//   + AI guard ตรวจก่อนปิดรอบ (mock §6.2) + ตาราง payslip รายคน
// KPI/ตัวเลขสลิป = ค่าจาก fixture ตรง ๆ (balance) · gate write/approve ตาม role matrix §5

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  Wallet,
  Plus,
  TrendingUp,
  Landmark,
  Receipt,
  ShieldCheck,
  Sparkles,
  AlertTriangle,
  Info,
  FileText,
  Calculator,
  CheckCircle2,
  BadgeCheck,
} from "lucide-react";
import cn from "@core/utils/class-names";

import { Button } from "@/components/ui/button";
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

import {
  MOCK_PAYROLL_RUNS,
  MOCK_PAYSLIPS,
  MOCK_EMPLOYEES,
  summarizePayrollRun2606,
  MOCK_AI_PAYROLL_ANOMALIES,
} from "../_fixtures";
import type { PayrollRun, Payslip, RunStatus } from "../_fixtures/types";
import {
  HrmShell,
  useHrmRole,
  fmtMoney,
  fmtNum,
  fmtPeriod,
  fullName,
  RunStatusBadge,
} from "../_components";

const TH_MONTHS = [
  "มกราคม",
  "กุมภาพันธ์",
  "มีนาคม",
  "เมษายน",
  "พฤษภาคม",
  "มิถุนายน",
  "กรกฎาคม",
  "สิงหาคม",
  "กันยายน",
  "ตุลาคม",
  "พฤศจิกายน",
  "ธันวาคม",
];
const MONTH_OPTS = TH_MONTHS.map((m, i) => ({ value: String(i + 1), label: m }));
const YEAR_OPTS = [2026, 2027].map((y) => ({ value: String(y), label: `${y + 543}` }));

// ลำดับ workflow + ปุ่ม action ถัดไป
const NEXT_STEP: Record<
  RunStatus,
  { next: RunStatus; label: string; icon: React.ReactNode; needApprove: boolean } | null
> = {
  draft: {
    next: "pending_approval",
    label: "คำนวณ & ส่งอนุมัติ",
    icon: <Calculator className="mr-1.5 h-4 w-4" />,
    needApprove: false,
  },
  pending_approval: {
    next: "approved",
    label: "อนุมัติรอบจ่าย",
    icon: <BadgeCheck className="mr-1.5 h-4 w-4" />,
    needApprove: true,
  },
  approved: {
    next: "paid",
    label: "ทำจ่ายเงินเดือน",
    icon: <CheckCircle2 className="mr-1.5 h-4 w-4" />,
    needApprove: false,
  },
  paid: null,
  cancelled: null,
};

export default function PayrollPage() {
  const { can } = useHrmRole();
  const canWrite = can("write", "payroll");
  const canApprove = can("approve", "payroll");
  const searchParams = useSearchParams();

  const [runs, setRuns] = useState<PayrollRun[]>(MOCK_PAYROLL_RUNS);

  // dialog รายละเอียดรอบ
  const [detailId, setDetailId] = useState<string | null>(null);
  // dialog สร้างรอบใหม่
  const [createOpen, setCreateOpen] = useState(false);

  // เปิด dialog ทำรอบใหม่อัตโนมัติเมื่อมาจาก dashboard (?new=1)
  const wantNew = searchParams.get("new") === "1";
  useEffect(() => {
    if (wantNew && canWrite) setCreateOpen(true);
  }, [wantNew, canWrite]);
  const [newMonth, setNewMonth] = useState("7");
  const [newYear, setNewYear] = useState("2026");
  const [creating, setCreating] = useState(false);
  // dialog ดูสลิป
  const [slipId, setSlipId] = useState<string | null>(null);

  const empById = useMemo(() => new Map(MOCK_EMPLOYEES.map((e) => [e.id, e])), []);

  // KPI จากรอบ มิ.ย. 2026 (ค่าจาก fixture ตรง ๆ)
  const summary = useMemo(() => summarizePayrollRun2606(), []);

  const detailRun = useMemo(() => runs.find((r) => r.id === detailId) ?? null, [runs, detailId]);
  // payslips ของรอบ มิ.ย. (รอบเดียวที่มีสลิปใน fixture)
  const detailSlips = useMemo<Payslip[]>(
    () => (detailRun?.id === "run-2026-06" ? MOCK_PAYSLIPS : []),
    [detailRun],
  );
  const slip = useMemo(() => MOCK_PAYSLIPS.find((p) => p.id === slipId) ?? null, [slipId]);

  // เปลี่ยนสถานะรอบตาม workflow
  function advanceStatus(run: PayrollRun) {
    const step = NEXT_STEP[run.status];
    if (!step) return;
    if (step.needApprove && !canApprove) {
      toast.error("เฉพาะเจ้าของ/ผู้ดูแลเท่านั้นที่อนุมัติการจ่ายเงินเดือนได้");
      return;
    }
    if (!step.needApprove && !canWrite) {
      toast.error("คุณไม่มีสิทธิ์ทำรายการนี้");
      return;
    }
    setRuns((prev) => prev.map((r) => (r.id === run.id ? { ...r, status: step.next } : r)));
    const msg: Record<RunStatus, string> = {
      draft: "",
      pending_approval: `คำนวณรอบ ${run.run_number} เสร็จ — ส่งอนุมัติแล้ว`,
      approved: `อนุมัติรอบ ${run.run_number} เรียบร้อย`,
      paid: `ทำจ่ายรอบ ${run.run_number} เรียบร้อย — สลิปพร้อมส่งพนักงาน`,
      cancelled: "",
    };
    toast.success(msg[step.next]);
  }

  function cancelRun(run: PayrollRun) {
    if (!canWrite) return;
    setRuns((prev) => prev.map((r) => (r.id === run.id ? { ...r, status: "cancelled" } : r)));
    setDetailId(null);
    toast.success(`ยกเลิกรอบ ${run.run_number} แล้ว`);
  }

  // สร้างรอบใหม่ (จำลองดึงพนักงาน + คำนวณ)
  function createRun() {
    const y = Number(newYear);
    const m = Number(newMonth);
    if (runs.some((r) => r.period_year === y && r.period_month === m)) {
      toast.error(`มีรอบ ${fmtPeriod(y, m)} อยู่แล้ว`);
      return;
    }
    setCreating(true);
    setTimeout(() => {
      const newRun: PayrollRun = {
        id: `run-new-${y}-${m}`,
        org_id: "org-demo",
        run_number: `PAY-${y}-${String(m).padStart(2, "0")}`,
        period_year: y,
        period_month: m,
        status: "draft",
        total_earnings: 0,
        total_deductions: 0,
        total_net: 0,
        total_employer_cost: 0,
        notes: `ดึงพนักงาน ${fmtNum(MOCK_EMPLOYEES.filter((e) => e.status === "active").length)} คน — รอคำนวณ`,
        created_at: new Date().toISOString(),
      };
      setRuns((prev) => [newRun, ...prev]);
      setCreating(false);
      setCreateOpen(false);
      toast.success(`สร้างรอบ ${fmtPeriod(y, m)} แล้ว — ดึงพนักงานเรียบร้อย`);
    }, 900);
  }

  return (
    <HrmShell
      title="เงินเดือน"
      description="ทำรอบจ่าย — คำนวณภาษี/ปกส./กองทุน ออกสลิป อนุมัติ และจ่าย ครบในที่เดียว"
      icon={<Wallet className="h-6 w-6" />}
      actions={
        canWrite ? (
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="mr-1.5 h-4 w-4" />
            ทำรอบเงินเดือนใหม่
          </Button>
        ) : null
      }
    >
      {/* KPI — รอบเดือนนี้ (มิ.ย. 2026) */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon={<TrendingUp className="h-4 w-4" />}
          label="ต้นทุนนายจ้างเดือนนี้"
          value={fmtMoney(summary.employerCost)}
          sub="เงินเดือน + ปกส.นายจ้าง + กองทุนนายจ้าง"
          tone="info"
          valueColored
        />
        <StatCard
          icon={<Wallet className="h-4 w-4" />}
          label="เงินเดือนสุทธิรวม"
          value={fmtMoney(summary.totalNet)}
          sub="ยอดโอนเข้าบัญชีพนักงาน"
          tone="primary"
        />
        <StatCard
          icon={<Receipt className="h-4 w-4" />}
          label="ภาษีหัก ณ ที่จ่ายรวม"
          value={fmtMoney(summary.totalWht)}
          sub="นำส่ง ภ.ง.ด.1"
          tone="warning"
        />
        <StatCard
          icon={<Landmark className="h-4 w-4" />}
          label="ปกส.นำส่งรวม"
          value={fmtMoney(summary.totalSsoEmployee + summary.totalSsoEmployer)}
          sub="ลูกจ้าง + นายจ้าง"
          tone="neutral"
        />
      </div>

      {/* ตารางรอบจ่าย */}
      <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="border-b border-gray-100 px-5 py-3 text-sm font-semibold text-gray-900">
          รอบจ่ายเงินเดือน
        </div>
        <Table stickyHeader maxHeight="58vh">
          <TableHeader sticky>
            <TableRow>
              <TableHead>เลขรอบ</TableHead>
              <TableHead>งวด</TableHead>
              <TableHead align="center">สถานะ</TableHead>
              <TableHead align="right">เงินเดือนสุทธิ</TableHead>
              <TableHead align="right">ต้นทุนนายจ้าง</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {runs.length === 0 ? (
              <TableEmpty colSpan={5}>
                <div className="flex flex-col items-center justify-center py-10 text-center">
                  <div className="mb-3 rounded-full bg-gray-100 p-4">
                    <Wallet className="h-7 w-7 text-gray-400" />
                  </div>
                  <p className="text-sm font-medium text-gray-700">ยังไม่มีรอบจ่ายเงินเดือน</p>
                  <p className="mt-1 text-sm text-gray-500">
                    เริ่มทำรอบแรกเพื่อคำนวณเงินเดือน ภาษี และประกันสังคมให้พนักงาน
                  </p>
                  {canWrite && (
                    <Button size="sm" className="mt-4" onClick={() => setCreateOpen(true)}>
                      <Plus className="mr-1.5 h-4 w-4" />
                      ทำรอบเงินเดือนใหม่
                    </Button>
                  )}
                </div>
              </TableEmpty>
            ) : (
              runs.map((r) => (
                <TableRow key={r.id} clickable onClick={() => setDetailId(r.id)}>
                  <TableCell className="font-mono text-xs text-gray-500">{r.run_number}</TableCell>
                  <TableCell className="font-medium text-gray-900">
                    {fmtPeriod(r.period_year, r.period_month)}
                  </TableCell>
                  <TableCell align="center">
                    <RunStatusBadge status={r.status} />
                  </TableCell>
                  <TableCell align="right" tabular>
                    {r.total_net > 0 ? fmtMoney(r.total_net) : "—"}
                  </TableCell>
                  <TableCell align="right" tabular>
                    {r.total_employer_cost > 0 ? fmtMoney(r.total_employer_cost) : "—"}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <p className="text-xs text-gray-400">
        คลิกแถวเพื่อดูรายละเอียดรอบ ตรวจความผิดปกติ และทำขั้นตอนถัดไป (คำนวณ → อนุมัติ → จ่าย)
      </p>

      {/* ── Dialog รายละเอียดรอบ ── */}
      <Dialog open={detailRun !== null} onOpenChange={(o) => !o && setDetailId(null)}>
        <DialogContent size="3xl">
          {detailRun && (
            <RunDetail
              run={detailRun}
              slips={detailSlips}
              empById={empById}
              canWrite={canWrite}
              canApprove={canApprove}
              onAdvance={() => advanceStatus(detailRun)}
              onCancel={() => cancelRun(detailRun)}
              onClose={() => setDetailId(null)}
              onViewSlip={(id) => setSlipId(id)}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* ── Dialog ดูสลิป (จำลอง) ── */}
      <Dialog open={slip !== null} onOpenChange={(o) => !o && setSlipId(null)}>
        <DialogContent size="lg">
          <DialogHeader>
            <DialogTitle>สลิปเงินเดือน (ตัวอย่าง)</DialogTitle>
          </DialogHeader>
          <DialogBody>
            {slip && (
              <SlipPreview
                slip={slip}
                empName={
                  empById.get(slip.employee_id) ? fullName(empById.get(slip.employee_id)!) : "—"
                }
                period={detailRun ? fmtPeriod(detailRun.period_year, detailRun.period_month) : ""}
              />
            )}
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSlipId(null)}>
              ปิด
            </Button>
            <Button onClick={() => toast.success("จำลองส่งสลิปทาง LINE เรียบร้อย")}>
              <FileText className="mr-1.5 h-4 w-4" />
              ส่งสลิปทาง LINE
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Dialog ทำรอบใหม่ ── */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent size="md">
          <DialogHeader>
            <DialogTitle>ทำรอบเงินเดือนใหม่</DialogTitle>
          </DialogHeader>
          <DialogBody>
            <div className="space-y-4">
              <Text className="text-sm text-gray-500">
                เลือกงวดที่ต้องการทำรอบ ระบบจะดึงพนักงานที่ทำงานอยู่ทั้งหมดเข้ามาคำนวณให้อัตโนมัติ
              </Text>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="run-month">เดือน</Label>
                  <CustomSelect
                    value={newMonth}
                    onChange={setNewMonth}
                    options={MONTH_OPTS}
                    className="mt-1 w-full"
                  />
                </div>
                <div>
                  <Label htmlFor="run-year">ปี (พ.ศ.)</Label>
                  <CustomSelect
                    value={newYear}
                    onChange={setNewYear}
                    options={YEAR_OPTS}
                    className="mt-1 w-full"
                  />
                </div>
              </div>
              <div className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-2.5 text-xs text-gray-500">
                จะดึงพนักงานที่ทำงานอยู่{" "}
                <span className="font-semibold text-gray-700">
                  {fmtNum(MOCK_EMPLOYEES.filter((e) => e.status === "active").length)} คน
                </span>{" "}
                — รวม OT/ขาด/ลา จากหน้าเวลาทำงาน แล้วคำนวณภาษี ปกส. และกองทุนให้อัตโนมัติ
              </div>
            </div>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              ยกเลิก
            </Button>
            <Button onClick={createRun} disabled={creating}>
              {creating ? "กำลังดึงพนักงาน & คำนวณ…" : "ดึงพนักงาน & คำนวณ"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </HrmShell>
  );
}

// ─────────────────────────────────────────────────────────────
// รายละเอียดรอบ (header + workflow + AI guard + ตาราง payslip)
// ─────────────────────────────────────────────────────────────
function RunDetail({
  run,
  slips,
  empById,
  canWrite,
  canApprove,
  onAdvance,
  onCancel,
  onClose,
  onViewSlip,
}: {
  run: PayrollRun;
  slips: Payslip[];
  empById: Map<string, { first_name: string; last_name: string }>;
  canWrite: boolean;
  canApprove: boolean;
  onAdvance: () => void;
  onCancel: () => void;
  onClose: () => void;
  onViewSlip: (id: string) => void;
}) {
  const step = NEXT_STEP[run.status];
  const stepDisabled = step ? (step.needApprove ? !canApprove : !canWrite) : true;
  const canCancel = canWrite && (run.status === "draft" || run.status === "pending_approval");

  return (
    <>
      <DialogHeader>
        <DialogTitle>
          <span className="flex flex-wrap items-center gap-2">
            รอบ {fmtPeriod(run.period_year, run.period_month)}
            <span className="font-mono text-xs font-normal text-gray-400">{run.run_number}</span>
            <RunStatusBadge status={run.status} />
          </span>
        </DialogTitle>
      </DialogHeader>
      <DialogBody>
        <div className="space-y-5">
          {/* แถบ workflow */}
          <WorkflowSteps status={run.status} />

          {/* สรุปยอด */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <MiniStat label="เงินเดือน + เงินเพิ่มรวม" value={fmtMoney(run.total_earnings)} />
            <MiniStat
              label="หักรวม (ปกส./ภาษี/กองทุน)"
              value={fmtMoney(run.total_deductions)}
              tone="negative"
            />
            <MiniStat label="สุทธิจ่ายพนักงาน" value={fmtMoney(run.total_net)} tone="positive" />
          </div>

          {/* AI guard ตรวจก่อนปิดรอบ (mock §6.2) */}
          {slips.length > 0 && <AiGuardPanel />}

          {/* ตาราง payslip รายคน */}
          <div>
            <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-gray-900">
              <FileText className="h-4 w-4 text-gray-400" />
              สลิปรายคน
              <span className="text-xs font-normal text-gray-400">({fmtNum(slips.length)} คน)</span>
            </div>
            {slips.length === 0 ? (
              <div className="rounded-lg border border-dashed border-gray-200 bg-gray-50 px-4 py-8 text-center text-sm text-gray-400">
                รอบนี้ยังไม่ได้คำนวณสลิป — กด &ldquo;คำนวณ &amp; ส่งอนุมัติ&rdquo;
                เพื่อสร้างสลิปรายคน
              </div>
            ) : (
              <div className="overflow-hidden rounded-lg border border-gray-200">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>พนักงาน</TableHead>
                      <TableHead align="right">ฐาน</TableHead>
                      <TableHead align="right">OT</TableHead>
                      <TableHead align="right">เงินเพิ่ม</TableHead>
                      <TableHead align="right">ปกส.</TableHead>
                      <TableHead align="right">ภาษี</TableHead>
                      <TableHead align="right">สุทธิ</TableHead>
                      <TableHead align="center">สลิป</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {slips.map((p) => {
                      const emp = empById.get(p.employee_id);
                      // เงินเพิ่มอื่น (ไม่รวมเงินเดือน BASE + OT) — เบี้ยขยัน/ค่าตำแหน่ง
                      const extra = p.earnings_json
                        .filter((e) => e.pay_item_id !== "pi-001" && e.pay_item_id !== "pi-002")
                        .reduce((s, e) => s + e.amount, 0);
                      return (
                        <TableRow key={p.id}>
                          <TableCell>
                            <div className="flex items-center gap-2.5">
                              <Avatar
                                name={emp ? fullName(emp) : "?"}
                                className="h-7 w-7 text-[10px]"
                              />
                              <span className="font-medium text-gray-900">
                                {emp ? fullName(emp) : "—"}
                              </span>
                            </div>
                          </TableCell>
                          <TableCell align="right" tabular>
                            {fmtMoney(p.base_salary, { currency: false })}
                          </TableCell>
                          <TableCell align="right" tabular>
                            {p.ot_amount > 0 ? fmtMoney(p.ot_amount, { currency: false }) : "—"}
                          </TableCell>
                          <TableCell align="right" tabular>
                            {extra > 0 ? fmtMoney(extra, { currency: false }) : "—"}
                          </TableCell>
                          <TableCell align="right" tabular>
                            {p.sso_employee > 0
                              ? `−${fmtMoney(p.sso_employee, { currency: false })}`
                              : "—"}
                          </TableCell>
                          <TableCell align="right" tabular>
                            {p.wht_amount > 0
                              ? `−${fmtMoney(p.wht_amount, { currency: false })}`
                              : "—"}
                          </TableCell>
                          <TableCell align="right" tabular className="font-semibold text-gray-900">
                            {fmtMoney(p.net_pay, { currency: false })}
                          </TableCell>
                          <TableCell align="center">
                            <Button
                              variant="ghost"
                              size="sm"
                              aria-label={`ดูสลิป ${emp ? fullName(emp) : ""}`}
                              onClick={() => onViewSlip(p.id)}
                            >
                              <FileText className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        </div>
      </DialogBody>
      <DialogFooter>
        {canCancel && (
          <Button variant="destructive" className="mr-auto" onClick={onCancel}>
            ยกเลิกรอบ
          </Button>
        )}
        <Button variant="outline" onClick={onClose}>
          ปิด
        </Button>
        {step && (
          <Button onClick={onAdvance} disabled={stepDisabled}>
            {step.icon}
            {step.label}
          </Button>
        )}
      </DialogFooter>
    </>
  );
}

// ─── แถบ workflow (วงกลมขั้นตอน) ───
const WF_STEPS: { key: RunStatus; label: string }[] = [
  { key: "draft", label: "ร่าง" },
  { key: "pending_approval", label: "รออนุมัติ" },
  { key: "approved", label: "อนุมัติ" },
  { key: "paid", label: "จ่ายแล้ว" },
];

function WorkflowSteps({ status }: { status: RunStatus }) {
  if (status === "cancelled") {
    return (
      <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-center text-sm text-gray-500">
        รอบนี้ถูกยกเลิกแล้ว
      </div>
    );
  }
  const activeIdx = WF_STEPS.findIndex((s) => s.key === status);
  return (
    <div className="flex items-center">
      {WF_STEPS.map((s, i) => {
        const done = i < activeIdx;
        const active = i === activeIdx;
        return (
          <div key={s.key} className="flex flex-1 items-center last:flex-none">
            <div className="flex flex-col items-center gap-1">
              <span
                className={cn(
                  "flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold",
                  done && "bg-green-100 text-green-700",
                  active && "bg-primary text-white",
                  !done && !active && "bg-gray-100 text-gray-400",
                )}
              >
                {done ? <CheckCircle2 className="h-4 w-4" /> : i + 1}
              </span>
              <span
                className={cn("text-[11px]", active ? "font-medium text-primary" : "text-gray-400")}
              >
                {s.label}
              </span>
            </div>
            {i < WF_STEPS.length - 1 && (
              <div
                className={cn(
                  "mx-1 h-0.5 flex-1 rounded",
                  i < activeIdx ? "bg-green-300" : "bg-gray-200",
                )}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── AI guard panel (mock §6.2) ───
function AiGuardPanel() {
  const data = MOCK_AI_PAYROLL_ANOMALIES;
  const [loading, setLoading] = useState(false);
  const [checked, setChecked] = useState(false);

  function runCheck() {
    setLoading(true);
    setChecked(false);
    setTimeout(() => {
      setLoading(false);
      setChecked(true);
    }, 1200);
  }

  const flagTone = (sev: "warning" | "error" | "info") =>
    sev === "error"
      ? "bg-red-50 text-red-600"
      : sev === "warning"
        ? "bg-amber-50 text-amber-600"
        : "bg-blue-50 text-blue-600";

  return (
    <div className="rounded-xl border border-blue-100 bg-blue-50/30">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-blue-100 px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
            <ShieldCheck className="h-4 w-4" />
          </span>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-gray-900">AI ตรวจก่อนปิดรอบ</span>
              <StatusBadge tone="info">AI</StatusBadge>
            </div>
            <div className="text-xs text-gray-400">
              ตรวจ OT เกินกฎหมาย / ขาดงานไม่มีใบลา / ลืมหักปกส.
            </div>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={runCheck} disabled={loading}>
          <Sparkles className="mr-1.5 h-4 w-4" />
          {loading ? "กำลังตรวจ…" : checked ? "ตรวจอีกครั้ง" : "ตรวจก่อนปิดรอบ"}
        </Button>
      </div>
      <div className="p-4">
        {loading ? (
          <div className="animate-pulse space-y-2">
            <div className="h-12 rounded bg-blue-100/50" />
            <div className="h-12 rounded bg-blue-100/50" />
            <p className="pt-1 text-center text-sm text-gray-400">AI กำลังตรวจรายการในรอบ…</p>
          </div>
        ) : !checked ? (
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <Info className="h-4 w-4 text-gray-400" />
            แนะนำให้ตรวจความผิดปกติด้วย AI ก่อนกดอนุมัติรอบจ่าย
          </div>
        ) : (
          <div className="space-y-2">
            <div className="flex items-center gap-1.5 text-xs font-medium text-amber-700">
              <AlertTriangle className="h-3.5 w-3.5" />
              พบ {fmtNum(data.flags.length)} จุดที่ควรตรวจสอบก่อนปิดรอบ
            </div>
            <ul className="space-y-2">
              {data.flags.map((f) => (
                <li
                  key={f.id}
                  className="flex items-start gap-2.5 rounded-lg border border-gray-100 bg-white px-3 py-2.5"
                >
                  <span
                    className={cn(
                      "mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg",
                      flagTone(f.severity),
                    )}
                  >
                    {f.severity === "error" ? (
                      <AlertTriangle className="h-3.5 w-3.5" />
                    ) : f.severity === "warning" ? (
                      <AlertTriangle className="h-3.5 w-3.5" />
                    ) : (
                      <Info className="h-3.5 w-3.5" />
                    )}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-xs font-semibold text-gray-900">
                        {f.employee_name ?? "รอบจ่าย"}
                      </span>
                      <StatusBadge
                        tone={
                          f.severity === "error"
                            ? "danger"
                            : f.severity === "warning"
                              ? "warning"
                              : "info"
                        }
                      >
                        {f.category}
                      </StatusBadge>
                    </div>
                    <div className="mt-0.5 text-xs text-gray-600">{f.message}</div>
                    <div className="mt-1 text-xs text-gray-400">แนะนำ: {f.suggestion}</div>
                  </div>
                </li>
              ))}
            </ul>
            <p className="pt-1 text-xs text-gray-400">
              ผลจาก AI เป็นการช่วยตรวจเบื้องต้น — โปรดตรวจทานก่อนตัดสินใจอนุมัติ
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── สลิป preview (จำลอง) ───
function SlipPreview({
  slip,
  empName,
  period,
}: {
  slip: Payslip;
  empName: string;
  period: string;
}) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between border-b border-gray-100 pb-3">
        <div>
          <div className="text-base font-semibold text-gray-900">{empName}</div>
          <div className="text-xs text-gray-400">งวด {period}</div>
        </div>
        <StatusBadge tone="info">สลิปเงินเดือน</StatusBadge>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {/* รายได้ */}
        <div>
          <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-gray-400">
            รายได้
          </div>
          <ul className="space-y-1.5 text-sm">
            {slip.earnings_json.map((e, i) => (
              <li key={i} className="flex justify-between gap-2">
                <span className="text-gray-600">{e.name}</span>
                <span className="font-mono tabular-nums text-gray-900">
                  {fmtMoney(e.amount, { currency: false })}
                </span>
              </li>
            ))}
          </ul>
          <div className="mt-2 flex justify-between border-t border-gray-100 pt-2 text-sm font-semibold">
            <span className="text-gray-700">รวมรายได้</span>
            <span className="font-mono tabular-nums text-gray-900">
              {fmtMoney(slip.gross, { currency: false })}
            </span>
          </div>
        </div>

        {/* รายการหัก */}
        <div>
          <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-gray-400">
            รายการหัก
          </div>
          <ul className="space-y-1.5 text-sm">
            {slip.deductions_json.length === 0 ? (
              <li className="text-gray-400">— ไม่มีรายการหัก —</li>
            ) : (
              slip.deductions_json.map((d, i) => (
                <li key={i} className="flex justify-between gap-2">
                  <span className="text-gray-600">{d.name}</span>
                  <span className="font-mono tabular-nums text-red-600">
                    −{fmtMoney(d.amount, { currency: false })}
                  </span>
                </li>
              ))
            )}
          </ul>
          <div className="mt-2 flex justify-between border-t border-gray-100 pt-2 text-sm font-semibold">
            <span className="text-gray-700">รวมหัก</span>
            <span className="font-mono tabular-nums text-red-600">
              −{fmtMoney(slip.total_deductions, { currency: false })}
            </span>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between rounded-lg bg-gray-50 px-4 py-3">
        <span className="text-sm font-semibold text-gray-700">เงินเดือนสุทธิ</span>
        <span className="font-mono text-lg font-semibold tabular-nums text-green-600">
          {fmtMoney(slip.net_pay)}
        </span>
      </div>
    </div>
  );
}

// ─── mini stat (ในกล่อง dialog) ───
function MiniStat({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string;
  tone?: "default" | "positive" | "negative";
}) {
  return (
    <div className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-2.5">
      <div className="text-xs text-gray-500">{label}</div>
      <div
        className={cn(
          "mt-0.5 font-mono text-base font-semibold tabular-nums",
          tone === "positive" && "text-green-600",
          tone === "negative" && "text-red-600",
          tone === "default" && "text-gray-900",
        )}
      >
        {value}
      </div>
    </div>
  );
}
