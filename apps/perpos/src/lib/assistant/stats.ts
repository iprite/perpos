/**
 * getAssistantStats — สถิติการใช้ผู้ช่วย AI ของผู้ใช้คนเดียว (per-profile)
 *
 * ใช้ร่วมกัน:
 *   - API   GET /api/assistant/stats (client poll/refresh)
 *   - Page  /assistant/usage (SSR initial)
 */

import type { SupabaseClient } from "@supabase/supabase-js";

const BKK = "Asia/Bangkok";
const dayStr = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: BKK }).format(d);

export type AssistantStats = {
  totals: { jobs: number; completed: number; failed: number; minutes: number };
  by_source: { web: { jobs: number; minutes: number }; line: { jobs: number; minutes: number } };
  daily: { date: string; jobs: number; minutes: number }[];
};

export async function getAssistantStats(
  admin: SupabaseClient,
  userId: string,
): Promise<AssistantStats> {
  const { data: jobs } = await admin
    .from("assistant_jobs")
    .select("status, source, duration_seconds, created_at")
    .eq("profile_id", userId)
    .order("created_at", { ascending: false })
    .limit(2000);

  const rows = (jobs ?? []) as {
    status: string;
    source: string;
    duration_seconds: number | null;
    created_at: string;
  }[];
  const completed = rows.filter((r) => r.status === "completed");

  const bySource = { web: { jobs: 0, minutes: 0 }, line: { jobs: 0, minutes: 0 } };
  for (const r of completed) {
    const k = r.source === "line" ? "line" : "web";
    bySource[k].jobs += 1;
    bySource[k].minutes += Math.round((r.duration_seconds ?? 0) / 60);
  }

  // daily 30 วันล่าสุด
  const days: Record<string, { jobs: number; minutes: number }> = {};
  for (let i = 29; i >= 0; i--)
    days[dayStr(new Date(Date.now() - i * 86400000))] = { jobs: 0, minutes: 0 };
  for (const r of completed) {
    const d = dayStr(new Date(r.created_at));
    if (days[d]) {
      days[d].jobs += 1;
      days[d].minutes += Math.round((r.duration_seconds ?? 0) / 60);
    }
  }
  const daily = Object.entries(days).map(([date, v]) => ({ date, ...v }));

  return {
    totals: {
      jobs: rows.length,
      completed: completed.length,
      failed: rows.filter((r) => r.status === "failed").length,
      minutes: Math.round(completed.reduce((s, r) => s + (r.duration_seconds ?? 0), 0) / 60),
    },
    by_source: bySource,
    daily,
  };
}
