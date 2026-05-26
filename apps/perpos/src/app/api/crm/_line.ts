/**
 * CRM LINE Bot — Inbound Command Handlers (Phase B + C)
 *
 * Phase B — Note commands:
 *   /n      <solution> | <content>  → note_type: note
 *   /survey <solution> | <content>  → note_type: site_survey
 *   /issue  <solution> | <content>  → note_type: issue
 *   /mtg    <solution> | <content>  → note_type: meeting
 *   /log    <solution> | <content>  → note_type: system_log
 *
 * Phase C — Time tracking:
 *   /in  <solution>               → start session
 *   /out [billable] [<content>]   → end session, create note with duration
 */

import { createAdminClient } from '../_lib/supabase';
import { notifyIssueNote } from './_notify';

type Admin = ReturnType<typeof createAdminClient>;

// ── LINE Reply helpers (inline to avoid circular imports) ─────────────────────

async function replyLine(replyToken: string, messages: unknown[]) {
  const token = process.env.LINE_MESSAGING_CHANNEL_ACCESS_TOKEN ?? '';
  if (!token) return;
  await fetch('https://api.line.me/v2/bot/message/reply', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ replyToken, messages }),
  });
}

function replyText(replyToken: string, text: string) {
  return replyLine(replyToken, [{ type: 'text', text }]);
}

function replyTextWithQuickReplies(
  replyToken: string,
  text: string,
  items: { label: string; text: string }[],
) {
  return replyLine(replyToken, [{
    type: 'text',
    text,
    quickReply: {
      items: items.map(item => ({
        type: 'action',
        action: { type: 'message', label: item.label.slice(0, 20), text: item.text },
      })),
    },
  }]);
}

// ── Type definitions ──────────────────────────────────────────────────────────

export type CrmNoteType = 'note' | 'site_survey' | 'issue' | 'meeting' | 'system_log';

const NOTE_TYPE_LABEL: Record<CrmNoteType, string> = {
  note:        '📝 Note',
  site_survey: '🔧 Site Survey',
  issue:       '🚨 Issue',
  meeting:     '🤝 Meeting',
  system_log:  '⚙️ System Log',
};

const NOTE_TYPE_EMOJI: Record<CrmNoteType, string> = {
  note:        '📝',
  site_survey: '🔧',
  issue:       '🚨',
  meeting:     '🤝',
  system_log:  '⚙️',
};

// ── Helpers ───────────────────────────────────────────────────────────────────

/** ตรวจว่า user เป็น CRM member ของ org นั้น (super_admin ผ่านเสมอ) */
async function isCrmMember(admin: Admin, userId: string, orgId: string, userRole: string): Promise<boolean> {
  if (userRole === 'super_admin') return true;
  const { data } = await admin
    .from('module_members')
    .select('id')
    .eq('org_id', orgId)
    .eq('user_id', userId)
    .eq('module_key', 'crm')
    .eq('is_active', true)
    .maybeSingle();
  return !!data;
}

type SolutionRow = { id: string; title: string; status: string; assigned_to: string | null };

/** fuzzy search solutions ใน org */
async function searchSolutions(
  admin: Admin,
  orgId: string,
  query: string,
  includeCompleted = false,
): Promise<SolutionRow[]> {
  let q = admin
    .from('crm_solutions')
    .select('id, title, status, assigned_to')
    .eq('org_id', orgId)
    .ilike('title', `%${query}%`)
    .order('updated_at', { ascending: false })
    .limit(6);

  if (!includeCompleted) {
    q = q.not('status', 'in', '("completed","cancelled")') as typeof q;
  }

  const { data } = await q;
  return (data ?? []) as SolutionRow[];
}

/** สร้าง note และ reply confirm */
async function createNoteAndReply(
  admin: Admin,
  orgId: string,
  solution: SolutionRow,
  profileId: string,
  profileName: string,
  noteType: CrmNoteType,
  content: string,
  replyToken: string,
) {
  const { error } = await admin
    .from('crm_solution_notes')
    .insert({
      solution_id:    solution.id,
      org_id:         orgId,
      content,
      note_type:      noteType,
      content_format: 'plain',
      created_by:     profileId,
    });

  if (error) {
    await replyText(replyToken, `❌ บันทึกไม่สำเร็จ: ${error.message}`);
    return;
  }

  // Trigger issue notification (fire-and-forget)
  if (noteType === 'issue') {
    void notifyIssueNote({
      admin,
      orgId,
      solutionId:         solution.id,
      solutionTitle:      solution.title,
      solutionAssignedTo: solution.assigned_to,
      authorId:           profileId,
      authorName:         profileName,
      content,
    });
  }

  const emoji = NOTE_TYPE_EMOJI[noteType];
  const label = NOTE_TYPE_LABEL[noteType];
  const preview = content.length > 80 ? content.slice(0, 80) + '…' : content;

  await replyText(replyToken,
    `✅ บันทึกแล้ว\n` +
    `${emoji} ${label}\n` +
    `📋 ${solution.title}\n` +
    `──────────────\n` +
    preview,
  );
}

