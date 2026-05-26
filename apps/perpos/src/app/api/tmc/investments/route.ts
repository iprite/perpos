import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '../../_lib/supabase';
import { requireTmcMember, canWriteFinance } from '../_lib';
import { recordMetric } from '@/lib/metrics';

/** GET ?orgId= → list all investment configs */
export async function GET(req: NextRequest) {
  const t0    = Date.now();
  const orgId = req.nextUrl.searchParams.get('orgId') ?? '';
  if (!orgId) return NextResponse.json({ error: 'missing orgId' }, { status: 400 });

  const auth = await requireTmcMember(req, orgId);
  if (!auth.ok) return auth.res;

  const { data, error } = await auth.rls
    .from('tmc_property_investments')
    .select('*')
    .eq('org_id', orgId)
    .order('starts_at');

  if (error) {
    void recordMetric({ orgId, route: '/api/tmc/investments', method: 'GET', status: 500, t0 });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  void recordMetric({ orgId, route: '/api/tmc/investments', method: 'GET', status: 200, t0 });
  return NextResponse.json(data ?? []);
}

/** POST → create/upsert investment config */
export async function POST(req: NextRequest) {
  const t0   = Date.now();
  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  const { orgId, property_code, investment_amount, annual_rate, starts_at, ends_at, note } = body as Record<string, string>;

  if (!orgId || !property_code || !investment_amount || !starts_at) {
    return NextResponse.json({ error: 'missing required fields' }, { status: 400 });
  }

  const auth = await requireTmcMember(req, orgId);
  if (!auth.ok) return auth.res;
  if (!canWriteFinance(auth.role)) return NextResponse.json({ error: 'ไม่มีสิทธิ์' }, { status: 403 });

  const admin = createAdminClient();
  const { data, error } = await admin
    .from('tmc_property_investments')
    .upsert({
      org_id: orgId,
      property_code,
      investment_amount: Number(investment_amount),
      annual_rate: annual_rate ? Number(annual_rate) : 0.08,
      starts_at,
      ends_at: ends_at || null,
      note: note || null,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'org_id,property_code' })
    .select()
    .single();

  if (error) {
    void recordMetric({ orgId, route: '/api/tmc/investments', method: 'POST', status: 500, t0 });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  void recordMetric({ orgId, route: '/api/tmc/investments', method: 'POST', status: 201, t0 });
  return NextResponse.json(data, { status: 201 });
}

/** PATCH → update investment config by id */
export async function PATCH(req: NextRequest) {
  const t0   = Date.now();
  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  const { orgId, id, investment_amount, annual_rate, starts_at, ends_at, note } = body as Record<string, string>;

  if (!orgId || !id) return NextResponse.json({ error: 'missing orgId or id' }, { status: 400 });

  const auth = await requireTmcMember(req, orgId);
  if (!auth.ok) return auth.res;
  if (!canWriteFinance(auth.role)) return NextResponse.json({ error: 'ไม่มีสิทธิ์' }, { status: 403 });

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (investment_amount !== undefined) patch.investment_amount = Number(investment_amount);
  if (annual_rate       !== undefined) patch.annual_rate       = Number(annual_rate);
  if (starts_at         !== undefined) patch.starts_at         = starts_at;
  if (ends_at           !== undefined) patch.ends_at           = ends_at || null;
  if (note              !== undefined) patch.note              = note || null;

  const admin = createAdminClient();
  const { data, error } = await admin
    .from('tmc_property_investments')
    .update(patch)
    .eq('id', id)
    .eq('org_id', orgId)
    .select()
    .single();

  if (error) {
    void recordMetric({ orgId, route: '/api/tmc/investments', method: 'PATCH', status: 500, t0 });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  void recordMetric({ orgId, route: '/api/tmc/investments', method: 'PATCH', status: 200, t0 });
  return NextResponse.json(data);
}
