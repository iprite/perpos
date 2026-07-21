/**
 * dashboard.ts — KPI ภาพรวม HR (RLS-scoped client).
 * ใช้ร่วม SSR page + API route /api/hrm/dashboard.
 * caller เช็ค auth ก่อน · ทุก query filter org_id · ห้ามส่ง admin service-role (bypass RLS).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Employee, PayrollRun } from "@/lib/hrm/types";
import { countActiveEmployees } from "@/lib/hrm/employees";
import { countPendingLeave } from "@/lib/hrm/leave";
import { getLatestPaidRun } from "@/lib/hrm/payroll";

export interface HrmReminder {
  employee_id: string;
  employee_name: string;
  kind: "birthday" | "probation_end" | "contract_end";
  date: string; // YYYY-MM-DD (CE)
  days_until: number;
}

export interface HrmDashboard {
  headcount_active: number;
  /** ต้นทุนเงินเดือนเดือนล่าสุด (รวมปกส.นายจ้าง) จากรอบ approved/paid ล่าสุด */
  latest_employer_cost: number;
  latest_run: PayrollRun | null;
  pending_leave: number;
  /** วันสำคัญใกล้ถึง (≤30 วัน) เรียงจากใกล้สุด */
  upcoming_reminders: HrmReminder[];
}

/** จำนวนวันถึงวันครบรอบถัดไปของ MM-DD (สำหรับวันเกิด — วนทุกปี) */
function daysUntilRecurring(dateStr: string, today: Date): number {
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return Infinity;
  const next = new Date(today.getFullYear(), d.getMonth(), d.getDate());
  if (next < today) next.setFullYear(today.getFullYear() + 1);
  return Math.ceil((next.getTime() - today.getTime()) / 86400000);
}

/** จำนวนวันถึงวันที่ระบุ (สำหรับครบทดลองงาน/ต่อสัญญา — ครั้งเดียว) */
function daysUntilFixed(dateStr: string, today: Date): number {
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return Infinity;
  return Math.ceil((d.getTime() - today.getTime()) / 86400000);
}

export async function getHrmDashboard(db: SupabaseClient, orgId: string): Promise<HrmDashboard> {
  const [headcount, pendingLeave, latestRun, empRes] = await Promise.all([
    countActiveEmployees(db, orgId),
    countPendingLeave(db, orgId),
    getLatestPaidRun(db, orgId),
    db
      .from("hrm_employees")
      .select(
        "id, first_name, last_name, birth_date, probation_end_date, contract_end_date, status",
      )
      .eq("org_id", orgId)
      .eq("status", "active"),
  ]);
  if (empRes.error) throw new Error(empRes.error.message);

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const employees = (empRes.data ?? []) as Pick<
    Employee,
    "id" | "first_name" | "last_name" | "birth_date" | "probation_end_date" | "contract_end_date"
  >[];

  const reminders: HrmReminder[] = [];
  const WINDOW = 30;
  for (const e of employees) {
    const name = `${e.first_name} ${e.last_name}`;
    if (e.birth_date) {
      const du = daysUntilRecurring(e.birth_date, today);
      if (du <= WINDOW)
        reminders.push({
          employee_id: e.id,
          employee_name: name,
          kind: "birthday",
          date: e.birth_date,
          days_until: du,
        });
    }
    if (e.probation_end_date) {
      const du = daysUntilFixed(e.probation_end_date, today);
      if (du >= 0 && du <= WINDOW)
        reminders.push({
          employee_id: e.id,
          employee_name: name,
          kind: "probation_end",
          date: e.probation_end_date,
          days_until: du,
        });
    }
    if (e.contract_end_date) {
      const du = daysUntilFixed(e.contract_end_date, today);
      if (du >= 0 && du <= WINDOW)
        reminders.push({
          employee_id: e.id,
          employee_name: name,
          kind: "contract_end",
          date: e.contract_end_date,
          days_until: du,
        });
    }
  }
  reminders.sort((a, b) => a.days_until - b.days_until);

  return {
    headcount_active: headcount,
    latest_employer_cost: latestRun?.total_employer_cost ?? 0,
    latest_run: latestRun,
    pending_leave: pendingLeave,
    upcoming_reminders: reminders,
  };
}
