// lib/gov-procure/attachments.ts — fetch logic สลิป/รูปเช็ค (reuse SSR + API)

import type { SupabaseClient } from "@supabase/supabase-js";
import type { GovProcureAttachment } from "./types";

/** list attachments ของ order (กรอง org_id + order_id) — เรียงใหม่สุดก่อน */
export async function listAttachments(
  client: SupabaseClient,
  orgId: string,
  orderId: string,
): Promise<GovProcureAttachment[]> {
  const { data, error } = await client
    .from("gov_procure_attachments")
    .select("*")
    .eq("org_id", orgId)
    .eq("order_id", orderId)
    .order("created_at", { ascending: false });

  if (error) throw new Error(error.message);
  return (data ?? []) as GovProcureAttachment[];
}
