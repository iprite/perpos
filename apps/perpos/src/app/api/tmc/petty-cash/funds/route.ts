import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '../../../_lib/supabase';
import { requireTmcMember, canWriteFinance } from '../../_lib';

/** GET /api/tmc/petty-cash/funds?orgId=xxx  → list all funds for the org */
export async function GET(req: NextRequest) {
  const orgId = req.nextUrl.searchParams.get('orgId') ?? '';
  if (!orgId) return NextResponse.json({ error: 'missing orgId' }, { status: 400 });

  const auth = await requireTmcMember(req, orgId);
  if (!auth.ok) return auth.res;

  const { data, error } = await auth.rls
    .from('tmc_petty_cash_funds')
    .select('*')
    .eq('org_id', orgId)
    .eq('is_active', true)
    .order('created_at');

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

/** POST /api/tmc/petty-cash/funds  → create a new petty cash fund */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({})) as Record<string, string>;
  const { orgId, name, note } = body;
  if (!orgId || !name) return NextResponse.json({ error: 'missing orgId or name' }, { status: 400 });

  const auth = await requireTmcMember(req, orgId);
  if (!auth.ok) return auth.res;
  if (!canWriteFinance(auth.role)) {
    return NextResponse.json({ error: 'ต้องการสิทธิ์ team_lead ขึ้นไป' }, { status: 403 });
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from('tmc_petty_cash_funds')
    .insert({ org_id: orgId, name: name.trim(), note: note || null })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}

/** PATCH /api/tmc/petty-cash/funds  → rename or deactivate a fund */
export async function PATCH(req: NextRequest) {
  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  const { orgId, id, name, note, is_active } = body as Record<string, string>;
  if (!orgId || !id) return NextResponse.json({ error: 'missing orgId or id' }, { status: 400 });

  const auth = await requireTmcMember(req, orgId);
  if (!auth.ok) return auth.res;
  if (!canWriteFinance(auth.role)) {
    return NextResponse.json({ error: 'ต้องการสิทธิ์ team_lead ขึ้นไป' }, { status: 403 });
  }

  const admin = createAdminClient();
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (name !== undefined) patch.name = name;
  if (note !== undefined) patch.note = note || null;
  if (is_active !== undefined) patch.is_active = is_active;

  const { data, error } = await admin
    .from('tmc_petty_cash_funds')
    .update(patch)
    .eq('id', id)
    .eq('org_id', orgId)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
