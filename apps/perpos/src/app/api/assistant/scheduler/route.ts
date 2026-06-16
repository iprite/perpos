import { NextRequest, NextResponse } from 'next/server';
import { requireCron } from '../../_lib/auth';
import { createAdminClient } from '../../_lib/supabase';

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

  // 4. Stuck STT jobs — งานถอดเสียงค้าง 'processing' เกิน 45 นาที (worker สะดุด/ตาย)
  //    → mark failed + แจ้ง LINE user (ไม่งั้นเงียบหายไม่รู้ว่าพัง). งานปกติ 1–3 นาทีก็เสร็จ
  //    threshold ตั้งสูง (45 นาที) เผื่อไฟล์ประชุมยาวหลายชั่วโมง (Cloud Run timeout = 3600s)
  //    กัน false-positive timeout; ส่วน race กับ worker ที่เพิ่งเสร็จกัน double ด้วย status guard
  //    ฝั่ง worker (update completed เฉพาะตอน status='processing') แล้ว
  const stuckThreshold = new Date(now.getTime() - 45 * 60 * 1000).toISOString();
  const { data: stuckJobs } = await admin
    .from('transcription_jobs')
    .update({
      status: 'failed',
      error_message: 'ประมวลผลนานเกินกำหนด (timeout) — กรุณาลองใหม่',
      updated_at: now.toISOString(),
    })
    .eq('status', 'processing')
    .lt('updated_at', stuckThreshold)
    .select('id, source, profile_id'); // returning = เฉพาะแถวที่เพิ่ง mark failed (atomic, กัน race กับ worker)

  for (const job of (stuckJobs ?? []) as Record<string, unknown>[]) {
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

  // 5. Privacy cleanup — ลบไฟล์เสียง + PDF ออกจาก storage และล้าง transcript ของงานที่
  //    เก่ากว่า 48 ชม. (ตรงกับหมายเหตุ privacy ในการ์ด MoM: ลบใน 48 ชม. ให้ดาวน์โหลดเก็บไว้)
  //    คง row + duration_seconds ไว้เพื่อ ledger โควต้า/สถิติไม่เพี้ยน · idempotent:
  //    เมื่อล้างแล้ว audio_url+transcript เป็น null → ไม่ถูกเลือกซ้ำในรอบถัดไป
  const STT_BUCKET = 'assistant_audio';
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
