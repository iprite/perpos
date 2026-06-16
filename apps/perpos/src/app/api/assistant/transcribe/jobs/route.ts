/**
 * API Route Handler: /api/assistant/transcribe/jobs
 *
 * GET  /api/assistant/transcribe/jobs?orgId=<orgId>&jobId=<jobId>
 * GET  /api/assistant/transcribe/jobs?orgId=<orgId>
 *   — ดึงสถานะงานเดี่ยว หรือรายการงานแกะเสียงล่าสุดของ org (ใช้สำหรับ polling)
 *
 * POST /api/assistant/transcribe/jobs
 *   — ลงทะเบียนงานแกะเสียงใบใหม่
 *   body: { orgId, audioUrl, fileName, mimeType, model, fileSize? }
 */

import { NextRequest } from 'next/server';
import { requireAssistantUser } from '../../../_lib/assistant-auth';
import { createAdminClient } from '../../../_lib/supabase';
import { ok, created, Err } from '../../../_lib/response';

const ALLOWED_MODELS = ['gemini-2.5-flash'];
const MAX_FILE_BYTES = 200 * 1024 * 1024; // 200MB — ต้องตรงกับ file_size_limit ของ bucket

// ── GET: ดึงสถานะหรือรายการงาน (per-profile) ────────────────────────────────────
export async function GET(req: NextRequest) {
  const auth = await requireAssistantUser(req);
  if (!auth.ok) return auth.res;

  const jobId = req.nextUrl.searchParams.get('jobId');
  const limit = parseInt(req.nextUrl.searchParams.get('limit') || '30', 10);

  const admin = createAdminClient();

  if (jobId) {
    const { data: job, error } = await admin
      .from('transcription_jobs')
      .select('*')
      .eq('id', jobId)
      .eq('profile_id', auth.userId)
      .maybeSingle();

    if (error) return Err.dbError(error);
    if (!job) return Err.notFound(`Transcription Job ID ${jobId}`);

    return ok(job);
  }

  const { data: jobs, error } = await admin
    .from('transcription_jobs')
    .select('*')
    .eq('profile_id', auth.userId)
    .order('created_at', { ascending: false })
    .limit(Number.isFinite(limit) ? limit : 30);

  if (error) return Err.dbError(error);

  return ok(jobs || []);
}

// ── POST: สร้างงานใบใหม่ (per-profile; org = home org จาก guard) ─────────────────
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const { audioUrl, fileName, mimeType, model, fileSize } = body ?? {};

  if (!audioUrl) return Err.missingField('audioUrl');
  if (!fileName) return Err.missingField('fileName');
  if (!mimeType) return Err.missingField('mimeType');

  const auth = await requireAssistantUser(req);
  if (!auth.ok) return auth.res;
  const orgId = auth.orgId;

  const chosenModel = model ?? 'gemini-2.5-flash';
  if (!ALLOWED_MODELS.includes(chosenModel)) {
    return Err.invalidFormat('model', 'รองรับเฉพาะ gemini-2.5-flash');
  }

  if (typeof fileSize === 'number' && fileSize > MAX_FILE_BYTES) {
    return Err.outOfRange('fileSize', 0, MAX_FILE_BYTES);
  }

  // ── ป้องกันอ้างอิงไฟล์ข้ามคน (per-profile) ──
  // audioUrl ต้องอยู่ใต้โฟลเดอร์ของผู้ใช้เอง (`<profileId>/...`)
  const storagePath = String(audioUrl).includes('/assistant_audio/')
    ? String(audioUrl).split('/assistant_audio/')[1].split('?')[0]
    : String(audioUrl).split('?')[0];

  if (!storagePath.startsWith(`${auth.userId}/`)) {
    return Err.invalidFormat('audioUrl', 'เส้นทางไฟล์ต้องอยู่ภายใต้โฟลเดอร์ของผู้ใช้');
  }

  const admin = createAdminClient();

  const { data: profile } = await admin
    .from('profiles')
    .select('email')
    .eq('id', auth.userId)
    .maybeSingle();

  const { data: job, error } = await admin
    .from('transcription_jobs')
    .insert({
      org_id:             orgId,
      profile_id:         auth.userId,
      audio_url:          storagePath,
      file_name:          String(fileName).slice(0, 255),
      mime_type:          String(mimeType),
      file_size:          typeof fileSize === 'number' ? fileSize : null,
      model:              chosenModel,
      status:             'pending',
      triggered_by:       auth.userId,
      triggered_by_email: profile?.email ?? null,
    })
    .select('*')
    .single();

  if (error) return Err.dbError(error);

  return created(job);
}
