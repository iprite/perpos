/**
 * API Route Handler: /api/assistant/jobs/process
 *
 * POST /api/assistant/jobs/process
 *   — Lightweight trigger. Claims the job (status -> 'processing') and hands the
 *     heavy work (download + Gemini Files API + transcription/diarization) off to
 *     the Cloud Run stt-worker, which returns 202 immediately and writes the
 *     transcript back to assistant_jobs asynchronously. The UI polls for it.
 *   body: { jobId, orgId }
 */

import { NextRequest } from 'next/server';
import { requireAssistantUser } from '../../../_lib/assistant-auth';
import { createAdminClient } from '../../../_lib/supabase';
import { ok, Err } from '../../../_lib/response';
import { triggerSttWorker } from '@/lib/assistant/stt-trigger';

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const { jobId } = body ?? {};

  if (!jobId) return Err.missingField('jobId');

  const auth = await requireAssistantUser(req);
  if (!auth.ok) return auth.res;

  const admin = createAdminClient();

  // Load job (scoped to ตัวผู้ใช้) — ใช้ org_id ที่ผูกกับงานเรียก worker
  const { data: job, error: jobError } = await admin
    .from('assistant_jobs')
    .select('id, status, org_id')
    .eq('id', jobId)
    .eq('profile_id', auth.userId)
    .maybeSingle();

  if (jobError) return Err.dbError(jobError);
  if (!job) return Err.notFound(`Transcription Job ID ${jobId}`);
  if (job.status === 'completed') {
    return ok({ message: 'งานถอดเสียงเสร็จสมบูรณ์แล้ว', status: 'completed' });
  }

  // claim + ส่งไป worker (shared) — ถ้าคิวเต็ม (queued) งานคงสถานะ pending ให้ scheduler ยิงซ้ำ
  const trig = await triggerSttWorker(admin, jobId, job.org_id as string);
  if (trig.ok) {
    return ok({ message: 'ส่งงานเข้าระบบถอดเสียงแล้ว กำลังประมวลผล', status: 'processing' });
  }
  if (trig.queued) {
    return ok({
      message: 'ขณะนี้มีงานจำนวนมาก งานของคุณเข้าคิวแล้ว ระบบจะประมวลผลให้อัตโนมัติเมื่อถึงคิว',
      status: 'pending',
      queued: true,
    });
  }
  return Err.externalService('STT worker', trig.error ?? 'trigger failed');
}
