/**
 * computeSchedulerRuns — log การรัน cron scheduler ล่าสุด + สรุปสถานะ (super admin)
 * scheduler เขียน 1 row ต่อการรันลง scheduler_runs (ดู api/assistant/scheduler/route.ts)
 *
 * ใช้ร่วม 2 ที่ (hybrid — หน้านี้ poll ทุก 60 วิ):
 *   - Server Component page.tsx        → initial data ตอน SSR (ไม่มี client waterfall แรก)
 *   - API route /api/admin/scheduler/runs → client view poll ต่อทุก 60 วิ
 *
 * รับ admin client (service role, bypass RLS) — auth/role check เป็นหน้าที่ของ caller
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export type SchedulerRun = {
  id: string;
  ran_at: string;
  duration_ms: number;
  ok: boolean;
  stuck_failed: number;
  requeued: number;
  requeue_gaveup: number;
  cleaned_jobs: number;
  error_message: string | null;
};

export type SchedulerData = {
  health: "healthy" | "stale" | "down";
  last_ran_at: string | null;
  age_seconds: number | null;
  summary: {
    runs_24h: number;
    failed_24h: number;
    stuck_failed_24h: number;
    requeued_24h: number;
    cleaned_24h: number;
  };
  queue: { pending: number; processing: number };
  runs: SchedulerRun[];
};

export async function computeSchedulerRuns(admin: SupabaseClient): Promise<SchedulerData> {
  const { data: runs } = await admin
    .from("scheduler_runs")
    .select(
      "id, ran_at, duration_ms, ok, stuck_failed, requeued, requeue_gaveup, cleaned_jobs, error_message",
    )
    .order("ran_at", { ascending: false })
    .limit(50);

  const rows = (runs ?? []) as unknown as SchedulerRun[];
  const last = rows[0] ?? null;

  // สถานะ: healthy ถ้ารันล่าสุดไม่เกิน 5 นาที (cron ทุก 1 นาที)
  const lastRanAt = last ? new Date(last.ran_at) : null;
  const ageMs = lastRanAt ? Date.now() - lastRanAt.getTime() : null;
  const health: "healthy" | "stale" | "down" =
    ageMs == null
      ? "down"
      : ageMs <= 5 * 60_000
        ? "healthy"
        : ageMs <= 30 * 60_000
          ? "stale"
          : "down";

  // สรุป 24 ชม. ล่าสุด
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const recent = rows.filter((r) => r.ran_at >= since);
  const summary = {
    runs_24h: recent.length,
    failed_24h: recent.filter((r) => r.ok === false).length,
    stuck_failed_24h: recent.reduce((s, r) => s + Number(r.stuck_failed ?? 0), 0),
    requeued_24h: recent.reduce((s, r) => s + Number(r.requeued ?? 0), 0),
    cleaned_24h: recent.reduce((s, r) => s + Number(r.cleaned_jobs ?? 0), 0),
  };

  // จำนวนงาน assistant ที่ค้างอยู่ตอนนี้
  const { count: pendingCount } = await admin
    .from("assistant_jobs")
    .select("id", { count: "exact", head: true })
    .eq("status", "pending");
  const { count: processingCount } = await admin
    .from("assistant_jobs")
    .select("id", { count: "exact", head: true })
    .eq("status", "processing");

  return {
    health,
    last_ran_at: last ? last.ran_at : null,
    age_seconds: ageMs == null ? null : Math.round(ageMs / 1000),
    summary,
    queue: { pending: pendingCount ?? 0, processing: processingCount ?? 0 },
    runs: rows,
  };
}
