import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '../../_lib/supabase';
import { requireTmcMember, canWriteFinance } from '../_lib';
import { setAuditContext } from '../../_lib/audit';
import { recordMetric } from '@/lib/metrics';

/** GET ?orgId= [&all=1] → accounts sorted */
export async function GET(req: NextRequest) {
  const t0 = Date.now();
  const orgId = req.nextUrl.searchParams.get('orgId') ?? '';
  if (!orgId) return NextResponse.json({ error: 'missing orgId' }, { status: 400 });

  const auth = await requireTmcMember(req, orgId);
  if (!auth.ok) return auth.res;

  const all = req.nextUrl.searchParams.get('all') === '1';

  let q = auth.rls
    .from('tmc_accounts')
    .select('*')
    .eq('org_id', orgId)
    .order('sort_order');

  if (!all) q = q.eq('is_active', true);

  const { data } = await q;
  void recordMetric({ orgId, route: '/api/tmc/accounts', method: req.method, status: 200, t0 });
  return NextResponse.json(data ?? []);
}

/** POST → create account */
export async function POST(req: NextRequest) {
  const t0 = Date.now();
  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  const { orgId, name, account_type, bank_name, account_no } = body as Record<string, string>;
  if (!orgId || !name?.trim()) return NextResponse.json({ error: 'missing orgId or name' }, { status: 400 });

  const auth = await requireTmcMember(req, orgId);
  if (!auth.ok) return auth.res;
  if (!canWriteFinance(auth.role)) return NextResponse.json({ error: 'ไม่มีสิทธิ์' }, { status: 403 });

  await setAuditContext(req, auth.userId, orgId);

  const { data: last } = await auth.rls
    .from('tmc_accounts')
    .select('sort_order')
    .eq('org_id', orgId)
    .order('sort_order', { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextOrder = ((last as Record<string, number> | null)?.sort_order ?? 0) + 1;

  const admin = createAdminClient();
  const { data, error } = await admin
    .from('tmc_accounts')
    .insert({
      org_id: orgId,
      name: name.trim(),
      account_type: account_type || 'savings',
      bank_name: bank_name?.trim() || null,
      account_no: account_no?.trim() || null,
      sort_order: nextOrder,
    })
    .select()
    .single();

  if (error) {
    void recordMetric({ orgId, route: '/api/tmc/accounts', method: req.method, status: 500, t0 });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  void recordMetric({ orgId, route: '/api/tmc/accounts', method: req.method, status: 201, t0 });
  return NextResponse.json(data, { status: 201 });
}

/** PATCH → edit account */
export async function PATCH(req: NextRequest) {
  const t0 = Date.now();
  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  const { orgId, id, name, account_type, bank_name, account_no, is_active } = body as Record<string, string>;
  if (!orgId || !id) return NextResponse.json({ error: 'missing orgId or id' }, { status: 400 });

  const auth = await requireTmcMember(req, orgId);
  if (!auth.ok) return auth.res;
  if (!canWriteFinance(auth.role)) return NextResponse.json({ error: 'ไม่มีสิทธิ์' }, { status: 403 });

  await setAuditContext(req, auth.userId, orgId);

  const patch: Record<string, unknown> = {};
  if (name         !== undefined) patch.name         = name.trim();
  if (account_type !== undefined) patch.account_type = account_type;
  if (bank_name    !== undefined) patch.bank_name    = bank_name?.trim() || null;
  if (account_no   !== undefined) patch.account_no   = account_no?.trim() || null;
  if (is_active    !== undefined) patch.is_active    = is_active;

  const admin = createAdminClient();
  const { data, error } = await admin
    .from('tmc_accounts')
    .update(patch)
    .eq('id', id)
    .eq('org_id', orgId)
    .select()
    .single();

  if (error) {
    void recordMetric({ orgId, route: '/api/tmc/accounts', method: req.method, status: 500, t0 });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  void recordMetric({ orgId, route: '/api/tmc/accounts', method: req.method, status: 200, t0 });
  return NextResponse.json(data);
}

/** DELETE ?id=&orgId= → soft delete (set is_active = false) */
export async function DELETE(req: NextRequest) {
  const t0    = Date.now();
  const p     = req.nextUrl.searchParams;
  const id    = p.get('id')    ?? '';
  const orgId = p.get('orgId') ?? '';
  if (!id || !orgId) return NextResponse.json({ error: 'missing id or orgId' }, { status: 400 });

  const auth = await requireTmcMember(req, orgId);
  if (!auth.ok) return auth.res;
  if (!['owner', 'admin', 'team_lead'].includes(auth.role)) {
    return NextResponse.json({ error: 'ต้องการสิทธิ์ team_lead ขึ้นไป' }, { status: 403 });
  }

  await setAuditContext(req, auth.userId, orgId);

  const admin = createAdminClient();
  const { error } = await admin
    .from('tmc_accounts')
    .update({ is_active: false })
    .eq('id', id)
    .eq('org_id', orgId);

  if (error) {
    void recordMetric({ orgId, route: '/api/tmc/accounts', method: req.method, status: 500, t0 });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  void recordMetric({ orgId, route: '/api/tmc/accounts', method: req.method, status: 200, t0 });
  return NextResponse.json({ ok: true });
}
