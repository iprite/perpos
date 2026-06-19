import type { SupabaseClient } from '@supabase/supabase-js';

export type TriggerResult = { ok: boolean; queued?: boolean; error?: string };

/**
 * Claim งานบีบ PDF (kind=pdf_compress) แล้วส่งไป pdf-compress-worker (Cloud Run).
 * โครงเดียวกับ triggerSttWorker — worker ไม่ว่าง (429/5xx/timeout) = เข้าคิว (ไม่ทิ้งงาน)
 * คืน pending ให้ scheduler ยิงซ้ำ (P1g) · error จริง (4xx อื่น) = mark failed
 */
export async function triggerPdfWorker(
  admin: SupabaseClient,
  jobId: string,
  orgId: string,
): Promise<TriggerResult> {
  const workerUrl = process.env.PDF_COMPRESS_WORKER_URL;
  const workerSecret = process.env.WORKER_SECRET;
  if (!workerUrl || !workerSecret) {
    return { ok: false, error: 'ยังไม่ได้ตั้งค่า PDF_COMPRESS_WORKER_URL / WORKER_SECRET' };
  }

  // Atomic claim — succeed only while pending/failed (กัน double-process)
  const { data: claimed, error: claimErr } = await admin
    .from('assistant_jobs')
    .update({ status: 'processing', error_message: null, updated_at: new Date().toISOString() })
    .eq('id', jobId)
    .eq('org_id', orgId)
    .in('status', ['pending', 'failed'])
    .select('id');
  if (claimErr) return { ok: false, error: claimErr.message };
  if (!claimed || claimed.length === 0) return { ok: true }; // already processing/completed

  const requeue = () =>
    admin
      .from('assistant_jobs')
      .update({ status: 'pending', updated_at: new Date().toISOString() })
      .eq('id', jobId)
      .eq('status', 'processing')
      .then(() => undefined, () => undefined);

  let resp: Response;
  try {
    resp = await fetch(`${workerUrl.replace(/\/$/, '')}/process`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-worker-secret': workerSecret.trim() },
      body: JSON.stringify({ jobId, orgId }),
      signal: AbortSignal.timeout(15_000),
    });
  } catch (e) {
    await requeue();
    return { ok: false, queued: true, error: e instanceof Error ? e.message : String(e) };
  }

  if (resp.ok) return { ok: true };

  if (resp.status === 429 || resp.status >= 500) {
    await requeue();
    return { ok: false, queued: true, error: `worker ${resp.status}` };
  }

  await admin
    .from('assistant_jobs')
    .update({ status: 'failed', error_message: 'ส่งงานบีบ PDF ไม่สำเร็จ', updated_at: new Date().toISOString() })
    .eq('id', jobId);
  return { ok: false, error: `worker ${resp.status}` };
}