// ── Usage strings ─────────────────────────────────────────────────────────────

const USAGE: Record<string, string> = {
  n:      '📌 /n <ชื่อ solution> | <เนื้อหา>\nเช่น /n ABC Corp | ติดตั้งเสร็จแล้ว',
  survey: '📌 /survey <ชื่อ solution> | <รายละเอียด>\nเช่น /survey ABC | พบสาย LAN ขาด 2 เส้น',
  issue:  '📌 /issue <ชื่อ solution> | <ปัญหา>\nเช่น /issue ABC | ระบบ offline ตั้งแต่ 09:00',
  mtg:    '📌 /mtg <ชื่อ solution> | <สรุปประชุม>\nเช่น /mtg ABC | ตกลงส่งมอบ 15 มิ.ย.',
  log:    '📌 /log <ชื่อ solution> | <event>\nเช่น /log ABC | restart server สำเร็จ',
};

// ── Main exported handler ─────────────────────────────────────────────────────

/**
 * handleCrmCmd — เรียกจาก LINE webhook สำหรับ /n /survey /issue /mtg /log
 */
export async function handleCrmCmd(
  admin: Admin,
  cmd: string,
  args: string[],
  profileId: string,
  profileName: string,
  profileRole: string,
  activeOrgId: string,
  replyToken: string,
) {
  // Map command → note_type
  const TYPE_MAP: Record<string, CrmNoteType> = {
    n:      'note',
    survey: 'site_survey',
    issue:  'issue',
    mtg:    'meeting',
    log:    'system_log',
  };
  const noteType = TYPE_MAP[cmd];
  if (!noteType) return; // shouldn't happen

  // Check CRM membership
  const member = await isCrmMember(admin, profileId, activeOrgId, profileRole);
  if (!member) {
    await replyText(replyToken,
      `❌ คุณไม่ได้เป็นสมาชิก CRM ของ org นี้\n` +
      `ติดต่อผู้ดูแลระบบเพื่อขอสิทธิ์`,
    );
    return;
  }

  // Parse "solution_query | content"
  const fullText = args.join(' ');
  const pipeIdx  = fullText.indexOf('|');

  if (pipeIdx === -1 || !fullText.slice(0, pipeIdx).trim() || !fullText.slice(pipeIdx + 1).trim()) {
    await replyText(replyToken, `❌ รูปแบบไม่ถูกต้อง\n\n${USAGE[cmd]}`);
    return;
  }

  const solutionQuery = fullText.slice(0, pipeIdx).trim();
  const content       = fullText.slice(pipeIdx + 1).trim();

  if (content.length < 3) {
    await replyText(replyToken, `❌ เนื้อหาสั้นเกินไป (ต้องอย่างน้อย 3 ตัวอักษร)`);
    return;
  }

  // Search solutions
  const solutions = await searchSolutions(admin, activeOrgId, solutionQuery);

  if (solutions.length === 0) {
    await replyText(replyToken,
      `❌ ไม่พบ solution ที่มีชื่อว่า "${solutionQuery}"\n\n` +
      `💡 ลองใช้ชื่อบางส่วน เช่น "/n ABC | ..." แทน "ABC Corp"\n` +
      `หรือตรวจสอบว่า solution ไม่ได้ถูกปิดแล้ว`,
    );
    return;
  }

  if (solutions.length === 1) {
    // Direct hit
    await createNoteAndReply(admin, activeOrgId, solutions[0], profileId, profileName, noteType, content, replyToken);
    return;
  }

  if (solutions.length > 5) {
    await replyText(replyToken,
      `❌ พบ solution มากเกินไป (${solutions.length} รายการ)\n` +
      `กรุณาระบุชื่อให้ตรงกว่า\n\n${USAGE[cmd]}`,
    );
    return;
  }

  // 2–5 matches → show Quick Reply buttons
  // Button text pre-fills the command with the exact solution name
  const cmdPrefix = `/${cmd} `;
  const quickItems = solutions.map(s => ({
    label: s.title,
    text:  `${cmdPrefix}${s.title} | ${content}`,
  }));

  const list = solutions.map((s, i) => `${i + 1}. ${s.title}`).join('\n');
  await replyTextWithQuickReplies(
    replyToken,
    `พบ ${solutions.length} solutions ที่ตรงกัน:\n${list}\n\n▼ เลือก solution:`,
    quickItems,
  );
}

// ── Time Tracking Helpers ─────────────────────────────────────────────────────

