"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";

// ─── Types ────────────────────────────────────────────────────────────────────

export type DepartmentRow = {
  id: string;
  organization_id: string;
  code: string | null;
  name: string;
  active: boolean;
};

export type EmployeeRow = {
  id: string;
  organization_id: string;
  employee_code: string;
  first_name: string;
  last_name: string;
  department_id: string | null;
  department_name: string | null;
  position: string | null;
  base_salary: number;
  tax_id: string | null;
  bank_name: string | null;
  bank_account: string | null;
  start_date: string | null;
  end_date: string | null;
  status: "active" | "inactive" | "terminated";
};

export type PayItemRow = {
  id: string;
  organization_id: string;
  code: string;
  name: string;
  item_type: "earning" | "deduction";
  is_recurring: boolean;
  account_label: string | null;
  linked_account_id: string | null;
  ytd_type: "none" | "income40_1";
  is_system: boolean;
  active: boolean;
  sort_order: number;
};

export type FundRow = {
  id: string;
  organization_id: string;
  fund_type: "ssf" | "pvd" | "gf" | "other";
  name: string;
  employee_rate: number;
  employer_rate: number;
  ceiling_wage: number | null;
  active: boolean;
  notes: string | null;
};

export type RunRow = {
  id: string;
  organization_id: string;
  run_number: string;
  period_year: number;
  period_month: number;
  status: "draft" | "pending_approval" | "approved" | "paid" | "cancelled";
  total_earnings: number;
  total_deductions: number;
  total_net: number;
  notes: string | null;
  created_at: string;
};

// ─── Departments ──────────────────────────────────────────────────────────────

export async function listDepartmentsAction(params: {
  organizationId: string;
}): Promise<{ ok: true; rows: DepartmentRow[] } | { ok: false; error: string }> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("payroll_departments")
    .select("id,organization_id,code,name,active")
    .eq("organization_id", params.organizationId)
    .order("name", { ascending: true });

  if (error) return { ok: false, error: error.message };

  const rows: DepartmentRow[] = (data ?? []).map((r: any) => ({
    id:              String(r.id),
    organization_id: String(r.organization_id),
    code:            r.code ? String(r.code) : null,
    name:            String(r.name),
    active:          Boolean(r.active),
  }));
  return { ok: true, rows };
}

export async function upsertDepartmentAction(params: {
  organizationId: string;
  id?: string;
  code?: string;
  name: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await createSupabaseServerClient();
  const payload: any = {
    organization_id: params.organizationId,
    code:            params.code?.trim() || null,
    name:            params.name.trim(),
  };
  if (params.id) payload.id = params.id;

  const { error } = await supabase.from("payroll_departments").upsert(payload);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/payroll");
  return { ok: true };
}

// ─── Employees ────────────────────────────────────────────────────────────────

export async function listEmployeesAction(params: {
  organizationId: string;
}): Promise<{ ok: true; rows: EmployeeRow[] } | { ok: false; error: string }> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("payroll_employees")
    .select(`
      id,organization_id,employee_code,first_name,last_name,
      department_id,position,base_salary,tax_id,bank_name,bank_account,
      start_date,end_date,status,
      payroll_departments(name)
    `)
    .eq("organization_id", params.organizationId)
    .order("employee_code", { ascending: true });

  if (error) return { ok: false, error: error.message };

  const rows: EmployeeRow[] = (data ?? []).map((r: any) => ({
    id:              String(r.id),
    organization_id: String(r.organization_id),
    employee_code:   String(r.employee_code),
    first_name:      String(r.first_name),
    last_name:       String(r.last_name),
    department_id:   r.department_id ? String(r.department_id) : null,
    department_name: r.payroll_departments?.name ? String(r.payroll_departments.name) : null,
    position:        r.position ? String(r.position) : null,
    base_salary:     Number(r.base_salary ?? 0),
    tax_id:          r.tax_id ? String(r.tax_id) : null,
    bank_name:       r.bank_name ? String(r.bank_name) : null,
    bank_account:    r.bank_account ? String(r.bank_account) : null,
    start_date:      r.start_date ? String(r.start_date) : null,
    end_date:        r.end_date ? String(r.end_date) : null,
    status:          String(r.status ?? "active") as EmployeeRow["status"],
  }));
  return { ok: true, rows };
}

