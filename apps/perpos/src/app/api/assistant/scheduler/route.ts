import { NextRequest, NextResponse } from 'next/server';
import { requireCron } from '../../_lib/auth';
import { createAdminClient } from '../../_lib/supabase';
import { triggerSttWorker } from '@/lib/assistant/stt-trigger';
import { leaveBot, deleteScheduledBot, deleteBotMedia } from '@/lib/assistant/recall';

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
  const startedMs = Date.now();
  // ตัวนับสรุปผลการรัน → เก็บลง scheduler_runs ให้หน้า Scheduler Monitor อ่าน
  const counts = { stuck_failed: 0, requeued: 0, requeue_gaveup: 0, cleaned_jobs: 0 };
  const logRun = async (okFlag: boolean, errorMessage?: string) => {
    await admin.from('scheduler_runs').insert({
      ran_at: now.toISOString(),
      duration_ms: Date.now() - startedMs,
      ok: okFlag,
      ...counts,
      error_message: errorMessage ?? null,
    }).then(() => undefined, () => undefined); // log ต้องไม่ทำให้ scheduler ล้ม
  };

  const accessToken = process.env.LINE_MESSAGING_CHANNEL_ACCESS_TOKEN ?? '';
  if (!accessToken) {
    await logRun(false, 'LINE token not configured');
    return NextResponse.json({ ok: false, error: 'LINE token not configured' });
  }

  try {

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
    .from('assistant_jobs')
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
      .from('assistant_jobs')
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
    counts.stuck_failed++;

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
    .from('assistant_jobs')
    .select('id, org_id, source, profile_id, created_at')
    .eq('status', 'pending')
    .neq('source', 'recall')   // recall มี lifecycle sweep แยก (ขั้น 7) — กันยิง worker ก่อนบอทอัดเสร็จ (C3)
    .lt('updated_at', new Date(now.getTime() - REQUEUE_AFTER_MS).toISOString())
    .order('created_at', { ascending: true })
    .limit(10); // จำกัดต่อรอบ กัน burst กระแทก worker ซ้ำ

  for (const pj of (pendingJobs ?? []) as Record<string, unknown>[]) {
    const ageMs = now.getTime() - new Date(pj.created_at as string).getTime();
    if (ageMs > GIVEUP_AFTER_MS) {
      const { data: gv } = await admin
        .from('assistant_jobs')
        .update({ status: 'failed', error_message: 'ระบบไม่ว่างนานเกินไป — กรุณาลองใหม่อีกครั้ง', updated_at: now.toISOString() })
        .eq('id', pj.id as string)
        .eq('status', 'pending')
        .select('id');
      if ((gv ?? []).length) {
        counts.requeue_gaveup++;
        if (pj.source === 'line') {
          const { data: prof } = await admin.from('profiles').select('line_user_id').eq('id', pj.profile_id as string).maybeSingle();
          const lineId = (prof as { line_user_id?: string } | null)?.line_user_id;
          if (lineId) await pushLine(accessToken, lineId, '❌ ขออภัย ระบบไม่ว่างเป็นเวลานาน งานถอดเสียงถูกยกเลิก\nกรุณาพิมพ์ /mom แล้วส่งไฟล์อีกครั้งครับ');
        }
      }
      continue;
    }
    await triggerSttWorker(admin, pj.id as string, pj.org_id as string); // overload อีก → คืน pending เอง รอรอบหน้า
    counts.requeued++;
  }

  const STT_BUCKET = 'assistant_audio';

  // 5. PDPA data minimization — ลบ "ไฟล์เสียงดิบ" ทันทีที่งานถึงสถานะสุดท้าย (completed/failed)
  //    ไฟล์เสียง = ข้อมูลส่วนบุคคลที่อ่อนไหวสุด · ใช้เสร็จตั้งแต่ตอนถอด → ไม่ต้องเก็บต่อ
  //    (PDF/transcript ยังอยู่ถึง 48 ชม. ในขั้น 6 ให้ผู้ใช้ดาวน์โหลด · การส่ง PDF/แจ้งผล
  //     ใช้ transcript_json ไม่ใช้เสียง → ลบได้ปลอดภัย) · idempotent ด้วย audio_url=null
  const { data: doneJobs } = await admin
    .from('assistant_jobs')
    .select('id, audio_url')
    .in('status', ['completed', 'failed'])
    .neq('source', 'recall')   // recall: เก็บเสียง 48 ชม. ให้ดาวน์โหลด → ลบในขั้น 6 (อายุ >48 ชม.) แทน
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
      .from('assistant_jobs')
      .update({ audio_url: null })
      .in('id', (doneJobs as Record<string, unknown>[]).map((j) => j.id as string));
  }

  // 6. Privacy cleanup — ลบ PDF ผลลัพธ์ + ล้าง transcript ของงานที่เก่ากว่า 48 ชม.
  //    (ตรงกับหมายเหตุ privacy ในการ์ด MoM: ลบใน 48 ชม. ให้ดาวน์โหลดเก็บไว้)
  //    คง row + duration_seconds ไว้เพื่อ ledger โควต้า/สถิติไม่เพี้ยน · idempotent:
  //    เมื่อล้างแล้ว audio_url+transcript เป็น null → ไม่ถูกเลือกซ้ำในรอบถัดไป
  const cleanupBefore = new Date(now.getTime() - 48 * 60 * 60 * 1000).toISOString();
  const { data: oldJobs } = await admin
    .from('assistant_jobs')
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
      .from('assistant_jobs')
      .update({ transcript_json: null, transcript_text: null, audio_url: null })
      .in('id', ids);
    counts.cleaned_jobs += ids.length;
  }

  // 7. Recall meeting-bot lifecycle — สั่งออกเมื่อครบโควต้า / ยอมแพ้บอทค้าง / retry งานถอดที่พร้อม
  const RECALL_STUCK_JOIN_MS = 15 * 60 * 1000;   // ไม่เข้าห้องภายใน 15 นาที → ยอมแพ้
  const RECALL_READY_GIVEUP_MS = 15 * 60 * 1000; // recording_ready แต่ถอดไม่จบใน 15 นาที → goodwill refund
  const notifyRecall = async (profileId: unknown, text: string) => {
    if (!profileId) return;
    const { data: prof } = await admin.from('profiles').select('line_user_id').eq('id', profileId as string).maybeSingle();
    const lineId = (prof as { line_user_id?: string } | null)?.line_user_id;
    if (lineId) await pushLine(accessToken, lineId, text);
  };

  const { data: recallJobs } = await admin
    .from('assistant_jobs')
    .select('id, org_id, profile_id, recall_bot_id, bot_state, joined_at, join_at, hold_seconds, status, created_at, updated_at, ready_at')
    .eq('source', 'recall')
    .neq('status', 'completed')   // completed → ไม่ต้องแตะ (worker ไม่เปลี่ยน bot_state) กัน starvation limit
    .in('bot_state', ['creating', 'scheduled', 'joining', 'in_waiting_room', 'recording', 'permission_denied', 'call_ended', 'leaving', 'recording_ready'])
    .limit(50);

  for (const rj of (recallJobs ?? []) as Record<string, unknown>[]) {
    const state = String(rj.bot_state ?? '');
    const botId = rj.recall_bot_id ? String(rj.recall_bot_id) : '';
    const status = String(rj.status ?? '');

    if (state === 'recording_ready') {
      if (status !== 'pending' && status !== 'failed') continue; // กำลัง processing อยู่
      // นับจาก ready_at (คงที่) ไม่ใช่ updated_at (triggerSttWorker รีเซ็ตทุก retry)
      const readyRef = rj.ready_at ? new Date(rj.ready_at as string).getTime() : new Date(rj.updated_at as string).getTime();
      const readyAgeMs = now.getTime() - readyRef;
      if (readyAgeMs > RECALL_READY_GIVEUP_MS) {
        const { data: gv } = await admin
          .from('assistant_jobs')
          .update({ status: 'failed', bot_state: 'failed_permanent', error_message: 'สรุปการประชุมไม่สำเร็จหลายครั้ง', updated_at: now.toISOString() })
          .eq('id', rj.id as string).in('status', ['pending', 'failed']).select('id');
        if ((gv ?? []).length) {
          await admin.rpc('refund_bot_settled', { p_job_id: rj.id as string }).then(() => undefined, () => undefined);
          await notifyRecall(rj.profile_id, '❌ ขออภัย สรุปการประชุมไม่สำเร็จ ระบบคืนโควต้าบอทให้แล้วครับ 🙏');
        }
      } else {
        await triggerSttWorker(admin, rj.id as string, rj.org_id as string); // retry ถอด
      }
      continue;
    }

    // ค้าง 'creating' (createBot ไม่ถึง Recall → ไม่มี recall_bot_id + ไม่มี webhook) → คืน hold + fail
    //   (ถ้าบอทเกิดจริง webhook joining_call จะ flip state ออกจาก creating ไปแล้ว)
    if (state === 'creating') {
      if (!botId && (now.getTime() - new Date(rj.created_at as string).getTime()) > RECALL_STUCK_JOIN_MS) {
        const { data: gv } = await admin.from('assistant_jobs')
          .update({ status: 'failed', bot_state: 'stuck', updated_at: now.toISOString() })
          .eq('id', rj.id as string).eq('bot_state', 'creating').select('id');
        if ((gv ?? []).length) {
          await admin.rpc('refund_bot_quota', { p_job_id: rj.id as string }).then(() => undefined, () => undefined);
          await notifyRecall(rj.profile_id, '❌ ส่งบอทเข้าห้องไม่สำเร็จ คืนโควต้าให้แล้วครับ 🙏');
        }
      }
      continue;
    }

    // ยังอยู่ในห้อง (active)
    const joinedMs = rj.joined_at ? new Date(rj.joined_at as string).getTime() : null;
    const holdS = Number(rj.hold_seconds ?? 0);

    // สั่งออกแล้วแต่ done ไม่มา (ค้าง 'leaving' > giveup) → กู้: settle + ตั้ง recording_ready + retry ถอด
    if (state === 'leaving') {
      const leavingAgeMs = now.getTime() - new Date(rj.updated_at as string).getTime();
      if (leavingAgeMs > RECALL_READY_GIVEUP_MS && status === 'pending') {
        const actualSec = joinedMs ? Math.max(0, Math.round((now.getTime() - joinedMs) / 1000)) : holdS;
        await admin.rpc('settle_bot_quota', { p_job_id: rj.id as string, p_actual_seconds: actualSec }).then(() => undefined, () => undefined);
        await admin.from('assistant_jobs').update({ bot_state: 'recording_ready', ready_at: now.toISOString(), updated_at: now.toISOString() }).eq('id', rj.id as string);
        await triggerSttWorker(admin, rj.id as string, rj.org_id as string);
      }
      continue;
    }

    // สำหรับ scheduled อนาคต (Phase 1 calendar) — ยังไม่ถึงเวลา join → ยังไม่ถือว่าค้าง
    const joinAtMs = rj.join_at ? new Date(rj.join_at as string).getTime() : null;
    const notYetScheduled = joinAtMs != null && joinAtMs > now.getTime();

    if (joinedMs && botId && holdS > 0 && (now.getTime() - joinedMs) / 1000 >= holdS) {
      // ครบโควต้า → settle ทันที (กัน quota ค้างถ้า done ช้า) + สั่งบอทออก · done จะถอดต่อ
      const actualSec = Math.max(0, Math.round((now.getTime() - joinedMs) / 1000));
      await admin.rpc('settle_bot_quota', { p_job_id: rj.id as string, p_actual_seconds: actualSec }).then(() => undefined, () => undefined);
      await leaveBot(botId).catch(() => false);
      await admin.from('assistant_jobs').update({ bot_state: 'leaving', updated_at: now.toISOString() }).eq('id', rj.id as string);
      await notifyRecall(rj.profile_id, '⏱️ ครบโควต้าบอท — กำลังสรุปการประชุมเท่าที่บันทึกได้ครับ');
    } else if (!joinedMs && !notYetScheduled && (now.getTime() - new Date(rj.created_at as string).getTime()) > RECALL_STUCK_JOIN_MS) {
      // บอทไม่เคยเข้าห้องภายในเวลาที่ควร → ยอมแพ้ + คืน hold
      if (botId) {
        if (state === 'scheduled') await deleteScheduledBot(botId).catch(() => false);
        else await leaveBot(botId).catch(() => false);
      }
      await admin.from('assistant_jobs').update({ status: 'failed', bot_state: 'stuck', updated_at: now.toISOString() }).eq('id', rj.id as string);
      await admin.rpc('refund_bot_quota', { p_job_id: rj.id as string }).then(() => undefined, () => undefined);
      await notifyRecall(rj.profile_id, '❌ บอทเข้าห้องประชุมไม่สำเร็จ คืนโควต้าให้แล้วครับ 🙏');
    }
  }

  // 8. PDPA — ลบ recording media ฝั่ง Recall หลังถอดเสร็จ (เรามี copy ใน bucket 48 ชม. แล้ว)
  //    marker: recording_url ยัง not-null = ยังไม่ได้ลบฝั่ง Recall
  const { data: purgeJobs } = await admin
    .from('assistant_jobs')
    .select('id, recall_bot_id')
    .eq('source', 'recall').eq('status', 'completed')
    .not('recall_bot_id', 'is', null)
    .not('recording_url', 'is', null)
    .limit(50);
  for (const pj of (purgeJobs ?? []) as Record<string, unknown>[]) {
    await deleteBotMedia(String(pj.recall_bot_id)).catch(() => false);
    await admin.from('assistant_jobs').update({ recording_url: null }).eq('id', pj.id as string);
  }

  // 9. cleanup webhook_event เก่า > 7 วัน (payload มี media URL/ผู้เข้าร่วม)
  await admin.from('webhook_event')
    .delete()
    .lt('created_at', new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString())
    .then(() => undefined, () => undefined);

    await logRun(true);
    return NextResponse.json({ ok: true, ...counts });
  } catch (e) {
    await logRun(false, e instanceof Error ? e.message : String(e));
    return NextResponse.json({ ok: false, error: 'scheduler_failed' }, { status: 500 });
  }
}
