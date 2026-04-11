import type { SalesFollowupRow } from "./quote-types";

export function quoteGroupDueAt(dueAt: string): "overdue" | "today" | "next7" | "later" {
  const d = new Date(dueAt);
  if (Number.isNaN(d.getTime())) return "later";

  const now = new Date();
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  const startOfTomorrow = new Date(startOfToday);
  startOfTomorrow.setDate(startOfTomorrow.getDate() + 1);
  const startOfNext7 = new Date(startOfToday);
  startOfNext7.setDate(startOfNext7.getDate() + 8);

  if (d.getTime() < startOfToday.getTime()) return "overdue";
  if (d.getTime() >= startOfToday.getTime() && d.getTime() < startOfTomorrow.getTime()) return "today";
  if (d.getTime() >= startOfTomorrow.getTime() && d.getTime() < startOfNext7.getTime()) return "next7";
  return "later";
}

export function quoteFormatDueLabel(dueAt: string) {
  const d = new Date(dueAt);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleString(undefined, { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

export function quoteIsDueRelevant(row: SalesFollowupRow) {
  if (!row.due_at) return false;
  if (row.completed_at) return false;
  const g = quoteGroupDueAt(row.due_at);
  return g === "overdue" || g === "today" || g === "next7";
}

export async function quotesListGlobalDueTasks(supabase: any): Promise<SalesFollowupRow[]> {
  const now = new Date();
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  const endOfNext7 = new Date(startOfToday);
  endOfNext7.setDate(endOfNext7.getDate() + 8);

  const { data, error } = await supabase
    .from("sales_followups")
    .select("id,quote_id,type,subject,notes,due_at,reminder_at,completed_at,assigned_to_profile_id,created_at,updated_at")
    .is("completed_at", null)
    .not("due_at", "is", null)
    .lte("due_at", endOfNext7.toISOString())
    .order("due_at", { ascending: true })
    .limit(200);

  if (error) throw error;
  return (data ?? []) as SalesFollowupRow[];
}