type SessionRow = {
  id: string;
  solution_id: string;
  org_id: string;
  started_at: string;
  solution_title?: string;
};

/** ดึง active session ของ user */
async function getSession(admin: Admin, lineUserId: string): Promise<SessionRow | null> {
  const { data } = await admin
    .from('crm_line_sessions')
    .select('id, solution_id, org_id, started_at, crm_solutions(title)')
    .eq('line_user_id', lineUserId)
    .maybeSingle();
  if (!data) return null;
  const row = data as Record<string, unknown>;
  return {
    id:             row.id as string,
    solution_id:    row.solution_id as string,
    org_id:         row.org_id as string,
    started_at:     row.started_at as string,
    solution_title: (row.crm_solutions as { title?: string } | null)?.title ?? '',
  };
}

/** แปลง minutes เป็น "Xh Ym" */
function fmtDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

/** แปลง ISO timestamp เป็นเวลาไทย "HH:MM" */
function fmtTimeTH(iso: string): string {
  return new Date(iso).toLocaleTimeString('th-TH', {
    hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Bangkok',
  });
}

// ── /in handler ───────────────────────────────────────────────────────────────

export async function handleCrmIn(
  admin: Admin,
  args: string[],
  lineUserId: string,
  profileId: string,
  profileRole: string,
  activeOrgId: string,
  replyToken: string,
) {
  const query = args.join(' ').trim();

  if (!query) {
    await replyText(replyToken,
      `❌ ระบุชื่อ solution\n\n📌 /in <ชื่อ solution>\nเช่น /in ABC Corp`,
    );
    return;
  }

  // Check CRM membership
  if (!await isCrmMember(admin, profileId, activeOrgId, profileRole)) {
    await replyText(replyToken, `❌ คุณไม่ได้เป็นสมาชิก CRM ของ org นี้`);
    return;
  }

  // Check for existing session
  const existing = await getSession(admin, lineUserId);
  if (existing) {
    const elapsed = Math.round((Date.now() - new Date(existing.started_at).getTime()) / 60000);
    await replyTextWithQuickReplies(
      replyToken,
      `⚠️ มี session ค้างอยู่\n📋 ${existing.solution_title}\n` +
      `⏱ เริ่ม ${fmtTimeTH(existing.started_at)} (${fmtDuration(elapsed)} แล้ว)\n\n` +
      `ต้องการทำอะไร?`,
      [
        { label: '✅ /out ปิด session เดิม', text: '/out' },
        { label: '🔄 เปลี่ยน solution', text: `/in ${query}` },
      ],
    );
    return;
  }

  // Search solution
  const solutions = await searchSolutions(admin, activeOrgId, query);

  if (solutions.length === 0) {
    await replyText(replyToken,
      `❌ ไม่พบ solution "${query}"\n💡 ลองใช้ชื่อบางส่วน เช่น /in ABC`,
    );
    return;
  }

  if (solutions.length > 5) {
    await replyText(replyToken,
      `❌ พบ solution มากเกินไป (${solutions.length} รายการ)\nกรุณาระบุชื่อให้ตรงกว่า`,
    );
    return;
  }

  if (solutions.length > 1) {
    const list = solutions.map((s, i) => `${i + 1}. ${s.title}`).join('\n');
    const quickItems = solutions.map(s => ({
      label: s.title,
      text:  `/in ${s.title}`,
    }));
    await replyTextWithQuickReplies(
      replyToken,
      `พบ ${solutions.length} solutions:\n${list}\n\n▼ เลือก solution:`,
      quickItems,
    );
    return;
  }

  const sol = solutions[0];

  // Upsert session (replace if somehow exists for same user)
  await admin.from('crm_line_sessions').upsert(
    { line_user_id: lineUserId, profile_id: profileId, solution_id: sol.id, org_id: activeOrgId, started_at: new Date().toISOString() },
    { onConflict: 'line_user_id' },
  );

  const startTime = fmtTimeTH(new Date().toISOString());
  await replyText(replyToken,
    `⏱ เริ่มนับเวลา\n📋 ${sol.title}\n🕐 ${startTime}\n\nพิมพ์ /out เมื่อเสร็จงาน\n/out billable — ถ้าคิดค่าบริการ`,
  );
}

// ── /out handler ──────────────────────────────────────────────────────────────

