/**
 * Recall bot status-change → ผลต่อ assistant_jobs + bot_quota + แจ้ง LINE (Phase 2.2)
 *
 * processBotEvent(admin, evt) เรียกจาก /api/assistant/recall/webhook (หลัง verify + idempotent)
 * กฎคิดเงิน (ดู v2 doc §9): fatal = ไม่คิด → refund · บอทเข้าห้องแล้วจบ/ถูกเตะ = คิดตามจริง → settle
 *   actual billed ≈ (done.updated_at − joined_at)  [Recall คิดจาก joining → terminal]
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { RecallWebhookEvent } from './recall';
import { triggerSttWorker } from './stt-trigger';
import { sendLineMessages } from '@/lib/line/send-messages';

type JobRow = {
  id: string; org_id: string; profile_id: string | null;
  bot_state: string | null; joined_at: string | null; hold_seconds: number | null;
  recording_started_at: string | null;
};

/** sub_code → ข้อความไทยที่เป็นมิตร (ไม่ครบทุกตัว — default กลาง ๆ) */
function subCodeMessage(subCode: string | null): string {
  switch (subCode) {
    case 'google_meet_knocking_disabled':
    case 'bot_not_admitted':
      return 'เจ้าของห้องปิดการขอเข้าร่วม หรือไม่ได้กดรับบอท';
    case 'meeting_not_found':
    case 'meeting_link_invalid':
      return 'ลิงก์ประชุมไม่ถูกต้องหรือห้องไม่พร้อมใช้งาน';
    case 'meeting_requires_sign_in':
      return 'ห้องนี้ต้องเข้าสู่ระบบก่อนจึงจะเข้าได้';
    case 'bot_kicked_from_call':
      return 'บอทถูกนำออกจากห้องประชุม';
    case 'timeout_exceeded_waiting_room':
    case 'call_ended_by_platform_waiting_room_timeout':
      return 'รอหน้าห้องนานเกินกำหนด ไม่ได้รับอนุญาตให้เข้า';
    case 'timeout_exceeded_recording_permission_denied':
      return 'ไม่ได้รับสิทธิ์บันทึกการประชุม';
    default:
      return 'บอทไม่สามารถดำเนินการประชุมต่อได้';
  }
}

/** Flex แจ้งสถานะบอท (#3 fatal / #4 ออกจากห้อง / #6 ครบโควต้า) — palette มาตรฐาน */
export function buildBotFlex(
  kind: 'fatal' | 'ended' | 'over_quota',
  opts: { reason?: string; remainMin?: number } = {},
) {
  const head =
    kind === 'fatal' ? { bg: '#C43448', title: '❌ เข้าห้องประชุมไม่สำเร็จ' }
    : kind === 'over_quota' ? { bg: '#3C3B3D', title: '⏱️ บอทออกเพราะครบโควต้า' }
    : { bg: '#3C3B3D', title: '🤖 บอทออกจากห้องประชุมแล้ว' };

  const lines: Record<string, unknown>[] = [
    { type: 'text', text: opts.reason ?? 'ดำเนินการเสร็จสิ้น', size: 'sm', wrap: true, color: '#3C3B3D' },
  ];
  if (kind === 'fatal') {
    lines.push({ type: 'text', text: 'คืนโควต้าให้แล้ว · พิมพ์วางลิงก์ใหม่เพื่อลองอีกครั้งได้เลยครับ 🙏', size: 'xs', wrap: true, color: '#9CA3AF', margin: 'md' });
  } else if (kind === 'over_quota') {
    lines.push({ type: 'text', text: 'บันทึกได้เท่าที่โควต้ามี — เติมโควต้าเพื่อบันทึกประชุมเต็มครั้งหน้า', size: 'xs', wrap: true, color: '#9CA3AF', margin: 'md' });
  }
  if (typeof opts.remainMin === 'number') {
    lines.push({ type: 'text', text: `🤖 โควต้าบอทคงเหลือ ${opts.remainMin} นาที`, size: 'xs', color: '#9CA3AF', margin: 'sm' });
  }

  return {
    type: 'flex' as const,
    altText: head.title,
    contents: {
      type: 'bubble',
      header: { type: 'box', layout: 'vertical', backgroundColor: head.bg, paddingAll: '14px',
        contents: [{ type: 'text', text: head.title, color: '#ffffff', weight: 'bold', size: 'md' }] },
      body: { type: 'box', layout: 'vertical', spacing: 'sm', paddingAll: '18px', contents: lines },
    },
  };
}

async function pushToProfile(admin: SupabaseClient, profileId: string | null, message: Record<string, unknown>): Promise<void> {
  if (!profileId) return;
  const { data } = await admin.from('profiles').select('line_user_id').eq('id', profileId).maybeSingle();
  const to = (data as { line_user_id?: string } | null)?.line_user_id;
  if (to) await sendLineMessages({ to, messages: [message as never] });
}

