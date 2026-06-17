/**
 * Admin: System Settings / Feature Flags (key/value)
 *   GET  /api/admin/settings              — คืนค่า settings ทั้งหมด (map key → value)
 *   PUT  /api/admin/settings  body { key, value, description? }  — upsert 1 key
 *
 * เข้าถึงผ่าน service role เท่านั้น (requireAdmin = super_admin)
 */

import { NextRequest } from 'next/server';
import { requireAdmin } from '../../_lib/auth';
import { createAdminClient } from '../../_lib/supabase';
import { ok, Err } from '../../_lib/response';
import { logAdminAction } from '../../_lib/admin-audit';

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (!auth.ok) return auth.res;

  const admin = createAdminClient();
  const { data, error } = await admin
    .from('app_settings')
    .select('key, value, description, updated_at');
  if (error) return Err.dbError(error);

  const map: Record<string, { value: unknown; description: string | null; updated_at: string }> = {};
  for (const row of (data ?? []) as Record<string, unknown>[]) {
    map[row.key as string] = {
      value: row.value,
      description: (row.description as string | null) ?? null,
      updated_at: row.updated_at as string,
    };
  }
  return ok({ settings: map });
}

export async function PUT(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (!auth.ok) return auth.res;

  const body = await req.json().catch(() => null);
  const key = body?.key;
  if (typeof key !== 'string' || !key.trim()) return Err.missingField('key');
  if (!('value' in (body ?? {}))) return Err.missingField('value');

  const admin = createAdminClient();
  const { data, error } = await admin
    .from('app_settings')
    .upsert(
      {
        key: key.trim(),
        value: body.value,
        description: typeof body.description === 'string' ? body.description : null,
        updated_by: auth.userId,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'key' },
    )
    .select('key, value, description, updated_at')
    .single();
  if (error) return Err.dbError(error);

  await logAdminAction(req, auth.userId, {
    action: 'settings.update',
    targetType: 'app_setting',
    targetId: key.trim(),
    targetLabel: key.trim(),
    metadata: { value: body.value },
  });

  return ok(data);
}
