import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '../../../../_lib/supabase';
import { requireCrmMember, canWrite } from '../../../_lib';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: clientId } = await params;
  const orgId = req.nextUrl.searchParams.get('orgId');
  if (!orgId) return NextResponse.json({ error: 'orgId required' }, { status: 400 });

  const auth = await requireCrmMember(req, orgId);
  if (!auth.ok) return auth.res;

  const admin = createAdminClient();
  const { data, error } = await admin
    .from('crm_client_contacts')
    .select('*')
    .eq('client_id', clientId)
    .eq('org_id', orgId)
    .order('is_primary', { ascending: false })
    .order('created_at', { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: clientId } = await params;
  const orgId = req.nextUrl.searchParams.get('orgId');
  if (!orgId) return NextResponse.json({ error: 'orgId required' }, { status: 400 });

  const auth = await requireCrmMember(req, orgId);
  if (!auth.ok) return auth.res;
  if (!canWrite(auth.role)) return NextResponse.json({ error: 'ไม่มีสิทธิ์เขียน' }, { status: 403 });

  const body = await req.json();
  const admin = createAdminClient();

  // If setting primary, unset others first
  if (body.is_primary) {
    await admin
      .from('crm_client_contacts')
      .update({ is_primary: false })
      .eq('client_id', clientId)
      .eq('org_id', orgId);
  }

  const { data, error } = await admin
    .from('crm_client_contacts')
    .insert({ ...body, client_id: clientId, org_id: orgId })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: clientId } = await params;
  const orgId    = req.nextUrl.searchParams.get('orgId');
  const contactId = req.nextUrl.searchParams.get('contactId');
  if (!orgId || !contactId) return NextResponse.json({ error: 'orgId and contactId required' }, { status: 400 });

  const auth = await requireCrmMember(req, orgId);
  if (!auth.ok) return auth.res;
  if (!canWrite(auth.role)) return NextResponse.json({ error: 'ไม่มีสิทธิ์เขียน' }, { status: 403 });

  const body = await req.json();
  const admin = createAdminClient();

  if (body.is_primary) {
    await admin
      .from('crm_client_contacts')
      .update({ is_primary: false })
      .eq('client_id', clientId)
      .eq('org_id', orgId);
  }

  const { data, error } = await admin
    .from('crm_client_contacts')
    .update(body)
    .eq('id', contactId)
    .eq('org_id', orgId)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: clientId } = await params;
  const orgId     = req.nextUrl.searchParams.get('orgId');
  const contactId = req.nextUrl.searchParams.get('contactId');
  if (!orgId || !contactId) return NextResponse.json({ error: 'orgId and contactId required' }, { status: 400 });

  const auth = await requireCrmMember(req, orgId);
  if (!auth.ok) return auth.res;
  if (!canWrite(auth.role)) return NextResponse.json({ error: 'ไม่มีสิทธิ์เขียน' }, { status: 403 });

  const admin = createAdminClient();
  const { error } = await admin
    .from('crm_client_contacts')
    .delete()
    .eq('id', contactId)
    .eq('client_id', clientId)
    .eq('org_id', orgId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
