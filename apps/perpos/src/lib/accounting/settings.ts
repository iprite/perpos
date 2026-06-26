/**
 * settings.ts — fetch logic ตั้งค่าองค์กร/ภาษี (acc_org_settings, 1 แถวต่อ org).
 * caller เช็ค auth ก่อน · filter org_id.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AccOrgSettings } from "./types";

/** อ่าน settings ของ org. คืน null ถ้ายังไม่เคย seed (Non-VAT default ใช้ใน UI). */
export async function getOrgSettings(
  db: SupabaseClient,
  orgId: string,
): Promise<AccOrgSettings | null> {
  const { data, error } = await db
    .from("acc_org_settings")
    .select("*")
    .eq("org_id", orgId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as AccOrgSettings) ?? null;
}