export async function handleCrmOut(
  admin: Admin,
  args: string[],
  lineUserId: string,
  profileId: string,
  profileName: string,
  replyToken: string,
) {
  const session = await getSession(admin, lineUserId);

  if (!session) {
    await replyText(replyToken,
      `❌ ไม่มี session ที่กำลังนับอยู่\nพิมพ์ /in <solution> เพื่อเริ่มนับเวลา`,
    );
    return;
  }

  // Parse args: /out [billable] [<content>]
  let isBillable = false;
  let content = '';

  if (args[0]?.toLowerCase() === 'billable') {
    isBillable = true;
    content = args.slice(1).join(' ').trim();
  } else {
    content = args.join(' ').trim();
  }

  // Calculate duration
  const startedAt  = new Date(session.started_at);
  const endedAt    = new Date();
  const durationMs = endedAt.getTime() - startedAt.getTime();
  const durationMin = Math.max(1, Math.round(durationMs / 60000));

  // Warn if session > 8h (possibly forgot to close)
  const MAX_SESSION_HOURS = 8;
  if (durationMin > MAX_SESSION_HOURS * 60) {
    await replyTextWithQuickReplies(
      replyToken,
      `⚠️ Session นานผิดปกติ (${fmtDuration(durationMin)})\n` +
      `📋 ${session.solution_title}\n` +
      `เริ่ม: ${fmtTimeTH(session.started_at)}\n\n` +
      `ยืนยันปิด session หรือไม่?`,
      [
        { label: '✅ ยืนยันปิด', text: `/out${isBillable ? ' billable' : ''}${content ? ' ' + content : ''}` },
        { label: '❌ ยกเลิก', text: '/in status' },
      ],
    );
    // NOTE: we don't delete the session here — user must confirm
    return;
  }

  // Delete session
  await admin.from('crm_line_sessions').delete().eq('line_user_id', lineUserId);

  // Build note content
  const noteContent = content ||
    `ทำงาน ${fmtTimeTH(session.started_at)} – ${fmtTimeTH(endedAt.toISOString())}`;

  // Create note with duration
  await admin.from('crm_solution_notes').insert({
    solution_id:      session.solution_id,
    org_id:           session.org_id,
    content:          noteContent,
    note_type:        'note',
    content_format:   'plain',
    duration_minutes: durationMin,
    is_billable:      isBillable,
    created_by:       profileId,
  });

  const billableTag = isBillable ? '\n💰 Billable' : '';
  const contentTag  = content ? `\n──────────────\n${content.slice(0, 80)}` : '';

  await replyText(replyToken,
    `✅ บันทึกเวลาแล้ว\n` +
    `📋 ${session.solution_title}\n` +
    `⏱ ${fmtDuration(durationMin)}` +
    billableTag +
    contentTag,
  );
}

// ── /in status ────────────────────────────────────────────────────────────────

export async function handleCrmInStatus(
  admin: Admin,
  lineUserId: string,
  replyToken: string,
) {
  const session = await getSession(admin, lineUserId);
  if (!session) {
    await replyText(replyToken, `ℹ️ ไม่มี session ที่กำลังนับอยู่\nพิมพ์ /in <solution> เพื่อเริ่ม`);
    return;
  }
  const elapsed = Math.round((Date.now() - new Date(session.started_at).getTime()) / 60000);
  await replyTextWithQuickReplies(
    replyToken,
    `⏱ Session ปัจจุบัน\n📋 ${session.solution_title}\n🕐 เริ่ม ${fmtTimeTH(session.started_at)}\n⌛ ผ่านมา ${fmtDuration(elapsed)}`,
    [
      { label: '✅ /out ปิด', text: '/out' },
      { label: '💰 /out billable', text: '/out billable' },
    ],
  );
}

// ── /sol handler — list solutions ────────────────────────────────────────────

