/**
 * POST /api/assistant/pdf/deliver
 *   body: { jobId, orgId }   header: x-worker-secret
 *   — เรียกจาก pdf-compress-worker เมื่อบีบ PDF (source='line') เสร็จ:
 *     สร้าง signed URL ของไฟล์ที่บีบแล้ว → push Flex (ปุ่มดาวน์โหลด + ก่อน/หลัง) กลับ LINE
 *     (LINE bot แนบไฟล์ตรง ๆ ไม่ได้ จึงส่งเป็นลิงก์)
 */

import { NextRequest } from 'next/server';
import { createAdminClient } from '../../../_lib/supabase';
import { ok, Err } from '../../../_lib/response';
import { sendLineMessages } from '@/lib/line/send-messages';

const BUCKET = 'assistant_pdf';

function fmtMB(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function buildFailFlex(reason: string) {
  const detail = reason && reason.trim() ? reason : 'ขออภัย ไม่สามารถบีบไฟล์ PDF นี้ได้';
  return {
    type: 'flex' as const,
    altText: `บีบ PDF ไม่สำเร็จ — ${detail}`.slice(0, 380),
    contents: {
      type: 'bubble',
      header: {
        type: 'box', layout: 'vertical', backgroundColor: '#C43448', paddingAll: '14px',
        contents: [{ type: 'text', text: '❌ บีบ PDF ไม่สำเร็จ', color: '#ffffff', weight: 'bold', size: 'md' }],
      },
      body: {
        type: 'box', layout: 'vertical', spacing: 'sm', paddingAll: '18px',
        contents: [
          { type: 'text', text: detail, size: 'sm', wrap: true, color: '#3C3B3D' },
          { type: 'separator', margin: 'md' },
          { type: 'text', text: 'พิมพ์ /pdf แล้วส่งไฟล์ใหม่อีกครั้งได้เลยครับ 🙏', size: 'xs', wrap: true, color: '#9CA3AF', margin: 'md' },
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
    .select('file_name, status, error_message, profile_id, pdf_meta, pdf_drive_url')
    .eq('id', jobId)
    .eq('org_id', orgId)
    .maybeSingle();
  if (error) return Err.dbError(error);
  if (!job) return Err.notFound(`PDF job ${jobId}`);

  const { data: profile } = await admin
    .from('profiles')
    .select('line_user_id')
    .eq('id', job.profile_id as string)
    .maybeSingle();
  const lineUserId = (profile as { line_user_id?: string } | null)?.line_user_id;
  if (!lineUserId) return ok({ skipped: 'no line_user_id' });

  // งานล้มเหลว → แจ้งด้วย Flex (ใช้ error_message ที่เป็นมิตรจาก worker)
  const meta = (job.pdf_meta ?? null) as
    | { output_path?: string; pages?: number; size_before?: number; size_after?: number; ratio?: number; no_gain?: boolean }
    | null;
  if (job.status !== 'completed' || !meta?.output_path) {
    await sendLineMessages({ to: lineUserId, messages: [buildFailFlex(String(job.error_message ?? ''))] });
    return ok({ delivered: 'error_notice' });
  }

  const fileName = String(job.file_name ?? 'document.pdf');
  const dlName = fileName.replace(/\.pdf$/i, '') + '-compressed.pdf';
  const { data: signed, error: signErr } = await admin.storage
    .from(BUCKET)
    .createSignedUrl(meta.output_path, 48 * 60 * 60, { download: dlName });
  if (signErr || !signed?.signedUrl) {
    await sendLineMessages({ to: lineUserId, messages: [buildFailFlex('สร้างลิงก์ดาวน์โหลดไม่สำเร็จ ลองใหม่ภายหลัง')] });
    return Err.externalService('pdf-deliver', signErr?.message ?? 'signed url failed');
  }

  const before = Number(meta.size_before ?? 0);
  const after = Number(meta.size_after ?? 0);
  const pct = Math.round(Number(meta.ratio ?? 0) * 100);
  const pages = Number(meta.pages ?? 0);
  const noGain = Boolean(meta.no_gain);

  // ข้อความผลลัพธ์ — กรณีบีบไม่ลง (ไฟล์เล็กที่สุดแล้ว) บอกตรง ๆ
  const resultLine = noGain
    ? 'ไฟล์นี้บีบให้เล็กลงอีกไม่ได้แล้ว (เหมาะสมที่สุดแล้ว)'
    : `${fmtMB(before)} → ${fmtMB(after)}  (ลด ${pct}%)`;

  const footerButtons: Record<string, unknown>[] = [
    { type: 'button', style: 'primary', color: '#3C3B3D', height: 'sm',
      action: { type: 'uri', label: 'ดาวน์โหลด PDF', uri: signed.signedUrl } },
  ];
  if (job.pdf_drive_url) {
    footerButtons.push({ type: 'button', style: 'secondary', height: 'sm', margin: 'sm',
      action: { type: 'uri', label: '📁 เปิดใน Google Drive', uri: String(job.pdf_drive_url) } });
  }

  const sent = await sendLineMessages({
    to: lineUserId,
    messages: [{
      type: 'flex',
      altText: `บีบ PDF เสร็จแล้ว: ${dlName}`,
      contents: {
        type: 'bubble',
        body: {
          type: 'box', layout: 'vertical', spacing: 'sm',
          contents: [
            { type: 'text', text: '📄 บีบ PDF เสร็จแล้ว', weight: 'bold', size: 'md', color: '#3C3B3D' },
            { type: 'text', text: fileName, size: 'sm', wrap: true, color: '#1A1A1B' },
            { type: 'text', text: resultLine, size: 'sm', wrap: true, color: noGain ? '#656D78' : '#46BC9E', weight: 'bold' },
            ...(pages ? [{ type: 'text', text: `${pages} หน้า`, size: 'xs', color: '#9CA3AF' } as const] : []),
            { type: 'separator', margin: 'md' },
            {
              type: 'box', layout: 'vertical', spacing: 'xs', margin: 'md',
              contents: [
                { type: 'text', text: '🔒 ความเป็นส่วนตัว', size: 'xs', weight: 'bold', color: '#656D78' },
                { type: 'text', text: 'ไฟล์จะถูกลบอัตโนมัติภายใน 48 ชั่วโมง กรุณาดาวน์โหลดเก็บไว้', size: 'xxs', wrap: true, color: '#9CA3AF' },
                { type: 'text', text: 'เราไม่นำข้อมูลของคุณไปใช้ฝึกหรือพัฒนาโมเดล AI ใด ๆ', size: 'xxs', wrap: true, color: '#9CA3AF' },
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
