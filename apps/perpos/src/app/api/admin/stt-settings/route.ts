/**
 * Super admin: ตั้งค่าระดับแพลตฟอร์มของฟีเจอร์แกะเสียง/MoM
 *   GET /api/admin/stt-settings                       — ดูค่าปัจจุบัน
 *   PUT /api/admin/stt-settings  body { defaultQuotaSeconds }  — ตั้งโควต้าเริ่มต้นผู้ใช้ใหม่
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

  const admin = createAdminClient();
  const { data } = await admin
    .from('stt_settings')
    .select('default_quota_seconds, default_bot_quota_seconds, updated_at')
    .eq('id', true)
    .maybeSingle();

  return ok({
    default_quota_seconds: (data?.default_quota_seconds as number) ?? 18000,
    default_bot_quota_seconds: (data?.default_bot_quota_seconds as number) ?? 7200,
    updated_at: data?.updated_at ?? null,
  });
}

export async function PUT(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (!auth.ok) return auth.res;

  const body = await req.json().catch(() => null);
  const { defaultQuotaSeconds, defaultBotQuotaSeconds } = body ?? {};
  const patch: Record<string, unknown> = { id: true, updated_by: auth.userId, updated_at: new Date().toISOString() };

  if (defaultQuotaSeconds !== undefined) {
    if (typeof defaultQuotaSeconds !== 'number' || !Number.isFinite(defaultQuotaSeconds)) return Err.invalidFormat('defaultQuotaSeconds', 'ต้องเป็นจำนวนวินาที (number)');
    if (defaultQuotaSeconds < 0 || defaultQuotaSeconds > MAX_LIMIT) return Err.outOfRange('defaultQuotaSeconds', 0, MAX_LIMIT);
    patch.default_quota_seconds = Math.round(defaultQuotaSeconds);
  }
  if (defaultBotQuotaSeconds !== undefined) {
    if (typeof defaultBotQuotaSeconds !== 'number' || !Number.isFinite(defaultBotQuotaSeconds)) return Err.invalidFormat('defaultBotQuotaSeconds', 'ต้องเป็นจำนวนวินาที (number)');
    if (defaultBotQuotaSeconds < 0 || defaultBotQuotaSeconds > MAX_LIMIT) return Err.outOfRange('defaultBotQuotaSeconds', 0, MAX_LIMIT);
    patch.default_bot_quota_seconds = Math.round(defaultBotQuotaSeconds);
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from('stt_settings')
    .upsert(patch, { onConflict: 'id' })
    .select('default_quota_seconds, default_bot_quota_seconds, updated_at')
    .single();
  if (error) return Err.dbError(error);

  await logAdminAction(req, auth.userId, {
    action: 'stt.default_quota_set',
    targetType: 'stt_settings',
    metadata: { default_quota_seconds: data.default_quota_seconds, default_bot_quota_seconds: data.default_bot_quota_seconds },
  });

  return ok({ default_quota_seconds: data.default_quota_seconds as number, default_bot_quota_seconds: data.default_bot_quota_seconds as number, updated_at: data.updated_at });
}