export async function upsertEmployeeAction(params: {
  organizationId: string;
  id?: string;
  employee_code: string;
  first_name: string;
  last_name: string;
  department_id?: string | null;
  position?: string | null;
  base_salary?: number;
  tax_id?: string | null;
  bank_name?: string | null;
  bank_account?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  status?: "active" | "inactive" | "terminated";
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await createSupabaseServerClient();
  const payload: any = {
    organization_id: params.organizationId,
    employee_code:   params.employee_code.trim(),
    first_name:      params.first_name.trim(),
    last_name:       params.last_name.trim(),
    department_id:   params.department_id || null,
    position:        params.position?.trim() || null,
    base_salary:     params.base_salary ?? 0,
    tax_id:          params.tax_id?.trim() || null,
    bank_name:       params.bank_name?.trim() || null,
    bank_account:    params.bank_account?.trim() || null,
    start_date:      params.start_date || null,
    end_date:        params.end_date || null,
    status:          params.status ?? "active",
  };
  if (params.id) payload.id = params.id;

  const { error } = await supabase.from("payroll_employees").upsert(payload);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/payroll");
  return { ok: true };
}

// ─── Pay Items ────────────────────────────────────────────────────────────────

export async function listPayItemsAction(params: {
  organizationId: string;
}): Promise<{ ok: true; rows: PayItemRow[] } | { ok: false; error: string }> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("payroll_pay_items")
    .select("id,organization_id,code,name,item_type,is_recurring,account_label,linked_account_id,ytd_type,is_system,active,sort_order")
    .eq("organization_id", params.organizationId)
    .order("sort_order", { ascending: true })
    .order("code", { ascending: true });

  if (error) return { ok: false, error: error.message };

  const rows: PayItemRow[] = (data ?? []).map((r: any) => ({
    id:                String(r.id),
    organization_id:   String(r.organization_id),
    code:              String(r.code),
    name:              String(r.name),
    item_type:         String(r.item_type) as PayItemRow["item_type"],
    is_recurring:      Boolean(r.is_recurring),
    account_label:     r.account_label ? String(r.account_label) : null,
    linked_account_id: r.linked_account_id ? String(r.linked_account_id) : null,
    ytd_type:          String(r.ytd_type ?? "none") as PayItemRow["ytd_type"],
    is_system:         Boolean(r.is_system),
    active:            Boolean(r.active),
    sort_order:        Number(r.sort_order ?? 0),
  }));
  return { ok: true, rows };
}

