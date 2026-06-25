"use client";

// การลา (leave) — prototype interactive
// guard super_admin อยู่ที่ layout.tsx แล้ว → หน้านี้เป็น client interactive
// 2 ส่วน: (a) ตารางใบลา + อนุมัติ/ไม่อนุมัติ (can approve,leave) → ลดวันคงเหลือ
//         (b) ตารางวันลาคงเหลือต่อคน (used/quota)
// ยื่นใบลา dialog → เพิ่ม pending · gate ตาม role matrix §5

import { useMemo, useState } from "react";
import {
  CalendarOff,
  CalendarPlus,
  CalendarCheck,
  Stethoscope,
  CalendarDays,
  Check,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { CustomSelect } from "@/components/ui/custom-select";
import { ThaiDatePicker } from "@/components/ui/thai-date-picker";
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
  MOCK_EMPLOYEES,
  MOCK_LEAVE_TYPES,
  MOCK_LEAVE_REQUESTS,
  MOCK_LEAVE_BALANCES,
  type LeaveBalance,
} from "../_fixtures";
import type { LeaveRequest } from "../_fixtures/types";
import {
  HrmShell,
  useHrmRole,
  fmtNum,
  fmtDateTH,
  fullName,
  LeaveStatusBadge,
} from "../_components";

// map leave_type code → key ของ balance
const TYPE_BALANCE_KEY: Record<string, "sick" | "personal" | "vacation" | null> = {
  sick: "sick",
  personal: "personal",
  vacation: "vacation",
  unpaid: null,
};

type LeaveForm = {
  employee_id: string;
  leave_type_id: string;
  start_date: string;
  end_date: string;
  reason: string;
};

const EMPTY_FORM: LeaveForm = {
  employee_id: "",
  leave_type_id: "",
  start_date: "",
  end_date: "",
  reason: "",
};

// นับจำนวนวันรวมขอบ (inclusive)
function daysBetween(start: string, end: string): number {
  if (!start || !end) return 0;
  const a = new Date(start);
  const b = new Date(end);
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return 0;
  const diff = Math.round((b.getTime() - a.getTime()) / 86400000) + 1;
  return diff > 0 ? diff : 0;
}

