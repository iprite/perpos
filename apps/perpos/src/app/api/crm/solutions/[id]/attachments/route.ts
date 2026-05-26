import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '../../../../_lib/supabase';
import { requireCrmMember, canWrite } from '../../../_lib';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: solutionId } = await params;
  const orgId = req.nextUrl.searchParams.get('orgId');
  if (!orgId) return NextResponse.json({ error: 'orgId required' }, { status: 400 });

  const auth = await requireCrmMember(req, orgId);
  if (!auth.ok) return auth.res;
  if (!canWrite(auth.role)) return NextResponse.json({ error: 'ไม่มีสิทธิ์เขียน' }, { status: 403 });

  const { noteId, fileName, mimeType, fileSize, storagePath } = await req.json();
  if (!noteId || !fileName || !storagePath) {
    return NextResponse.json({ error: 'noteId, fileName, storagePath required' }, { status: 400 });
  }

  const admin = createAdminClient();

  // Verify note belongs to this solution + org
  const { data: note } = await admin
    .from('crm_solution_notes')
    .select('id')
    .eq('id', noteId)
    .eq('solution_id', solutionId)
    .eq('org_id', orgId)
    .maybeSingle();

  if (!note) return NextResponse.json({ error: 'note not found' }, { status: 404 });

  const { data, error } = await admin
    .from('crm_note_attachments')
    .insert({ note_id: noteId, org_id: orgId, solution_id: solutionId, file_name: fileName, mime_type: mimeType ?? 'application/octet-stream', file_size: fileSize ?? 0, storage_path: storagePath, created_by: auth.userId })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: solutionId } = await params;
  const attachmentId = req.nextUrl.searchParams.get('attachmentId');
  const orgId        = req.nextUrl.searchParams.get('orgId');
  if (!orgId || !attachmentId) return NextResponse.json({ error: 'orgId and attachmentId required' }, { status: 400 });

  const auth = await requireCrmMember(req, orgId);
  if (!auth.ok) return auth.res;

  const admin = createAdminClient();

  const { data: att } = await admin
    .from('crm_note_attachments')
    .select('storage_path, created_by')
    .eq('id', attachmentId)
    .eq('solution_id', solutionId)
    .eq('org_id', orgId)
    .maybeSingle();

  if (!att) return NextResponse.json({ error: 'attachment not found' }, { status: 404 });

  // Delete from storage
  await admin.storage.from('crm-attachments').remove([att.storage_path]);

  // Delete record
  const { error } = await admin.from('crm_note_attachments').delete().eq('id', attachmentId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
