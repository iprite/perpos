import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '../../../../_lib/supabase';
import { requireCrmMember, canWrite } from '../../../_lib';
import { sendLineMessages } from '@/lib/line/send-messages';
import { notifyIssueNote } from '../../../_notify';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const orgId = req.nextUrl.searchParams.get('orgId');
  if (!orgId) return NextResponse.json({ error: 'orgId required' }, { status: 400 });

  const auth = await requireCrmMember(req, orgId);
  if (!auth.ok) return auth.res;

  const admin = createAdminClient();
  const { data, error } = await admin
    .from('crm_solution_notes')
    .select('*, author:profiles(id, email, display_name), attachments:crm_note_attachments(id, file_name, mime_type, file_size, storage_path)')
    .eq('solution_id', id)
    .eq('org_id', orgId)
    .order('created_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const orgId = req.nextUrl.searchParams.get('orgId');
  if (!orgId) return NextResponse.json({ error: 'orgId required' }, { status: 400 });

  const auth = await requireCrmMember(req, orgId);
  if (!auth.ok) return auth.res;
  if (!canWrite(auth.role)) return NextResponse.json({ error: 'ไม่มีสิทธิ์เขียน' }, { status: 403 });

  const body = await req.json();
  const {
    content,
    note_type = 'note',
    content_format = 'plain',
    duration_minutes = null,
    is_billable = false,
    is_internal = false,
    mentioned_user_ids = [],
  } = body;
  if (!content?.trim()) return NextResponse.json({ error: 'content required' }, { status: 400 });

  const VALID_TYPES = ['note', 'meeting', 'site_survey', 'issue', 'system_log', 'internal'];
  if (!VALID_TYPES.includes(note_type)) {
    return NextResponse.json({ error: 'invalid note_type' }, { status: 400 });
  }

  const VALID_FORMATS = ['plain', 'markdown'];
  if (!VALID_FORMATS.includes(content_format)) {
    return NextResponse.json({ error: 'invalid content_format' }, { status: 400 });
  }

  const admin = createAdminClient();

  // Fetch solution title + assignee for notifications
  const { data: sol } = await admin
    .from('crm_solutions')
    .select('title, assigned_to')
    .eq('id', id)
    .maybeSingle();

  const { data: note, error } = await admin
    .from('crm_solution_notes')
    .insert({
      solution_id:      id,
      org_id:           orgId,
      content,
      note_type,
      content_format,
      duration_minutes: duration_minutes ? Number(duration_minutes) : null,
      is_billable:      Boolean(is_billable),
      is_internal:      Boolean(is_internal),
      created_by:       auth.userId,
    })
    .select('*, author:profiles(id, email, display_name)')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Fetch author display name (shared by mentions + issue notify)
  const { data: authorProfile } = await admin
    .from('profiles')
    .select('display_name, email')
    .eq('id', auth.userId)
    .maybeSingle();
  const authorName = (authorProfile as { display_name?: string; email?: string } | null)?.display_name
    || (authorProfile as { display_name?: string; email?: string } | null)?.email
    || 'Someone';

  // Issue alert → assignee + managers (fire-and-forget)
  if (note_type === 'issue') {
    void notifyIssueNote({
      admin,
      orgId,
      solutionId:         id,
      solutionTitle:      (sol as { title?: string; assigned_to?: string | null } | null)?.title ?? '',
      solutionAssignedTo: (sol as { title?: string; assigned_to?: string | null } | null)?.assigned_to ?? null,
      authorId:           auth.userId,
      authorName,
      content,
    });
  }

  // Handle mentions (fire-and-forget)
  if (Array.isArray(mentioned_user_ids) && mentioned_user_ids.length > 0) {
    void handleMentions({
      admin,
      noteId:     note.id,
      solutionId: id,
      orgId,
      mentionedUserIds: mentioned_user_ids,
      authorId:   auth.userId,
      authorName,
      content,
      solutionTitle: (sol as { title?: string } | null)?.title ?? 'Solution',
    });
  }

  return NextResponse.json(note, { status: 201 });
}

async function handleMentions({
  admin, noteId, solutionId, orgId, mentionedUserIds, authorId, authorName, content, solutionTitle,
}: {
  admin: ReturnType<typeof createAdminClient>;
  noteId: string; solutionId: string; orgId: string;
  mentionedUserIds: string[];
  authorId: string;
  authorName: string;
  content: string; solutionTitle: string;
}) {
  // Filter out the author themselves
  const ids = mentionedUserIds.filter(id => id !== authorId);
  if (ids.length === 0) return;

  // Insert mention records (ignore duplicates)
  await admin.from('crm_note_mentions').upsert(
    ids.map(uid => ({ note_id: noteId, solution_id: solutionId, org_id: orgId, mentioned_user_id: uid })),
    { onConflict: 'note_id,mentioned_user_id', ignoreDuplicates: true },
  );

  // Fetch LINE user IDs of mentioned users
  const { data: profiles } = await admin
    .from('profiles')
    .select('id, display_name, email, line_user_id')
    .in('id', ids);

  const preview = content.replace(/[#*`>\[\]]/g, '').slice(0, 100).trim();
  const previewText = preview.length < content.replace(/[#*`>\[\]]/g, '').trim().length
    ? preview + '…' : preview;

  for (const p of profiles ?? []) {
    const profile = p as { line_user_id?: string | null };
    if (!profile.line_user_id) continue;
    await sendLineMessages({
      to: profile.line_user_id,
      messages: [{
        type: 'text',
        text: `🔔 ${authorName} กล่าวถึงคุณใน "${solutionTitle}"\n\n${previewText}`,
      }],
    });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: solutionId } = await params;
  const noteId = req.nextUrl.searchParams.get('noteId');
  const orgId  = req.nextUrl.searchParams.get('orgId');
  if (!orgId || !noteId) return NextResponse.json({ error: 'orgId and noteId required' }, { status: 400 });

  const auth = await requireCrmMember(req, orgId);
  if (!auth.ok) return auth.res;

  const admin = createAdminClient();
  const { error } = await admin
    .from('crm_solution_notes')
    .delete()
    .eq('id', noteId)
    .eq('solution_id', solutionId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
