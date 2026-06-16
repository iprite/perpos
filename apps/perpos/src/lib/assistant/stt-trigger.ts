import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Claim a pending transcription job และส่งไปประมวลผลที่ stt-worker (Cloud Run).
 * ใช้ร่วมกันโดย jobs/process route (เว็บ) และ LINE webhook (/mom).
 */
export async function triggerSttWorker(
  admin: SupabaseClient,
  jobId: string,
  orgId: string,
): Promise<{ ok: boolean; error?: string }> {
  const workerUrl = process.env.STT_WORKER_URL;
  const workerSecret = process.env.WORKER_SECRET;
  if (!workerUrl || !workerSecret) {
    return { ok: false, error: 'ยังไม่ได้ตั้งค่า STT_WORKER_URL / WORKER_SECRET' };
  }

  // Atomic claim — succeed only while pending/failed (กัน double-process)
  const { data: claimed, error: claimErr } = await admin
    .from('transcription_jobs')
    .update({ status: 'processing', error_message: null, updated_at: new Date().toISOString() })
    .eq('id', jobId)
    .eq('org_id', orgId)
    .in('status', ['pending', 'failed'])
    .select('id');
  if (claimErr) return { ok: false, error: claimErr.message };
  if (!claimed || claimed.length === 0) return { ok: true }; // already processing/completed

  try {
    const resp = await fetch(`${workerUrl.replace(/\/$/, '')}/process`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-worker-secret': workerSecret.trim() },
      body: JSON.stringify({ jobId, orgId }),
    });
    if (!resp.ok) throw new Error(`worker responded ${resp.status}`);
  } catch (e) {
    await admin
      .from('transcription_jobs')
      .update({ status: 'failed', error_message: 'ส่งงานไปยังระบบวิเคราะห์ไม่สำเร็จ', updated_at: new Date().toISOString() })
      .eq('id', jobId);
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
  return { ok: true };
}
