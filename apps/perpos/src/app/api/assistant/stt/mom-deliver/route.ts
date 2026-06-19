/**
 * POST /api/assistant/stt/mom-deliver
 *   body: { jobId, orgId }   header: x-worker-secret
 *   — เรียกจาก stt-worker เมื่อ STT (source='line') เสร็จ:
 *     buildMomHtml → pdf-renderer → upload PDF → signed URL → push Flex (ปุ่มดาวน์โหลด) กลับ LINE
 *     (LINE bot แนบไฟล์ PDF ตรง ๆ ไม่ได้ จึงส่งเป็นลิงก์)
 */

import { NextRequest } from 'next/server';
import { createAdminClient } from '../../../_lib/supabase';
import { ok, Err } from '../../../_lib/response';
import { buildMomHtml, MOM_FOOTER_TEMPLATE, type MomJson } from '@/lib/assistant/mom-html';
import { sendLineMessages } from '@/lib/line/send-messages';
import { saveToDrive } from '@/lib/google/drive';
import crypto from 'crypto';

const BUCKET = 'assistant_audio';

// Flex card แจ้งงานล้มเหลว — แยกข้อความตาม source (บอทประชุม vs อัปไฟล์เอง)
function buildFailFlex(reason: string, isRecall: boolean) {
  const title = isRecall ? '❌ สรุปการประชุมไม่สำเร็จ' : '❌ ถอดเสียงไม่สำเร็จ';
  const detail = isRecall
    ? 'ขออภัย ระบบสรุปการประชุมไม่สำเร็จ'
    : (reason && !reason.startsWith('quota_exceeded') ? reason : 'ขออภัย ไม่สามารถถอดเสียงไฟล์นี้ได้');
  const hint = isRecall
    ? 'เปิดดู/ดาวน์โหลดรายงานได้ที่หน้าผู้ช่วย AI › ประชุม ครับ 🙏'
    : 'พิมพ์ /mom แล้วส่งไฟล์ใหม่อีกครั้งได้เลยครับ 🙏';
  return {
    type: 'flex' as const,
    altText: `${title.replace('❌ ', '')} — ${detail}`.slice(0, 380),
    contents: {
      type: 'bubble',
      header: {
        type: 'box', layout: 'vertical', backgroundColor: '#C43448', paddingAll: '14px',
        contents: [{ type: 'text', text: title, color: '#ffffff', weight: 'bold', size: 'md' }],
      },
      body: {
        type: 'box', layout: 'vertical', spacing: 'sm', paddingAll: '18px',
        contents: [
          { type: 'text', text: detail, size: 'sm', wrap: true, color: '#3C3B3D' },
          { type: 'separator', margin: 'md' },
          { type: 'text', text: hint, size: 'xs', wrap: true, color: '#9CA3AF', margin: 'md' },
        ],
      },
    },
  };
}

