import { getAdminClient } from '../lib/supabase';
import { downloadLineContent } from '../lib/line';
import { compressPdf, UserFacingError, PDF_BUCKET } from './pdf.service';

// ── Public entrypoint (never throws — invoked fire-and-forget) ──────────────
export async function processJob(jobId: string, orgId: string): Promise<void> {
  try {
    await runJob(jobId, orgId);
  } catch (e) {
    console.error(`[pdf-worker] unhandled error job ${jobId}:`, e instanceof Error ? e.message : String(e));
  }
}

async function runJob(jobId: string, orgId: string): Promise<void> {
  const admin = getAdminClient();

  const { data: job, error } = await admin
    .from('assistant_jobs')
    .select('id, status, source, line_message_id, file_name, profile_id, pdf_meta')
    .eq('id', jobId)
    .eq('org_id', orgId)
    .maybeSingle();
  if (error) {
    console.error(`[pdf-worker] load job ${jobId} failed:`, error.message);
    return;
  }
  if (!job) {
    console.warn(`[pdf-worker] job ${jobId} not found for org ${orgId}`);
    return;
  }
  if (job.status === 'completed') {
    console.log(`[pdf-worker] job ${jobId} already completed; skip.`);
    return;
  }

  try {
    // 1. หาไฟล์ต้นฉบับ — งาน LINE โหลดเองจาก content API (เก็บ webhook ให้เร็ว)
    let bytes: Buffer;
    if (job.source === 'line' && job.line_message_id) {
      bytes = await downloadLineContent(String(job.line_message_id));
    } else {
      throw new Error(`unsupported source for pdf job: ${job.source}`);
    }

    // 2. บีบ (python pikepdf+pillow) — โยน UserFacingError ถ้าเกินเพดาน/ไฟล์เสีย
    const result = await compressPdf(bytes);
    const profileId = String(job.profile_id ?? '');

    // 3. หักโควต้าตามจำนวนหน้า (atomic reserve) — บีบ deterministic ราคาถูก จึงบีบก่อนแล้วค่อยหัก
    //    ⚠️ บีบไม่ลง (noGain) = ไม่คิดหน้า (ส่งไฟล์เดิมคืนฟรี) — หักเฉพาะตอนบีบได้จริง
    let reserved = false;
    if (!result.noGain) {
      const reserve = (await admin.rpc('consume_pdf_quota', {
        p_profile_id: profileId, p_pages: result.pages, p_job_id: jobId, p_source: 'line',
      })).data as { ok?: boolean; remaining_pages?: number } | null;
      if (!reserve?.ok) {
        const remain = Math.max(0, reserve?.remaining_pages ?? 0);
        console.log(`[pdf-worker] job ${jobId} quota exceeded (file ${result.pages}p, remain ${remain}p)`);
        await admin.from('assistant_jobs').update({
          status: 'failed',
          error_message: `โควต้าไม่พอ — ไฟล์นี้ ${result.pages} หน้า แต่โควต้าคงเหลือ ${remain} หน้า`,
          updated_at: new Date().toISOString(),
        }).eq('id', jobId);
        await deliverToLine(jobId, orgId).catch(() => undefined);
        return;
      }
      reserved = true;
    }

    // จองโควต้าแล้ว → งานหลังจากนี้ล้ม ต้องคืน (refund_pdf_job idempotent)
    try {
      // 4. อัปผลลัพธ์เข้า bucket (ถ้า noGain = คืนไฟล์เดิม ก็อัปไว้ให้ดาวน์โหลดได้)
      const outputPath = `${orgId}/${jobId}-compressed.pdf`;
      const { error: upErr } = await admin.storage
        .from(PDF_BUCKET)
        .upload(outputPath, result.bytes, { contentType: 'application/pdf', upsert: true });
      if (upErr) throw new Error(`upload output failed: ${upErr.message}`);

      // 5. mark completed + เก็บผลใน pdf_meta — guard บน status≠completed กัน race กับ stuck-sweep
      const { data: finalized, error: updErr } = await admin
        .from('assistant_jobs')
        .update({
          status: 'completed',
          error_message: null,
          file_size: result.sizeBefore,
          pdf_meta: {
            output_path: outputPath,
            pages: result.pages,
            size_before: result.sizeBefore,
            size_after: result.sizeAfter,
            ratio: result.ratio,
            no_gain: result.noGain,
          },
          updated_at: new Date().toISOString(),
        })
        .eq('id', jobId)
        .neq('status', 'completed')
        .select('id');
      if (updErr) throw new Error(updErr.message);
      if (!finalized || finalized.length === 0) {
        console.warn(`[pdf-worker] job ${jobId} no longer pending — skip delivery.`);
        return;
      }

      console.log(`[pdf-worker] job ${jobId} done (${result.pages}p, ${result.sizeBefore}→${result.sizeAfter}, ${Math.round(result.ratio * 100)}%).`);
      await deliverToLine(jobId, orgId);
    } catch (postErr) {
      // ล้มหลังจองโควต้า → คืนโควต้า (idempotent) แล้วโยนต่อให้ outer catch จัดการ
      if (reserved) await admin.rpc('refund_pdf_job', { p_job_id: jobId }).then(() => undefined, () => undefined);
      throw postErr;
    }
  } catch (err) {
    const raw = err instanceof Error ? err.message : String(err);
    console.error(`[pdf-worker] job ${jobId} failed:`, raw);
    const userMsg = err instanceof UserFacingError ? err.message : 'บีบไฟล์ไม่สำเร็จ กรุณาลองส่งไฟล์ใหม่อีกครั้ง';
    await admin
      .from('assistant_jobs')
      .update({ status: 'failed', error_message: userMsg, updated_at: new Date().toISOString() })
      .eq('id', jobId);
    await deliverToLine(jobId, orgId).catch(() => undefined);
  }
}

/** ให้ฝั่ง Next.js push Flex (ปุ่มดาวน์โหลด) กลับ LINE — secret-gated */
async function deliverToLine(jobId: string, orgId: string): Promise<void> {
  const baseUrl = (process.env.APP_BASE_URL ?? 'https://app.perpos.ai').replace(/\/$/, '');
  const secret = (process.env.WORKER_SECRET ?? '').trim();
  const resp = await fetch(`${baseUrl}/api/assistant/pdf/deliver`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-worker-secret': secret },
    body: JSON.stringify({ jobId, orgId }),
    signal: AbortSignal.timeout(60_000),
  });
  if (!resp.ok) throw new Error(`pdf-deliver responded ${resp.status}`);
}