export async function handleCrmSolutions(
  admin: Admin,
  args: string[],
  profileId: string,
  profileRole: string,
  activeOrgId: string,
  replyToken: string,
) {
  if (!await isCrmMember(admin, profileId, activeOrgId, profileRole)) {
    await replyText(replyToken, '❌ คุณไม่ได้เป็นสมาชิก CRM ของ org นี้');
    return;
  }

  const firstArg      = args[0]?.toLowerCase() ?? '';
  const includeAll    = firstArg === 'all' || firstArg === 'ทั้งหมด';
  const keyword       = !includeAll ? args.join(' ').trim() : '';

  let q = admin
    .from('crm_solutions')
    .select('id, title, status, assigned_to, profiles!assigned_to(display_name, email)')
    .eq('org_id', activeOrgId)
    .order('status')
    .order('updated_at', { ascending: false })
    .limit(25);

  if (!includeAll) {
    q = q.not('status', 'in', '("completed","cancelled")') as typeof q;
  }
  if (keyword) {
    q = q.ilike('title', `%${keyword}%`) as typeof q;
  }

  const { data } = await q;

  type SolRow = {
    id: string; title: string; status: string; assigned_to: string | null;
    profiles: { display_name?: string; email?: string } | null;
  };
  const rows = (data ?? []) as unknown as SolRow[];

  if (!rows.length) {
    const hint = keyword
      ? `ไม่พบ solution ที่มีคำว่า "${keyword}"`
      : includeAll
      ? 'ยังไม่มี solutions ใน org นี้'
      : 'ไม่มี active solutions\n\nพิมพ์ /sol all เพื่อดูทั้งหมด';
    await replyText(replyToken, `📋 ${hint}`);
    return;
  }

  // Group by status
  const ORDER = ['in_progress', 'proposal', 'lead', 'on_hold', 'completed', 'cancelled'];
  const grouped = new Map<string, SolRow[]>();
  for (const s of ORDER) grouped.set(s, []);
  for (const r of rows) {
    const bucket = grouped.get(r.status) ?? [];
    bucket.push(r);
    grouped.set(r.status, bucket);
  }

  const lines: string[] = [];
  let idx = 1;
  for (const status of ORDER) {
    const bucket = grouped.get(status) ?? [];
    if (!bucket.length) continue;
    const emoji = STATUS_EMOJI[status] ?? '•';
    const label = STATUS_LABEL[status] ?? status;
    lines.push(`${emoji} ${label}:`);
    for (const r of bucket) {
      const assignee = r.profiles?.display_name || r.profiles?.email || '';
      const who = assignee ? ` — ${assignee}` : '';
      lines.push(`  ${idx}. ${r.title}${who}`);
      idx++;
    }
  }

  const total  = rows.length;
  const header = keyword
    ? `📋 Solutions "${keyword}" (${total}):\n\n`
    : includeAll
    ? `📋 Solutions ทั้งหมด (${total}):\n\n`
    : `📋 Active Solutions (${total}):\n\n`;

  const footer = !includeAll && !keyword
    ? '\n\n/sol all — ดูทั้งหมด\n/status <ชื่อ> — รายละเอียด'
    : '\n\n/status <ชื่อ> — รายละเอียด';

  await replyText(replyToken, header + lines.join('\n') + footer);
}

// ── Phase E: Photo attachment ─────────────────────────────────────────────────

/**
 * handleCrmPhoto — called when LINE sends an image event
 *
 * Requires an active /in session. Downloads the image from the LINE Content
 * API, uploads to Supabase Storage (crm-attachments bucket), creates a note,
 * and inserts a crm_note_attachments record.
 */
export async function handleCrmPhoto(
  admin: Admin,
  lineUserId: string,
  messageId: string,
  profileId: string,
  replyToken: string,
) {
  // Require active session — photo must be tied to a solution
  const session = await getSession(admin, lineUserId);
  if (!session) {
    await replyText(replyToken,
      '📸 ได้รับรูปภาพแล้ว แต่ยังไม่มี session\n\n' +
      'พิมพ์ /in <solution> ก่อน แล้วส่งรูปอีกครั้ง',
    );
    return;
  }

  // Download image from LINE Content API
  const lineToken = process.env.LINE_MESSAGING_CHANNEL_ACCESS_TOKEN ?? '';
  const contentRes = await fetch(
    `https://api-data.line.me/v2/bot/message/${messageId}/content`,
    { headers: { Authorization: `Bearer ${lineToken}` } },
  );

  if (!contentRes.ok) {
    await replyText(replyToken, '❌ ดาวน์โหลดรูปภาพไม่สำเร็จ กรุณาลองใหม่');
    return;
  }

  const mimeType = contentRes.headers.get('content-type') ?? 'image/jpeg';
  const ext      = mimeType.includes('png') ? 'png' : mimeType.includes('gif') ? 'gif' : 'jpg';
  const buffer   = Buffer.from(await contentRes.arrayBuffer());
  const fileSize = buffer.length;

  // Build a unique storage path: orgId/solutionId/timestamp_messageId.ext
  const timestamp   = Date.now();
  const fileName    = `${timestamp}_${messageId}.${ext}`;
  const storagePath = `${session.org_id}/${session.solution_id}/${fileName}`;

  const { error: uploadErr } = await admin.storage
    .from('crm-attachments')
    .upload(storagePath, buffer, { contentType: mimeType, upsert: false });

  if (uploadErr) {
    await replyText(replyToken, `❌ อัปโหลดรูปไม่สำเร็จ: ${uploadErr.message}`);
    return;
  }

  // Create a note to anchor the attachment
  const timeLabel = new Date().toLocaleTimeString('th-TH', {
    hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Bangkok',
  });
  const { data: note, error: noteErr } = await admin
    .from('crm_solution_notes')
    .insert({
      solution_id:    session.solution_id,
      org_id:         session.org_id,
      content:        `📸 รูปภาพจาก LINE (${timeLabel})`,
      note_type:      'note',
      content_format: 'plain',
      created_by:     profileId,
    })
    .select('id')
    .single();

  if (noteErr || !note) {
    // Best-effort cleanup of the uploaded file
    void admin.storage.from('crm-attachments').remove([storagePath]);
    await replyText(replyToken, `❌ บันทึก note ไม่สำเร็จ: ${noteErr?.message ?? 'unknown'}`);
    return;
  }

  // Insert attachment record
  const { error: attErr } = await admin.from('crm_note_attachments').insert({
    note_id:      (note as { id: string }).id,
    solution_id:  session.solution_id,
    org_id:       session.org_id,
    file_name:    fileName,
    mime_type:    mimeType,
    file_size:    fileSize,
    storage_path: storagePath,
    created_by:   profileId,
  });

  if (attErr) {
    await replyText(replyToken, `❌ บันทึก attachment ไม่สำเร็จ: ${attErr.message}`);
    return;
  }

  await replyText(replyToken,
    `✅ บันทึกรูปภาพแล้ว\n` +
    `📋 ${session.solution_title}\n` +
    `📎 ${fileName}\n` +
    `📁 ${(fileSize / 1024).toFixed(0)} KB`,
  );
}

