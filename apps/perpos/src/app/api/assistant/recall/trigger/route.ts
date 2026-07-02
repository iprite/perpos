/**
 * POST /api/assistant/recall/trigger  (requireAssistantUser)
 *   web "ส่งบอทเข้าประชุม" — วางลิงก์/ดึงจากคลิปบอร์ด → ส่งบอท Recall เข้าห้องทันที
 *   logic เดียวกับ LINE (Phase 2) ผ่าน shared lib · การกดปุ่มบนเว็บ = ยืนยัน (ไม่มี confirm card)
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireAssistantUser } from '../../../_lib/assistant-auth';
import { createAdminClient } from '../../../_lib/supabase';
import { extractMeetingUrl, makeDedupKey, normalizeMeetingUrl, parseMeetingDateTime } from '@/lib/assistant/recall';
import {
  BOT_MIN_START, PLATFORM_LABEL, getBotRemaining, hasActiveBotForMeeting, createBotForHeldJob,
} from '@/lib/assistant/recall-bot';
import { scheduleFutureMeeting } from '@/lib/assistant/schedule-meeting';

export async function POST(req: NextRequest) {
  const auth = await requireAssistantUser(req);
  if (!auth.ok) return auth.res;
  const profileId = auth.userId;
  const orgId = auth.orgId;

  const body = (await req.json().catch(() => ({}))) as { meetingUrl?: string };
  const text = String(body.meetingUrl ?? '');
  const found = extractMeetingUrl(text);
  if (!found) return NextResponse.json({ ok: false, reason: 'invalid_url' });

  const admin = createAdminClient();

  // PDPA §8 — กดส่งบอทบนเว็บ (เห็นข้อความความรับผิดชอบในหน้า) = บันทึกความยินยอมครั้งแรก
  await admin.from('profiles').update({ bot_consent_at: new Date().toISOString() }).eq('id', profileId).is('bot_consent_at', null);

  // มีวัน-เวลานัดล่วงหน้า (>10 นาที) → ลงนัดในปฏิทิน + ให้ scheduler เตือน/ส่งบอทตามเวลา (เหมือน LINE)
  const joinAt = parseMeetingDateTime(text);
  if (joinAt && joinAt.getTime() - Date.now() > 10 * 60 * 1000) {
    const result = await scheduleFutureMeeting(admin, { profileId, orgId, found, joinAt, text, source: 'web' });
    if (result.kind === 'not_connected')
      return NextResponse.json({ ok: false, reason: 'calendar_not_connected' });
    return NextResponse.json({
      ok: true,
      scheduled: true,
      exists: result.kind === 'exists',
      title: result.title,
      joinAtText: result.joinAtText,
      platformLabel: result.platformLabel,
    });
  }

  const { remainSec, remainMin } = await getBotRemaining(admin, profileId);
  if (remainSec < BOT_MIN_START) return NextResponse.json({ ok: false, reason: 'low_quota', remainMin });

  // M2 reconcile + dedup (ประชุมตอนนี้ = เวลาปัจจุบัน)
  const meetingKey = normalizeMeetingUrl(found.url);
  if (await hasActiveBotForMeeting(admin, profileId, meetingKey, Date.now())) {
    return NextResponse.json({ ok: false, reason: 'already_active' });
  }
  const dedupKey = makeDedupKey(found.url, new Date());
  const { data: dup } = await admin.from('assistant_jobs').select('bot_state').eq('dedup_key', dedupKey).maybeSingle();
  const dupState = (dup as { bot_state?: string } | null)?.bot_state;
  if (dup && !['cancelled', 'fatal', 'create_failed', 'recording_ready', 'done'].includes(dupState ?? '')) {
    return NextResponse.json({ ok: false, reason: 'already_active' });
  }
  if (dup) await admin.from('assistant_jobs').delete().eq('dedup_key', dedupKey);

  const EST = remainSec;
  const platformLabel = PLATFORM_LABEL[found.platform] ?? 'ห้องประชุม';

  const { data: jobRow, error: insErr } = await admin
    .from('assistant_jobs')
    .insert({
      org_id: orgId, profile_id: profileId, source: 'recall', kind: 'stt',
      audio_url: null, file_name: `${platformLabel} recording`, mime_type: 'audio/mp4',
      meeting_url: found.url, dedup_key: dedupKey, hold_seconds: EST,
      join_at: null, bot_state: 'creating', triggered_by: profileId,
    })
    .select('id').single();
  if (insErr || !jobRow) return NextResponse.json({ ok: false, reason: 'already_active' });
  const jobId = (jobRow as { id: string }).id;

  const { data: held } = await admin.rpc('hold_bot_quota', { p_profile_id: profileId, p_seconds: EST, p_job_id: jobId });
  if (!held || (held as { ok?: boolean }).ok !== true) {
    await admin.from('assistant_jobs').delete().eq('id', jobId);
    return NextResponse.json({ ok: false, reason: 'low_quota', remainMin });
  }

  const outcome = await createBotForHeldJob(admin, { id: jobId, profile_id: profileId, org_id: orgId, meeting_url: found.url, join_at: null }, EST, 'delete');
  if (outcome.kind === 'sent') return NextResponse.json({ ok: true, jobId, platformLabel });
  if (outcome.kind === 'busy') return NextResponse.json({ ok: false, reason: 'busy' });
  return NextResponse.json({ ok: false, reason: 'fatal' });
}
