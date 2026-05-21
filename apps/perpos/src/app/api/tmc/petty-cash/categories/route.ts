import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '../../../_lib/supabase';
import { requireTmcMember, canWriteFinance } from '../../_lib';

/** GET ?orgId= → active categories sorted */
export async function GET(req: NextRequest) {
  const orgId = req.nextUrl.searchParams.get('orgId') ?? '';
  if (!orgId) return NextResponse.json({ error: 'missing orgId' }, { status: 400 });

  const auth = await requireTmcMember(req, orgId);
  if (!auth.ok) return auth.res;

  const { data, error } = await auth.rls
    .from('tmc_petty_cash_categories')
    .select('id, name, sort_order, is_active')
    .eq('org_id', orgId)
    .order('sort_order')
    .order('name');

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

/** POST → create */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  const { orgId, name } = body as Record<string, string>;
  if (!orgId || !name?.trim()) return NextResponse.json({ error: 'missing orgId or name' }, { status: 400 });

  const auth = await requireTmcMember(req, orgId);
  if (!auth.ok) return auth.res;
  if (!canWriteFinance(auth.role)) return NextResponse.json({ error: 'ไม่มีสิทธิ์' }, { status: 403 });

  // next sort_order
  const { data: last } = await auth.rls
    .from('tmc_petty_cash_categories')
    .select('sort_order')
    .eq('org_id', orgId)
    .order('sort_order', { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextOrder = ((last as Record<string, number> | null)?.sort_order ?? 0) + 1;

  const admin = createAdminClient();
  const { data, error } = await admin
    .from('tmc_petty_cash_categories')
    .insert({ org_id: orgId, name: name.trim(), sort_order: nextOrder })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}

/** PATCH → rename or toggle is_active */
export async function PATCH(req: NextRequest) {
  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  const { orgId, id, name, is_active } = body as Record<string, string>;
  if (!orgId || !id) return NextResponse.json({ error: 'missing orgId or id' }, { status: 400 });

  const auth = await requireTmcMember(req, orgId);
  if (!auth.ok) return auth.res;
  if (!canWriteFinance(auth.role)) return NextResponse.json({ error: 'ไม่มีสิทธิ์' }, { status: 403 });

  const patch: Record<string, unknown> = {};
  if (name !== undefined)      patch.name = name.trim();
  if (is_active !== undefined) patch.is_active = is_active;

  const admin = createAdminClient();
  const { data, error } = await admin
    .from('tmc_petty_cash_categories')
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
  const p   = req.nextUrl.searchParams;
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
    .from('tmc_petty_cash_categories')
    .delete()
    .eq('id', id)
    .eq('org_id', orgId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
