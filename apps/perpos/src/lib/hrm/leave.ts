/**
 * leave.ts — fetch logic การลา (ประเภท + ใบลา + คงเหลือ). RLS-scoped client.
 * caller เช็ค auth ก่อน · ทุก query filter org_id.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { LeaveType, LeaveRequest } from "@/lib/hrm/types";

export async function listLeaveTypes(
  db: SupabaseClient,
  orgId: string,
  opts?: { activeOnly?: boolean },
): Promise<LeaveType[]> {
  let q = db
    .from("hrm_leave_types")
    .select("*")
    .eq("org_id", orgId)
    .order("code", { ascending: true });
  if (opts?.activeOnly) q = q.eq("active", true);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []) as LeaveType[];
}

export async function listLeaveRequests(
  db: SupabaseClient,
  orgId: string,
  opts?: { status?: LeaveRequest["status"]; employeeId?: string; year?: number },
): Promise<LeaveRequest[]> {
  let q = db
    .from("hrm_leave_requests")
    .select("*")
    .eq("org_id", orgId)
    .order("start_date", { ascending: false });
  if (opts?.status) q = q.eq("status", opts.status);
  if (opts?.employeeId) q = q.eq("employee_id", opts.employeeId);
  if (opts?.year) {
    q = q.gte("start_date", `${opts.year}-01-01`).lte("start_date", `${opts.year}-12-31`);
  }
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []) as LeaveRequest[];
}

export interface LeaveBalanceRow {
  employee_id: string;
  leave_type_id: string;
  leave_type_code: string;
  leave_type_name: string;
  quota_days_per_year: number; // 0 = ไม่จำกัด
  used_days: number;
  remaining_days: number | null; // null = ไม่จำกัด
}

/**
 * computeBalances — วันลาคงเหลือต่อพนักงานต่อประเภท (เฉพาะใบลา status='approved' ในปีนั้น).
 * คำนวณใน TS (dataset เล็ก) — quota จาก leave_types, used จากผลรวม days ของใบลาที่อนุมัติ.
 */
export async function computeBalances(
  db: SupabaseClient,
  orgId: string,
  year: number = new Date().getFullYear(),
): Promise<LeaveBalanceRow[]> {
  const [types, requests, employees] = await Promise.all([
    listLeaveTypes(db, orgId, { activeOnly: true }),
    listLeaveRequests(db, orgId, { status: "approved", year }),
    db.from("hrm_employees").select("id").eq("org_id", orgId).eq("status", "active"),
  ]);
  if (employees.error) throw new Error(employees.error.message);
  const empIds = ((employees.data ?? []) as { id: string }[]).map((e) => e.id);

  const usedMap = new Map<string, number>(); // key = `${empId}:${typeId}`
  for (const r of requests) {
    const key = `${r.employee_id}:${r.leave_type_id}`;
    usedMap.set(key, (usedMap.get(key) ?? 0) + Number(r.days || 0));
  }

  const rows: LeaveBalanceRow[] = [];
  for (const empId of empIds) {
    for (const t of types) {
      const used = usedMap.get(`${empId}:${t.id}`) ?? 0;
      const unlimited = !t.quota_days_per_year || t.quota_days_per_year <= 0;
      rows.push({
        employee_id: empId,
        leave_type_id: t.id,
        leave_type_code: t.code,
        leave_type_name: t.name,
        quota_days_per_year: t.quota_days_per_year,
        used_days: used,
        remaining_days: unlimited ? null : Math.max(0, t.quota_days_per_year - used),
      });
    }
  }
  return rows;
}

/** จำนวนใบลารออนุมัติ (dashboard KPI) */
export async function countPendingLeave(db: SupabaseClient, orgId: string): Promise<number> {
  const { count, error } = await db
    .from("hrm_leave_requests")
    .select("id", { count: "exact", head: true })
    .eq("org_id", orgId)
    .eq("status", "pending");
  if (error) throw new Error(error.message);
  return count ?? 0;
}
