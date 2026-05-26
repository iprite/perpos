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
  const { data, error } = await admin
    .from('crm_solutions')
    .select('*, client:crm_clients(id, name)')
    .eq('id', id)
    .eq('org_id', orgId)
    .single();

  if (error || !data) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json(data);
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

  // Fetch current status before update to detect changes
  const { data: before } = await admin
    .from('crm_solutions')
    .select('status')
    .eq('id', id)
    .eq('org_id', orgId)
    .single();

  const { data, error } = await admin
    .from('crm_solutions')
    .update(body)
    .eq('id', id)
    .eq('org_id', orgId)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Auto-log status changes
  if (body.status && before && body.status !== before.status) {
    const STATUS_LABEL: Record<string, string> = {
      lead: 'Lead', proposal: 'Proposal', in_progress: 'In Progress',
      on_hold: 'On Hold', completed: 'Completed', cancelled: 'Cancelled',
    };
    await admin.from('crm_solution_notes').insert({
      solution_id: id,
      org_id:      orgId,
      content:     `เปลี่ยน status: ${STATUS_LABEL[before.status] ?? before.status} → ${STATUS_LABEL[body.status] ?? body.status}`,
      note_type:   'status_change',
      created_by:  auth.userId,
    });
  }

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
    .from('crm_solutions')
    .delete()
    .eq('id', id)
    .eq('org_id', orgId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
