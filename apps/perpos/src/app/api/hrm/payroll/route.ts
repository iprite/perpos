import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "../../_lib/supabase";
import { setAuditContext } from "../../_lib/audit";
import { recordMetric } from "@/lib/metrics";
import { requireHrmMember, canWriteHrm, hrmError, orgIdFromQuery } from "../_lib";
import { listRuns } from "@/lib/hrm/payroll";
import { getMonthlyAttendanceSummary } from "@/lib/hrm/time";
import { computePayslip, summarizeRun, type PayslipDraft } from "@/lib/hrm/payroll-calc";
import type { Employee, Fund } from "@/lib/hrm/types";

const ROUTE = "/api/hrm/payroll";
const WORK_DAYS_PER_MONTH = 22;

/** GET ?orgId= → รายการรอบจ่าย (RLS) */
export async function GET(req: NextRequest) {
  const t0 = Date.now();
  const orgId = orgIdFromQuery(req);
  if (!orgId) return hrmError("missing orgId");

  const auth = await requireHrmMember(req, orgId);
  if (!auth.ok) return auth.res;

  try {
    const runs = await listRuns(auth.rls, orgId);
    void recordMetric({ orgId, route: ROUTE, method: req.method, status: 200, t0 });
    return NextResponse.json({ runs });
  } catch (e) {
    void recordMetric({ orgId, route: ROUTE, method: req.method, status: 500, t0 });
    return hrmError((e as Error).message, 500);
  }
}

/**
 * POST → สร้างรอบเงินเดือน + คำนวณ (status='draft').
 * body: { orgId, period_year, period_month, notes? }
 * flow: ดึงพนักงาน active + funds + attendance summary ของเดือนนั้น
 *       → computePayslip ต่อคน (TS, ไม่มี RPC) → insert run + payslips → สรุปยอด.
 */
export async function POST(req: NextRequest) {
  const t0 = Date.now();
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const orgId = String(body.orgId ?? "");
  const period_year = Number(body.period_year);
  const period_month = Number(body.period_month);
  if (!orgId) return hrmError("missing orgId");
  if (!period_year || !period_month || period_month < 1 || period_month > 12) {
    return hrmError("ระบุปี/เดือนของรอบให้ถูกต้อง");
  }

  const auth = await requireHrmMember(req, orgId);
  if (!auth.ok) return auth.res;
  if (!canWriteHrm(auth.role)) return hrmError("ไม่มีสิทธิ์สร้างรอบเงินเดือน", 403);

  await setAuditContext(req, auth.userId, orgId);
  const admin = createAdminClient();

  // กันสร้างรอบซ้ำเดือนเดียวกัน
  const { data: dup } = await admin
    .from("hrm_payroll_runs")
    .select("id")
    .eq("org_id", orgId)
    .eq("period_year", period_year)
    .eq("period_month", period_month)
    .maybeSingle();
  if (dup) return hrmError("มีรอบเงินเดือนของเดือนนี้อยู่แล้ว", 409);

  // ดึงข้อมูลจำเป็น (ผ่าน admin — server-trusted, filter org_id เสมอ)
  const [{ data: empData, error: empErr }, { data: fundData, error: fundErr }] = await Promise.all([
    admin.from("hrm_employees").select("*").eq("org_id", orgId).eq("status", "active"),
    admin.from("hrm_funds").select("*").eq("org_id", orgId).eq("active", true),
  ]);
  if (empErr) return hrmError(empErr.message, 500);
  if (fundErr) return hrmError(fundErr.message, 500);

  const employees = (empData ?? []) as Employee[];
  const funds = (fundData ?? []) as Fund[];
  if (employees.length === 0) return hrmError("ไม่มีพนักงานที่ทำงานอยู่ในรอบนี้");

  const attSummary = await getMonthlyAttendanceSummary(auth.rls, orgId, period_year, period_month);

  // คำนวณสลิปต่อคน
  const drafts: PayslipDraft[] = employees.map((emp) => {
    const s = attSummary.get(emp.id);
    const extraEarnings: { pay_item_id: string; name: string; amount: number }[] = [];
    // daily: คิดค่าจ้าง = base_salary(ต่อวัน) × วันมาทำงาน → ส่งเป็นเงินฐานผ่าน extraEarnings
    if (emp.employment_type === "daily") {
      const daysWorked = s?.present_days ?? WORK_DAYS_PER_MONTH;
      extraEarnings.push({
        pay_item_id: "BASE",
        name: `ค่าจ้างรายวัน (${daysWorked} วัน)`,
        amount: Math.round((Number(emp.base_salary) || 0) * daysWorked),
      });
    }
    return computePayslip(
      emp,
      {
        otHours: s?.ot_hours ?? 0,
        absenceDays: s?.absent_days ?? 0,
        lateCount: s?.late_count ?? 0,
        extraEarnings,
      },
      funds,
    );
  });

  const totals = summarizeRun(drafts);
  const run_number = `PAY-${period_year}-${String(period_month).padStart(2, "0")}`;

  // insert run
  const { data: run, error: runErr } = await admin
    .from("hrm_payroll_runs")
    .insert({
      org_id: orgId,
      run_number,
      period_year,
      period_month,
      status: "draft",
      total_earnings: totals.total_earnings,
      total_deductions: totals.total_deductions,
      total_net: totals.total_net,
      total_employer_cost: totals.total_employer_cost,
      notes: (body.notes as string) || null,
    })
    .select()
    .single();
  if (runErr || !run) return hrmError(runErr?.message ?? "สร้างรอบไม่สำเร็จ", 500);

  // insert payslips (org_id + run_id จาก server)
  const payslipRows = drafts.map((d) => ({ ...d, org_id: orgId, run_id: run.id }));
  const { error: slipErr } = await admin.from("hrm_payslips").insert(payslipRows);
  if (slipErr) {
    // rollback run ถ้าสลิป insert ล้ม (ไม่มี transaction — ลบ manual)
    await admin.from("hrm_payroll_runs").delete().eq("id", run.id).eq("org_id", orgId);
    return hrmError(slipErr.message, 500);
  }

  void recordMetric({ orgId, route: ROUTE, method: req.method, status: 201, t0 });
  return NextResponse.json({ run, payslip_count: payslipRows.length }, { status: 201 });
}
