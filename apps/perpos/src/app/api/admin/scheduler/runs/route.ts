/**
 * Admin: Scheduler / Background Jobs monitor
 *   GET /api/admin/scheduler/runs  — log การรัน cron scheduler ล่าสุด + สรุปสถานะ
 *
 * scheduler เขียน 1 row ต่อการรันลง scheduler_runs (ดู api/assistant/scheduler/route.ts)
 */

import { NextRequest } from 'next/server';
import { requireAdmin } from '../../../_lib/auth';
import { createAdminClient } from '../../../_lib/supabase';
import { ok, Err } from '../../../_lib/response';

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (!auth.ok) return auth.res;

  const admin = createAdminClient();

  const { data: runs, error } = await admin
    .from('scheduler_runs')
    .select('id, ran_at, duration_ms, ok, stuck_failed, requeued, requeue_gaveup, cleaned_jobs, error_message')
    .order('ran_at', { ascending: false })
    .limit(50);
  if (error) return Err.dbError(error);

  const rows = (runs ?? []) as Record<string, unknown>[];
  const last = rows[0] ?? null;

  // สถานะการทำงาน: ถือว่า healthy ถ้ารันล่าสุดไม่เกิน 5 นาที (cron ทุก 1 นาที)
  const lastRanAt = last ? new Date(last.ran_at as string) : null;
  const ageMs = lastRanAt ? Date.now() - lastRanAt.getTime() : null;
  const health: 'healthy' | 'stale' | 'down' =
    ageMs == null ? 'down' : ageMs <= 5 * 60_000 ? 'healthy' : ageMs <= 30 * 60_000 ? 'stale' : 'down';

  // สรุป 24 ชม. ล่าสุด
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const recent = rows.filter((r) => (r.ran_at as string) >= since);
  const summary = {
    runs_24h: recent.length,
    failed_24h: recent.filter((r) => r.ok === false).length,
    stuck_failed_24h: recent.reduce((s, r) => s + Number(r.stuck_failed ?? 0), 0),
    requeued_24h: recent.reduce((s, r) => s + Number(r.requeued ?? 0), 0),
    cleaned_24h: recent.reduce((s, r) => s + Number(r.cleaned_jobs ?? 0), 0),
  };

  // จำนวนงาน assistant ที่ค้างอยู่ตอนนี้
  const { count: pendingCount } = await admin
    .from('assistant_jobs')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'pending');
  const { count: processingCount } = await admin
    .from('assistant_jobs')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'processing');

  return ok({
    health,
    last_ran_at: last ? (last.ran_at as string) : null,
    age_seconds: ageMs == null ? null : Math.round(ageMs / 1000),
    summary,
    queue: { pending: pendingCount ?? 0, processing: processingCount ?? 0 },
    runs: rows,
  });
}
