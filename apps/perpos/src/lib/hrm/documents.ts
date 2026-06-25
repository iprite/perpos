/**
 * documents.ts — fetch logic เอกสาร HR. RLS-scoped client.
 * caller เช็ค auth ก่อน · ทุก query filter org_id.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { HrmDocument, DocType } from "@/lib/hrm/types";

export async function listDocuments(
  db: SupabaseClient,
  orgId: string,
  opts?: { employeeId?: string; docType?: DocType },
): Promise<HrmDocument[]> {
  let q = db
    .from("hrm_documents")
    .select("*")
    .eq("org_id", orgId)
    .order("created_at", { ascending: false });
  if (opts?.employeeId) q = q.eq("employee_id", opts.employeeId);
  if (opts?.docType) q = q.eq("doc_type", opts.docType);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []) as HrmDocument[];
}
