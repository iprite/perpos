import type { SupabaseClient } from '@supabase/supabase-js';

export type TriggerResult = { ok: boolean; queued?: boolean; error?: string };

/**
 * Claim a pending transcription job และส่งไปประมวลผลที่ stt-worker (Cloud Run).
 * ใช้ร่วมกันโดย jobs/process route (เว็บ) และ LINE webhook (/mom).
 *
 * ถ้า worker ไม่ว่าง (429 / 5xx / network/timeout) = "คิวเต็มชั่วคราว" → **ไม่ทิ้งงาน**
 * แต่คืนสถานะเป็น `pending` แล้วให้ scheduler ยิงซ้ำเมื่อ instance ว่าง (DB เป็น retry queue)
 * → คืน { ok:false, queued:true }. ส่วน error จริง (4xx อื่น) → mark failed → { ok:false }
 */
export async function triggerSttWorker(
  admin: SupabaseClient,
  jobId: string,
  orgId: string,
): Promise<TriggerResult> {
  const workerUrl = process.env.STT_WORKER_URL;
  const workerSecret = process.env.WORKER_SECRET;
  if (!workerUrl || !workerSecret) {
    return { ok: false, error: 'ยังไม่ได้ตั้งค่า STT_WORKER_URL / WORKER_SECRET' };
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

  // คืนงานเป็น pending → scheduler จะ re-trigger เมื่อ instance ว่าง (ไม่ทิ้งงาน)
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
      signal: AbortSignal.timeout(15_000), // worker ตอบ 202 เร็ว; ถ้าช้า/แขวน = ไม่ว่าง → เข้าคิว
    });
  } catch (e) {
    await requeue(); // network/timeout (cold start, instance ไม่ว่าง) → เข้าคิว
    return { ok: false, queued: true, error: e instanceof Error ? e.message : String(e) };
  }

  if (resp.ok) return { ok: true };

  // 429 (too many requests) หรือ 5xx (instance ไม่ว่าง/สเกลไม่ทัน) → เข้าคิว ไม่ทิ้งงาน
  if (resp.status === 429 || resp.status >= 500) {
    await requeue();
    return { ok: false, queued: true, error: `worker ${resp.status}` };
  }

  // error จริง (4xx อื่น เช่น 400/401/403) → fail
  await admin
    .from('assistant_jobs')
    .update({ status: 'failed', error_message: 'ส่งงานไปยังระบบวิเคราะห์ไม่สำเร็จ', updated_at: new Date().toISOString() })
    .eq('id', jobId);
  return { ok: false, error: `worker ${resp.status}` };
}
