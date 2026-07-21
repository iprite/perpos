/**
 * payroll.ts — fetch logic รอบเงินเดือน + สลิป (RLS-scoped client)
 * caller เช็ค auth ก่อน · ทุก query filter org_id.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { PayrollRun, Payslip } from "@/lib/hrm/types";

export async function listRuns(db: SupabaseClient, orgId: string): Promise<PayrollRun[]> {
  const { data, error } = await db
    .from("hrm_payroll_runs")
    .select("*")
    .eq("org_id", orgId)
    .order("period_year", { ascending: false })
    .order("period_month", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as PayrollRun[];
}

export async function getRun(
  db: SupabaseClient,
  orgId: string,
  id: string,
): Promise<{ run: PayrollRun | null; payslips: Payslip[] }> {
  const { data: run, error: e1 } = await db
    .from("hrm_payroll_runs")
    .select("*")
    .eq("org_id", orgId)
    .eq("id", id)
    .maybeSingle();
  if (e1) throw new Error(e1.message);
  if (!run) return { run: null, payslips: [] };

  const { data: slips, error: e2 } = await db
    .from("hrm_payslips")
    .select("*")
    .eq("org_id", orgId)
    .eq("run_id", id);
  if (e2) throw new Error(e2.message);

  return { run: run as PayrollRun, payslips: (slips ?? []) as Payslip[] };
}

/** สลิปทั้งหมดของรอบ (สำหรับ payslips listing) */
export async function listPayslips(
  db: SupabaseClient,
  orgId: string,
  runId: string,
): Promise<Payslip[]> {
  const { data, error } = await db
    .from("hrm_payslips")
    .select("*")
    .eq("org_id", orgId)
    .eq("run_id", runId);
  if (error) throw new Error(error.message);
  return (data ?? []) as Payslip[];
}

/** รอบ paid ล่าสุด + ต้นทุนรวม (ใช้ใน dashboard) */
export async function getLatestPaidRun(
  db: SupabaseClient,
  orgId: string,
): Promise<PayrollRun | null> {
  const { data, error } = await db
    .from("hrm_payroll_runs")
    .select("*")
    .eq("org_id", orgId)
    .in("status", ["approved", "paid"])
    .order("period_year", { ascending: false })
    .order("period_month", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as PayrollRun) ?? null;
}
