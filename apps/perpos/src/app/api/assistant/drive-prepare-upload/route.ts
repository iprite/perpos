/**
 * POST /api/assistant/drive-prepare-upload  (x-worker-secret)
 *   stt-worker เรียกเพื่อขอ {accessToken, folderId} ก่อนอัปไฟล์เสียงลง Google Drive
 *   เก็บ OAuth creds ไว้ที่ Next ที่เดียว · worker upload bytes ไป Google ตรง (ไฟล์ใหญ่ไม่ผ่าน Next)
 *   เช็ก save_audio_to_drive (opt-in) ที่นี่ → ปิด/ไม่เชื่อม = ตอบ ok:false ให้ worker ข้าม
 */
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '../../_lib/supabase';
import { resolveDriveFolder } from '@/lib/google/drive';

export async function POST(req: NextRequest) {
  const required = (process.env.WORKER_SECRET ?? '').trim();
  const got = (req.headers.get('x-worker-secret') ?? '').trim();
  if (!required || got !== required) return NextResponse.json({ ok: false }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as { profileId?: string; refresh?: boolean };
  const profileId = String(body.profileId ?? '');
  if (!profileId) return NextResponse.json({ ok: false, reason: 'missing_profile' });

  const admin = createAdminClient();
  const { data: s } = await admin
    .from('meeting_calendar_settings')
    .select('save_audio_to_drive')
    .eq('profile_id', profileId)
    .maybeSingle();
  if (!(s as { save_audio_to_drive?: boolean } | null)?.save_audio_to_drive) {
    return NextResponse.json({ ok: false, reason: 'disabled' });
  }

  const resolved = await resolveDriveFolder(admin, profileId, 'audio', 'ไฟล์เสียง', body.refresh === true);
  if (!resolved) return NextResponse.json({ ok: false, reason: 'not_connected' });

  return NextResponse.json({ ok: true, accessToken: resolved.accessToken, folderId: resolved.folderId });
}
