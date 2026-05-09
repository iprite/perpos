"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";

export type AuditLogRow = {
  id: string;
  createdAt: string;
  userId: string | null;
  action: string;
  tableName: string;
  recordId: string | null;
  oldValue: any;
  newValue: any;
};

export async function listAuditLogsAction(params: {
  organizationId: string;
  limit: number;
  tableName?: string;
  action?: string;
}) {
  const supabase = await createSupabaseServerClient();
  let q = supabase
    .from("audit_logs")
    .select("id,created_at,user_id,action,table_name,record_id,old_value,new_value")
    .eq("organization_id", params.organizationId)
    .order("created_at", { ascending: false })
    .limit(params.limit);
  if (params.tableName) q = q.eq("table_name", params.tableName);
  if (params.action) q = q.eq("action", params.action);
  const { data, error } = await q;
  if (error) return { ok: false as const, error: error.message ?? "query_failed" };
  const rows: AuditLogRow[] = (data ?? []).map((r: any) => ({
    id: String(r.id),
    createdAt: String(r.created_at),
    userId: r.user_id ? String(r.user_id) : null,
    action: String(r.action),
    tableName: String(r.table_name),
    recordId: r.record_id ? String(r.record_id) : null,
    oldValue: r.old_value ?? null,
    newValue: r.new_value ?? null,
  }));
  return { ok: true as const, rows };
}

