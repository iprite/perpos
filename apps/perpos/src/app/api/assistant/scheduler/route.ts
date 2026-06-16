import { NextRequest, NextResponse } from 'next/server';
import { requireCron } from '../../_lib/auth';
import { createAdminClient } from '../../_lib/supabase';
import { triggerSttWorker } from '@/lib/assistant/stt-trigger';

const BKK = 'Asia/Bangkok';

function bkkHourMin(now: Date) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: BKK, hour: 'numeric', minute: 'numeric', hour12: false,
  }).formatToParts(now);
  const hour = Number(parts.find((p) => p.type === 'hour')?.value ?? 0);
  const minute = Number(parts.find((p) => p.type === 'minute')?.value ?? 0);
  return { hour, minute };
}

async function pushLine(accessToken: string, to: string, text: string) {
  await fetch('https://api.line.me/v2/bot/message/push', {
    method: 'POST',
    headers: { authorization: `Bearer ${accessToken}`, 'content-type': 'application/json' },
    body: JSON.stringify({ to, messages: [{ type: 'text', text }] }),
  });
}

export async function GET(req: NextRequest) { return run(req); }
export async function POST(req: NextRequest) { return run(req); }

async function run(req: NextRequest) {
  const cronErr = requireCron(req);
  if (cronErr) return cronErr;

  const admin = createAdminClient();
  const now = new Date();
  const { hour, minute } = bkkHourMin(now);
  const accessToken = process.env.LINE_MESSAGING_CHANNEL_ACCESS_TOKEN ?? '';
  if (!accessToken) return NextResponse.json({ ok: false, error: 'LINE token not configured' });

  // 1. Due reminders — remind_at within the last 5 minutes
  const fiveMinAgo = new Date(now.getTime() - 5 * 60 * 1000).toISOString();
  const { data: dueTasks } = await admin
    .from('tasks')
    .select('id, title, profile_id, remind_at, profiles(line_user_id)')
    .eq('status', 'pending')
    .lte('remind_at', now.toISOString())
    .gte('remind_at', fiveMinAgo);

  for (const task of (dueTasks ?? []) as Record<string, unknown>[]) {
    const lineId = (task.profiles as Record<string, string> | null)?.line_user_id;
    if (!lineId) continue;
    await pushLine(accessToken, lineId, `⏰ แจ้งเตือน: ${String(task.title)}`);
    await admin.from('tasks').update({ remind_at: null }).eq('id', task.id);
  }

  // 2. Daily briefing at 08:00 BKK (once only)
  if (hour === 8 && minute === 0) {
    const { data: profiles } = await admin
      .from('profiles')
      .select('id, line_user_id, display_name')
      .not('line_user_id', 'is', null)
      .eq('is_active', true);

    for (const p of (profiles ?? []) as Record<string, string>[]) {
      const { data: tasks } = await admin
        .from('tasks')
        .select('title, priority, due_at')
        .eq('profile_id', p.id)
        .eq('status', 'pending')
        .order('due_at', { ascending: true })
        .limit(5);

      if (!tasks?.length) continue;
      const lines = tasks.map((t: Record<string, string>, i: number) =>
        `${i + 1}. ${t.title}${t.due_at ? ` (${new Date(t.due_at).toLocaleDateString('th-TH')})` : ''}`,
      );
      await pushLine(accessToken, p.line_user_id, `🌅 สวัสดีตอนเช้า ${p.display_name ?? ''}\n\nงานที่รออยู่:\n${lines.join('\n')}`);
    }
  }

  // 3. Follow-up at 17:00 BKK (once only)
  if (hour === 17 && minute === 0) {
    const { data: profiles } = await admin
      .from('profiles')
      .select('id, line_user_id, display_name')
      .not('line_user_id', 'is', null)
      .eq('is_active', true);

    for (const p of (profiles ?? []) as Record<string, string>[]) {
      const { data: tasks } = await admin
        .from('tasks')
        .select('title')
        .eq('profile_id', p.id)
        .eq('status', 'in_progress')
        .limit(5);

      if (!tasks?.length) continue;
      const lines = tasks.map((t: Record<string, string>, i: number) => `${i + 1}. ${t.title}`);
      await pushLine(accessToken, p.line_user_id, `🌆 ช่วงเย็น — งานที่กำลังทำ:\n${lines.join('\n')}`);
    }
  }

  // 4. Stuck STT jobs — งานถอดเสียงค้าง 'processing' (worker สะดุด/ตาย) → mark failed +
  //    แจ้ง LINE user (ไม่งั้นเงียบหายไม่รู้ว่าพัง). threshold แบบ adaptive + เพดาน 60 นาที
  //    (= Cloud Run timeout — เกินนี้ instance ตายแน่ ไม่ต้องรอ):
  //      • duration รู้แล้ว = กำลังประมวลผล Gemini จริง → max(10 นาที, duration ÷ 3)
  //          (ไฟล์ 60 นาที → ~20 นาที; Gemini เร็วกว่า realtime จึงไม่ควรเกินนี้)
  //      • duration ยังเป็น null = worker ยังไม่เริ่ม/ยังไม่ได้วัด — อาจ "ติดคิว" ตอน request
  //          เข้าเยอะ (Cloud Run concurrency จำกัด) → ให้เวลาเต็มเพดาน 60 นาที กัน false-fail
  //    candidate = processing ที่ค้างเกิน 10 นาที (ขั้นต่ำ) แล้วค่อยกรอง threshold ราย job
  const MIN_S = 10 * 60, MAX_S = 60 * 60;
  const tenMinAgo = new Date(now.getTime() - MIN_S * 1000).toISOString();
  const { data: processingJobs } = await admin
    .from('transcription_jobs')
    .select('id, source, profile_id, duration_seconds, updated_at')
    .eq('status', 'processing')
    .lt('updated_at', tenMinAgo);

  for (const j of (processingJobs ?? []) as Record<string, unknown>[]) {
    const dur = j.duration_seconds == null ? null : Number(j.duration_seconds);
    const thresholdS = dur && dur > 0 ? Math.min(MAX_S, Math.max(MIN_S, Math.round(dur / 3))) : MAX_S;
    const ageS = (now.getTime() - new Date(j.updated_at as string).getTime()) / 1000;
    if (ageS < thresholdS) continue;

    // atomic per-job: re-check status='processing' + ไม่ถูกแตะตั้งแต่ cutoff (กัน race กับ worker
    // ที่อาจอัปเดต updated_at ระหว่างทาง) — fail เฉพาะแถวที่เพิ่งเปลี่ยนจริง
    const cutoff = new Date(now.getTime() - thresholdS * 1000).toISOString();
    const { data: failed } = await admin
      .from('transcription_jobs')
      .update({
        status: 'failed',
        error_message: 'ประมวลผลนานเกินกำหนด (timeout) — กรุณาลองใหม่',
        updated_at: now.toISOString(),
      })
      .eq('id', j.id as string)
      .eq('status', 'processing')
      .lt('updated_at', cutoff)
      .select('id, source, profile_id');
    const job = (failed ?? [])[0] as Record<string, unknown> | undefined;
    if (!job) continue; // worker เพิ่งเสร็จ/อัปเดตทัน → ข้าม

    // คืนโควต้าที่จองไว้ (idempotent) — กรณี worker crash กลางคันก่อน refund เอง
    await admin.rpc('refund_stt_job', { p_job_id: job.id as string }).then(() => undefined, () => undefined);

    if (job.source !== 'line') continue; // งานเว็บ: UI มีปุ่มลองใหม่อยู่แล้ว
    const { data: prof } = await admin
      .from('profiles')
      .select('line_user_id')
      .eq('id', job.profile_id as string)
      .maybeSingle();
    const lineId = (prof as { line_user_id?: string } | null)?.line_user_id;
    if (lineId) {
      await pushLine(accessToken, lineId,
        '❌ ขออภัย การถอดเสียงใช้เวลานานผิดปกติและถูกยกเลิก\nกรุณาพิมพ์ /mom แล้วส่งไฟล์อีกครั้งครับ');
    }
  }

  // 4.5 Requeue pending STT jobs — งานที่ติดคิว (trigger เจอ worker ไม่ว่าง → คืนเป็น pending)
  //     หรือ trigger แรกพลาด → ยิงซ้ำให้ทุก ~1 นาที (DB เป็น retry queue, ไม่ทิ้งงาน)
  //     เกิน 30 นาทียังเริ่มไม่ได้ → ยอมแพ้ mark failed + แจ้ง (กัน retry วนไม่จบตอน worker ตายยาว)
  //     ยังไม่ reserve โควต้าตอน pending จึงไม่ต้อง refund
  const REQUEUE_AFTER_MS = 60 * 1000;        // pending เกิน 1 นาที → ลองยิงใหม่
  const GIVEUP_AFTER_MS = 30 * 60 * 1000;    // pending เกิน 30 นาที → ยอมแพ้
  const { data: pendingJobs } = await admin
    .from('transcription_jobs')
    .select('id, org_id, source, profile_id, created_at')
    .eq('status', 'pending')
    .lt('updated_at', new Date(now.getTime() - REQUEUE_AFTER_MS).toISOString())
    .order('created_at', { ascending: true })
    .limit(10); // จำกัดต่อรอบ กัน burst กระแทก worker ซ้ำ

  for (const pj of (pendingJobs ?? []) as Record<string, unknown>[]) {
    const ageMs = now.getTime() - new Date(pj.created_at as string).getTime();
    if (ageMs > GIVEUP_AFTER_MS) {
      const { data: gv } = await admin
        .from('transcription_jobs')
        .update({ status: 'failed', error_message: 'ระบบไม่ว่างนานเกินไป — กรุณาลองใหม่อีกครั้ง', updated_at: now.toISOString() })
        .eq('id', pj.id as string)
        .eq('status', 'pending')
        .select('id');
      if ((gv ?? []).length && pj.source === 'line') {
        const { data: prof } = await admin.from('profiles').select('line_user_id').eq('id', pj.profile_id as string).maybeSingle();
        const lineId = (prof as { line_user_id?: string } | null)?.line_user_id;
        if (lineId) await pushLine(accessToken, lineId, '❌ ขออภัย ระบบไม่ว่างเป็นเวลานาน งานถอดเสียงถูกยกเลิก\nกรุณาพิมพ์ /mom แล้วส่งไฟล์อีกครั้งครับ');
      }
      continue;
    }
    await triggerSttWorker(admin, pj.id as string, pj.org_id as string); // overload อีก → คืน pending เอง รอรอบหน้า
  }

  const STT_BUCKET = 'assistant_audio';

  // 5. PDPA data minimization — ลบ "ไฟล์เสียงดิบ" ทันทีที่งานถึงสถานะสุดท้าย (completed/failed)
  //    ไฟล์เสียง = ข้อมูลส่วนบุคคลที่อ่อนไหวสุด · ใช้เสร็จตั้งแต่ตอนถอด → ไม่ต้องเก็บต่อ
  //    (PDF/transcript ยังอยู่ถึง 48 ชม. ในขั้น 6 ให้ผู้ใช้ดาวน์โหลด · การส่ง PDF/แจ้งผล
  //     ใช้ transcript_json ไม่ใช้เสียง → ลบได้ปลอดภัย) · idempotent ด้วย audio_url=null
  const { data: doneJobs } = await admin
    .from('transcription_jobs')
    .select('id, audio_url')
    .in('status', ['completed', 'failed'])
    .not('audio_url', 'is', null)
    .limit(200);

  if (doneJobs && doneJobs.length) {
    const paths: string[] = [];
    for (const j of doneJobs as Record<string, unknown>[]) {
      const audioUrl = String(j.audio_url ?? '');
      if (!audioUrl) continue;
      const p = audioUrl.includes(`/${STT_BUCKET}/`)
        ? audioUrl.split(`/${STT_BUCKET}/`)[1].split('?')[0]
        : audioUrl.split('?')[0];
      if (p) paths.push(p);
    }
    if (paths.length) {
      await admin.storage.from(STT_BUCKET).remove(paths).then(() => undefined, () => undefined);
    }
    await admin
      .from('transcription_jobs')
      .update({ audio_url: null })
      .in('id', (doneJobs as Record<string, unknown>[]).map((j) => j.id as string));
  }

  // 6. Privacy cleanup — ลบ PDF ผลลัพธ์ + ล้าง transcript ของงานที่เก่ากว่า 48 ชม.
  //    (ตรงกับหมายเหตุ privacy ในการ์ด MoM: ลบใน 48 ชม. ให้ดาวน์โหลดเก็บไว้)
  //    คง row + duration_seconds ไว้เพื่อ ledger โควต้า/สถิติไม่เพี้ยน · idempotent:
  //    เมื่อล้างแล้ว audio_url+transcript เป็น null → ไม่ถูกเลือกซ้ำในรอบถัดไป
  const cleanupBefore = new Date(now.getTime() - 48 * 60 * 60 * 1000).toISOString();
  const { data: oldJobs } = await admin
    .from('transcription_jobs')
    .select('id, org_id, audio_url')
    .lt('created_at', cleanupBefore)
    .or('transcript_json.not.is.null,audio_url.not.is.null')
    .limit(200);

  if (oldJobs && oldJobs.length) {
    const paths: string[] = [];
    for (const j of oldJobs as Record<string, unknown>[]) {
      const orgId = String(j.org_id ?? '');
      const audioUrl = j.audio_url ? String(j.audio_url) : '';
      if (audioUrl) {
        const p = audioUrl.includes(`/${STT_BUCKET}/`)
          ? audioUrl.split(`/${STT_BUCKET}/`)[1].split('?')[0]
          : audioUrl.split('?')[0];
        if (p) paths.push(p);
      }
      if (orgId) paths.push(`${orgId}/mom/${String(j.id)}.pdf`); // PDF ผลลัพธ์ (อาจไม่มีถ้างาน fail)
    }
    if (paths.length) {
      await admin.storage.from(STT_BUCKET).remove(paths).then(() => undefined, () => undefined);
    }
    const ids = (oldJobs as Record<string, unknown>[]).map((j) => j.id as string);
    await admin
      .from('transcription_jobs')
      .update({ transcript_json: null, transcript_text: null, audio_url: null })
      .in('id', ids);
  }

  return NextResponse.json({ ok: true });
}