export async function upsertPayItemAction(params: {
  organizationId: string;
  id?: string;
  code: string;
  name: string;
  item_type: "earning" | "deduction";
  is_recurring: boolean;
  account_label?: string | null;
  ytd_type?: "none" | "income40_1";
  sort_order?: number;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await createSupabaseServerClient();
  const payload: any = {
    organization_id: params.organizationId,
    code:            params.code.trim(),
    name:            params.name.trim(),
    item_type:       params.item_type,
    is_recurring:    params.is_recurring,
    account_label:   params.account_label?.trim() || null,
    ytd_type:        params.ytd_type ?? "none",
    sort_order:      params.sort_order ?? 0,
  };
  if (params.id) payload.id = params.id;

  const { error } = await supabase.from("payroll_pay_items").upsert(payload);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/payroll");
  return { ok: true };
}

export async function togglePayItemActiveAction(params: {
  id: string;
  organizationId: string;
  active: boolean;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("payroll_pay_items")
    .update({ active: params.active })
    .eq("id", params.id)
    .eq("organization_id", params.organizationId);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/payroll");
  return { ok: true };
}

// ─── Funds ────────────────────────────────────────────────────────────────────

export async function listFundsAction(params: {
  organizationId: string;
}): Promise<{ ok: true; rows: FundRow[] } | { ok: false; error: string }> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("payroll_funds")
    .select("id,organization_id,fund_type,name,employee_rate,employer_rate,ceiling_wage,active,notes")
    .eq("organization_id", params.organizationId)
    .order("fund_type", { ascending: true });

  if (error) return { ok: false, error: error.message };

  const rows: FundRow[] = (data ?? []).map((r: any) => ({
    id:              String(r.id),
    organization_id: String(r.organization_id),
    fund_type:       String(r.fund_type) as FundRow["fund_type"],
    name:            String(r.name),
    employee_rate:   Number(r.employee_rate ?? 0),
    employer_rate:   Number(r.employer_rate ?? 0),
    ceiling_wage:    r.ceiling_wage != null ? Number(r.ceiling_wage) : null,
    active:          Boolean(r.active),
    notes:           r.notes ? String(r.notes) : null,
  }));
  return { ok: true, rows };
}

export async function upsertFundAction(params: {
  organizationId: string;
  id?: string;
  fund_type: "ssf" | "pvd" | "gf" | "other";
  name: string;
  employee_rate?: number;
  employer_rate?: number;
  ceiling_wage?: number | null;
  notes?: string | null;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await createSupabaseServerClient();
  const payload: any = {
    organization_id: params.organizationId,
    fund_type:       params.fund_type,
    name:            params.name.trim(),
    employee_rate:   params.employee_rate ?? 0,
    employer_rate:   params.employer_rate ?? 0,
    ceiling_wage:    params.ceiling_wage ?? null,
    notes:           params.notes?.trim() || null,
  };
  if (params.id) payload.id = params.id;

  const { error } = await supabase.from("payroll_funds").upsert(payload);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/payroll");
  return { ok: true };
}

// ─── Payroll Runs ─────────────────────────────────────────────────────────────

export async function listPayrollRunsAction(params: {
  organizationId: string;
}): Promise<{ ok: true; rows: RunRow[] } | { ok: false; error: string }> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("payroll_runs")
    .select("id,organization_id,run_number,period_year,period_month,status,total_earnings,total_deductions,total_net,notes,created_at")
    .eq("organization_id", params.organizationId)
    .order("period_year", { ascending: false })
    .order("period_month", { ascending: false });

  if (error) return { ok: false, error: error.message };

  const rows: RunRow[] = (data ?? []).map((r: any) => ({
    id:               String(r.id),
    organization_id:  String(r.organization_id),
    run_number:       String(r.run_number),
    period_year:      Number(r.period_year),
    period_month:     Number(r.period_month),
    status:           String(r.status) as RunRow["status"],
    total_earnings:   Number(r.total_earnings ?? 0),
    total_deductions: Number(r.total_deductions ?? 0),
    total_net:        Number(r.total_net ?? 0),
    notes:            r.notes ? String(r.notes) : null,
    created_at:       String(r.created_at),
  }));
  return { ok: true, rows };
}

// ─── Account Settings ─────────────────────────────────────────────────────────

export async function getAccountSettingsAction(params: {
  organizationId: string;
}): Promise<{ ok: true; settings: Record<string, string> } | { ok: false; error: string }> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("payroll_account_settings")
    .select("setting_key,account_label")
    .eq("organization_id", params.organizationId);

  if (error) return { ok: false, error: error.message };

  const settings: Record<string, string> = {};
  for (const row of data ?? []) {
    settings[String(row.setting_key)] = String(row.account_label ?? "");
  }
  return { ok: true, settings };
}

export async function upsertAccountSettingAction(params: {
  organizationId: string;
  setting_key: string;
  account_label: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("payroll_account_settings").upsert({
    organization_id: params.organizationId,
    setting_key:     params.setting_key,
    account_label:   params.account_label.trim() || null,
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/payroll");
  return { ok: true };
}