// ── Phase D: Query helpers ────────────────────────────────────────────────────

const STATUS_EMOJI: Record<string, string> = {
  lead:        '💡',
  proposal:    '📄',
  in_progress: '🔵',
  on_hold:     '🟠',
  completed:   '✅',
  cancelled:   '❌',
};

const STATUS_LABEL: Record<string, string> = {
  lead:        'Lead',
  proposal:    'Proposal',
  in_progress: 'กำลังดำเนินการ',
  on_hold:     'รอ/หยุดชั่วคราว',
  completed:   'เสร็จแล้ว',
  cancelled:   'ยกเลิก',
};

/** วันจันทร์ต้นสัปดาห์ตามเวลากรุงเทพ (YYYY-MM-DD) */
function getBkkWeekStart(): string {
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' }); // YYYY-MM-DD
  const [y, m, d] = today.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  const day = date.getDay(); // 0=Sun
  date.setDate(date.getDate() - (day === 0 ? 6 : day - 1));
  return date.toISOString().slice(0, 10);
}

/** วันที่ 1 ของเดือนตามเวลากรุงเทพ (YYYY-MM-DD) */
function getBkkMonthStart(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' }).slice(0, 7) + '-01';
}

// ── /status handler ───────────────────────────────────────────────────────────

export async function handleCrmStatus(
  admin: Admin,
  args: string[],
  profileId: string,
  profileRole: string,
  activeOrgId: string,
  replyToken: string,
) {
  const query = args.join(' ').trim();
  if (!query) {
    await replyText(replyToken, '📌 /status <ชื่อ solution>\nเช่น /status ABC Corp');
    return;
  }

  if (!await isCrmMember(admin, profileId, activeOrgId, profileRole)) {
    await replyText(replyToken, '❌ คุณไม่ได้เป็นสมาชิก CRM ของ org นี้');
    return;
  }

  // Include completed/cancelled — useful for reviewing past projects
  const solutions = await searchSolutions(admin, activeOrgId, query, true);

  if (solutions.length === 0) {
    await replyText(replyToken, `❌ ไม่พบ solution "${query}"`);
    return;
  }

  if (solutions.length > 5) {
    await replyText(replyToken,
      `❌ พบมากเกินไป (${solutions.length} รายการ) กรุณาระบุชื่อให้ตรงกว่า`,
    );
    return;
  }

  if (solutions.length > 1) {
    const list = solutions.map((s, i) =>
      `${i + 1}. ${s.title} ${STATUS_EMOJI[s.status] ?? ''}`,
    ).join('\n');
    await replyTextWithQuickReplies(
      replyToken,
      `พบ ${solutions.length} solutions:\n${list}\n\n▼ เลือก solution:`,
      solutions.map(s => ({ label: s.title, text: `/status ${s.title}` })),
    );
    return;
  }

  const sol = solutions[0];

  // Assignee name
  let assigneeName = '—';
  if (sol.assigned_to) {
    const { data: ap } = await admin.from('profiles')
      .select('display_name, email').eq('id', sol.assigned_to).maybeSingle();
    assigneeName = (ap as { display_name?: string; email?: string } | null)?.display_name
      || (ap as { display_name?: string; email?: string } | null)?.email || '—';
  }

  // Latest note (excluding system_log noise)
  const { data: lastNote } = await admin
    .from('crm_solution_notes')
    .select('note_type, content, created_at')
    .eq('solution_id', sol.id)
    .not('note_type', 'eq', 'system_log')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  const statusEmoji = STATUS_EMOJI[sol.status] ?? '❓';
  const statusLabel = STATUS_LABEL[sol.status] ?? sol.status;
  let text = `📋 ${sol.title}\n\n${statusEmoji} ${statusLabel}\n👤 ${assigneeName}`;

  if (lastNote) {
    const n = lastNote as { note_type: string; content: string; created_at: string };
    const noteEmoji = NOTE_TYPE_EMOJI[n.note_type as CrmNoteType] ?? '📝';
    const date = new Date(n.created_at).toLocaleDateString('th-TH', {
      month: 'short', day: 'numeric', timeZone: 'Asia/Bangkok',
    });
    const preview = n.content.length > 60 ? n.content.slice(0, 60) + '…' : n.content;
    text += `\n\n📌 ล่าสุด (${date}):\n${noteEmoji} ${preview}`;
  }

  await replyText(replyToken, text);
}

