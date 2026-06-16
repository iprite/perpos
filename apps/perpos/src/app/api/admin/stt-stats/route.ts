/**
 * GET /api/admin/stt-stats — สถิติการใช้แกะเสียงรวมทุกผู้ใช้ (super admin)
 */

import { NextRequest } from 'next/server';
import { requireAdmin } from '../../_lib/auth';
import { createAdminClient } from '../../_lib/supabase';
import { ok } from '../../_lib/response';

const BKK = 'Asia/Bangkok';
const dayStr = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: BKK }).format(d);

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (!auth.ok) return auth.res;

  const admin = createAdminClient();
  const since = new Date(Date.now() - 30 * 86400000).toISOString();

  const { data: jobs } = await admin
    .from('assistant_jobs')
    .select('status, source, duration_seconds, created_at, profile_id')
    .gte('created_at', since)
    .limit(20000);
  const { data: profs } = await admin
    .from('profiles')
    .select('id, display_name, email, is_active')
    .not('line_user_id', 'is', null)
    .limit(2000);

  const rows = (jobs ?? []) as { status: string; source: string; duration_seconds: number | null; created_at: string; profile_id: string }[];
  const completed = rows.filter((r) => r.status === 'completed');
  const profById = new Map((profs ?? []).map((p) => [p.id as string, p]));

  const bySource = { web: { jobs: 0, minutes: 0 }, line: { jobs: 0, minutes: 0 } };
  const days: Record<string, { jobs: number; minutes: number }> = {};
  for (let i = 29; i >= 0; i--) days[dayStr(new Date(Date.now() - i * 86400000))] = { jobs: 0, minutes: 0 };
  const perUser = new Map<string, { minutes: number; jobs: number }>();

  for (const r of completed) {
    const mins = Math.round((r.duration_seconds ?? 0) / 60);
    const k = r.source === 'line' ? 'line' : 'web';
    bySource[k].jobs += 1; bySource[k].minutes += mins;
    const d = dayStr(new Date(r.created_at));
    if (days[d]) { days[d].jobs += 1; days[d].minutes += mins; }
    const u = perUser.get(r.profile_id) ?? { minutes: 0, jobs: 0 };
    u.minutes += mins; u.jobs += 1; perUser.set(r.profile_id, u);
  }

  const topUsers = Array.from(perUser.entries())
    .map(([pid, v]) => ({ display_name: (profById.get(pid) as { display_name?: string } | undefined)?.display_name ?? 'ผู้ใช้', minutes: v.minutes, jobs: v.jobs }))
    .sort((a, b) => b.minutes - a.minutes)
    .slice(0, 10);

  return ok({
    users: {
      total: (profs ?? []).length,
      active: (profs ?? []).filter((p) => p.is_active).length,
      claimed: (profs ?? []).filter((p) => !String(p.email ?? '').endsWith('@stt-line.perpos.io')).length,
    },
    totals: {
      jobs: rows.length,
      completed: completed.length,
      failed: rows.filter((r) => r.status === 'failed').length,
      minutes: Math.round(completed.reduce((s, r) => s + (r.duration_seconds ?? 0), 0) / 60),
    },
    by_source: bySource,
    daily: Object.entries(days).map(([date, v]) => ({ date, ...v })),
    top_users: topUsers,
  });
}
