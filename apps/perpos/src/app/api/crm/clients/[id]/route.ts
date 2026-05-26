import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '../../../_lib/supabase';
import { requireCrmMember, canWrite } from '../../_lib';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const orgId = req.nextUrl.searchParams.get('orgId');
  if (!orgId) return NextResponse.json({ error: 'orgId required' }, { status: 400 });

  const auth = await requireCrmMember(req, orgId);
  if (!auth.ok) return auth.res;

  const admin = createAdminClient();
  const { data: client, error } = await admin
    .from('crm_clients')
    .select('*')
    .eq('id', id)
    .eq('org_id', orgId)
    .single();

  if (error || !client) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const { data: solutions } = await admin
    .from('crm_solutions')
    .select('*')
    .eq('client_id', id)
    .order('created_at', { ascending: false });

  return NextResponse.json({ ...client, solutions: solutions ?? [] });
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const orgId = req.nextUrl.searchParams.get('orgId');
  if (!orgId) return NextResponse.json({ error: 'orgId required' }, { status: 400 });

  const auth = await requireCrmMember(req, orgId);
  if (!auth.ok) return auth.res;
  if (!canWrite(auth.role)) return NextResponse.json({ error: 'ไม่มีสิทธิ์เขียน' }, { status: 403 });

  const body = await req.json();
  const admin = createAdminClient();
  const { data, error } = await admin
    .from('crm_clients')
    .update(body)
    .eq('id', id)
    .eq('org_id', orgId)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const orgId = req.nextUrl.searchParams.get('orgId');
  if (!orgId) return NextResponse.json({ error: 'orgId required' }, { status: 400 });

  const auth = await requireCrmMember(req, orgId);
  if (!auth.ok) return auth.res;
  if (!canWrite(auth.role)) return NextResponse.json({ error: 'ไม่มีสิทธิ์เขียน' }, { status: 403 });

  const admin = createAdminClient();
  const { error } = await admin
    .from('crm_clients')
    .delete()
    .eq('id', id)
    .eq('org_id', orgId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
