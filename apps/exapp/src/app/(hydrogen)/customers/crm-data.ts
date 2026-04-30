import type { SupabaseClient } from "@supabase/supabase-js";

import type { CrmActivity, CrmActivityType, CrmDeal, CrmDealStage, CrmDealStatus } from "./crm-types";

function nowIso() {
  return new Date().toISOString();
}

function toIsoOrNull(input: string) {
  const v = input.trim();
  if (!v) return null;
  const d = new Date(v);
  const ms = d.getTime();
  if (!Number.isFinite(ms)) return null;
  return d.toISOString();
}

export async function crmListStages(supabase: SupabaseClient) {
  const { data, error } = await supabase
    .from("crm_deal_stages")
    .select("key,name,sort_order,is_active,created_at")
    .eq("is_active", true)
    .order("sort_order", { ascending: true });
  if (error) throw error;
  return (data ?? []) as CrmDealStage[];
}

export async function crmListDeals(
  supabase: SupabaseClient,
  opts: { customerId?: string; status?: CrmDealStatus | "all"; limit?: number }
) {
  let q = supabase
    .from("crm_deals")
    .select("id,customer_id,title,amount,currency,stage_key,probability,expected_close_date,status,owner_profile_id,created_at,updated_at")
    .order("updated_at", { ascending: false });
  if (opts.customerId) q = q.eq("customer_id", opts.customerId);
  if (opts.status && opts.status !== "all") q = q.eq("status", opts.status);
  if (opts.limit) q = q.limit(Math.max(1, Math.min(1000, opts.limit)));
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as CrmDeal[];
}

export async function crmUpsertDeal(
  supabase: SupabaseClient,
  input: Partial<CrmDeal> & { customer_id: string; title: string; stage_key: string }
) {
  const payload = {
    customer_id: input.customer_id,
    title: input.title.trim(),
    amount: Number.isFinite(Number(input.amount)) ? Number(input.amount) : 0,
    currency: (input.currency ?? "THB").trim() || "THB",
    stage_key: input.stage_key,
    probability: Number.isFinite(Number(input.probability)) ? Math.max(0, Math.min(100, Number(input.probability))) : 0,
    expected_close_date: (input.expected_close_date ?? null) as string | null,
    status: ((input.status ?? "open") as CrmDealStatus) ?? "open",
    owner_profile_id: (input.owner_profile_id ?? null) as string | null,
    updated_at: nowIso(),
  };

  if (input.id) {
    const { data, error } = await supabase
      .from("crm_deals")
      .update(payload)
      .eq("id", input.id)
      .select(
        "id,customer_id,title,amount,currency,stage_key,probability,expected_close_date,status,owner_profile_id,created_at,updated_at"
      )
      .single();
    if (error) throw error;
    return data as CrmDeal;
  }

  const { data, error } = await supabase
    .from("crm_deals")
    .insert(payload)
    .select("id,customer_id,title,amount,currency,stage_key,probability,expected_close_date,status,owner_profile_id,created_at,updated_at")
    .single();
  if (error) throw error;
  return data as CrmDeal;
}

export async function crmUpdateDealStage(supabase: SupabaseClient, dealId: string, stageKey: string) {
  const nextStatus = stageKey === "won" ? ("won" as const) : stageKey === "lost" ? ("lost" as const) : ("open" as const);
  const { error } = await supabase
    .from("crm_deals")
    .update({ stage_key: stageKey, status: nextStatus, updated_at: nowIso() })
    .eq("id", dealId);
  if (error) throw error;
}

export async function crmListGlobalDueTasks(supabase: SupabaseClient) {
  const now = new Date();
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const end7 = new Date(start);
  end7.setDate(end7.getDate() + 7);
  const { data, error } = await supabase
    .from("crm_activities")
    .select("id,customer_id,deal_id,type,subject,notes,due_at,reminder_at,completed_at,assigned_to_profile_id,created_at,updated_at")
    .eq("type", "task")
    .is("completed_at", null)
    .not("due_at", "is", null)
    .lte("due_at", end7.toISOString())
    .order("due_at", { ascending: true })
    .limit(50);
  if (error) throw error;
  return (data ?? []) as CrmActivity[];
}

