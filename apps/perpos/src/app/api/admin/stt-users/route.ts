/**
 * Super admin: จัดการผู้ใช้ LINE ของระบบแกะเสียง
 *   GET /api/admin/stt-users          — รายชื่อผู้ใช้ LINE + โควต้า + สถานะ
 *   PUT /api/admin/stt-users          body { profileId, limitSeconds?, isActive? }
 */

import { NextRequest } from 'next/server';
import { requireAdmin } from '../../_lib/auth';
import { createAdminClient } from '../../_lib/supabase';
import { ok, Err } from '../../_lib/response';
import { logAdminAction } from '../../_lib/admin-audit';

const SHADOW_DOMAIN = '@stt-line.perpos.io';
const MAX_LIMIT = 6_000_000;

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (!auth.ok) return auth.res;

  const admin = createAdminClient();
  const { data: profiles, error } = await admin
    .from('profiles')
    .select('id, display_name, email, is_active, created_at, line_user_id, line_picture_url')
    .not('line_user_id', 'is', null)
    .order('created_at', { ascending: false })
    .limit(500);
  if (error) return Err.dbError(error);

  // backfill รูปโปรไฟล์ LINE ที่ยังไม่มี (ผู้ใช้เก่าที่ provision ก่อนเก็บรูป) — ดึงจาก LINE profile API ครั้งเดียวแล้ว cache ลง DB
  const pictureById = new Map<string, string | null>();
  for (const p of profiles ?? []) pictureById.set(p.id as string, (p.line_picture_url as string | null) ?? null);
  const missing = (profiles ?? []).filter((p) => !p.line_picture_url && p.line_user_id).slice(0, 50);
  if (missing.length) {
    const token = process.env.LINE_MESSAGING_CHANNEL_ACCESS_TOKEN ?? '';
    await Promise.all(
      missing.map(async (p) => {
        try {
          const res = await fetch(`https://api.line.me/v2/bot/profile/${p.line_user_id}`, { headers: { Authorization: `Bearer ${token}` } });
          if (!res.ok) return;
          const j = (await res.json()) as { pictureUrl?: string };
          const url = j.pictureUrl ?? null;
          if (url) {
            pictureById.set(p.id as string, url);
            await admin.from('profiles').update({ line_picture_url: url }).eq('id', p.id as string);
          }
        } catch {
          /* ignore — รูปไม่ใช่ของสำคัญ */
        }
      }),
    );
  }

  const ids = (profiles ?? []).map((p) => p.id as string);
  const quotaById = new Map<string, { limit_seconds: number; used_seconds: number }>();
  if (ids.length) {
    const { data: quotas } = await admin.from('stt_quota').select('profile_id, limit_seconds, used_seconds').in('profile_id', ids);
    for (const q of quotas ?? []) quotaById.set(q.profile_id as string, { limit_seconds: q.limit_seconds as number, used_seconds: q.used_seconds as number });
  }

  const items = (profiles ?? []).map((p) => {
    const q = quotaById.get(p.id as string);
    const limit = q?.limit_seconds ?? 18000;
    const used = q?.used_seconds ?? 0;
    const email = String(p.email ?? '');
    return {
      profile_id: p.id,
      display_name: p.display_name ?? 'ผู้ใช้ LINE',
      picture_url: pictureById.get(p.id as string) ?? null,
      claimed: !email.endsWith(SHADOW_DOMAIN),
      email: email.endsWith(SHADOW_DOMAIN) ? null : email,
      is_active: p.is_active,
      created_at: p.created_at,
      limit_seconds: limit,
      used_seconds: used,
      remaining_seconds: Math.max(0, limit - used),
    };
  });
  return ok({ items });
}

export async function PUT(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (!auth.ok) return auth.res;

  const body = await req.json().catch(() => null);
  const { profileId, limitSeconds, isActive } = body ?? {};
  if (!profileId) return Err.missingField('profileId');

  const admin = createAdminClient();

  if (typeof limitSeconds === 'number' && Number.isFinite(limitSeconds)) {
    if (limitSeconds < 0 || limitSeconds > MAX_LIMIT) return Err.outOfRange('limitSeconds', 0, MAX_LIMIT);
    const { error } = await admin
      .from('stt_quota')
      .upsert({ profile_id: profileId, limit_seconds: Math.round(limitSeconds), updated_at: new Date().toISOString() }, { onConflict: 'profile_id' });
    if (error) return Err.dbError(error);
  }

  if (typeof isActive === 'boolean') {
    const { error } = await admin.from('profiles').update({ is_active: isActive }).eq('id', profileId);
    if (error) return Err.dbError(error);
  }

  await logAdminAction(req, auth.userId, {
    action: 'stt.user_update',
    targetType: 'user',
    targetId: profileId,
    metadata: {
      ...(typeof limitSeconds === 'number' ? { limit_seconds: Math.round(limitSeconds) } : {}),
      ...(typeof isActive === 'boolean' ? { is_active: isActive } : {}),
    },
  });

  return ok({ updated: true });
}
