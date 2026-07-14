// lib/gov-procure/settings.ts — fetch logic ตั้งค่าต่อ org (reuse SSR + API)
// ถ้ายังไม่มี row → คืน default (กัน null/404, B2)

import type { SupabaseClient } from "@supabase/supabase-js";
import { DEFAULT_SETTINGS, type GovProcureSettings } from "./types";

/** อ่าน settings ของ org — ถ้าไม่มี row คืนค่า default (merge org_id) */
export async function getSettings(
  client: SupabaseClient,
  orgId: string,
): Promise<GovProcureSettings> {
  const { data, error } = await client
    .from("gov_procure_settings")
    .select("*")
    .eq("org_id", orgId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (data) return data as GovProcureSettings;

  const nowIso = new Date().toISOString();
  return {
    org_id: orgId,
    ...DEFAULT_SETTINGS,
    created_at: nowIso,
    updated_at: nowIso,
  };
}
