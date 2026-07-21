/**
 * getAssistantJobs — รายการงานผู้ช่วย AI ล่าสุดของผู้ใช้คนเดียว (per-profile)
 *
 * ใช้ร่วมกัน:
 *   - API   GET /api/assistant/jobs (client poll)
 *   - Page  /assistant (SSR initial)
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export async function getAssistantJobs(
  admin: SupabaseClient,
  userId: string,
  limit = 30,
): Promise<Record<string, unknown>[]> {
  const { data: jobs } = await admin
    .from("assistant_jobs")
    .select("*")
    .eq("profile_id", userId)
    .order("created_at", { ascending: false })
    .limit(Number.isFinite(limit) ? limit : 30);
  return (jobs ?? []) as Record<string, unknown>[];
}