export async function POST(req: NextRequest) {
  const required = (process.env.WORKER_SECRET ?? '').trim();
  const got = (req.headers.get('x-worker-secret') ?? '').trim();
  if (!required || got !== required) return Err.unauthorized();

  const body = await req.json().catch(() => null);
  const { jobId, orgId } = body ?? {};
  if (!jobId || !orgId) return Err.missingField('jobId/orgId');

  const admin = createAdminClient();
  const { data: job, error } = await admin
    .from('assistant_jobs')
    .select('file_name, status, transcript_json, created_at, profile_id, error_message, source, mom_drive_url')
    .eq('id', jobId)
    .eq('org_id', orgId)
    .maybeSingle();
  if (error) return Err.dbError(error);
  if (!job) return Err.notFound(`Transcription job ${jobId}`);

  // ปลายทาง LINE
  const { data: profile } = await admin
    .from('profiles')
    .select('line_user_id')
    .eq('id', job.profile_id as string)
    .maybeSingle();
  const lineUserId = (profile as { line_user_id?: string } | null)?.line_user_id;
  if (!lineUserId) return ok({ skipped: 'no line_user_id' });

  const isRecall = job.source === 'recall';

  // งานล้มเหลว → แจ้งด้วย Flex card (ใช้ error_message ที่เป็นมิตรจาก worker ถ้ามี)
  //   recall: ข้ามการ์ดที่นี่ — งานบอทมี scheduler retry หลายรอบ (จะ spam การ์ด fail ทุกรอบ)
  //   ปล่อยให้ scheduler giveup (failed_permanent) แจ้ง + คืนโควต้า ครั้งเดียวพอ
  if (job.status !== 'completed' || !job.transcript_json) {
    if (!isRecall) {
      const reason = String(job.error_message ?? '').trim();
      await sendLineMessages({ to: lineUserId, messages: [buildFailFlex(reason, false)] });
    }
    return ok({ delivered: isRecall ? 'recall_fail_silent' : 'error_notice' });
  }

  const renderUrl = process.env.PDF_RENDER_URL;
  const renderSecret = process.env.PDF_SERVICE_SECRET;

  // ถ้าสร้าง PDF ไม่สำเร็จด้วยเหตุใด ๆ → แจ้งผู้ใช้ทาง LINE (Flex) แล้วค่อย return error
  const failToLine = async (reason: string) => {
    await sendLineMessages({
      to: lineUserId,
      messages: [buildFailFlex('สร้างไฟล์ PDF รายงานการประชุมไม่สำเร็จ กรุณาลองใหม่ภายหลัง', isRecall)],
    }).catch(() => undefined);
    return Err.externalService('mom-pdf', reason);
  };

  if (!renderUrl) return failToLine('ยังไม่ได้ตั้งค่า PDF_RENDER_URL');

  const tj = job.transcript_json as MomJson;
  const dateText = new Intl.DateTimeFormat('th-TH', {
    timeZone: 'Asia/Bangkok', day: 'numeric', month: 'long', year: 'numeric',
  }).format(new Date(job.created_at as string));

  // 1. HTML → PDF
  const resp = await fetch(`${renderUrl.replace(/\/$/, '')}/render`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(renderSecret ? { 'x-pdf-secret': renderSecret } : {}) },
    body: JSON.stringify({ html: buildMomHtml(tj, dateText), filename: 'minutes-of-meeting', footerHtml: MOM_FOOTER_TEMPLATE }),
    signal: AbortSignal.timeout(120_000),
  }).catch((e) => { throw e; });
  if (!resp.ok) {
    const detail = await resp.text().catch(() => '');
    return failToLine(`PDF renderer ${resp.status} ${detail}`.slice(0, 200));
  }
  const pdfBytes = Buffer.from(await resp.arrayBuffer());

  // 2. upload + signed URL (48 ชม. — MoM อาจมีข้อมูลละเอียดอ่อน)
  const path = `${orgId}/mom/${jobId}.pdf`;
  const { error: upErr } = await admin.storage
    .from(BUCKET)
    .upload(path, pdfBytes, { contentType: 'application/pdf', upsert: true });
  if (upErr) return failToLine(`Storage upload: ${upErr.message}`);

  const { data: signed, error: signErr } = await admin.storage
    .from(BUCKET)
    .createSignedUrl(path, 48 * 60 * 60, { download: `MoM-${jobId}.pdf` });
  if (signErr || !signed?.signedUrl) return failToLine(`signed url: ${signErr?.message ?? 'failed'}`);

  // 3. โควต้าคงเหลือ (แสดงใน Flex) — recall → bot_quota, อื่น ๆ → stt_quota
  const { data: quota } = await admin
    .from(isRecall ? 'bot_quota' : 'stt_quota')
    .select('limit_seconds, used_seconds')
    .eq('profile_id', job.profile_id as string)
    .maybeSingle();
  const qLimit = (quota as { limit_seconds?: number } | null)?.limit_seconds ?? (isRecall ? 7200 : 18000);
  const qUsed = (quota as { used_seconds?: number } | null)?.used_seconds ?? 0;
  const quotaLine = `${isRecall ? '🤖 โควต้าบอท' : '⏱️ โควต้า'}คงเหลือ ${Math.max(0, Math.floor((qLimit - qUsed) / 60))} / ${Math.floor(qLimit / 60)} นาที`;

  // 3.5 (recall) signed URL ของไฟล์เสียง mp3 — เก็บ 48 ชม. ให้ผู้ใช้ดาวน์โหลด (best-effort)
  let audioUrl = '';
  if (isRecall) {
    const { data: aSigned } = await admin.storage
      .from(BUCKET)
      .createSignedUrl(`${orgId}/recall/${jobId}.mp3`, 48 * 60 * 60, { download: `recording-${jobId}.mp3` });
    audioUrl = aSigned?.signedUrl ?? '';
  }

  // 3.6 เก็บ MoM ลง Google Drive (ถ้าเปิด save_mom_to_drive + เชื่อม) — best-effort ไม่กระทบการส่ง LINE
  let momDriveUrl = String(job.mom_drive_url ?? ''); // เคยอัปแล้ว → ใช้ลิงก์เดิม (ปุ่มยังโชว์ตอน re-deliver)
  const { data: gset } = await admin
    .from('meeting_calendar_settings')
    .select('save_mom_to_drive')
    .eq('profile_id', job.profile_id as string)
    .maybeSingle();
  // idempotent: เคยอัปแล้ว (mom_drive_url มีค่า) → ไม่อัปซ้ำ (กันไฟล์ซ้ำถ้า mom-deliver ถูกเรียกซ้ำ)
  if (!job.mom_drive_url && (gset as { save_mom_to_drive?: boolean } | null)?.save_mom_to_drive) {
    const safeTitle = String(tj.meeting_title || 'รายงานการประชุม').replace(/[\\/:*?"<>|]/g, ' ').trim().slice(0, 80);
    // timeout race — กัน Drive API ค้างทำให้ LINE delivery ค้าง (best-effort: เกิน 15 วิ → ข้าม)
    const link = await Promise.race([
      saveToDrive(admin, job.profile_id as string, {
        categoryKey: 'mom', categoryName: 'รายงานการประชุม',
        fileName: `MoM ${safeTitle} ${dateText}.pdf`, mimeType: 'application/pdf', bytes: pdfBytes,
      }),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 15_000)),
    ]);
    if (link) {
      momDriveUrl = link;
      await admin.from('assistant_jobs').update({ mom_drive_url: link }).eq('id', jobId);
    }
  }

  // 4. push Flex (ปุ่มดาวน์โหลด) กลับ LINE
  const privacyAudio = isRecall
    ? 'ไฟล์เสียง + รายงาน PDF จะถูกลบอัตโนมัติภายใน 48 ชั่วโมง กรุณาดาวน์โหลดเก็บไว้'
    : 'ไฟล์เสียงถูกลบออกจากระบบทันทีหลังประมวลผลเสร็จ · รายงาน PDF นี้จะถูกลบอัตโนมัติภายใน 48 ชั่วโมง กรุณาดาวน์โหลดเก็บไว้';
  // ลิงก์ดาวน์โหลดสั้น perpos domain (app.perpos.io/f/<code>) → proxy สร้าง signed URL สด · ไฟล์หมดอายุ → หน้า "ไฟล์หมดอายุ"
  const fileBase = (process.env.APP_BASE_URL ?? 'https://app.perpos.io').replace(/\/$/, '');
  const shortLink = async (kind: 'mom' | 'audio') => {
    const code = crypto.randomBytes(6).toString('base64url'); // 8 ตัวอักษร unguessable
    await admin.from('file_links').insert({ code, job_id: jobId, kind });
    return `${fileBase}/f/${code}`;
  };
  const momFileUrl = await shortLink('mom');
  const audioFileUrl = audioUrl ? await shortLink('audio') : '';

  const footerButtons: Record<string, unknown>[] = [
    { type: 'button', style: 'primary', color: '#4DB0D3', height: 'sm',
      action: { type: 'uri', label: 'ดาวน์โหลด MoM (PDF)', uri: momFileUrl } },
  ];
  if (audioUrl) {
    footerButtons.push({ type: 'button', style: 'secondary', height: 'sm', margin: 'sm',
      action: { type: 'uri', label: 'ดาวน์โหลดไฟล์เสียง (MP3)', uri: audioFileUrl } });
  }
  if (momDriveUrl) {
    footerButtons.push({ type: 'button', style: 'secondary', height: 'sm', margin: 'sm',
      action: { type: 'uri', label: '📁 เปิดใน Google Drive', uri: momDriveUrl } });
  }

  const meetingTitle = String(tj.meeting_title || job.file_name || 'รายงานการประชุม');
  const sent = await sendLineMessages({
    to: lineUserId,
    messages: [{
      type: 'flex',
      altText: `รายงานการประชุมเสร็จแล้ว: ${meetingTitle}`,
      contents: {
        type: 'bubble',
        body: {
          type: 'box', layout: 'vertical', spacing: 'sm',
          contents: [
            { type: 'text', text: '📋 รายงานการประชุม (MoM)', weight: 'bold', size: 'md', color: '#4DB0D3' },
            { type: 'text', text: meetingTitle, size: 'sm', wrap: true, color: '#1A1A1B' },
            { type: 'text', text: 'ถอดเสียงเสร็จแล้ว กดปุ่มด้านล่างเพื่อดาวน์โหลด', size: 'xs', wrap: true, color: '#656D78' },
            { type: 'text', text: quotaLine, size: 'xs', color: '#9CA3AF', margin: 'sm' },
            { type: 'separator', margin: 'md' },
            {
              type: 'box', layout: 'vertical', spacing: 'xs', margin: 'md',
              contents: [
                { type: 'text', text: '🔒 ความเป็นส่วนตัวของข้อมูล', size: 'xs', weight: 'bold', color: '#656D78' },
                { type: 'text', text: privacyAudio, size: 'xxs', wrap: true, color: '#9CA3AF' },
                { type: 'text', text: 'เราไม่นำข้อมูลของคุณไปใช้ฝึกหรือพัฒนาโมเดล AI ใด ๆ ทั้งสิ้น', size: 'xxs', wrap: true, color: '#9CA3AF' },
              ],
            },
          ],
        },
        footer: { type: 'box', layout: 'vertical', contents: footerButtons },
      },
    }],
  });

  if (!sent.ok) return Err.externalService('LINE', sent.error);
  return ok({ delivered: true });
}
