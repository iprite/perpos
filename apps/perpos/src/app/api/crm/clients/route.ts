import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '../../_lib/supabase';
import { requireCrmMember, canWrite } from '../_lib';

export async function GET(req: NextRequest) {
  const orgId = req.nextUrl.searchParams.get('orgId');
  if (!orgId) return NextResponse.json({ error: 'orgId required' }, { status: 400 });

  const auth = await requireCrmMember(req, orgId);
  if (!auth.ok) return auth.res;

  const admin = createAdminClient();
  const status = req.nextUrl.searchParams.get('status') ?? '';
  const q = req.nextUrl.searchParams.get('q') ?? '';

  let query = admin
    .from('crm_clients')
    .select('*, solutions_count:crm_solutions(count)')
    .eq('org_id', orgId)
    .order('created_at', { ascending: false });

  if (status) query = query.eq('status', status);
  if (q) query = query.ilike('name', `%${q}%`);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function POST(req: NextRequest) {
  const orgId = req.nextUrl.searchParams.get('orgId');
  if (!orgId) return NextResponse.json({ error: 'orgId required' }, { status: 400 });

  const auth = await requireCrmMember(req, orgId);
  if (!auth.ok) return auth.res;
  if (!canWrite(auth.role)) return NextResponse.json({ error: 'ไม่มีสิทธิ์เขียน' }, { status: 403 });

  const body = await req.json();
  const admin = createAdminClient();
  const { data, error } = await admin
    .from('crm_clients')
    .insert({ ...body, org_id: orgId, created_by: auth.userId })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}
