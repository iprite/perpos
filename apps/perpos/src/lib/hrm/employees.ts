/**
 * employees.ts — fetch logic พนักงาน (RLS-scoped client)
 * ใช้ร่วม: SSR page (createSupabaseServerClient) + API route (createAuthedClient).
 * caller ต้องเช็ค auth/membership ก่อน · ห้ามส่ง admin service-role client (bypass RLS).
 * ทุก query filter org_id เสมอ.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Employee, EmployeeStatus } from "@/lib/hrm/types";

const TABLE = "hrm_employees";

export async function listEmployees(
  db: SupabaseClient,
  orgId: string,
  opts?: { status?: EmployeeStatus | "all"; search?: string },
): Promise<Employee[]> {
  let q = db
    .from(TABLE)
    .select("*")
    .eq("org_id", orgId)
    .order("employee_code", { ascending: true });

  const status = opts?.status ?? "all";
  if (status !== "all") q = q.eq("status", status);

  const { data, error } = await q;
  if (error) throw new Error(error.message);

  let rows = (data ?? []) as Employee[];
  // search ฝั่ง JS (ชื่อ/รหัส/ตำแหน่ง) — dataset เล็ก (≤10 คน)
  const s = opts?.search?.trim().toLowerCase();
  if (s) {
    rows = rows.filter(
      (e) =>
        `${e.first_name} ${e.last_name}`.toLowerCase().includes(s) ||
        e.employee_code.toLowerCase().includes(s) ||
        (e.position ?? "").toLowerCase().includes(s) ||
        (e.department_tag ?? "").toLowerCase().includes(s),
    );
  }
  return rows;
}

export async function getEmployee(
  db: SupabaseClient,
  orgId: string,
  id: string,
): Promise<Employee | null> {
  const { data, error } = await db
    .from(TABLE)
    .select("*")
    .eq("org_id", orgId)
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as Employee) ?? null;
}

/** จำนวนพนักงาน active (ใช้ใน dashboard KPI) */
export async function countActiveEmployees(db: SupabaseClient, orgId: string): Promise<number> {
  const { count, error } = await db
    .from(TABLE)
    .select("id", { count: "exact", head: true })
    .eq("org_id", orgId)
    .eq("status", "active");
  if (error) throw new Error(error.message);
  return count ?? 0;
}
