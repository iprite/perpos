/**
 * /api/admin/module-registry/grants
 *
 * GET    ?module_key=xxx  → list all users with grant status + LINE connected status
 * POST   { module_key, user_id, is_enabled }  → upsert grant
 * DELETE { module_key, user_id }              → remove grant
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '../../../_lib/auth';
import { createAdminClient } from '../../../_lib/supabase';

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (!auth.ok) return auth.res;

  const moduleKey = req.nextUrl.searchParams.get('module_key');
  if (!moduleKey) return NextResponse.json({ error: 'missing module_key' }, { status: 400 });

  const admin = createAdminClient();

  // All profiles with email + LINE status
  const { data: profiles, error: profErr } = await admin
    .from('profiles')
    .select('id, email, role, is_active, line_user_id')
    .order('email');

  if (profErr) return NextResponse.json({ error: profErr.message }, { status: 500 });

  // Current grants for this module
  const { data: grants } = await admin
    .from('personal_module_grants')
    .select('user_id, is_enabled, granted_by, created_at')
    .eq('module_key', moduleKey);

  const grantMap = new Map((grants ?? []).map(g => [g.user_id, g]));

  const users = (profiles ?? []).map(p => ({
    id:            p.id,
    email:         p.email,
    role:          p.role,
    is_active:     p.is_active,
    line_connected: !!p.line_user_id,
    grant:         grantMap.get(p.id) ?? null,
  }));

  return NextResponse.json({ ok: true, users });
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (!auth.ok) return auth.res;

  const body = await req.json().catch(() => null) as Record<string, unknown> | null;
  const { module_key, user_id, is_enabled } = body ?? {};

  if (!module_key || typeof module_key !== 'string') return NextResponse.json({ error: 'missing module_key' }, { status: 400 });
  if (!user_id   || typeof user_id   !== 'string') return NextResponse.json({ error: 'missing user_id'   }, { status: 400 });

  const admin = createAdminClient();

  // Verify module is personal
  const { data: mod } = await admin
    .from('module_registry')
    .select('is_personal')
    .eq('key', module_key)
    .maybeSingle();

  if (!mod) return NextResponse.json({ error: 'module not found' }, { status: 404 });
  if (!(mod as Record<string, unknown>).is_personal)
    return NextResponse.json({ error: 'module is not personal' }, { status: 400 });

  const { data, error } = await admin
    .from('personal_module_grants')
    .upsert({
      module_key,
      user_id,
      granted_by: auth.userId,
      is_enabled: is_enabled !== false,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'module_key,user_id' })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, grant: data });
}

export async function DELETE(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (!auth.ok) return auth.res;

  const body = await req.json().catch(() => null) as Record<string, unknown> | null;
  const { module_key, user_id } = body ?? {};

  if (!module_key || typeof module_key !== 'string') return NextResponse.json({ error: 'missing module_key' }, { status: 400 });
  if (!user_id   || typeof user_id   !== 'string') return NextResponse.json({ error: 'missing user_id'   }, { status: 400 });

  const admin = createAdminClient();
  const { error } = await admin
    .from('personal_module_grants')
    .delete()
    .eq('module_key', module_key)
    .eq('user_id', user_id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
