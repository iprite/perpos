import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '../../_lib/auth';
import { createAdminClient } from '../../_lib/supabase';

/** สถานะปฏิทิน: เชื่อม Google แล้วหรือยัง + เปิดเตือน/ส่งบอทจากปฏิทินไหม */
export async function GET(req: NextRequest) {
  const auth = await requireUser(req);
  if (!auth.ok) return auth.res;
  const admin = createAdminClient();

  const [{ data: tok }, { data: settings }] = await Promise.all([
    admin.from('google_drive_tokens').select('profile_id').eq('profile_id', auth.userId).maybeSingle(),
    admin.from('meeting_calendar_settings').select('auto_remind_enabled, save_mom_to_drive, save_audio_to_drive').eq('profile_id', auth.userId).maybeSingle(),
  ]);
  const s = settings as { auto_remind_enabled?: boolean; save_mom_to_drive?: boolean; save_audio_to_drive?: boolean } | null;

  return NextResponse.json({
    ok: true,
    connected: Boolean(tok?.profile_id),
    // ไม่มี row = ยังไม่เคยเปิด → ถือว่าปิด (เปิด = สร้าง/เปิด row → scheduler ถึงจะ sync)
    autoRemind: Boolean(s?.auto_remind_enabled),
    saveMom: Boolean(s?.save_mom_to_drive),
    saveAudio: Boolean(s?.save_audio_to_drive),
  });
}

/** เปิด/ปิดการเตือน+ส่งบอทจากปฏิทิน (upsert meeting_calendar_settings) */
export async function PUT(req: NextRequest) {
  const auth = await requireUser(req);
  if (!auth.ok) return auth.res;
  const body = (await req.json().catch(() => ({}))) as { autoRemind?: boolean; saveMom?: boolean; saveAudio?: boolean };

  // รับเฉพาะ field ที่ส่งมา (อัปเดตทีละ toggle ได้)
  const patch: Record<string, unknown> = { profile_id: auth.userId, updated_at: new Date().toISOString() };
  if (typeof body.autoRemind === 'boolean') patch.auto_remind_enabled = body.autoRemind;
  if (typeof body.saveMom === 'boolean') patch.save_mom_to_drive = body.saveMom;
  if (typeof body.saveAudio === 'boolean') patch.save_audio_to_drive = body.saveAudio;

  const admin = createAdminClient();
  await admin.from('meeting_calendar_settings').upsert(patch, { onConflict: 'profile_id' });

  // PDPA §8 — เปิดเตือน+ส่งบอทจากปฏิทิน (หลังเห็นข้อกำหนดในหน้านี้) = บันทึกความยินยอม
  //   ปิดช่องโหว่: ผู้ใช้ที่ใช้เฉพาะ calendar auto-join (ไม่เคยวางลิงก์ใน LINE) ก็ต้องมี consent ก่อนบอทเข้าห้อง
  if (body.autoRemind === true) {
    await admin.from('profiles').update({ bot_consent_at: new Date().toISOString() })
      .eq('id', auth.userId).is('bot_consent_at', null);
  }
  return NextResponse.json({ ok: true });
}
