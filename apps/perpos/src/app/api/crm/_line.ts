/**
 * CRM LINE Bot — Inbound Command Handlers (Phase B)
 *
 * Commands:
 *   /n      <solution> | <content>  → note_type: note
 *   /survey <solution> | <content>  → note_type: site_survey
 *   /issue  <solution> | <content>  → note_type: issue
 *   /mtg    <solution> | <content>  → note_type: meeting
 *   /log    <solution> | <content>  → note_type: system_log
 *
 * Flow:
 *   1. Verify user is CRM member of their active org
 *   2. Fuzzy search solutions by query
 *   3. 0 matches → error reply
 *   4. 1 match   → create note → confirm reply
 *   5. 2–5 matches → list solutions + Quick Reply buttons
 *   6. >5 matches → ask to be more specific
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
async function searchSolutions(admin: Admin, orgId: string, query: string): Promise<SolutionRow[]> {
  const { data } = await admin
    .from('crm_solutions')
    .select('id, title, status, assigned_to')
    .eq('org_id', orgId)
    .ilike('title', `%${query}%`)
    .not('status', 'in', '("completed","cancelled")')
    .order('updated_at', { ascending: false })
    .limit(6);
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

// ── /crm help ─────────────────────────────────────────────────────────────────

export function crmHelpText(): string {
  return (
    `─── 📋 CRM Notes ───\n` +
    `/n <solution> | <note>     — บันทึก Note\n` +
    `/survey <sol> | <detail>   — Site Survey\n` +
    `/issue <sol> | <problem>   — รายงานปัญหา\n` +
    `/mtg <sol> | <summary>     — สรุปประชุม\n` +
    `/log <sol> | <event>       — System Log\n\n` +
    `💡 ใช้ | (pipe) คั่นระหว่างชื่อ solution กับเนื้อหา\n` +
    `เช่น /issue ABC Corp | ระบบไม่ตอบสนอง`
  );
}
