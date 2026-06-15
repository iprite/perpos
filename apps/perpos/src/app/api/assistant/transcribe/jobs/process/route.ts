/**
 * API Route Handler: /api/assistant/transcribe/jobs/process
 *
 * POST /api/assistant/transcribe/jobs/process
 *   — Lightweight trigger. Claims the job (status -> 'processing') and hands the
 *     heavy work (download + Gemini Files API + transcription/diarization) off to
 *     the Cloud Run stt-worker, which returns 202 immediately and writes the
 *     transcript back to transcription_jobs asynchronously. The UI polls for it.
 *   body: { jobId, orgId }
 */

import { NextRequest } from 'next/server';
import { requireModuleMember } from '../../../../_lib/module-auth';
import { createAdminClient } from '../../../../_lib/supabase';
import { ok, Err } from '../../../../_lib/response';

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const { jobId, orgId } = body ?? {};

  if (!jobId) return Err.missingField('jobId');
  if (!orgId) return Err.missingField('orgId');

  const auth = await requireModuleMember(req, orgId, 'assistant');
  if (!auth.ok) return auth.res;

  const workerUrl = process.env.STT_WORKER_URL;
  const workerSecret = process.env.WORKER_SECRET;
  if (!workerUrl || !workerSecret) {
    return Err.externalService('STT worker', 'ยังไม่ได้ตั้งค่า STT_WORKER_URL / WORKER_SECRET');
  }

  const admin = createAdminClient();

  // Load job (scoped to the org)
  const { data: job, error: jobError } = await admin
    .from('transcription_jobs')
    .select('id, status')
    .eq('id', jobId)
    .eq('org_id', orgId)
    .maybeSingle();

  if (jobError) return Err.dbError(jobError);
  if (!job) return Err.notFound(`Transcription Job ID ${jobId}`);

  if (job.status === 'completed') {
    return ok({ message: 'งานแกะเสียงเสร็จสมบูรณ์แล้ว', status: 'completed' });
  }

  // Atomically claim the job: only succeeds when it is still pending/failed.
  // Prevents double-processing (concurrency) and duplicate Gemini spend.
  const { data: claimed, error: claimError } = await admin
    .from('transcription_jobs')
    .update({ status: 'processing', error_message: null, updated_at: new Date().toISOString() })
    .eq('id', jobId)
    .in('status', ['pending', 'failed'])
    .select('id');

  if (claimError) return Err.dbError(claimError);
  if (!claimed || claimed.length === 0) {
    // Already processing (or just completed) — idempotent no-op.
    return ok({ message: 'งานนี้กำลังประมวลผลอยู่แล้ว', status: 'processing' });
  }

  // Hand off to the Cloud Run worker (returns 202 fast; heavy work runs there).
  try {
    const resp = await fetch(`${workerUrl.replace(/\/$/, '')}/process`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-worker-secret': workerSecret,
      },
      body: JSON.stringify({ jobId, orgId }),
    });

    if (!resp.ok) {
      throw new Error(`worker responded ${resp.status}`);
    }
  } catch (e) {
    // Revert the claim so the user can retry.
    await admin
      .from('transcription_jobs')
      .update({
        status: 'failed',
        error_message: 'ไม่สามารถส่งงานไปยังระบบแกะเสียงได้ กรุณาลองใหม่',
        updated_at: new Date().toISOString(),
      })
      .eq('id', jobId);

    return Err.externalService('STT worker', String(e));
  }

  return ok({ message: 'ส่งงานเข้าระบบแกะเสียงแล้ว กำลังประมวลผล', status: 'processing' });
}
