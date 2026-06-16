/**
 * POST /api/assistant/transcribe/mom-pdf
 *   body: { orgId, jobId }
 *   — สร้างรายงานการประชุม (Minutes of Meeting) เป็น PDF ผ่าน pdf-renderer (Chromium)
 *     เพื่อให้ภาษาไทย shaping ถูกต้อง (สระล่าง/ตัวสะกดไม่ตกหล่นแบบ @react-pdf)
 */

import { NextRequest } from 'next/server';
import { requireModuleMember } from '../../../_lib/module-auth';
import { createAdminClient } from '../../../_lib/supabase';
import { Err } from '../../../_lib/response';
import { buildMomHtml, type MomJson } from '@/lib/assistant/mom-html';

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const { orgId, jobId } = body ?? {};
  if (!orgId) return Err.missingField('orgId');
  if (!jobId) return Err.missingField('jobId');

  const auth = await requireModuleMember(req, orgId, 'assistant');
  if (!auth.ok) return auth.res;

  const renderUrl = process.env.PDF_RENDER_URL;
  const renderSecret = process.env.PDF_SERVICE_SECRET;
  if (!renderUrl) return Err.externalService('PDF renderer', 'ยังไม่ได้ตั้งค่า PDF_RENDER_URL');

  const admin = createAdminClient();
  const { data: job, error } = await admin
    .from('transcription_jobs')
    .select('file_name, status, transcript_json, created_at')
    .eq('id', jobId)
    .eq('org_id', orgId)
    .maybeSingle();
  if (error) return Err.dbError(error);
  if (!job) return Err.notFound(`Transcription job ${jobId}`);
  if (job.status !== 'completed' || !job.transcript_json) {
    return Err.invalidFormat('jobId', 'งานนี้ยังไม่มีผลสรุปให้สร้าง PDF');
  }

  const tj = job.transcript_json as MomJson;
  const dateText = new Intl.DateTimeFormat('th-TH', {
    timeZone: 'Asia/Bangkok',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date(job.created_at as string));

  const html = buildMomHtml(tj, dateText);
  // ชื่อไฟล์ฝั่ง server เป็น ASCII (กันปัญหา encode header) — ชื่อไทยจริงตั้งที่ frontend (a.download)
  const filename = 'minutes-of-meeting';

  const resp = await fetch(`${renderUrl.replace(/\/$/, '')}/render`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(renderSecret ? { 'x-pdf-secret': renderSecret } : {}),
    },
    body: JSON.stringify({ html, filename }),
  }).catch((e) => {
    throw e;
  });

  if (!resp.ok) {
    const detail = await resp.text().catch(() => '');
    return Err.externalService('PDF renderer', `${resp.status} ${detail}`.slice(0, 300));
  }

  const pdf = await resp.arrayBuffer();
  return new Response(pdf, {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}.pdf"`,
      'Cache-Control': 'no-store',
    },
  });
}
