/**
 * GET /api/assistant/transcribe/stats?orgId=<orgId>
 *   — สถิติการใช้แกะเสียงของผู้ใช้ที่ล็อกอิน (ตัวเอง)
 */

import { NextRequest } from 'next/server';
import { requireModuleMember } from '../../../_lib/module-auth';
import { createAdminClient } from '../../../_lib/supabase';
import { ok, Err } from '../../../_lib/response';

const BKK = 'Asia/Bangkok';
const dayStr = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: BKK }).format(d);

export async function GET(req: NextRequest) {
  const orgId = req.nextUrl.searchParams.get('orgId');
  if (!orgId) return Err.missingField('orgId');
  const auth = await requireModuleMember(req, orgId, 'assistant');
  if (!auth.ok) return auth.res;

  const admin = createAdminClient();
  const { data: jobs } = await admin
    .from('transcription_jobs')
    .select('status, source, duration_seconds, created_at')
    .eq('profile_id', auth.userId)
    .order('created_at', { ascending: false })
    .limit(2000);
  const { data: quota } = await admin
    .from('stt_quota')
    .select('limit_seconds, used_seconds')
    .eq('profile_id', auth.userId)
    .maybeSingle();

  const rows = (jobs ?? []) as { status: string; source: string; duration_seconds: number | null; created_at: string }[];
  const completed = rows.filter((r) => r.status === 'completed');

  const bySource = { web: { jobs: 0, minutes: 0 }, line: { jobs: 0, minutes: 0 } };
  for (const r of completed) {
    const k = r.source === 'line' ? 'line' : 'web';
    bySource[k].jobs += 1;
    bySource[k].minutes += Math.round((r.duration_seconds ?? 0) / 60);
  }

  // daily 30 วันล่าสุด
  const days: Record<string, { jobs: number; minutes: number }> = {};
  for (let i = 29; i >= 0; i--) days[dayStr(new Date(Date.now() - i * 86400000))] = { jobs: 0, minutes: 0 };
  for (const r of completed) {
    const d = dayStr(new Date(r.created_at));
    if (days[d]) { days[d].jobs += 1; days[d].minutes += Math.round((r.duration_seconds ?? 0) / 60); }
  }
  const daily = Object.entries(days).map(([date, v]) => ({ date, ...v }));

  const limit = (quota as { limit_seconds?: number } | null)?.limit_seconds ?? 18000;
  const used = (quota as { used_seconds?: number } | null)?.used_seconds ?? 0;

  return ok({
    quota: { limit_seconds: limit, used_seconds: used, remaining_seconds: Math.max(0, limit - used) },
    totals: {
      jobs: rows.length,
      completed: completed.length,
      failed: rows.filter((r) => r.status === 'failed').length,
      minutes: Math.round(completed.reduce((s, r) => s + (r.duration_seconds ?? 0), 0) / 60),
    },
    by_source: bySource,
    daily,
  });
}
