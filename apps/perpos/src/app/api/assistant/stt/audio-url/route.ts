/**
 * GET /api/assistant/stt/audio-url?jobId=<id>
 *   — signed URL (48 ชม.) ของไฟล์เสียง recording (เฉพาะงานบอท source='recall') ให้ผู้ใช้ดาวน์โหลดบนเว็บ
 */

import { NextRequest } from 'next/server';
import { requireAssistantUser } from '../../../_lib/assistant-auth';
import { createAdminClient } from '../../../_lib/supabase';
import { ok, Err } from '../../../_lib/response';

const BUCKET = 'assistant_audio';

export async function GET(req: NextRequest) {
  const auth = await requireAssistantUser(req);
  if (!auth.ok) return auth.res;

  const jobId = req.nextUrl.searchParams.get('jobId');
  if (!jobId) return Err.missingField('jobId');

  const admin = createAdminClient();
  const { data: job } = await admin
    .from('assistant_jobs')
    .select('id, org_id, profile_id, source, audio_url')
    .eq('id', jobId)
    .maybeSingle();
  if (!job) return Err.notFound(`job ${jobId}`);
  if ((job as { profile_id?: string }).profile_id !== auth.userId) return Err.forbidden();
  if ((job as { source?: string }).source !== 'recall') return Err.invalidFormat('job', 'ไม่มีไฟล์เสียงให้ดาวน์โหลด');

  const audioUrl = (job as { audio_url?: string | null }).audio_url ?? '';
  const path = audioUrl && !audioUrl.startsWith('recall:')
    ? audioUrl
    : `${(job as { org_id: string }).org_id}/recall/${jobId}.mp3`;

  const { data: signed, error } = await admin.storage
    .from(BUCKET)
    .createSignedUrl(path, 48 * 60 * 60, { download: `recording-${jobId}.mp3` });
  if (error || !signed?.signedUrl) return Err.notFound('ไฟล์เสียง (อาจหมดอายุหรือถูกลบแล้ว)');

  return ok({ url: signed.signedUrl });
}
