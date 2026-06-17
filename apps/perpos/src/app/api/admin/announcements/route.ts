/**
 * Admin: Announcements (ประกาศถึงผู้ใช้ — in-app banner)
 *   GET    /api/admin/announcements                 — รายการทั้งหมด
 *   POST   /api/admin/announcements  body { title, body?, level?, is_active?, starts_at?, ends_at? }
 *   PUT    /api/admin/announcements  body { id, ...fields }
 *   DELETE /api/admin/announcements?id=<id>
 */

import { NextRequest } from 'next/server';
import { requireAdmin } from '../../_lib/auth';
import { createAdminClient } from '../../_lib/supabase';
import { ok, created, Err } from '../../_lib/response';
import { logAdminAction } from '../../_lib/admin-audit';

const LEVELS = ['info', 'success', 'warning', 'critical'] as const;

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (!auth.ok) return auth.res;

  const admin = createAdminClient();
  const { data, error } = await admin
    .from('announcements')
    .select('id, title, body, level, is_active, starts_at, ends_at, created_at, updated_at')
    .order('created_at', { ascending: false });
  if (error) return Err.dbError(error);
  return ok({ announcements: data ?? [] });
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (!auth.ok) return auth.res;

  const b = await req.json().catch(() => null);
  const title = typeof b?.title === 'string' ? b.title.trim() : '';
  if (!title) return Err.missingField('title');
  const level = LEVELS.includes(b?.level) ? b.level : 'info';

  const admin = createAdminClient();
  const { data, error } = await admin
    .from('announcements')
    .insert({
      title,
      body: typeof b?.body === 'string' ? b.body : '',
      level,
      is_active: b?.is_active !== false,
      starts_at: b?.starts_at || null,
      ends_at: b?.ends_at || null,
      created_by: auth.userId,
    })
    .select('id, title, level, is_active')
    .single();
  if (error) return Err.dbError(error);

  await logAdminAction(req, auth.userId, {
    action: 'announcement.create',
    targetType: 'announcement',
    targetId: data.id,
    targetLabel: title,
    metadata: { level },
  });
  return created(data);
}

export async function PUT(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (!auth.ok) return auth.res;

  const b = await req.json().catch(() => null);
  const id = typeof b?.id === 'string' ? b.id : '';
  if (!id) return Err.missingField('id');

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (typeof b.title === 'string') patch.title = b.title.trim();
  if (typeof b.body === 'string') patch.body = b.body;
  if (LEVELS.includes(b.level)) patch.level = b.level;
  if (typeof b.is_active === 'boolean') patch.is_active = b.is_active;
  if ('starts_at' in b) patch.starts_at = b.starts_at || null;
  if ('ends_at' in b) patch.ends_at = b.ends_at || null;

  const admin = createAdminClient();
  const { data, error } = await admin
    .from('announcements')
    .update(patch)
    .eq('id', id)
    .select('id, title, level, is_active')
    .single();
  if (error) return Err.dbError(error);

  await logAdminAction(req, auth.userId, {
    action: 'announcement.update',
    targetType: 'announcement',
    targetId: id,
    targetLabel: (data?.title as string) ?? id,
    metadata: patch,
  });
  return ok(data);
}

export async function DELETE(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (!auth.ok) return auth.res;

  const id = req.nextUrl.searchParams.get('id');
  if (!id) return Err.missingField('id');

  const admin = createAdminClient();
  const { error } = await admin.from('announcements').delete().eq('id', id);
  if (error) return Err.dbError(error);

  await logAdminAction(req, auth.userId, {
    action: 'announcement.delete',
    targetType: 'announcement',
    targetId: id,
  });
  return ok({ deleted: true });
}
