/**
 * Super admin: มอนิเตอร์งานแกะเสียง (assistant_jobs) ทั้งระบบ
 *   GET  /api/admin/stt-jobs?status=&source=&limit=   — รายการงานล่าสุด + ชื่อผู้ใช้
 *   POST /api/admin/stt-jobs   body { jobId, action: 'fail' }
 *        — ปิดงานที่ค้าง (pending/processing) เป็น failed + คืนโควต้าที่ debit ไปแล้ว
 *
 * ใช้แก้กับดักที่ AGENTS.md เตือน: job ค้าง pending/processing เพราะ Cloud Run CPU throttling
 * → admin เคลียร์เองได้ และผู้ใช้ได้โควต้าคืน
 */

import { NextRequest } from 'next/server';
import { requireAdmin } from '../../_lib/auth';
import { createAdminClient } from '../../_lib/supabase';
import { ok, Err } from '../../_lib/response';
import { logAdminAction } from '../../_lib/admin-audit';

const VALID_STATUS = ['pending', 'processing', 'completed', 'failed'] as const;
const VALID_SOURCE = ['web', 'line'] as const;

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (!auth.ok) return auth.res;

  const sp = req.nextUrl.searchParams;
  const status = sp.get('status');
  const source = sp.get('source');
  const limit = Math.min(200, Math.max(1, parseInt(sp.get('limit') ?? '100', 10) || 100));

  const admin = createAdminClient();
  let q = admin
    .from('assistant_jobs')
    .select('id, profile_id, file_name, mime_type, file_size, duration_seconds, model, status, source, error_message, created_at, updated_at')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (status && (VALID_STATUS as readonly string[]).includes(status)) q = q.eq('status', status);
  if (source && (VALID_SOURCE as readonly string[]).includes(source)) q = q.eq('source', source);

  const { data: jobs, error } = await q;
  if (error) return Err.dbError(error);

  // เติมชื่อผู้ใช้
  const ids = Array.from(new Set((jobs ?? []).map((j) => j.profile_id).filter(Boolean))) as string[];
  const nameById = new Map<string, string>();
  if (ids.length) {
    const { data: profiles } = await admin.from('profiles').select('id, display_name').in('id', ids);
    for (const p of profiles ?? []) nameById.set(p.id as string, (p.display_name as string) ?? 'ผู้ใช้');
  }

  // นับสรุปตามสถานะ (ทั้งระบบ ไม่จำกัด limit)
  const counts: Record<string, number> = { pending: 0, processing: 0, completed: 0, failed: 0 };
  const { data: allStatuses } = await admin.from('assistant_jobs').select('status');
  for (const r of allStatuses ?? []) {
    const s = r.status as string;
    if (s in counts) counts[s] += 1;
  }

  const items = (jobs ?? []).map((j) => ({
    id: j.id,
    profile_id: j.profile_id,
    display_name: j.profile_id ? (nameById.get(j.profile_id as string) ?? 'ผู้ใช้') : '—',
    file_name: j.file_name,
    file_size: j.file_size,
    duration_seconds: j.duration_seconds,
    model: j.model,
    status: j.status,
    source: j.source,
    error_message: j.error_message,
    created_at: j.created_at,
    updated_at: j.updated_at,
  }));

  return ok({ items, counts });
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (!auth.ok) return auth.res;

  const body = await req.json().catch(() => null);
  const { jobId, action } = body ?? {};
  if (!jobId) return Err.missingField('jobId');
  if (action !== 'fail') return Err.invalidFormat('action', "รองรับเฉพาะ 'fail'");

  const admin = createAdminClient();
  const { data: job, error: jErr } = await admin
    .from('assistant_jobs')
    .select('id, profile_id, status')
    .eq('id', jobId)
    .maybeSingle();
  if (jErr) return Err.dbError(jErr);
  if (!job) return Err.missingField('jobId');
  if (job.status === 'completed' || job.status === 'failed') {
    return Err.invalidFormat('status', 'งานนี้จบแล้ว (completed/failed) คืนโควต้าไม่ได้');
  }

  // คืนโควต้า: หายอด debit ที่ผูกกับ job นี้ (ยังไม่เคย refund)
  let refundedSeconds = 0;
  if (job.profile_id) {
    const { data: txns } = await admin
      .from('stt_usage_transactions')
      .select('kind, duration_seconds')
      .eq('job_id', jobId);
    const debited = (txns ?? []).filter((t) => t.kind === 'debit').reduce((s, t) => s + (Number(t.duration_seconds) || 0), 0);
    const refunded = (txns ?? []).filter((t) => t.kind === 'refund').reduce((s, t) => s + (Number(t.duration_seconds) || 0), 0);
    refundedSeconds = Math.max(0, debited - refunded);
    if (refundedSeconds > 0) {
      const { error: rErr } = await admin.rpc('refund_stt_quota', {
        p_profile_id: job.profile_id,
        p_seconds: refundedSeconds,
        p_job_id: jobId,
      });
      if (rErr) return Err.dbError(rErr);
    }
  }

  const { error: uErr } = await admin
    .from('assistant_jobs')
    .update({ status: 'failed', error_message: 'ปิดงานโดยแอดมิน (ค้างเกินกำหนด) + คืนโควต้า', updated_at: new Date().toISOString() })
    .eq('id', jobId);
  if (uErr) return Err.dbError(uErr);

  await logAdminAction(req, auth.userId, {
    action: 'stt.job_fail_refund',
    targetType: 'stt_job',
    targetId: jobId,
    metadata: { profile_id: job.profile_id, refunded_seconds: refundedSeconds },
  });

  return ok({ jobId, status: 'failed', refunded_seconds: refundedSeconds });
}