// ── /notes handler ────────────────────────────────────────────────────────────

export async function handleCrmNotes(
  admin: Admin,
  args: string[],
  profileId: string,
  profileRole: string,
  activeOrgId: string,
  replyToken: string,
) {
  const query = args.join(' ').trim();
  if (!query) {
    await replyText(replyToken, '📌 /notes <ชื่อ solution>\nเช่น /notes ABC Corp');
    return;
  }

  if (!await isCrmMember(admin, profileId, activeOrgId, profileRole)) {
    await replyText(replyToken, '❌ คุณไม่ได้เป็นสมาชิก CRM ของ org นี้');
    return;
  }

  const solutions = await searchSolutions(admin, activeOrgId, query, true);

  if (solutions.length === 0) {
    await replyText(replyToken, `❌ ไม่พบ solution "${query}"`);
    return;
  }

  if (solutions.length > 5) {
    await replyText(replyToken,
      `❌ พบมากเกินไป (${solutions.length} รายการ) กรุณาระบุชื่อให้ตรงกว่า`,
    );
    return;
  }

  if (solutions.length > 1) {
    const list = solutions.map((s, i) => `${i + 1}. ${s.title}`).join('\n');
    await replyTextWithQuickReplies(
      replyToken,
      `พบ ${solutions.length} solutions:\n${list}\n\n▼ เลือก solution:`,
      solutions.map(s => ({ label: s.title, text: `/notes ${s.title}` })),
    );
    return;
  }

  const sol = solutions[0];

  const { data: notes } = await admin
    .from('crm_solution_notes')
    .select('note_type, content, created_at, duration_minutes, is_billable')
    .eq('solution_id', sol.id)
    .order('created_at', { ascending: false })
    .limit(5);

  if (!notes?.length) {
    await replyText(replyToken, `📋 ${sol.title}\n\nยังไม่มี notes`);
    return;
  }

  type NoteRow = {
    note_type: string; content: string; created_at: string;
    duration_minutes: number | null; is_billable: boolean;
  };
  const rows = notes as NoteRow[];

  const lines = rows.map(n => {
    const emoji = NOTE_TYPE_EMOJI[n.note_type as CrmNoteType] ?? '📝';
    const date = new Date(n.created_at).toLocaleDateString('th-TH', {
      month: 'short', day: 'numeric', timeZone: 'Asia/Bangkok',
    });
    const preview = n.content.length > 60 ? n.content.slice(0, 60) + '…' : n.content;
    const dur  = n.duration_minutes ? ` ⏱${fmtDuration(n.duration_minutes)}` : '';
    const bill = n.is_billable ? ' 💰' : '';
    return `${emoji} ${date}${dur}${bill}\n${preview}`;
  });

  await replyText(replyToken,
    `📋 ${sol.title} — ${rows.length} Notes ล่าสุด:\n\n${lines.join('\n─────\n')}`,
  );
}

// ── /issues handler ───────────────────────────────────────────────────────────

export async function handleCrmIssues(
  admin: Admin,
  profileId: string,
  profileRole: string,
  activeOrgId: string,
  replyToken: string,
) {
  if (!await isCrmMember(admin, profileId, activeOrgId, profileRole)) {
    await replyText(replyToken, '❌ คุณไม่ได้เป็นสมาชิก CRM ของ org นี้');
    return;
  }

  // Fetch recent issues — fetch extra so we can filter out closed solutions in JS
  const { data } = await admin
    .from('crm_solution_notes')
    .select('content, created_at, crm_solutions!inner(title, status)')
    .eq('org_id', activeOrgId)
    .eq('note_type', 'issue')
    .order('created_at', { ascending: false })
    .limit(20);

  type IssueRow = {
    content: string; created_at: string;
    crm_solutions: { title: string; status: string };
  };
  const rows = (data ?? []) as unknown as IssueRow[];

  // Only show issues from non-closed solutions
  const open = rows
    .filter(r => !['completed', 'cancelled'].includes(r.crm_solutions?.status ?? ''))
    .slice(0, 10);

  if (!open.length) {
    await replyText(replyToken, '✅ ไม่มี open issues ในขณะนี้');
    return;
  }

  const lines = open.map((r, i) => {
    const date = new Date(r.created_at).toLocaleDateString('th-TH', {
      month: 'short', day: 'numeric', timeZone: 'Asia/Bangkok',
    });
    const preview = r.content.length > 50 ? r.content.slice(0, 50) + '…' : r.content;
    return `${i + 1}. 📋 ${r.crm_solutions.title} (${date})\n   🚨 ${preview}`;
  });

  await replyText(replyToken, `🚨 Open Issues (${open.length}):\n\n${lines.join('\n\n')}`);
}