async function botRemainMin(admin: SupabaseClient, profileId: string | null): Promise<number | undefined> {
  if (!profileId) return undefined;
  const { data } = await admin.from('bot_quota').select('limit_seconds, used_seconds').eq('profile_id', profileId).maybeSingle();
  if (!data) return undefined;
  const d = data as { limit_seconds: number; used_seconds: number };
  return Math.max(0, Math.floor((d.limit_seconds - d.used_seconds) / 60));
}

export async function processBotEvent(admin: SupabaseClient, evt: RecallWebhookEvent): Promise<void> {
  const botId = evt.data?.bot?.id;
  const meta = evt.data?.bot?.metadata ?? {};
  const code = evt.data?.data?.code;
  const subCode = evt.data?.data?.sub_code ?? null;
  const updatedAt = evt.data?.data?.updated_at ?? new Date().toISOString();
  const jobId = meta.job_id;
  if (!jobId) return; // ไม่ใช่บอทของเรา (ไม่มี metadata)

  const { data: jobData } = await admin
    .from('assistant_jobs')
    .select('id, org_id, profile_id, bot_state, joined_at, hold_seconds, recording_started_at')
    .eq('id', jobId)
    .maybeSingle();
  const job = jobData as JobRow | null;
  if (!job) return;

  const touch = (patch: Record<string, unknown>) =>
    admin.from('assistant_jobs').update({ ...patch, last_sub_code: subCode, updated_at: new Date().toISOString() }).eq('id', job.id);

  switch (code) {
    case 'joining_call':
      await touch({ bot_state: 'joining', joined_at: updatedAt });
      break;

    case 'in_waiting_room':
      await touch({ bot_state: 'in_waiting_room' });
      break;

    case 'in_call_recording':
      await touch({ bot_state: 'recording', recording_started_at: updatedAt });
      break;

    case 'recording_permission_denied':
      await touch({ bot_state: 'permission_denied' });
      break;

    case 'fatal': {
      // ไม่คิดเงิน → คืน hold เต็ม
      await admin.rpc('refund_bot_quota', { p_job_id: job.id }).then(() => undefined, () => undefined);
      await touch({ bot_state: 'fatal', status: 'failed', error_message: `recall_fatal:${subCode ?? ''}` });
      await pushToProfile(admin, job.profile_id, buildBotFlex('fatal', { reason: subCodeMessage(subCode) }));
      break;
    }

    case 'call_ended': {
      // เคสผิดปกติ (ถูกเตะ/ปฏิเสธสิทธิ์/รอนานเกิน) → แจ้งผู้ใช้ (settle จะเกิดที่ bot.done)
      const abnormal = subCode && /kicked|denied|waiting_room|permission/i.test(subCode);
      await touch({ bot_state: 'call_ended' });
      if (abnormal) {
        const remainMin = await botRemainMin(admin, job.profile_id);
        await pushToProfile(admin, job.profile_id, buildBotFlex('ended', { reason: subCodeMessage(subCode), remainMin }));
      }
      break;
    }

    case 'done': {
      if (job.bot_state === 'fatal' || job.bot_state === 'cancelled') break; // จบด้วย refund แล้ว
      const { data: refunded } = await admin
        .from('bot_usage_transactions').select('id').eq('job_id', job.id).eq('kind', 'refund').maybeSingle();
      if (refunded) break;

      // ไม่เคยเริ่มอัดเลย = ประชุมไม่เริ่ม/ไม่มีเสียงให้ถอด → ยอมไม่คิด (คืน hold เต็ม แม้ Recall คิดเรา)
      if (!job.recording_started_at) {
        await admin.rpc('refund_bot_quota', { p_job_id: job.id }).then(() => undefined, () => undefined);
        await touch({ bot_state: 'no_recording', status: 'failed', error_message: 'no_recording' });
        await pushToProfile(admin, job.profile_id, buildBotFlex('ended', { reason: 'ไม่พบการประชุม/เสียงในห้อง จึงไม่คิดโควต้าครับ' }));
        break;
      }

      // มีการอัด → คิดตามเวลาที่บอทอยู่ในห้อง (presence: done − joined) = ตาม Recall cost
      const joined = job.joined_at ? new Date(job.joined_at).getTime() : null;
      const actualSec = joined ? Math.max(0, Math.round((new Date(updatedAt).getTime() - joined) / 1000)) : (job.hold_seconds ?? 0);
      await admin.rpc('settle_bot_quota', { p_job_id: job.id, p_actual_seconds: actualSec }).then(() => undefined, () => undefined);
      // เข้าราง stt เดิม: worker ดึง recording จาก Recall → ถอด → MoM/PDF/LINE
      await touch({ bot_state: 'recording_ready', recording_url: botId ? `recall:${botId}` : null, ready_at: new Date().toISOString() });
      await triggerSttWorker(admin, job.id, job.org_id);
      break;
    }

    default:
      // breakout_room_* ฯลฯ — ไม่ทำอะไร
      break;
  }
}
