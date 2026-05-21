import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '../../_lib/supabase';
import { requireTmcMember, canWriteFinance } from '../_lib';

/** GET ?orgId= → list active properties */
export async function GET(req: NextRequest) {
  const orgId = req.nextUrl.searchParams.get('orgId') ?? '';
  if (!orgId) return NextResponse.json({ error: 'missing orgId' }, { status: 400 });

  // all=1 → include inactive (for management UI)
  const all = req.nextUrl.searchParams.get('all') === '1';

  const auth = await requireTmcMember(req, orgId);
  if (!auth.ok) return auth.res;

  let q = auth.rls
    .from('tmc_properties')
    .select('id, code, name, is_active, sort_order')
    .eq('org_id', orgId)
    .order('sort_order')
    .order('code');

  if (!all) q = q.eq('is_active', true) as typeof q;

  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

/** POST → create new property */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({})) as Record<string, string>;
  const { orgId, code, name } = body;
  if (!orgId || !code?.trim() || !name?.trim()) {
    return NextResponse.json({ error: 'missing orgId, code, or name' }, { status: 400 });
  }

  const auth = await requireTmcMember(req, orgId);
  if (!auth.ok) return auth.res;
  if (!canWriteFinance(auth.role)) return NextResponse.json({ error: 'ไม่มีสิทธิ์' }, { status: 403 });

  const { data: last } = await auth.rls
    .from('tmc_properties')
    .select('sort_order')
    .eq('org_id', orgId)
    .order('sort_order', { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextOrder = ((last as Record<string, number> | null)?.sort_order ?? 0) + 1;

  const admin = createAdminClient();
  const { data, error } = await admin
    .from('tmc_properties')
    .insert({ org_id: orgId, code: code.trim(), name: name.trim(), sort_order: nextOrder })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}

/** PATCH → edit code/name or toggle is_active */
export async function PATCH(req: NextRequest) {
  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  const { orgId, id, code, name, is_active } = body as Record<string, string>;
  if (!orgId || !id) return NextResponse.json({ error: 'missing orgId or id' }, { status: 400 });

  const auth = await requireTmcMember(req, orgId);
  if (!auth.ok) return auth.res;
  if (!canWriteFinance(auth.role)) return NextResponse.json({ error: 'ไม่มีสิทธิ์' }, { status: 403 });

  const patch: Record<string, unknown> = {};
  if (code      !== undefined) patch.code      = code.trim();
  if (name      !== undefined) patch.name      = name.trim();
  if (is_active !== undefined) patch.is_active = is_active;

  const admin = createAdminClient();
  const { data, error } = await admin
    .from('tmc_properties')
    .update(patch)
    .eq('id', id)
    .eq('org_id', orgId)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

/** DELETE ?id=&orgId= */
export async function DELETE(req: NextRequest) {
  const p     = req.nextUrl.searchParams;
  const id    = p.get('id')    ?? '';
  const orgId = p.get('orgId') ?? '';
  if (!id || !orgId) return NextResponse.json({ error: 'missing id or orgId' }, { status: 400 });

  const auth = await requireTmcMember(req, orgId);
  if (!auth.ok) return auth.res;
  if (!['owner', 'admin', 'team_lead'].includes(auth.role)) {
    return NextResponse.json({ error: 'ต้องการสิทธิ์ team_lead ขึ้นไป' }, { status: 403 });
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from('tmc_properties')
    .delete()
    .eq('id', id)
    .eq('org_id', orgId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
