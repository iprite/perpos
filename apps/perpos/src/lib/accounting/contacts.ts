/**
 * contacts.ts — fetch logic ลูกค้า/ผู้ขาย (acc_contacts).
 * caller เช็ค auth ก่อน · ทุก query filter org_id (กัน leak ข้าม org).
 * reuse กับ SSR page + API route.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AccContact } from "./types";

export async function listContacts(
  db: SupabaseClient,
  orgId: string,
  opts?: { kind?: string; search?: string },
): Promise<AccContact[]> {
  let q = db.from("acc_contacts").select("*").eq("org_id", orgId);
  if (opts?.kind) {
    // 'both' โผล่ทั้ง customer และ vendor filter
    if (opts.kind === "customer") q = q.in("kind", ["customer", "both"]);
    else if (opts.kind === "vendor") q = q.in("kind", ["vendor", "both"]);
    else q = q.eq("kind", opts.kind);
  }
  if (opts?.search) q = q.ilike("name", `%${opts.search}%`);
  q = q.order("name", { ascending: true });
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []) as AccContact[];
}

export async function getContact(
  db: SupabaseClient,
  orgId: string,
  id: string,
): Promise<AccContact | null> {
  const { data, error } = await db
    .from("acc_contacts")
    .select("*")
    .eq("org_id", orgId)
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as AccContact) ?? null;
}
