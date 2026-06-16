/**
 * POST /api/assistant/transcribe/mom-deliver
 *   body: { jobId, orgId }   header: x-worker-secret
 *   — เรียกจาก stt-worker เมื่อ STT (source='line') เสร็จ:
 *     buildMomHtml → pdf-renderer → upload PDF → signed URL → push Flex (ปุ่มดาวน์โหลด) กลับ LINE
 *     (LINE bot แนบไฟล์ PDF ตรง ๆ ไม่ได้ จึงส่งเป็นลิงก์)
 */

import { NextRequest } from 'next/server';
import { createAdminClient } from '../../../_lib/supabase';
import { ok, Err } from '../../../_lib/response';
import { buildMomHtml, type MomJson } from '@/lib/assistant/mom-html';
import { sendLineMessages } from '@/lib/line/send-messages';

const BUCKET = 'assistant_audio';

export async function POST(req: NextRequest) {
  const required = (process.env.WORKER_SECRET ?? '').trim();
  const got = (req.headers.get('x-worker-secret') ?? '').trim();
  if (!required || got !== required) return Err.unauthorized();

  const body = await req.json().catch(() => null);
  const { jobId, orgId } = body ?? {};
  if (!jobId || !orgId) return Err.missingField('jobId/orgId');

  const admin = createAdminClient();
  const { data: job, error } = await admin
    .from('transcription_jobs')
    .select('file_name, status, transcript_json, created_at, profile_id')
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

  // งานล้มเหลว → แจ้ง text
  if (job.status !== 'completed' || !job.transcript_json) {
    await sendLineMessages({
      to: lineUserId,
      messages: [{ type: 'text', text: '❌ ขออภัย แกะเสียงไม่สำเร็จ กรุณาลองส่งไฟล์ใหม่อีกครั้ง (พิมพ์ /mom)' }],
    });
    return ok({ delivered: 'error_notice' });
  }

  const renderUrl = process.env.PDF_RENDER_URL;
  const renderSecret = process.env.PDF_SERVICE_SECRET;
  if (!renderUrl) return Err.externalService('PDF renderer', 'ยังไม่ได้ตั้งค่า PDF_RENDER_URL');

  const tj = job.transcript_json as MomJson;
  const dateText = new Intl.DateTimeFormat('th-TH', {
    timeZone: 'Asia/Bangkok', day: 'numeric', month: 'long', year: 'numeric',
  }).format(new Date(job.created_at as string));

  // 1. HTML → PDF
  const resp = await fetch(`${renderUrl.replace(/\/$/, '')}/render`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(renderSecret ? { 'x-pdf-secret': renderSecret } : {}) },
    body: JSON.stringify({ html: buildMomHtml(tj, dateText), filename: 'minutes-of-meeting' }),
  });
  if (!resp.ok) {
    const detail = await resp.text().catch(() => '');
    return Err.externalService('PDF renderer', `${resp.status} ${detail}`.slice(0, 300));
  }
  const pdfBytes = Buffer.from(await resp.arrayBuffer());

  // 2. upload + signed URL (7 วัน)
  const path = `${orgId}/mom/${jobId}.pdf`;
  const { error: upErr } = await admin.storage
    .from(BUCKET)
    .upload(path, pdfBytes, { contentType: 'application/pdf', upsert: true });
  if (upErr) return Err.externalService('Storage', upErr.message);

  const { data: signed, error: signErr } = await admin.storage
    .from(BUCKET)
    .createSignedUrl(path, 7 * 24 * 60 * 60, { download: `MoM-${jobId}.pdf` });
  if (signErr || !signed?.signedUrl) return Err.externalService('Storage', signErr?.message ?? 'signed url failed');

  // 3. push Flex (ปุ่มดาวน์โหลด) กลับ LINE
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
            { type: 'text', text: '📋 รายงานการประชุม (MoM)', weight: 'bold', size: 'md', color: '#0284c7' },
            { type: 'text', text: meetingTitle, size: 'sm', wrap: true, color: '#111827' },
            { type: 'text', text: 'แกะเสียงเสร็จแล้ว กดปุ่มด้านล่างเพื่อดาวน์โหลดไฟล์ PDF', size: 'xs', wrap: true, color: '#6b7280' },
          ],
        },
        footer: {
          type: 'box', layout: 'vertical',
          contents: [
            { type: 'button', style: 'primary', color: '#0284c7', height: 'sm',
              action: { type: 'uri', label: 'ดาวน์โหลด MoM (PDF)', uri: signed.signedUrl } },
          ],
        },
      },
    }],
  });

  if (!sent.ok) return Err.externalService('LINE', sent.error);
  return ok({ delivered: true });
}