export default function LeavePage() {
  const { can } = useHrmRole();
  const canWrite = can("write", "leave");
  const canApprove = can("approve", "leave");

  const [requests, setRequests] = useState<LeaveRequest[]>(MOCK_LEAVE_REQUESTS);
  const [balances, setBalances] = useState<LeaveBalance[]>(MOCK_LEAVE_BALANCES);

  const [detailId, setDetailId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState<LeaveForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const empById = useMemo(() => new Map(MOCK_EMPLOYEES.map((e) => [e.id, e])), []);
  const typeById = useMemo(() => new Map(MOCK_LEAVE_TYPES.map((t) => [t.id, t])), []);

  // โควตาต่อปีจาก leave_types (ผูก contract เดียวกับหน้า settings) — fallback 0 ถ้าไม่พบ
  const quotaByCode = useMemo(() => {
    const m = new Map<string, number>();
    for (const t of MOCK_LEAVE_TYPES) m.set(t.code, t.quota_days_per_year);
    return m;
  }, []);
  const sickQuota = quotaByCode.get("sick") ?? 0;
  const personalQuota = quotaByCode.get("personal") ?? 0;
  const vacationQuota = quotaByCode.get("vacation") ?? 0;

  const empOpts = useMemo(
    () => [
      { value: "", label: "— เลือกพนักงาน —" },
      ...MOCK_EMPLOYEES.filter((e) => e.status === "active").map((e) => ({
        value: e.id,
        label: `${fullName(e)} (${e.employee_code})`,
      })),
    ],
    [],
  );
  const typeOpts = useMemo(
    () => [
      { value: "", label: "— เลือกประเภทลา —" },
      ...MOCK_LEAVE_TYPES.filter((t) => t.active).map((t) => ({ value: t.id, label: t.name })),
    ],
    [],
  );

  // KPI
  const kpi = useMemo(() => {
    const pending = requests.filter((r) => r.status === "pending").length;
    const approvedThisMonth = requests.filter(
      (r) => r.status === "approved" && r.start_date.startsWith("2026-06"),
    ).length;
    const sickDays = requests
      .filter((r) => r.status === "approved" && typeById.get(r.leave_type_id)?.code === "sick")
      .reduce((s, r) => s + r.days, 0);
    // พนักงานลาวันนี้ (24 มิ.ย. 2026 = today)
    const today = "2026-06-24";
    const onLeaveToday = requests.filter(
      (r) => r.status === "approved" && r.start_date <= today && r.end_date >= today,
    ).length;
    return { pending, approvedThisMonth, sickDays, onLeaveToday };
  }, [requests, typeById]);

  // เรียงใบลา: pending ก่อน แล้วตามวันที่ใหม่สุด
  const sortedRequests = useMemo(() => {
    const rank: Record<string, number> = { pending: 0, approved: 1, rejected: 2, cancelled: 3 };
    return [...requests].sort((a, b) => {
      const r = rank[a.status] - rank[b.status];
      if (r !== 0) return r;
      return b.start_date.localeCompare(a.start_date);
    });
  }, [requests]);

  const detail = useMemo(
    () => requests.find((r) => r.id === detailId) ?? null,
    [requests, detailId],
  );

  // อนุมัติ / ไม่อนุมัติ
  function decide(req: LeaveRequest, status: "approved" | "rejected") {
    if (!canApprove) {
      toast.error("คุณไม่มีสิทธิ์อนุมัติใบลา");
      return;
    }
    setRequests((prev) =>
      prev.map((r) =>
        r.id === req.id
          ? { ...r, status, approved_by: "emp-001", decided_at: new Date().toISOString() }
          : r,
      ),
    );
    // อนุมัติ → ลดวันคงเหลือตามประเภท
    if (status === "approved") {
      const code = typeById.get(req.leave_type_id)?.code;
      const key = code ? TYPE_BALANCE_KEY[code] : null;
      if (key) {
        setBalances((prev) =>
          prev.map((b): LeaveBalance => {
            if (b.employee_id !== req.employee_id) return b;
            const next = { ...b };
            if (key === "sick") {
              next.sick_used += req.days;
              next.sick_remaining = Math.max(next.sick_remaining - req.days, 0);
            } else if (key === "personal") {
              next.personal_used += req.days;
              next.personal_remaining = Math.max(next.personal_remaining - req.days, 0);
            } else {
              next.vacation_used += req.days;
              next.vacation_remaining = Math.max(next.vacation_remaining - req.days, 0);
            }
            return next;
          }),
        );
      }
    }
    const emp = empById.get(req.employee_id);
    toast.success(
      status === "approved"
        ? `อนุมัติใบลาของ ${emp ? fullName(emp) : "พนักงาน"} แล้ว`
        : `ไม่อนุมัติใบลาของ ${emp ? fullName(emp) : "พนักงาน"}`,
    );
    setDetailId(null);
  }

  // ยื่นใบลา
  function submitLeave(e: React.FormEvent) {
    e.preventDefault();
    if (!form.employee_id) {
      toast.error("กรุณาเลือกพนักงาน");
      return;
    }
    if (!form.leave_type_id) {
      toast.error("กรุณาเลือกประเภทการลา");
      return;
    }
    if (!form.start_date || !form.end_date) {
      toast.error("กรุณาเลือกวันเริ่มและวันสิ้นสุด");
      return;
    }
    const days = daysBetween(form.start_date, form.end_date);
    if (days <= 0) {
      toast.error("วันสิ้นสุดต้องไม่ก่อนวันเริ่ม");
      return;
    }
    setSaving(true);
    setTimeout(() => {
      const newReq: LeaveRequest = {
        id: `lr-new-${requests.length + 1}`,
        org_id: "org-demo",
        employee_id: form.employee_id,
        leave_type_id: form.leave_type_id,
        start_date: form.start_date,
        end_date: form.end_date,
        days,
        reason: form.reason.trim() || null,
        status: "pending",
        approved_by: null,
        decided_at: null,
        created_at: new Date().toISOString(),
      };
      setRequests((prev) => [newReq, ...prev]);
      setSaving(false);
      setCreateOpen(false);
      setForm(EMPTY_FORM);
      const emp = empById.get(form.employee_id);
      toast.success(`ยื่นใบลาของ ${emp ? fullName(emp) : "พนักงาน"} เรียบร้อย — รออนุมัติ`);
    }, 700);
  }

  return (
    <HrmShell
      title="การลา"
      description="ใบลาทั้งหมด อนุมัติ/ปฏิเสธ และดูวันลาคงเหลือของพนักงานแต่ละคน"
      icon={<CalendarOff className="h-6 w-6" />}
      actions={
        canWrite ? (
          <Button onClick={() => setCreateOpen(true)}>
            <CalendarPlus className="mr-1.5 h-4 w-4" />
            ยื่นใบลา
          </Button>
        ) : null
      }
    >
      {/* KPI */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon={<CalendarOff className="h-4 w-4" />}
          label="ใบลารออนุมัติ"
          value={fmtNum(kpi.pending)}
          sub="รอผู้ดูแลตัดสิน"
          tone={kpi.pending > 0 ? "warning" : "neutral"}
          valueColored={kpi.pending > 0}
        />
        <StatCard
          icon={<CalendarCheck className="h-4 w-4" />}
          label="อนุมัติเดือนนี้"
          value={fmtNum(kpi.approvedThisMonth)}
          sub="ใบลาที่อนุมัติในมิถุนายน"
          tone="info"
        />
        <StatCard
          icon={<Stethoscope className="h-4 w-4" />}
          label="ลาป่วยรวม"
          value={`${fmtNum(kpi.sickDays)} วัน`}
          sub="รวมทุกคน (อนุมัติแล้ว)"
          tone="neutral"
        />
        <StatCard
          icon={<CalendarDays className="h-4 w-4" />}
          label="พนักงานลาวันนี้"
          value={fmtNum(kpi.onLeaveToday)}
          sub="ลาที่ครอบคลุมวันนี้"
          tone={kpi.onLeaveToday > 0 ? "primary" : "neutral"}
        />
      </div>

      {/* (a) ตารางใบลา */}
      <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="border-b border-gray-100 px-5 py-3 text-sm font-semibold text-gray-900">
          ใบลาทั้งหมด
        </div>
        <Table stickyHeader maxHeight="50vh">
          <TableHeader sticky>
            <TableRow>
              <TableHead>พนักงาน</TableHead>
              <TableHead align="center">ประเภท</TableHead>
              <TableHead>ช่วงวันลา</TableHead>
              <TableHead align="right">จำนวนวัน</TableHead>
              <TableHead align="center">สถานะ</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sortedRequests.length === 0 ? (
              <TableEmpty colSpan={5}>
                <div className="flex flex-col items-center justify-center py-10 text-center">
                  <div className="mb-3 rounded-full bg-gray-100 p-4">
                    <CalendarOff className="h-7 w-7 text-gray-400" />
                  </div>
                  <p className="text-sm font-medium text-gray-700">ยังไม่มีใบลา</p>
                  <p className="mt-1 text-sm text-gray-500">
                    เริ่มยื่นใบลาให้พนักงานเพื่อจัดการการลาอย่างเป็นระบบ
                  </p>
                  {canWrite && (
                    <Button size="sm" className="mt-4" onClick={() => setCreateOpen(true)}>
                      <CalendarPlus className="mr-1.5 h-4 w-4" />
                      ยื่นใบลา
                    </Button>
                  )}
                </div>
              </TableEmpty>
            ) : (
              sortedRequests.map((r) => {
                const emp = empById.get(r.employee_id);
                const lt = typeById.get(r.leave_type_id);
                return (
                  <TableRow key={r.id} clickable onClick={() => setDetailId(r.id)}>
                    <TableCell>
                      <div className="flex items-center gap-2.5">
                        <Avatar name={emp ? fullName(emp) : "?"} className="h-7 w-7 text-[10px]" />
                        <span className="font-medium text-gray-900">
                          {emp ? fullName(emp) : "—"}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell align="center">
                      <StatusBadge tone="neutral">{lt?.name ?? "ลา"}</StatusBadge>
                    </TableCell>
                    <TableCell className="text-gray-600">
                      {r.start_date === r.end_date
                        ? fmtDateTH(r.start_date)
                        : `${fmtDateTH(r.start_date)} – ${fmtDateTH(r.end_date)}`}
                    </TableCell>
                    <TableCell align="right" tabular>
                      {fmtNum(r.days)} วัน
                    </TableCell>
                    <TableCell align="center">
                      <LeaveStatusBadge status={r.status} />
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      {/* (b) ตารางวันลาคงเหลือต่อคน */}
      <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="border-b border-gray-100 px-5 py-3 text-sm font-semibold text-gray-900">
          วันลาคงเหลือต่อคน (ปี 2569)
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>พนักงาน</TableHead>
              <TableHead align="center">ลาป่วย (ใช้/โควตา)</TableHead>
              <TableHead align="center">ลากิจ (ใช้/โควตา)</TableHead>
              <TableHead align="center">พักร้อน (ใช้/โควตา)</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {balances.length === 0 ? (
              <TableEmpty colSpan={4}>ยังไม่มีข้อมูลวันลาคงเหลือของพนักงาน</TableEmpty>
            ) : (
              balances.map((b) => {
                const emp = empById.get(b.employee_id);
                return (
                  <TableRow key={b.employee_id}>
                    <TableCell>
                      <div className="flex items-center gap-2.5">
                        <Avatar name={emp ? fullName(emp) : "?"} className="h-7 w-7 text-[10px]" />
                        <span className="font-medium text-gray-900">
                          {emp ? fullName(emp) : "—"}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell align="center">
                      <BalanceCell used={b.sick_used} quota={sickQuota} />
                    </TableCell>
                    <TableCell align="center">
                      <BalanceCell used={b.personal_used} quota={personalQuota} />
                    </TableCell>
                    <TableCell align="center">
                      <BalanceCell used={b.vacation_used} quota={vacationQuota} />
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      {/* ── Dialog รายละเอียดใบลา ── */}
      <Dialog open={detail !== null} onOpenChange={(o) => !o && setDetailId(null)}>
        <DialogContent size="lg">
          <DialogHeader>
            <DialogTitle>รายละเอียดใบลา</DialogTitle>
          </DialogHeader>
          <DialogBody>
            {detail && (
              <LeaveDetail
                req={detail}
                empName={
                  empById.get(detail.employee_id) ? fullName(empById.get(detail.employee_id)!) : "—"
                }
                typeName={typeById.get(detail.leave_type_id)?.name ?? "ลา"}
              />
            )}
          </DialogBody>
          <DialogFooter>
            {detail?.status === "pending" && canApprove ? (
              <>
                <Button
                  variant="destructive"
                  className="mr-auto"
                  onClick={() => detail && decide(detail, "rejected")}
                >
                  <X className="mr-1.5 h-4 w-4" />
                  ไม่อนุมัติ
                </Button>
                <Button variant="outline" onClick={() => setDetailId(null)}>
                  ปิด
                </Button>
                <Button onClick={() => detail && decide(detail, "approved")}>
                  <Check className="mr-1.5 h-4 w-4" />
                  อนุมัติ
                </Button>
              </>
            ) : (
              <Button variant="outline" onClick={() => setDetailId(null)}>
                ปิด
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Dialog ยื่นใบลา ── */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent size="lg">
          <DialogHeader>
            <DialogTitle>ยื่นใบลา</DialogTitle>
          </DialogHeader>
          <form className="flex min-h-0 flex-1 flex-col" onSubmit={submitLeave}>
            <DialogBody>
              <div className="space-y-4">
                <div>
                  <Label htmlFor="lv-emp">พนักงาน *</Label>
                  <CustomSelect
                    value={form.employee_id}
                    onChange={(v) => setForm((f) => ({ ...f, employee_id: v }))}
                    options={empOpts}
                    className="mt-1 w-full"
                  />
                </div>
                <div>
                  <Label htmlFor="lv-type">ประเภทการลา *</Label>
                  <CustomSelect
                    value={form.leave_type_id}
                    onChange={(v) => setForm((f) => ({ ...f, leave_type_id: v }))}
                    options={typeOpts}
                    className="mt-1 w-full"
                  />
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <Label htmlFor="lv-start">วันเริ่มลา *</Label>
                    <div className="mt-1">
                      <ThaiDatePicker
                        value={form.start_date}
                        onChange={(iso) =>
                          setForm((f) => ({
                            ...f,
                            start_date: iso,
                            end_date: f.end_date && f.end_date >= iso ? f.end_date : iso,
                          }))
                        }
                        placeholder="เลือกวันเริ่มลา"
                      />
                    </div>
                  </div>
                  <div>
                    <Label htmlFor="lv-end">วันสิ้นสุด *</Label>
                    <div className="mt-1">
                      <ThaiDatePicker
                        value={form.end_date}
                        onChange={(iso) => setForm((f) => ({ ...f, end_date: iso }))}
                        placeholder="เลือกวันสิ้นสุด"
                      />
                    </div>
                  </div>
                </div>
                {form.start_date && form.end_date && (
                  <div className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-2 text-xs text-gray-600">
                    รวมลาทั้งหมด{" "}
                    <span className="font-semibold text-gray-900">
                      {fmtNum(daysBetween(form.start_date, form.end_date))} วัน
                    </span>
                  </div>
                )}
                <div>
                  <Label htmlFor="lv-reason">เหตุผล</Label>
                  <Input
                    id="lv-reason"
                    className="mt-1"
                    value={form.reason}
                    onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))}
                    placeholder="เช่น ไข้หวัด มีใบรับรองแพทย์"
                  />
                </div>
              </div>
            </DialogBody>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>
                ยกเลิก
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? "กำลังบันทึก…" : "ยื่นใบลา"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </HrmShell>
  );
}

// ─── cell วันลาคงเหลือ (used/quota + bar) ───
function BalanceCell({ used, quota }: { used: number; quota: number }) {
  const remaining = Math.max(quota - used, 0);
  const tone = remaining === 0 ? "danger" : remaining <= quota * 0.25 ? "warning" : "neutral";
  return (
    <div className="inline-flex flex-col items-center gap-0.5">
      <StatusBadge tone={tone}>
        <span className="font-mono tabular-nums">
          {fmtNum(used)}/{fmtNum(quota)}
        </span>
      </StatusBadge>
      <span className="text-[11px] text-gray-400">เหลือ {fmtNum(remaining)}</span>
    </div>
  );
}

// ─── รายละเอียดใบลา ───
function LeaveDetail({
  req,
  empName,
  typeName,
}: {
  req: LeaveRequest;
  empName: string;
  typeName: string;
}) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between border-b border-gray-100 pb-3">
        <div>
          <div className="text-base font-semibold text-gray-900">{empName}</div>
          <div className="text-xs text-gray-400">{typeName}</div>
        </div>
        <LeaveStatusBadge status={req.status} />
      </div>
      <dl className="grid grid-cols-2 gap-3 text-sm">
        <Field label="วันเริ่มลา" value={fmtDateTH(req.start_date)} />
        <Field label="วันสิ้นสุด" value={fmtDateTH(req.end_date)} />
        <Field label="จำนวนวัน" value={`${fmtNum(req.days)} วัน`} />
        <Field label="ยื่นเมื่อ" value={fmtDateTH(req.created_at)} />
      </dl>
      <div>
        <div className="text-xs text-gray-500">เหตุผล</div>
        <Text className="mt-0.5 text-sm text-gray-700">{req.reason || "— ไม่ได้ระบุ —"}</Text>
      </div>
      {req.status === "pending" && (
        <div className="rounded-lg border border-amber-100 bg-amber-50/50 px-3 py-2 text-xs text-amber-700">
          ใบลานี้รอการอนุมัติ — เมื่ออนุมัติ ระบบจะหักวันลาคงเหลือของพนักงานอัตโนมัติ
        </div>
      )}
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-gray-500">{label}</dt>
      <dd className="mt-0.5 font-medium text-gray-900">{value}</dd>
    </div>
  );
}