export async function crmListActivities(
  supabase: SupabaseClient,
  opts: { customerId: string; includeCompleted?: boolean; limit?: number }
) {
  let q = supabase
    .from("crm_activities")
    .select("id,customer_id,deal_id,type,subject,notes,due_at,reminder_at,completed_at,assigned_to_profile_id,created_at,updated_at")
    .eq("customer_id", opts.customerId)
    .order("created_at", { ascending: false });

  if (!opts.includeCompleted) q = q.is("completed_at", null);
  q = q.limit(Math.max(1, Math.min(500, opts.limit ?? 200)));

  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as CrmActivity[];
}

export async function crmUpsertActivity(
  supabase: SupabaseClient,
  input: Partial<CrmActivity> & { customer_id: string; type: CrmActivityType; subject: string }
) {
  const payload = {
    customer_id: input.customer_id,
    deal_id: (input.deal_id ?? null) as string | null,
    type: input.type,
    subject: input.subject.trim(),
    notes: (input.notes ?? null) as string | null,
    due_at: input.due_at ?? null,
    reminder_at: input.reminder_at ?? null,
    completed_at: input.completed_at ?? null,
    assigned_to_profile_id: (input.assigned_to_profile_id ?? null) as string | null,
    updated_at: nowIso(),
  };

  if (input.id) {
    const { data, error } = await supabase
      .from("crm_activities")
      .update(payload)
      .eq("id", input.id)
      .select(
        "id,customer_id,deal_id,type,subject,notes,due_at,reminder_at,completed_at,assigned_to_profile_id,created_at,updated_at"
      )
      .single();
    if (error) throw error;
    return data as CrmActivity;
  }

  const { data, error } = await supabase
    .from("crm_activities")
    .insert(payload)
    .select("id,customer_id,deal_id,type,subject,notes,due_at,reminder_at,completed_at,assigned_to_profile_id,created_at,updated_at")
    .single();
  if (error) throw error;
  return data as CrmActivity;
}

export async function crmCompleteActivity(supabase: SupabaseClient, activityId: string, completed: boolean) {
  const { error } = await supabase
    .from("crm_activities")
    .update({ completed_at: completed ? nowIso() : null, updated_at: nowIso() })
    .eq("id", activityId);
  if (error) throw error;
}

export async function crmListDueTasksForCustomer(supabase: SupabaseClient, customerId: string) {
  const now = new Date();
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const end7 = new Date(start);
  end7.setDate(end7.getDate() + 7);

  const { data, error } = await supabase
    .from("crm_activities")
    .select("id,customer_id,deal_id,type,subject,notes,due_at,reminder_at,completed_at,assigned_to_profile_id,created_at,updated_at")
    .eq("customer_id", customerId)
    .eq("type", "task")
    .is("completed_at", null)
    .not("due_at", "is", null)
    .lte("due_at", end7.toISOString())
    .order("due_at", { ascending: true })
    .limit(30);
  if (error) throw error;
  return (data ?? []) as CrmActivity[];
}

export function crmGroupDueAt(iso: string) {
  const due = new Date(iso);
  const now = new Date();
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);
  const tomorrowStart = new Date(todayStart);
  tomorrowStart.setDate(tomorrowStart.getDate() + 1);
  const next7 = new Date(todayStart);
  next7.setDate(next7.getDate() + 7);
  if (due.getTime() < todayStart.getTime()) return "overdue" as const;
  if (due.getTime() < tomorrowStart.getTime()) return "today" as const;
  if (due.getTime() <= next7.getTime()) return "next7" as const;
  return "next7" as const;
}

export function crmFormatDueLabel(iso: string) {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "-";
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd} ${hh}:${mi}`;
}

export function crmNormalizeDueInput(dateStr: string, timeStr: string) {
  const d = dateStr.trim();
  if (!d) return null;
  const t = timeStr.trim() || "09:00";
  return toIsoOrNull(`${d}T${t}:00`);
}