// ── /hours handler ────────────────────────────────────────────────────────────

export async function handleCrmHours(
  admin: Admin,
  args: string[],
  profileId: string,
  activeOrgId: string,
  replyToken: string,
) {
  const period = args[0]?.toLowerCase();
  const isMonth = period === 'month' || period === 'เดือน';
  const fromDate   = isMonth ? getBkkMonthStart() : getBkkWeekStart();
  const periodLabel = isMonth ? 'เดือนนี้' : 'สัปดาห์นี้';

  const { data } = await admin
    .from('crm_solution_notes')
    .select('solution_id, duration_minutes, is_billable, crm_solutions(title)')
    .eq('created_by', profileId)
    .eq('org_id', activeOrgId)
    .not('duration_minutes', 'is', null)
    .gte('created_at', fromDate);

  type HoursRow = {
    solution_id: string;
    duration_minutes: number;
    is_billable: boolean;
    crm_solutions: { title: string } | null;
  };
  const rows = (data ?? []) as unknown as HoursRow[];

  if (!rows.length) {
    await replyText(replyToken,
      `⏱ ยังไม่มีข้อมูลชั่วโมงทำงาน${periodLabel}\n\n💡 ใช้ /in <solution> เริ่มนับเวลา`,
    );
    return;
  }

  // Group by solution
  const byProject = new Map<string, { title: string; minutes: number; billable: number }>();
  let totalMin = 0;
  let billableMin = 0;

  for (const r of rows) {
    const key   = r.solution_id;
    const title = r.crm_solutions?.title ?? key;
    const entry = byProject.get(key);
    if (entry) {
      entry.minutes += r.duration_minutes;
      if (r.is_billable) entry.billable += r.duration_minutes;
    } else {
      byProject.set(key, {
        title,
        minutes:  r.duration_minutes,
        billable: r.is_billable ? r.duration_minutes : 0,
      });
    }
    totalMin += r.duration_minutes;
    if (r.is_billable) billableMin += r.duration_minutes;
  }

  const projectLines = Array.from(byProject.values())
    .sort((a, b) => b.minutes - a.minutes)
    .map(p => {
      const bill = p.billable > 0 ? ` (💰 ${fmtDuration(p.billable)})` : '';
      return `  • ${p.title}: ${fmtDuration(p.minutes)}${bill}`;
    });

  await replyText(replyToken,
    `⏱ ชั่วโมงทำงาน${periodLabel}:\n\n` +
    projectLines.join('\n') + '\n\n' +
    `─────────────────\n` +
    `รวม: ${fmtDuration(totalMin)}\n` +
    `💰 Billable: ${fmtDuration(billableMin)}\n` +
    `📊 Non-billable: ${fmtDuration(totalMin - billableMin)}`,
  );
}

// ── /crm help ─────────────────────────────────────────────────────────────────

export function crmHelpText(): string {
  return (
    `─── 📋 CRM Notes ───\n` +
    `/n <sol> | <note>        — บันทึก Note\n` +
    `/survey <sol> | <detail> — Site Survey\n` +
    `/issue <sol> | <problem> — รายงานปัญหา\n` +
    `/mtg <sol> | <summary>   — สรุปประชุม\n` +
    `/log <sol> | <event>     — System Log\n\n` +
    `─── ⏱ Time Tracking ───\n` +
    `/in <solution>           — เริ่มนับเวลา\n` +
    `/out [billable] [note]   — หยุดนับ + บันทึก\n` +
    `/in status               — ดู session ปัจจุบัน\n\n` +
    `─── 🔍 Query ───\n` +
    `/sol                     — รายการ solutions ทั้งหมด\n` +
    `/sol <keyword>           — ค้นหา solution\n` +
    `/status <solution>       — ดูสถานะ + note ล่าสุด\n` +
    `/notes <solution>        — notes 5 รายการล่าสุด\n` +
    `/issues                  — open issues ทั้งหมด\n` +
    `/hours [month]           — ชั่วโมงทำงานของฉัน\n\n` +
    `💡 /n ABC Corp | ติดตั้งเสร็จ`
  );
}
