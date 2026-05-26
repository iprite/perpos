import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '../../../_lib/supabase';
import { requireCrmMember, canWrite } from '../../_lib';
import { notifyStatusChange } from '../../_notify';

const STATUS_LABEL: Record<string, string> = {
  lead: 'Lead', proposal: 'Proposal', in_progress: 'In Progress',
  on_hold: 'On Hold', completed: 'Completed', cancelled: 'Cancelled',
};

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

  // Fetch current state before update to detect status changes
  const { data: before } = await admin
    .from('crm_solutions')
    .select('status, title, assigned_to')
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

  // Auto-log status changes as system_log note
  if (body.status && before && body.status !== before.status) {
    await admin.from('crm_solution_notes').insert({
      solution_id:    id,
      org_id:         orgId,
      content:        `เปลี่ยน status: ${STATUS_LABEL[before.status] ?? before.status} → ${STATUS_LABEL[body.status] ?? body.status}`,
      note_type:      'system_log',   // ← fixed: was 'status_change' (invalid after Phase 1 migration)
      content_format: 'plain',
      created_by:     auth.userId,
    });

    // Fetch changer's display name for notification
    const { data: changer } = await admin
      .from('profiles')
      .select('display_name, email')
      .eq('id', auth.userId)
      .maybeSingle();
    const changerName = (changer as { display_name?: string; email?: string } | null)?.display_name
      || (changer as { display_name?: string; email?: string } | null)?.email
      || 'Someone';

    // Fire-and-forget LINE notification → assignee
    void notifyStatusChange({
      admin,
      orgId,
      solutionId:          id,
      solutionTitle:       (before as { title?: string } | null)?.title ?? data.title ?? '',
      solutionAssignedTo:  (before as { assigned_to?: string | null } | null)?.assigned_to ?? null,
      changerId:           auth.userId,
      changerName,
      fromStatus:          (before as { status?: string } | null)?.status ?? '',
      toStatus:            body.status,
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
