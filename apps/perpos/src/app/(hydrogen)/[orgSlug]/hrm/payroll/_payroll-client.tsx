"use client";

// _payroll-client.tsx — มุมมองเงินเดือน (client view, mutation จริง)
// initial/summary มาจาก server (lib/hrm/payroll) · สร้างรอบ/เปลี่ยนสถานะ → /api/hrm/payroll (Bearer) → router.refresh()
// รายละเอียดรอบ + สลิปรายคน = fetch GET /api/hrm/payroll/[id] ตอนเปิด dialog (lazy)
// gate ปุ่มด้วย canWrite/role จริง (owner เท่านั้นจึงอนุมัติ/จ่าย — ตรงกับ API state-machine)

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Wallet,
  Plus,
  TrendingUp,
  Landmark,
  Receipt,
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
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

import type { PayrollRun, Payslip, RunStatus, HrmRole, Employee } from "@/lib/hrm/types";
import { fmtMoney, fmtNum, fmtPeriod } from "../_components/format";
import { RunStatusBadge } from "../_components/badges";
import { hrmMutate } from "../_components/api";

export interface PayrollSummary {
  period_label: { year: number; month: number } | null;
  employer_cost: number;
  total_net: number;
  total_wht: number;
  total_sso: number;
}

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
const CURRENT_YEAR = new Date().getFullYear();
const YEAR_OPTS = [CURRENT_YEAR, CURRENT_YEAR + 1].map((y) => ({
  value: String(y),
  label: `${y + 543}`,
}));

// workflow ขั้นถัดไป (ตรงกับ ALLOWED_TRANSITIONS ใน API)
const NEXT_STEP: Record<
  RunStatus,
  { next: RunStatus; label: string; icon: React.ReactNode; ownerOnly: boolean } | null
> = {
  draft: {
    next: "pending_approval",
    label: "ส่งอนุมัติ",
    icon: <Calculator className="mr-1.5 h-4 w-4" />,
    ownerOnly: false,
  },
  pending_approval: {
    next: "approved",
    label: "อนุมัติรอบจ่าย",
    icon: <BadgeCheck className="mr-1.5 h-4 w-4" />,
    ownerOnly: true,
  },
  approved: {
    next: "paid",
    label: "ทำจ่ายเงินเดือน",
    icon: <CheckCircle2 className="mr-1.5 h-4 w-4" />,
    ownerOnly: true,
  },
  paid: null,
  cancelled: null,
};

/** GET authed (Bearer) — สำหรับดึงสลิปรายรอบ (api.ts มีแต่ POST/PATCH/DELETE) */
async function fetchRun(path: string): Promise<{ run: PayrollRun; payslips: Payslip[] }> {
  const supabase = createSupabaseBrowserClient();
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("กรุณาเข้าสู่ระบบใหม่");
  const res = await fetch(path, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) {
    const j = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(j.error || "โหลดรายละเอียดรอบไม่สำเร็จ");
  }
  return (await res.json()) as { run: PayrollRun; payslips: Payslip[] };
}

