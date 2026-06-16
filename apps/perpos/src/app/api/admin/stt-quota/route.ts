/**
 * Admin: ตั้ง/ดูโควต้าแกะเสียงรายคน (วินาที)
 *   GET  /api/admin/stt-quota?profileId=<id>   — ดูโควต้า + การใช้ล่าสุด
 *   PUT  /api/admin/stt-quota  body { profileId, limitSeconds }  — ตั้ง limit (ปรับ/เติม)
 */

import { NextRequest } from 'next/server';
import { requireAdmin } from '../../_lib/auth';
import { createAdminClient } from '../../_lib/supabase';
import { ok, Err } from '../../_lib/response';
import { logAdminAction } from '../../_lib/admin-audit';

const MAX_LIMIT = 6_000_000; // ~100,000 นาที กันตั้งค่าพลาด

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (!auth.ok) return auth.res;

  const profileId = req.nextUrl.searchParams.get('profileId');
  if (!profileId) return Err.missingField('profileId');

  const admin = createAdminClient();
  const { data: quota } = await admin
    .from('stt_quota')
    .select('limit_seconds, used_seconds, updated_at')
    .eq('profile_id', profileId)
    .maybeSingle();
  const { data: usage } = await admin
    .from('stt_usage_transactions')
    .select('kind, duration_seconds, source, created_at, job_id')
    .eq('profile_id', profileId)
    .order('created_at', { ascending: false })
    .limit(20);

  const limit = (quota as { limit_seconds?: number } | null)?.limit_seconds ?? 18000;
  const used = (quota as { used_seconds?: number } | null)?.used_seconds ?? 0;
  return ok({ profile_id: profileId, limit_seconds: limit, used_seconds: used, remaining_seconds: Math.max(0, limit - used), usage: usage ?? [] });
}

export async function PUT(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (!auth.ok) return auth.res;

  const body = await req.json().catch(() => null);
  const { profileId, limitSeconds } = body ?? {};
  if (!profileId) return Err.missingField('profileId');
  if (typeof limitSeconds !== 'number' || !Number.isFinite(limitSeconds)) {
    return Err.invalidFormat('limitSeconds', 'ต้องเป็นจำนวนวินาที (number)');
  }
  if (limitSeconds < 0 || limitSeconds > MAX_LIMIT) {
    return Err.outOfRange('limitSeconds', 0, MAX_LIMIT);
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from('stt_quota')
    .upsert({ profile_id: profileId, limit_seconds: Math.round(limitSeconds), updated_at: new Date().toISOString() }, { onConflict: 'profile_id' })
    .select('limit_seconds, used_seconds')
    .single();
  if (error) return Err.dbError(error);

  const limit = data.limit_seconds as number;
  const used = data.used_seconds as number;

  await logAdminAction(req, auth.userId, {
    action: 'stt.quota_set',
    targetType: 'user',
    targetId: profileId,
    metadata: { limit_seconds: limit },
  });

  return ok({ profile_id: profileId, limit_seconds: limit, used_seconds: used, remaining_seconds: Math.max(0, limit - used) });
}
