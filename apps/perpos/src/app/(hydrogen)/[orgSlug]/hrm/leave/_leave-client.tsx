"use client";

// _leave-client.tsx — มุมมองการลา (client view, mutation จริง)
// initial มาจาก server (lib/hrm/leave) · ยื่นใบลา/อนุมัติ/ปฏิเสธ → /api/hrm/leave (Bearer) → router.refresh()
// 2 ตาราง: (a) ใบลาทั้งหมด (row pending คลิก → dialog อนุมัติ/ปฏิเสธ) (b) วันลาคงเหลือต่อคน (pivot ตามประเภท)
// gate ปุ่ม/การตัดสินด้วย canWrite (role จริงจาก server)

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
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

import type { Employee, LeaveType, LeaveRequest } from "@/lib/hrm/types";
import type { LeaveBalanceRow } from "@/lib/hrm/leave";
import { fmtNum, fmtDateTH, fullName } from "../_components/format";
import { LeaveStatusBadge } from "../_components/badges";
import { hrmMutate } from "../_components/api";

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

export function LeaveClient({
  initialRequests,
  leaveTypes,
  balances,
  employees,
  orgId,
  canWrite,
  year,
}: {
  initialRequests: LeaveRequest[];
  leaveTypes: LeaveType[];
  balances: LeaveBalanceRow[];
  employees: Employee[];
  orgId: string;
  canWrite: boolean;
  year: number;
}) {
  const router = useRouter();

  const [detailId, setDetailId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState<LeaveForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [deciding, setDeciding] = useState(false);

  const empById = useMemo(() => new Map(employees.map((e) => [e.id, e])), [employees]);
  const typeById = useMemo(() => new Map(leaveTypes.map((t) => [t.id, t])), [leaveTypes]);

  const empOpts = useMemo(
    () => [
      { value: "", label: "— เลือกพนักงาน —" },
      ...employees
        .filter((e) => e.status === "active")
        .map((e) => ({ value: e.id, label: `${fullName(e)} (${e.employee_code})` })),
    ],
    [employees],
  );
  const typeOpts = useMemo(
    () => [
      { value: "", label: "— เลือกประเภทลา —" },
      ...leaveTypes.filter((t) => t.active).map((t) => ({ value: t.id, label: t.name })),
    ],
    [leaveTypes],
  );

  // ── KPI (จาก initial server data) ──
  const kpi = useMemo(() => {
    const pending = initialRequests.filter((r) => r.status === "pending").length;
    const ym = `${year}-${String(new Date().getMonth() + 1).padStart(2, "0")}`;
    const approvedThisMonth = initialRequests.filter(
      (r) => r.status === "approved" && r.start_date.startsWith(ym),
    ).length;
    const sickDays = initialRequests
      .filter((r) => r.status === "approved" && typeById.get(r.leave_type_id)?.code === "sick")
      .reduce((s, r) => s + Number(r.days || 0), 0);
    const today = new Date().toISOString().slice(0, 10);
    const onLeaveToday = initialRequests.filter(
      (r) => r.status === "approved" && r.start_date <= today && r.end_date >= today,
    ).length;
    return { pending, approvedThisMonth, sickDays, onLeaveToday };
  }, [initialRequests, typeById, year]);

  // ── เรียงใบลา: pending ก่อน แล้ววันที่ใหม่สุด ──
  const sortedRequests = useMemo(() => {
    const rank: Record<string, number> = { pending: 0, approved: 1, rejected: 2, cancelled: 3 };
    return [...initialRequests].sort((a, b) => {
      const r = (rank[a.status] ?? 9) - (rank[b.status] ?? 9);
      if (r !== 0) return r;
      return b.start_date.localeCompare(a.start_date);
    });
  }, [initialRequests]);

  // ── pivot วันลาคงเหลือ → per employee + per leave_type_code ──
  const balanceTypes = useMemo(() => {
    const seen = new Map<string, string>(); // code → name
    for (const b of balances)
      if (!seen.has(b.leave_type_code)) seen.set(b.leave_type_code, b.leave_type_name);
    return Array.from(seen, ([code, name]) => ({ code, name }));
  }, [balances]);

  const balanceRows = useMemo(() => {
    const byEmp = new Map<string, Map<string, LeaveBalanceRow>>();
    for (const b of balances) {
      let m = byEmp.get(b.employee_id);
      if (!m) {
        m = new Map();
        byEmp.set(b.employee_id, m);
      }
      m.set(b.leave_type_code, b);
    }
    return Array.from(byEmp, ([employee_id, m]) => ({ employee_id, byCode: m }));
  }, [balances]);

  const detail = useMemo(
    () => initialRequests.find((r) => r.id === detailId) ?? null,
    [initialRequests, detailId],
  );

  // ── อนุมัติ / ปฏิเสธ (PATCH จริง) ──
  async function decide(req: LeaveRequest, status: "approved" | "rejected") {
    setDeciding(true);
    try {
      await hrmMutate(`/api/hrm/leave/${req.id}`, "PATCH", { orgId, status });
      const emp = empById.get(req.employee_id);
      toast.success(
        status === "approved"
          ? `อนุมัติใบลาของ ${emp ? fullName(emp) : "พนักงาน"} แล้ว`
          : `ไม่อนุมัติใบลาของ ${emp ? fullName(emp) : "พนักงาน"}`,
      );
      setDetailId(null);
      router.refresh();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setDeciding(false);
    }
  }

  // ── ยื่นใบลา (POST จริง) ──
  async function submitLeave(e: React.FormEvent) {
    e.preventDefault();
    if (!form.employee_id) return toast.error("กรุณาเลือกพนักงาน");
    if (!form.leave_type_id) return toast.error("กรุณาเลือกประเภทการลา");
    if (!form.start_date || !form.end_date) return toast.error("กรุณาเลือกวันเริ่มและวันสิ้นสุด");
    const days = daysBetween(form.start_date, form.end_date);
    if (days <= 0) return toast.error("วันสิ้นสุดต้องไม่ก่อนวันเริ่ม");

    setSaving(true);
    try {
      await hrmMutate("/api/hrm/leave", "POST", {
        orgId,
        employee_id: form.employee_id,
        leave_type_id: form.leave_type_id,
        start_date: form.start_date,
        end_date: form.end_date,
        days,
        reason: form.reason.trim() || null,
      });
      const emp = empById.get(form.employee_id);
      setCreateOpen(false);
      setForm(EMPTY_FORM);
      toast.success(`ยื่นใบลาของ ${emp ? fullName(emp) : "พนักงาน"} เรียบร้อย — รออนุมัติ`);
      router.refresh();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-5">
      {/* action */}
      {canWrite && (
        <div className="flex justify-end">
          <Button onClick={() => setCreateOpen(true)}>
            <CalendarPlus className="mr-1.5 h-4 w-4" />
            ยื่นใบลา
          </Button>
        </div>
      )}

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
          sub="ใบลาที่อนุมัติเดือนนี้"
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

      {/* (a) ตารางใบลา — title เหนือตาราง, Table การ์ดในตัว */}
      <div>
        <div className="mb-2.5 px-1 text-sm font-semibold text-gray-900">ใบลาทั้งหมด</div>
        <Table stickyHeader maxHeight="50vh" className="shadow-sm">
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
                    <TableCell align="right" className="tabular-nums">
                      {fmtNum(Number(r.days || 0))} วัน
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

      {/* (b) ตารางวันลาคงเหลือต่อคน — title เหนือตาราง */}
      <div>
        <div className="mb-2.5 px-1 text-sm font-semibold text-gray-900">
          วันลาคงเหลือต่อคน (ปี {year + 543})
        </div>
        <Table className="shadow-sm">
          <TableHeader>
            <TableRow>
              <TableHead>พนักงาน</TableHead>
              {balanceTypes.map((t) => (
                <TableHead key={t.code} align="center">
                  {t.name} (ใช้/โควตา)
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {balanceRows.length === 0 ? (
              <TableEmpty colSpan={balanceTypes.length + 1}>
                ยังไม่มีข้อมูลวันลาคงเหลือของพนักงาน
              </TableEmpty>
            ) : (
              balanceRows.map((row) => {
                const emp = empById.get(row.employee_id);
                return (
                  <TableRow key={row.employee_id}>
                    <TableCell>
                      <div className="flex items-center gap-2.5">
                        <Avatar name={emp ? fullName(emp) : "?"} className="h-7 w-7 text-[10px]" />
                        <span className="font-medium text-gray-900">
                          {emp ? fullName(emp) : "—"}
                        </span>
                      </div>
                    </TableCell>
                    {balanceTypes.map((t) => (
                      <TableCell key={t.code} align="center">
                        <BalanceCell b={row.byCode.get(t.code)} />
                      </TableCell>
                    ))}
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
            {detail?.status === "pending" && canWrite ? (
              <>
                <Button
                  variant="destructive"
                  className="mr-auto"
                  disabled={deciding}
                  onClick={() => detail && decide(detail, "rejected")}
                >
                  <X className="mr-1.5 h-4 w-4" />
                  ไม่อนุมัติ
                </Button>
                <Button variant="outline" onClick={() => setDetailId(null)}>
                  ปิด
                </Button>
                <Button disabled={deciding} onClick={() => detail && decide(detail, "approved")}>
                  <Check className="mr-1.5 h-4 w-4" />
                  {deciding ? "กำลังบันทึก…" : "อนุมัติ"}
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
                    <span className="font-semibold tabular-nums text-gray-900">
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
    </div>
  );
}

// ─── cell วันลาคงเหลือ (used/quota + เหลือ) ───
function BalanceCell({ b }: { b?: LeaveBalanceRow }) {
  if (!b) return <span className="text-gray-300">—</span>;
  const rem = b.remaining_days;
  const unlimited = rem === null;
  const tone =
    rem === null
      ? "neutral"
      : rem === 0
        ? "danger"
        : rem <= b.quota_days_per_year * 0.25
          ? "warning"
          : "neutral";
  return (
    <div className="inline-flex flex-col items-center gap-0.5">
      <StatusBadge tone={tone}>
        <span className="tabular-nums">
          {unlimited
            ? `${fmtNum(b.used_days)}/ไม่จำกัด`
            : `${fmtNum(b.used_days)}/${fmtNum(b.quota_days_per_year)}`}
        </span>
      </StatusBadge>
      {!unlimited && (
        <span className="text-[11px] tabular-nums text-gray-400">
          เหลือ {fmtNum(b.remaining_days ?? 0)}
        </span>
      )}
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
        <Field label="จำนวนวัน" value={`${fmtNum(Number(req.days || 0))} วัน`} />
        <Field label="ยื่นเมื่อ" value={fmtDateTH(req.created_at)} />
      </dl>
      <div>
        <div className="text-xs text-gray-500">เหตุผล</div>
        <Text className="mt-0.5 text-sm text-gray-700">{req.reason || "— ไม่ได้ระบุ —"}</Text>
      </div>
      {req.status === "pending" && (
        <div className="rounded-lg border border-amber-100 bg-amber-50/50 px-3 py-2 text-xs text-amber-700">
          ใบลานี้รอการอนุมัติ — เมื่ออนุมัติ ระบบจะนับวันลาคงเหลือของพนักงานให้อัตโนมัติ
        </div>
      )}
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-gray-500">{label}</dt>
      <dd className="mt-0.5 font-medium tabular-nums text-gray-900">{value}</dd>
    </div>
  );
}
