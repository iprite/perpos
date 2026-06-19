import type { SupabaseClient } from '@supabase/supabase-js';
import { createBot, leaveBot, extractMeetingUrl, normalizeMeetingUrl, AdhocPoolDepletedError } from './recall';

export const BOT_MIN_START = 300;   // โควต้าบอทขั้นต่ำที่ส่งบอทแล้วคุ้ม (5 นาที)
export const BOT_TRIAL_LIMIT = 7200; // 120 นาที (default ถ้าไม่มี row)
export const BOT_LOW_QUOTA = 900;    // 15 นาที — เกณฑ์ "ใกล้หมด"

export const PLATFORM_LABEL: Record<string, string> = {
  google_meet: 'Google Meet', zoom: 'Zoom', teams: 'Microsoft Teams',
};

/** นาทีคงเหลือของ bot_quota (ไม่มี row = trial เต็ม) */
export async function getBotRemaining(admin: SupabaseClient, profileId: string): Promise<{ remainSec: number; remainMin: number }> {
  const { data } = await admin.from('bot_quota').select('limit_seconds, used_seconds').eq('profile_id', profileId).maybeSingle();
  const limit = (data as { limit_seconds?: number } | null)?.limit_seconds ?? BOT_TRIAL_LIMIT;
  const used = (data as { used_seconds?: number } | null)?.used_seconds ?? 0;
  const remainSec = Math.max(0, limit - used);
  return { remainSec, remainMin: Math.floor(remainSec / 60) };
}

/**
 * มี bot job ห้องเดียวกัน (meeting_key) + เวลาใกล้กัน (±30 นาที) ที่ยัง active อยู่ไหม — reconcile กันบอทซ้ำ (M2)
 * เช็คเวลาด้วยเพื่อกัน false-match กับลิงก์ recurring (ลิงก์เดิม คนละรอบเวลา)
 */
export async function hasActiveBotForMeeting(admin: SupabaseClient, profileId: string, meetingKey: string, startsAtMs: number): Promise<boolean> {
  const { data } = await admin
    .from('assistant_jobs')
    .select('meeting_url, join_at, created_at')
    .eq('profile_id', profileId).eq('source', 'recall')
    .in('bot_state', ['awaiting_confirm', 'creating', 'scheduled', 'joining', 'in_waiting_room', 'recording'])
    .limit(50);
  const WINDOW = 30 * 60 * 1000;
  return ((data ?? []) as { meeting_url: string | null; join_at: string | null; created_at: string }[])
    .some((j) => {
      if (!j.meeting_url || normalizeMeetingUrl(j.meeting_url) !== meetingKey) return false;
      const t = new Date(j.join_at ?? j.created_at).getTime();
      return Math.abs(t - startsAtMs) <= WINDOW;
    });
}

export type HeldJob = { id: string; profile_id: string; org_id: string; meeting_url: string; join_at: string | null };

export type DispatchOutcome =
  | { kind: 'sent'; platformLabel: string; joinAtText?: string; estMin: number }
  | { kind: 'cancelled' }
  | { kind: 'busy' }   // Recall ad-hoc pool หนาแน่น
  | { kind: 'fatal' };

/**
 * job ถูก claim เป็น 'creating' + hold สำเร็จแล้ว → createBot + จัดการ state/refund → คืน outcome (ไม่ reply)
 * channel-agnostic: LINE / web จัดรูปข้อความเองจาก outcome
 * adhocFail: 'awaiting_confirm' (revert ให้กดซ้ำได้ — LINE confirm card) หรือ 'delete' (ลบทิ้ง — calendar/web)
 */
export async function createBotForHeldJob(
  admin: SupabaseClient, job: HeldJob, EST: number, adhocFail: 'awaiting_confirm' | 'delete',
): Promise<DispatchOutcome> {
  const platform = extractMeetingUrl(job.meeting_url);
  const platformLabel = platform ? (PLATFORM_LABEL[platform.platform] ?? 'ห้องประชุม') : 'ห้องประชุม';
  const scheduledIso = job.join_at;
  try {
    const bot = await createBot({
      meetingUrl: job.meeting_url, holdSeconds: EST,
      ...(scheduledIso ? { joinAt: scheduledIso } : {}),
      metadata: { profile_id: job.profile_id, job_id: job.id, org_id: job.org_id },
    });
    const { data: upd } = await admin.from('assistant_jobs')
      .update({ recall_bot_id: bot.id, updated_at: new Date().toISOString() })
      .eq('id', job.id).select('bot_state').single();
    const curState = (upd as { bot_state?: string } | null)?.bot_state;

    if (curState === 'cancelled') {
      await leaveBot(bot.id).catch(() => false);
      return { kind: 'cancelled' };
    }
    if (curState === 'creating') {
      await admin.from('assistant_jobs').update({ bot_state: 'scheduled' }).eq('id', job.id).eq('bot_state', 'creating');
    }
    const joinAtText = scheduledIso
      ? new Intl.DateTimeFormat('th-TH', { timeZone: 'Asia/Bangkok', dateStyle: 'long', timeStyle: 'short' }).format(new Date(scheduledIso))
      : undefined;
    return { kind: 'sent', platformLabel, joinAtText, estMin: Math.floor(EST / 60) };
  } catch (e) {
    await admin.rpc('refund_bot_quota', { p_job_id: job.id }).then(() => undefined, () => undefined);
    if (e instanceof AdhocPoolDepletedError && adhocFail === 'awaiting_confirm') {
      await admin.from('assistant_jobs').update({ bot_state: 'awaiting_confirm' }).eq('id', job.id);
      return { kind: 'busy' };
    }
    await admin.from('assistant_jobs').delete().eq('id', job.id);
    return e instanceof AdhocPoolDepletedError ? { kind: 'busy' } : { kind: 'fatal' };
  }
}