export function PayrollClient({
  initial,
  summary,
  orgId,
  canWrite,
  role,
}: {
  initial: PayrollRun[];
  summary: PayrollSummary;
  orgId: string;
  canWrite: boolean;
  role: HrmRole;
}) {
  const router = useRouter();
  const isOwner = role === "owner";

  // dialog สร้างรอบใหม่
  const [createOpen, setCreateOpen] = useState(false);
  const [newMonth, setNewMonth] = useState(String(new Date().getMonth() + 1));
  const [newYear, setNewYear] = useState(String(CURRENT_YEAR));
  const [creating, setCreating] = useState(false);

  // dialog รายละเอียดรอบ
  const [detailRun, setDetailRun] = useState<PayrollRun | null>(null);
  const [slips, setSlips] = useState<Payslip[]>([]);
  const [empById, setEmpById] = useState<Map<string, Employee>>(new Map());
  const [slipsLoading, setSlipsLoading] = useState(false);
  const [acting, setActing] = useState(false);

  // ── เปิดรายละเอียดรอบ (lazy fetch สลิป + พนักงาน) ──
  async function openDetail(run: PayrollRun) {
    setDetailRun(run);
    setSlips([]);
    setSlipsLoading(true);
    try {
      const { payslips } = await fetchRun(`/api/hrm/payroll/${run.id}?orgId=${orgId}`);
      setSlips(payslips);
      // ดึงชื่อพนักงานสำหรับสลิป
      const empRes = await fetch(`/api/hrm/employees?orgId=${orgId}`, {
        headers: await bearer(),
      });
      if (empRes.ok) {
        const j = (await empRes.json()) as { employees: Employee[] };
        setEmpById(new Map(j.employees.map((e) => [e.id, e])));
      }
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSlipsLoading(false);
    }
  }

  async function bearer(): Promise<Record<string, string>> {
    const supabase = createSupabaseBrowserClient();
    const { data } = await supabase.auth.getSession();
    return { Authorization: `Bearer ${data.session?.access_token ?? ""}` };
  }

  // ── สร้างรอบใหม่ (POST จริง — คำนวณฝั่ง server) ──
  async function createRun() {
    const y = Number(newYear);
    const m = Number(newMonth);
    if (initial.some((r) => r.period_year === y && r.period_month === m)) {
      toast.error(`มีรอบ ${fmtPeriod(y, m)} อยู่แล้ว`);
      return;
    }
    setCreating(true);
    try {
      await hrmMutate("/api/hrm/payroll", "POST", {
        orgId,
        period_year: y,
        period_month: m,
      });
      setCreateOpen(false);
      toast.success(`สร้างรอบ ${fmtPeriod(y, m)} แล้ว — ดึงพนักงานและคำนวณเรียบร้อย`);
      router.refresh();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setCreating(false);
    }
  }

  // ── เปลี่ยนสถานะรอบ (PATCH จริง) ──
  async function changeStatus(run: PayrollRun, next: RunStatus, successMsg: string) {
    setActing(true);
    try {
      await hrmMutate(`/api/hrm/payroll/${run.id}`, "PATCH", { orgId, status: next });
      setDetailRun(null);
      toast.success(successMsg);
      router.refresh();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setActing(false);
    }
  }

  const step = detailRun ? NEXT_STEP[detailRun.status] : null;
  const stepBlocked = step ? step.ownerOnly && !isOwner : true;
  const canCancel =
    detailRun != null &&
    canWrite &&
    (detailRun.status === "draft" || detailRun.status === "pending_approval");

  return (
    <div className="space-y-5">
      {/* action */}
      {canWrite && (
        <div className="flex justify-end">
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="mr-1.5 h-4 w-4" />
            ทำรอบเงินเดือนใหม่
          </Button>
        </div>
      )}

      {/* KPI — รอบล่าสุด */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon={<TrendingUp className="h-4 w-4" />}
          label="ต้นทุนนายจ้างรอบล่าสุด"
          value={fmtMoney(summary.employer_cost)}
          sub={
            summary.period_label
              ? `งวด ${fmtPeriod(summary.period_label.year, summary.period_label.month)}`
              : "ยังไม่มีรอบจ่าย"
          }
          tone="info"
          valueColored
        />
        <StatCard
          icon={<Wallet className="h-4 w-4" />}
          label="เงินเดือนสุทธิรวม"
          value={fmtMoney(summary.total_net)}
          sub="ยอดโอนเข้าบัญชีพนักงาน"
          tone="primary"
        />
        <StatCard
          icon={<Receipt className="h-4 w-4" />}
          label="ภาษีหัก ณ ที่จ่ายรวม"
          value={fmtMoney(summary.total_wht)}
          sub="นำส่ง ภ.ง.ด.1"
          tone="warning"
        />
        <StatCard
          icon={<Landmark className="h-4 w-4" />}
          label="ปกส.นำส่งรวม"
          value={fmtMoney(summary.total_sso)}
          sub="ลูกจ้าง + นายจ้าง"
          tone="neutral"
        />
      </div>

      {/* ตารางรอบจ่าย — title เหนือตาราง, Table เป็นการ์ดในตัว */}
      <div>
        <div className="mb-2.5 px-1 text-sm font-semibold text-gray-900">รอบจ่ายเงินเดือน</div>
        <Table stickyHeader maxHeight="58vh" className="shadow-sm">
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
            {initial.length === 0 ? (
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
              initial.map((r) => (
                <TableRow key={r.id} clickable onClick={() => openDetail(r)}>
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
        คลิกแถวเพื่อดูรายละเอียดรอบ สลิปรายคน และทำขั้นตอนถัดไป (ส่งอนุมัติ → อนุมัติ → จ่าย)
      </p>

      {/* ── Dialog รายละเอียดรอบ ── */}
      <Dialog open={detailRun !== null} onOpenChange={(o) => !o && setDetailRun(null)}>
        <DialogContent size="3xl">
          {detailRun && (
            <>
              <DialogHeader>
                <DialogTitle>
                  <span className="flex flex-wrap items-center gap-2">
                    รอบ {fmtPeriod(detailRun.period_year, detailRun.period_month)}
                    <span className="font-mono text-xs font-normal text-gray-400">
                      {detailRun.run_number}
                    </span>
                    <RunStatusBadge status={detailRun.status} />
                  </span>
                </DialogTitle>
              </DialogHeader>
              <DialogBody>
                <div className="space-y-5">
                  {/* แถบ workflow */}
                  <WorkflowSteps status={detailRun.status} />

                  {/* สรุปยอด */}
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                    <MiniStat
                      label="เงินเดือน + เงินเพิ่มรวม"
                      value={fmtMoney(detailRun.total_earnings)}
                    />
                    <MiniStat
                      label="หักรวม (ปกส./ภาษี/กองทุน)"
                      value={fmtMoney(detailRun.total_deductions)}
                      tone="negative"
                    />
                    <MiniStat
                      label="สุทธิจ่ายพนักงาน"
                      value={fmtMoney(detailRun.total_net)}
                      tone="positive"
                    />
                  </div>

                  {/* ตาราง payslip รายคน */}
                  <div>
                    <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-gray-900">
                      <FileText className="h-4 w-4 text-gray-400" />
                      สลิปรายคน
                      <span className="text-xs font-normal text-gray-400">
                        ({fmtNum(slips.length)} คน)
                      </span>
                    </div>
                    {slipsLoading ? (
                      <div className="animate-pulse space-y-2">
                        {Array.from({ length: 3 }).map((_, i) => (
                          <div key={i} className="h-12 rounded bg-gray-100" />
                        ))}
                      </div>
                    ) : slips.length === 0 ? (
                      <div className="rounded-lg border border-dashed border-gray-200 bg-gray-50 px-4 py-8 text-center text-sm text-gray-400">
                        รอบนี้ยังไม่มีสลิปรายคน
                      </div>
                    ) : (
                      <Table className="shadow-sm">
                        <TableHeader>
                          <TableRow>
                            <TableHead>พนักงาน</TableHead>
                            <TableHead align="right">ฐาน</TableHead>
                            <TableHead align="right">OT</TableHead>
                            <TableHead align="right">ปกส.</TableHead>
                            <TableHead align="right">ภาษี</TableHead>
                            <TableHead align="right">สุทธิ</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {slips.map((p) => {
                            const emp = empById.get(p.employee_id);
                            const name = emp ? `${emp.first_name} ${emp.last_name}` : "—";
                            return (
                              <TableRow key={p.id}>
                                <TableCell>
                                  <div className="flex items-center gap-2.5">
                                    <Avatar name={name} className="h-7 w-7 text-[10px]" />
                                    <span className="font-medium text-gray-900">{name}</span>
                                  </div>
                                </TableCell>
                                <TableCell align="right" tabular>
                                  {fmtMoney(p.base_salary, { currency: false })}
                                </TableCell>
                                <TableCell align="right" tabular>
                                  {p.ot_amount > 0
                                    ? fmtMoney(p.ot_amount, { currency: false })
                                    : "—"}
                                </TableCell>
                                <TableCell align="right" tabular>
                                  {p.sso_employee > 0
                                    ? fmtMoney(-p.sso_employee, { currency: false })
                                    : "—"}
                                </TableCell>
                                <TableCell align="right" tabular>
                                  {p.wht_amount > 0
                                    ? fmtMoney(-p.wht_amount, { currency: false })
                                    : "—"}
                                </TableCell>
                                <TableCell
                                  align="right"
                                  tabular
                                  className="font-semibold text-gray-900"
                                >
                                  {fmtMoney(p.net_pay, { currency: false })}
                                </TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    )}
                  </div>
                </div>
              </DialogBody>
              <DialogFooter>
                {canCancel && (
                  <Button
                    variant="destructive"
                    className="mr-auto"
                    disabled={acting}
                    onClick={() =>
                      changeStatus(detailRun, "cancelled", `ยกเลิกรอบ ${detailRun.run_number} แล้ว`)
                    }
                  >
                    ยกเลิกรอบ
                  </Button>
                )}
                <Button variant="outline" onClick={() => setDetailRun(null)}>
                  ปิด
                </Button>
                {step && canWrite && (
                  <Button
                    disabled={acting || stepBlocked}
                    onClick={() =>
                      changeStatus(
                        detailRun,
                        step.next,
                        statusMessage(step.next, detailRun.run_number),
                      )
                    }
                  >
                    {step.icon}
                    {stepBlocked ? "เฉพาะเจ้าของอนุมัติ/จ่าย" : step.label}
                  </Button>
                )}
              </DialogFooter>
            </>
          )}
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
                เลือกงวดที่ต้องการทำรอบ ระบบจะดึงพนักงานที่ทำงานอยู่ทั้งหมด รวม OT/ขาด/ลา
                จากหน้าเวลาทำงาน แล้วคำนวณภาษี ปกส. และกองทุนให้อัตโนมัติ
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
    </div>
  );
}

function statusMessage(next: RunStatus, runNumber: string): string {
  const map: Record<RunStatus, string> = {
    draft: "",
    pending_approval: `ส่งรอบ ${runNumber} เข้าอนุมัติแล้ว`,
    approved: `อนุมัติรอบ ${runNumber} เรียบร้อย`,
    paid: `ทำจ่ายรอบ ${runNumber} เรียบร้อย — สลิปพร้อมส่งพนักงาน`,
    cancelled: `ยกเลิกรอบ ${runNumber} แล้ว`,
  };
  return map[next];
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
