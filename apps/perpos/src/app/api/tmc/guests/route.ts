import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '../../_lib/supabase';
import { requireTmcMember } from '../_lib';
import { recordMetric } from '@/lib/metrics';

export async function GET(req: NextRequest) {
  const t0 = Date.now();
  const p = req.nextUrl.searchParams;
  const orgId = p.get('orgId') ?? '';
  if (!orgId) return NextResponse.json({ error: 'missing orgId' }, { status: 400 });

  const auth = await requireTmcMember(req, orgId);
  if (!auth.ok) return auth.res;

  let q = auth.rls
    .from('tmc_guests')
    .select('*, tmc_stays(id, check_in, check_out, property_code, room_rate, stay_type)')
    .eq('org_id', orgId)
    .order('created_at', { ascending: false });

  const search = p.get('search');
  if (search) q = q.or(`first_name.ilike.%${search}%,last_name.ilike.%${search}%,tel.ilike.%${search}%,nickname.ilike.%${search}%`);

  const { data, error } = await q.limit(100);
  if (error) {
    void recordMetric({ orgId, route: '/api/tmc/guests', method: req.method, status: 500, t0 });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  void recordMetric({ orgId, route: '/api/tmc/guests', method: req.method, status: 200, t0 });
  return NextResponse.json(data ?? []);
}

export async function POST(req: NextRequest) {
  const t0 = Date.now();
  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  const orgId = String(body.orgId ?? '');
  if (!orgId) return NextResponse.json({ error: 'missing orgId' }, { status: 400 });

  const auth = await requireTmcMember(req, orgId);
  if (!auth.ok) return auth.res;

  const admin = createAdminClient();
  const { data, error } = await admin
    .from('tmc_guests')
    .insert({
      org_id: orgId,
      first_name: body.firstName,
      last_name: body.lastName ?? null,
      nickname: body.nickname ?? null,
      tel: body.tel ?? null,
      guest_type: body.guestType ?? 'regular',
      notes: body.notes ?? null,
    })
    .select()
    .single();

  if (error) {
    void recordMetric({ orgId, route: '/api/tmc/guests', method: req.method, status: 500, t0 });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  void recordMetric({ orgId, route: '/api/tmc/guests', method: req.method, status: 201, t0 });
  return NextResponse.json(data, { status: 201 });
}

export async function PUT(req: NextRequest) {
  const t0 = Date.now();
  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  const { id, orgId, ...fields } = body as Record<string, string>;
  if (!id || !orgId) return NextResponse.json({ error: 'missing id or orgId' }, { status: 400 });

  const auth = await requireTmcMember(req, orgId);
  if (!auth.ok) return auth.res;

  const admin = createAdminClient();
  const { data, error } = await admin
    .from('tmc_guests')
    .update({
      first_name: fields.firstName,
      last_name: fields.lastName ?? null,
      nickname: fields.nickname ?? null,
      tel: fields.tel ?? null,
      guest_type: fields.guestType ?? 'regular',
      notes: fields.notes ?? null,
    })
    .eq('id', id)
    .eq('org_id', orgId)
    .select()
    .single();

  if (error) {
    void recordMetric({ orgId, route: '/api/tmc/guests', method: req.method, status: 500, t0 });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  void recordMetric({ orgId, route: '/api/tmc/guests', method: req.method, status: 200, t0 });
  return NextResponse.json(data);
}
