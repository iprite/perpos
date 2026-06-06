/**
 * API Route Handler: /api/acc-firm/ocr/jobs/process
 *
 * POST /api/acc-firm/ocr/jobs/process
 *   — Lightweight trigger. Claims the job (status -> 'processing') and hands the
 *     heavy AI pipeline (download + Gemini OCR/classify/journal) off to the
 *     Cloud Run ocr-worker, which returns 202 immediately and writes results back
 *     to ocr_processing_jobs asynchronously. The UI polls for completion.
 *   body: { jobId, firmOrgId }
 */

import { NextRequest } from 'next/server';
import { requireModuleMember } from '../../../../_lib/module-auth';
import { createAdminClient } from '../../../../_lib/supabase';
import { ok, Err } from '../../../../_lib/response';

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const { jobId, firmOrgId } = body ?? {};

  if (!jobId) return Err.missingField('jobId');
  if (!firmOrgId) return Err.missingField('firmOrgId');

  const auth = await requireModuleMember(req, firmOrgId, 'acc_firm');
  if (!auth.ok) return auth.res;

  if (auth.moduleRole === 'viewer') {
    return Err.forbidden('ไม่มีสิทธิ์สั่งดำเนินการประมวลผล OCR');
  }

  const workerUrl = process.env.OCR_WORKER_URL;
  const workerSecret = process.env.WORKER_SECRET;
  if (!workerUrl || !workerSecret) {
    return Err.externalService('OCR worker', 'ยังไม่ได้ตั้งค่า OCR_WORKER_URL / WORKER_SECRET');
  }

  const admin = createAdminClient();

  // Load job (scoped to the firm)
  const { data: job, error: jobError } = await admin
    .from('ocr_processing_jobs')
    .select('id, status, client_org_id')
    .eq('id', jobId)
    .eq('firm_org_id', firmOrgId)
    .maybeSingle();

  if (jobError) return Err.dbError(jobError);
  if (!job) return Err.notFound(`OCR Job ID ${jobId}`);

  if (job.status === 'completed') {
    return ok({ message: 'งานประมวลผลเสร็จสมบูรณ์แล้ว', status: 'completed' });
  }

  // Client relationship must still be active
  const { data: relation, error: relError } = await admin
    .from('acc_firm_clients')
    .select('id, status')
    .eq('firm_org_id', firmOrgId)
    .eq('client_org_id', job.client_org_id)
    .maybeSingle();

  if (relError) return Err.dbError(relError);
  if (!relation || relation.status !== 'active') {
    return Err.forbidden('ความสัมพันธ์ลูกค้าไม่อยู่ในสถานะที่ใช้งานได้');
  }

  // Atomically claim the job: only succeeds when it is still pending/failed.
  // Prevents double-processing (concurrency) and duplicate Gemini spend.
  const { data: claimed, error: claimError } = await admin
    .from('ocr_processing_jobs')
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
      body: JSON.stringify({ jobId, firmOrgId }),
    });

    if (!resp.ok) {
      throw new Error(`worker responded ${resp.status}`);
    }
  } catch (e) {
    // Revert the claim so the user can retry.
    await admin
      .from('ocr_processing_jobs')
      .update({
        status: 'failed',
        error_message: 'ไม่สามารถส่งงานไปยังระบบวิเคราะห์ได้ กรุณาลองใหม่',
        updated_at: new Date().toISOString(),
      })
      .eq('id', jobId);

    return Err.externalService('OCR worker', String(e));
  }

  return ok({ message: 'ส่งงานเข้าระบบวิเคราะห์แล้ว กำลังประมวลผล', status: 'processing' });
}
