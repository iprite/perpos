import { NextRequest, NextResponse } from "next/server";
import { requireCron } from "../../_lib/auth";
import { createAdminClient } from "../../_lib/supabase";
import { triggerSttWorker } from "@/lib/assistant/stt-trigger";
import { triggerPdfWorker } from "@/lib/assistant/pdf-trigger";
import {
  leaveBot,
  deleteScheduledBot,
  deleteBotMedia,
  extractMeetingUrl,
  normalizeMeetingUrl,
} from "@/lib/assistant/recall";
import { syncProfileCalendar } from "@/lib/assistant/calendar-sync";
import { getCalendarAccessTokenForProfile, getCalendarEvent } from "@/lib/google/calendar";
import { buildBotConfirmFlex, buildQuotaWarningFlex } from "@/lib/assistant/bot-flex";
import { getServiceRemaining } from "@/lib/assistant/token-balance";
import { getStripe } from "../../_lib/stripe";
import { alertAdminLine } from "@/lib/admin/alert";

const QUOTA_WARN_LEAD_S = 600; // เตือนโควต้าบอทใกล้หมด ≥10 นาทีก่อน kick
const SCHED_PLATFORM_LABEL: Record<string, string> = {
  google_meet: "Google Meet",
  zoom: "Zoom",
  teams: "Microsoft Teams",
};

async function pushLine(accessToken: string, to: string, text: string) {
  await fetch("https://api.line.me/v2/bot/message/push", {
    method: "POST",
    headers: { authorization: `Bearer ${accessToken}`, "content-type": "application/json" },
    body: JSON.stringify({ to, messages: [{ type: "text", text }] }),
  });
}

async function pushLineFlex(accessToken: string, to: string, message: unknown) {
  await fetch("https://api.line.me/v2/bot/message/push", {
    method: "POST",
    headers: { authorization: `Bearer ${accessToken}`, "content-type": "application/json" },
    body: JSON.stringify({ to, messages: [message] }),
  }).then(
    () => undefined,
    () => undefined,
  );
}

export async function GET(req: NextRequest) {
  return run(req);
}
export async function POST(req: NextRequest) {
  return run(req);
}

async function run(req: NextRequest) {
  const cronErr = requireCron(req);
  if (cronErr) return cronErr;

  const admin = createAdminClient();
  const now = new Date();
  const startedMs = Date.now();
  // ตัวนับสรุปผลการรัน → เก็บลง scheduler_runs ให้หน้า Scheduler Monitor อ่าน
  const counts = { stuck_failed: 0, requeued: 0, requeue_gaveup: 0, cleaned_jobs: 0 };
  const logRun = async (okFlag: boolean, errorMessage?: string) => {
    await admin
      .from("scheduler_runs")
      .insert({
        ran_at: now.toISOString(),
        duration_ms: Date.now() - startedMs,
        ok: okFlag,
        ...counts,
        error_message: errorMessage ?? null,
      })
      .then(
        () => undefined,
        () => undefined,
      ); // log ต้องไม่ทำให้ scheduler ล้ม
    // แจ้ง admin ทาง LINE เฉพาะตอนมีปัญหาจริง — digest 1 ครั้ง/run (กัน spam)
    if (!okFlag || counts.stuck_failed > 0 || counts.requeue_gaveup > 0) {
      await alertAdminLine(
        admin,
        [
          "⚠️ PERPOS scheduler",
          errorMessage ? `error: ${errorMessage}` : "พบงานมีปัญหา (stuck/ยอมแพ้)",
          `stuck_failed=${counts.stuck_failed} · requeue_gaveup=${counts.requeue_gaveup} · requeued=${counts.requeued}`,
        ].join("\n"),
      );
    }
  };

  const accessToken = process.env.LINE_MESSAGING_CHANNEL_ACCESS_TOKEN ?? "";
  if (!accessToken) {
    await logRun(false, "LINE token not configured");
    return NextResponse.json({ ok: false, error: "LINE token not configured" });
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
    const MIN_S = 10 * 60,
      MAX_S = 60 * 60;
    const tenMinAgo = new Date(now.getTime() - MIN_S * 1000).toISOString();
    const { data: processingJobs } = await admin
      .from("assistant_jobs")
      .select("id, source, profile_id, duration_seconds, updated_at")
      .eq("status", "processing")
      .neq("kind", "pdf_compress") // pdf มี sweep แยก (ขั้น 4.7) — refund/worker/ข้อความคนละตัว
      .lt("updated_at", tenMinAgo);

    for (const j of (processingJobs ?? []) as Record<string, unknown>[]) {
      const dur = j.duration_seconds == null ? null : Number(j.duration_seconds);
      const thresholdS =
        dur && dur > 0 ? Math.min(MAX_S, Math.max(MIN_S, Math.round(dur / 3))) : MAX_S;
      const ageS = (now.getTime() - new Date(j.updated_at as string).getTime()) / 1000;
      if (ageS < thresholdS) continue;

      // atomic per-job: re-check status='processing' + ไม่ถูกแตะตั้งแต่ cutoff (กัน race กับ worker
      // ที่อาจอัปเดต updated_at ระหว่างทาง) — fail เฉพาะแถวที่เพิ่งเปลี่ยนจริง
      const cutoff = new Date(now.getTime() - thresholdS * 1000).toISOString();
      const { data: failed } = await admin
        .from("assistant_jobs")
        .update({
          status: "failed",
          error_message: "ประมวลผลนานเกินกำหนด (timeout) — กรุณาลองใหม่",
          updated_at: now.toISOString(),
        })
        .eq("id", j.id as string)
        .eq("status", "processing")
        .lt("updated_at", cutoff)
        .select("id, source, profile_id");
      const job = (failed ?? [])[0] as Record<string, unknown> | undefined;
      if (!job) continue; // worker เพิ่งเสร็จ/อัปเดตทัน → ข้าม
      counts.stuck_failed++;

      // คืนโควต้าที่จองไว้ (idempotent) — กรณี worker crash กลางคันก่อน refund เอง
      await admin.rpc("refund_stt_job", { p_job_id: job.id as string }).then(
        () => undefined,
        () => undefined,
      );

      if (job.source !== "line") continue; // งานเว็บ: UI มีปุ่มลองใหม่อยู่แล้ว
      const { data: prof } = await admin
        .from("profiles")
        .select("line_user_id")
        .eq("id", job.profile_id as string)
        .maybeSingle();
      const lineId = (prof as { line_user_id?: string } | null)?.line_user_id;
      if (lineId) {
        await pushLine(
          accessToken,
          lineId,
          "❌ ขออภัย การถอดเสียงใช้เวลานานผิดปกติและถูกยกเลิก\nกรุณาพิมพ์ /mom แล้วส่งไฟล์อีกครั้งครับ",
        );
      }
    }

    // 4.5 Requeue pending STT jobs — งานที่ติดคิว (trigger เจอ worker ไม่ว่าง → คืนเป็น pending)
    //     หรือ trigger แรกพลาด → ยิงซ้ำให้ทุก ~1 นาที (DB เป็น retry queue, ไม่ทิ้งงาน)
    //     เกิน 30 นาทียังเริ่มไม่ได้ → ยอมแพ้ mark failed + แจ้ง (กัน retry วนไม่จบตอน worker ตายยาว)
    //     ยังไม่ reserve โควต้าตอน pending จึงไม่ต้อง refund
    const REQUEUE_AFTER_MS = 60 * 1000; // pending เกิน 1 นาที → ลองยิงใหม่
    const GIVEUP_AFTER_MS = 30 * 60 * 1000; // pending เกิน 30 นาที → ยอมแพ้
    const { data: pendingJobs } = await admin
      .from("assistant_jobs")
      .select("id, org_id, source, profile_id, created_at")
      .eq("status", "pending")
      .neq("source", "recall") // recall มี lifecycle sweep แยก (ขั้น 7) — กันยิง worker ก่อนบอทอัดเสร็จ (C3)
      .neq("kind", "pdf_compress") // pdf requeue แยก (ขั้น 4.7) — ใช้ triggerPdfWorker
      .lt("updated_at", new Date(now.getTime() - REQUEUE_AFTER_MS).toISOString())
      .order("created_at", { ascending: true })
      .limit(10); // จำกัดต่อรอบ กัน burst กระแทก worker ซ้ำ

    for (const pj of (pendingJobs ?? []) as Record<string, unknown>[]) {
      const ageMs = now.getTime() - new Date(pj.created_at as string).getTime();
      if (ageMs > GIVEUP_AFTER_MS) {
        const { data: gv } = await admin
          .from("assistant_jobs")
          .update({
            status: "failed",
            error_message: "ระบบไม่ว่างนานเกินไป — กรุณาลองใหม่อีกครั้ง",
            updated_at: now.toISOString(),
          })
          .eq("id", pj.id as string)
          .eq("status", "pending")
          .select("id");
        if ((gv ?? []).length) {
          counts.requeue_gaveup++;
          if (pj.source === "line") {
            const { data: prof } = await admin
              .from("profiles")
              .select("line_user_id")
              .eq("id", pj.profile_id as string)
              .maybeSingle();
            const lineId = (prof as { line_user_id?: string } | null)?.line_user_id;
            if (lineId)
              await pushLine(
                accessToken,
                lineId,
                "❌ ขออภัย ระบบไม่ว่างเป็นเวลานาน งานถอดเสียงถูกยกเลิก\nกรุณาพิมพ์ /mom แล้วส่งไฟล์อีกครั้งครับ",
              );
          }
        }
        continue;
      }
      await triggerSttWorker(admin, pj.id as string, pj.org_id as string); // overload อีก → คืน pending เอง รอรอบหน้า
      counts.requeued++;
    }

    // 4.7 PDF (pdf_compress) — stuck-sweep + requeue + PDPA (แยกจาก STT: refund/worker/bucket คนละตัว)
    {
      const PDF_BUCKET = "assistant_pdf";
      const PDF_STUCK_MS = 15 * 60 * 1000; // worker timeout 9 นาที → เกิน 15 นาที = ตายแน่

      // stuck 'processing' → fail + refund_pdf_job (idempotent) + แจ้ง LINE
      const { data: pdfStuck } = await admin
        .from("assistant_jobs")
        .select("id, source, profile_id")
        .eq("kind", "pdf_compress")
        .eq("status", "processing")
        .lt("updated_at", new Date(now.getTime() - PDF_STUCK_MS).toISOString())
        .limit(50);
      for (const j of (pdfStuck ?? []) as Record<string, unknown>[]) {
        const cutoff = new Date(now.getTime() - PDF_STUCK_MS).toISOString();
        const { data: failed } = await admin
          .from("assistant_jobs")
          .update({
            status: "failed",
            error_message: "บีบไฟล์นานเกินกำหนด (timeout) — กรุณาส่งไฟล์ใหม่",
            updated_at: now.toISOString(),
          })
          .eq("id", j.id as string)
          .eq("status", "processing")
          .lt("updated_at", cutoff)
          .select("id");
        if (!(failed ?? []).length) continue; // worker เพิ่งเสร็จทัน → ข้าม
        counts.stuck_failed++;
        await admin.rpc("refund_pdf_job", { p_job_id: j.id as string }).then(
          () => undefined,
          () => undefined,
        );
        if (j.source === "line") {
          const { data: prof } = await admin
            .from("profiles")
            .select("line_user_id")
            .eq("id", j.profile_id as string)
            .maybeSingle();
          const lineId = (prof as { line_user_id?: string } | null)?.line_user_id;
          if (lineId)
            await pushLine(
              accessToken,
              lineId,
              "❌ ขออภัย การบีบ PDF ใช้เวลานานผิดปกติและถูกยกเลิก\nส่งไฟล์เข้ามาใหม่ได้เลยครับ",
            );
        }
      }

      // requeue 'pending' → triggerPdfWorker · เกิน GIVEUP → ยอมแพ้ (ยังไม่ reserve → ไม่ต้อง refund)
      const { data: pdfPending } = await admin
        .from("assistant_jobs")
        .select("id, org_id, source, profile_id, created_at")
        .eq("kind", "pdf_compress")
        .eq("status", "pending")
        .lt("updated_at", new Date(now.getTime() - REQUEUE_AFTER_MS).toISOString())
        .order("created_at", { ascending: true })
        .limit(10);
      for (const pj of (pdfPending ?? []) as Record<string, unknown>[]) {
        const ageMs = now.getTime() - new Date(pj.created_at as string).getTime();
        if (ageMs > GIVEUP_AFTER_MS) {
          const { data: gv } = await admin
            .from("assistant_jobs")
            .update({
              status: "failed",
              error_message: "ระบบไม่ว่างนานเกินไป — กรุณาลองใหม่อีกครั้ง",
              updated_at: now.toISOString(),
            })
            .eq("id", pj.id as string)
            .eq("status", "pending")
            .select("id");
          if ((gv ?? []).length) {
            counts.requeue_gaveup++;
            if (pj.source === "line") {
              const { data: prof } = await admin
                .from("profiles")
                .select("line_user_id")
                .eq("id", pj.profile_id as string)
                .maybeSingle();
              const lineId = (prof as { line_user_id?: string } | null)?.line_user_id;
              if (lineId)
                await pushLine(
                  accessToken,
                  lineId,
                  "❌ ขออภัย ระบบไม่ว่างเป็นเวลานาน งานบีบ PDF ถูกยกเลิก\nส่งไฟล์เข้ามาใหม่ได้เลยครับ",
                );
            }
          }
          continue;
        }
        await triggerPdfWorker(admin, pj.id as string, pj.org_id as string);
        counts.requeued++;
      }

      // PDPA — ลบไฟล์ผลลัพธ์ใน assistant_pdf เมื่อ job เก่ากว่า 48 ชม. (signed URL หมดอายุแล้ว)
      //   ledger pdf_usage_transactions เก็บสถิติ/บิลแทน → set pdf_meta=null = idempotent
      const pdfCleanupBefore = new Date(now.getTime() - 48 * 60 * 60 * 1000).toISOString();
      const { data: oldPdf } = await admin
        .from("assistant_jobs")
        .select("id, pdf_meta")
        .eq("kind", "pdf_compress")
        .lt("created_at", pdfCleanupBefore)
        .not("pdf_meta", "is", null)
        .limit(200);
      if (oldPdf && oldPdf.length) {
        const paths: string[] = [];
        for (const j of oldPdf as Record<string, unknown>[]) {
          const m = j.pdf_meta as { output_path?: string; orig_path?: string } | null;
          if (m?.output_path) paths.push(m.output_path);
          if (m?.orig_path) paths.push(m.orig_path); // ต้นฉบับที่เก็บไว้สำหรับ rasterize (vector-heavy)
        }
        if (paths.length)
          await admin.storage
            .from(PDF_BUCKET)
            .remove(paths)
            .then(
              () => undefined,
              () => undefined,
            );
        await admin
          .from("assistant_jobs")
          .update({ pdf_meta: null })
          .in(
            "id",
            (oldPdf as Record<string, unknown>[]).map((j) => j.id as string),
          );
        counts.cleaned_jobs += oldPdf.length;
      }
    }

    const STT_BUCKET = "assistant_audio";

    // 5. PDPA data minimization — ลบ "ไฟล์เสียงดิบ" ทันทีที่งานถึงสถานะสุดท้าย (completed/failed)
    //    ไฟล์เสียง = ข้อมูลส่วนบุคคลที่อ่อนไหวสุด · ใช้เสร็จตั้งแต่ตอนถอด → ไม่ต้องเก็บต่อ
    //    (PDF/transcript ยังอยู่ถึง 48 ชม. ในขั้น 6 ให้ผู้ใช้ดาวน์โหลด · การส่ง PDF/แจ้งผล
    //     ใช้ transcript_json ไม่ใช้เสียง → ลบได้ปลอดภัย) · idempotent ด้วย audio_url=null
    const { data: doneJobs } = await admin
      .from("assistant_jobs")
      .select("id, audio_url")
      .in("status", ["completed", "failed"])
      .neq("source", "recall") // recall: เก็บเสียง 48 ชม. ให้ดาวน์โหลด → ลบในขั้น 6 (อายุ >48 ชม.) แทน
      .not("audio_url", "is", null)
      .limit(200);

    if (doneJobs && doneJobs.length) {
      const paths: string[] = [];
      for (const j of doneJobs as Record<string, unknown>[]) {
        const audioUrl = String(j.audio_url ?? "");
        if (!audioUrl) continue;
        const p = audioUrl.includes(`/${STT_BUCKET}/`)
          ? audioUrl.split(`/${STT_BUCKET}/`)[1].split("?")[0]
          : audioUrl.split("?")[0];
        if (p) paths.push(p);
      }
      if (paths.length) {
        await admin.storage
          .from(STT_BUCKET)
          .remove(paths)
          .then(
            () => undefined,
            () => undefined,
          );
      }
      await admin
        .from("assistant_jobs")
        .update({ audio_url: null })
        .in(
          "id",
          (doneJobs as Record<string, unknown>[]).map((j) => j.id as string),
        );
    }

    // 6. Privacy cleanup — ลบ PDF ผลลัพธ์ + ล้าง transcript ของงานที่เก่ากว่า 48 ชม.
    //    (ตรงกับหมายเหตุ privacy ในการ์ด MoM: ลบใน 48 ชม. ให้ดาวน์โหลดเก็บไว้)
    //    คง row + duration_seconds ไว้เพื่อ ledger โควต้า/สถิติไม่เพี้ยน · idempotent:
    //    เมื่อล้างแล้ว audio_url+transcript เป็น null → ไม่ถูกเลือกซ้ำในรอบถัดไป
    const cleanupBefore = new Date(now.getTime() - 48 * 60 * 60 * 1000).toISOString();
    const { data: oldJobs } = await admin
      .from("assistant_jobs")
      .select("id, org_id, audio_url")
      .lt("created_at", cleanupBefore)
      .or("transcript_json.not.is.null,audio_url.not.is.null")
      .limit(200);

    if (oldJobs && oldJobs.length) {
      const paths: string[] = [];
      for (const j of oldJobs as Record<string, unknown>[]) {
        const orgId = String(j.org_id ?? "");
        const audioUrl = j.audio_url ? String(j.audio_url) : "";
        if (audioUrl) {
          const p = audioUrl.includes(`/${STT_BUCKET}/`)
            ? audioUrl.split(`/${STT_BUCKET}/`)[1].split("?")[0]
            : audioUrl.split("?")[0];
          if (p) paths.push(p);
        }
        if (orgId) paths.push(`${orgId}/mom/${String(j.id)}.pdf`); // PDF ผลลัพธ์ (อาจไม่มีถ้างาน fail)
      }
      if (paths.length) {
        await admin.storage
          .from(STT_BUCKET)
          .remove(paths)
          .then(
            () => undefined,
            () => undefined,
          );
      }
      const ids = (oldJobs as Record<string, unknown>[]).map((j) => j.id as string);
      await admin
        .from("assistant_jobs")
        .update({ transcript_json: null, transcript_text: null, audio_url: null })
        .in("id", ids);
      counts.cleaned_jobs += ids.length;
    }

    // 6b. ลบ recall job ที่ "รอยืนยัน" (awaiting_confirm) ค้างเกิน 30 นาที — ผู้ใช้ไม่กดยืนยัน
    //     ยังไม่ได้ hold โควต้า → แค่ลบเพื่อปล่อย dedup_key ให้วางลิงก์ใหม่ได้
    {
      const cutoff = new Date(Date.now() - 30 * 60 * 1000).toISOString();
      const { data: stale } = await admin
        .from("assistant_jobs")
        .delete()
        .eq("source", "recall")
        .eq("bot_state", "awaiting_confirm")
        .lt("created_at", cutoff)
        .select("id");
      if (stale) counts.cleaned_jobs += (stale as unknown[]).length;
    }

    // 7. Recall meeting-bot lifecycle — สั่งออกเมื่อครบโควต้า / ยอมแพ้บอทค้าง / retry งานถอดที่พร้อม
    const RECALL_STUCK_JOIN_MS = 15 * 60 * 1000; // ไม่เข้าห้องภายใน 15 นาที → ยอมแพ้
    const RECALL_READY_GIVEUP_MS = 15 * 60 * 1000; // recording_ready แต่ถอดไม่จบใน 15 นาที → goodwill refund
    const notifyRecall = async (profileId: unknown, text: string) => {
      if (!profileId) return;
      const { data: prof } = await admin
        .from("profiles")
        .select("line_user_id")
        .eq("id", profileId as string)
        .maybeSingle();
      const lineId = (prof as { line_user_id?: string } | null)?.line_user_id;
      if (lineId) await pushLine(accessToken, lineId, text);
    };

    const { data: recallJobs } = await admin
      .from("assistant_jobs")
      .select(
        "id, org_id, profile_id, recall_bot_id, bot_state, joined_at, join_at, hold_seconds, status, created_at, updated_at, ready_at, quota_warned_at",
      )
      .eq("source", "recall")
      .neq("status", "completed") // completed → ไม่ต้องแตะ (worker ไม่เปลี่ยน bot_state) กัน starvation limit
      .in("bot_state", [
        "creating",
        "scheduled",
        "joining",
        "in_waiting_room",
        "recording",
        "permission_denied",
        "call_ended",
        "leaving",
        "recording_ready",
      ])
      .limit(50);

    for (const rj of (recallJobs ?? []) as Record<string, unknown>[]) {
      const state = String(rj.bot_state ?? "");
      const botId = rj.recall_bot_id ? String(rj.recall_bot_id) : "";
      const status = String(rj.status ?? "");

      if (state === "recording_ready") {
        if (status !== "pending" && status !== "failed") continue; // กำลัง processing อยู่
        // นับจาก ready_at (คงที่) ไม่ใช่ updated_at (triggerSttWorker รีเซ็ตทุก retry)
        const readyRef = rj.ready_at
          ? new Date(rj.ready_at as string).getTime()
          : new Date(rj.updated_at as string).getTime();
        const readyAgeMs = now.getTime() - readyRef;
        if (readyAgeMs > RECALL_READY_GIVEUP_MS) {
          const { data: gv } = await admin
            .from("assistant_jobs")
            .update({
              status: "failed",
              bot_state: "failed_permanent",
              error_message: "สรุปการประชุมไม่สำเร็จหลายครั้ง",
              updated_at: now.toISOString(),
            })
            .eq("id", rj.id as string)
            .in("status", ["pending", "failed"])
            .select("id");
          if ((gv ?? []).length) {
            await admin.rpc("refund_bot_settled", { p_job_id: rj.id as string }).then(
              () => undefined,
              () => undefined,
            );
            await notifyRecall(
              rj.profile_id,
              "❌ ขออภัย สรุปการประชุมไม่สำเร็จ ระบบคืนโควต้าบอทให้แล้วครับ 🙏",
            );
          }
        } else {
          await triggerSttWorker(admin, rj.id as string, rj.org_id as string); // retry ถอด
        }
        continue;
      }

      // ค้าง 'creating' (createBot ไม่ถึง Recall → ไม่มี recall_bot_id + ไม่มี webhook) → คืน hold + fail
      //   (ถ้าบอทเกิดจริง webhook joining_call จะ flip state ออกจาก creating ไปแล้ว)
      if (state === "creating") {
        if (
          !botId &&
          now.getTime() - new Date(rj.created_at as string).getTime() > RECALL_STUCK_JOIN_MS
        ) {
          const { data: gv } = await admin
            .from("assistant_jobs")
            .update({ status: "failed", bot_state: "stuck", updated_at: now.toISOString() })
            .eq("id", rj.id as string)
            .eq("bot_state", "creating")
            .select("id");
          if ((gv ?? []).length) {
            await admin.rpc("refund_bot_quota", { p_job_id: rj.id as string }).then(
              () => undefined,
              () => undefined,
            );
            await notifyRecall(rj.profile_id, "❌ ส่งบอทเข้าห้องไม่สำเร็จ คืนโควต้าให้แล้วครับ 🙏");
          }
        }
        continue;
      }

      // ยังอยู่ในห้อง (active)
      const joinedMs = rj.joined_at ? new Date(rj.joined_at as string).getTime() : null;
      let holdS = Number(rj.hold_seconds ?? 0);

      // สั่งออกแล้วแต่ done ไม่มา (ค้าง 'leaving' > giveup) → กู้: settle + ตั้ง recording_ready + retry ถอด
      if (state === "leaving") {
        const leavingAgeMs = now.getTime() - new Date(rj.updated_at as string).getTime();
        if (leavingAgeMs > RECALL_READY_GIVEUP_MS && status === "pending") {
          const actualSec = joinedMs
            ? Math.max(0, Math.round((now.getTime() - joinedMs) / 1000))
            : holdS;
          await admin
            .rpc("settle_bot_quota", { p_job_id: rj.id as string, p_actual_seconds: actualSec })
            .then(
              () => undefined,
              () => undefined,
            );
          await admin
            .from("assistant_jobs")
            .update({
              bot_state: "recording_ready",
              ready_at: now.toISOString(),
              updated_at: now.toISOString(),
            })
            .eq("id", rj.id as string);
          await triggerSttWorker(admin, rj.id as string, rj.org_id as string);
        }
        continue;
      }

      // สำหรับ scheduled อนาคต (Phase 1 calendar) — ยังไม่ถึงเวลา join → ยังไม่ถือว่าค้าง
      const joinAtMs = rj.join_at ? new Date(rj.join_at as string).getTime() : null;
      const notYetScheduled = joinAtMs != null && joinAtMs > now.getTime();

      // ── Phase 1c: เติมโควต้าระหว่างประชุม → ขยาย hold ให้บอทอยู่ต่ออัตโนมัติ (absorb top-up) ──
      if (joinedMs && botId && holdS > 0) {
        const { remainUnits: spare } = await getServiceRemaining(
          admin,
          rj.profile_id as string,
          "bot",
        );
        if (spare > 0) {
          const ok = await admin
            .rpc("extend_bot_hold", { p_job_id: rj.id as string, p_extra_seconds: spare })
            .then(
              (r) => r.data === true,
              () => false,
            );
          if (ok) {
            holdS += spare;
            await admin
              .from("assistant_jobs")
              .update({ hold_seconds: holdS, quota_warned_at: null, updated_at: now.toISOString() })
              .eq("id", rj.id as string);
          }
        }
      }

      // ── Phase 1c: เตือนโควต้าใกล้หมด ≥10 นาทีก่อนบอทดีดตัว (ครั้งเดียว ผ่าน quota_warned_at) ──
      if (joinedMs && botId && holdS > 0 && !rj.quota_warned_at) {
        const elapsedS = (now.getTime() - joinedMs) / 1000;
        if (elapsedS >= holdS - QUOTA_WARN_LEAD_S && elapsedS < holdS) {
          const minsLeft = Math.max(1, Math.ceil((holdS - elapsedS) / 60));
          const { data: prof } = await admin
            .from("profiles")
            .select("line_user_id")
            .eq("id", rj.profile_id as string)
            .maybeSingle();
          const lineId = (prof as { line_user_id?: string } | null)?.line_user_id;
          if (lineId) await pushLineFlex(accessToken, lineId, buildQuotaWarningFlex(minsLeft));
          await admin
            .from("assistant_jobs")
            .update({ quota_warned_at: now.toISOString() })
            .eq("id", rj.id as string);
        }
      }

      if (joinedMs && botId && holdS > 0 && (now.getTime() - joinedMs) / 1000 >= holdS) {
        // ครบโควต้า → settle ทันที (กัน quota ค้างถ้า done ช้า) + สั่งบอทออก · done จะถอดต่อ
        const actualSec = Math.max(0, Math.round((now.getTime() - joinedMs) / 1000));
        await admin
          .rpc("settle_bot_quota", { p_job_id: rj.id as string, p_actual_seconds: actualSec })
          .then(
            () => undefined,
            () => undefined,
          );
        await leaveBot(botId).catch(() => false);
        await admin
          .from("assistant_jobs")
          .update({ bot_state: "leaving", updated_at: now.toISOString() })
          .eq("id", rj.id as string);
        await notifyRecall(
          rj.profile_id,
          "⏱️ ครบโควต้าบอท — กำลังสรุปการประชุมเท่าที่บันทึกได้ครับ",
        );
      } else if (
        !joinedMs &&
        !notYetScheduled &&
        now.getTime() - new Date(rj.created_at as string).getTime() > RECALL_STUCK_JOIN_MS
      ) {
        // บอทไม่เคยเข้าห้องภายในเวลาที่ควร → ยอมแพ้ + คืน hold
        if (botId) {
          if (state === "scheduled") await deleteScheduledBot(botId).catch(() => false);
          else await leaveBot(botId).catch(() => false);
        }
        await admin
          .from("assistant_jobs")
          .update({ status: "failed", bot_state: "stuck", updated_at: now.toISOString() })
          .eq("id", rj.id as string);
        await admin.rpc("refund_bot_quota", { p_job_id: rj.id as string }).then(
          () => undefined,
          () => undefined,
        );
        await notifyRecall(rj.profile_id, "❌ บอทเข้าห้องประชุมไม่สำเร็จ คืนโควต้าให้แล้วครับ 🙏");
      }
    }

    // 8. PDPA — ลบ recording media ฝั่ง Recall หลังถอดเสร็จ (เรามี copy ใน bucket 48 ชม. แล้ว)
    //    marker: recording_url ยัง not-null = ยังไม่ได้ลบฝั่ง Recall
    const { data: purgeJobs } = await admin
      .from("assistant_jobs")
      .select("id, recall_bot_id")
      .eq("source", "recall")
      .eq("status", "completed")
      .not("recall_bot_id", "is", null)
      .not("recording_url", "is", null)
      .limit(50);
    for (const pj of (purgeJobs ?? []) as Record<string, unknown>[]) {
      await deleteBotMedia(String(pj.recall_bot_id)).catch(() => false);
      await admin
        .from("assistant_jobs")
        .update({ recording_url: null })
        .eq("id", pj.id as string);
    }

    // 9. cleanup webhook_event เก่า > 7 วัน (payload มี media URL/ผู้เข้าร่วม)
    await admin
      .from("webhook_event")
      .delete()
      .lt("created_at", new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString())
      .then(
        () => undefined,
        () => undefined,
      );

    // 9b. cleanup file_links เก่า > 48 ชม. (ลิงก์ดาวน์โหลดสั้น — ไฟล์ถูกลบที่ 48 ชม.แล้ว)
    await admin
      .from("file_links")
      .delete()
      .lt("created_at", new Date(now.getTime() - 48 * 60 * 60 * 1000).toISOString())
      .then(
        () => undefined,
        () => undefined,
      );

    // 10. Phase 1b — sync ปฏิทิน Google ของผู้ใช้ที่เปิด auto_remind (throttle 10 นาที/คน, batch 15)
    //     poll upcoming 36 ชม. → upsert recall_calendar_events (event ที่จะส่งบอท reminder ใน Phase 1c)
    {
      const throttleMs = 10 * 60 * 1000;
      // เอา 15 คนที่ค้าง sync นานสุดก่อน (null = ไม่เคย sync มาก่อน) แล้วค่อยกรอง throttle ใน JS
      // (เลี่ยง .or() กับ timestamp ที่มีจุด ms → PostgREST parse เพี้ยน · เลี่ยง embed FK ที่ไม่แน่นอน)
      const { data: toSync } = await admin
        .from("meeting_calendar_settings")
        .select("profile_id, last_synced_at")
        .eq("auto_remind_enabled", true)
        .order("last_synced_at", { ascending: true, nullsFirst: true })
        .limit(15);
      for (const row of (toSync ?? []) as { profile_id: string; last_synced_at: string | null }[]) {
        if (
          row.last_synced_at &&
          now.getTime() - new Date(row.last_synced_at).getTime() < throttleMs
        )
          continue;
        const profileId = row.profile_id;
        const { data: prof } = await admin
          .from("profiles")
          .select("line_active_org_id")
          .eq("id", profileId)
          .maybeSingle();
        const orgId = (prof as { line_active_org_id?: string } | null)?.line_active_org_id ?? null;
        try {
          await syncProfileCalendar(admin, profileId, orgId);
        } catch {
          /* รายคนพลาดไม่ล้มทั้ง loop */
        }
        await admin
          .from("meeting_calendar_settings")
          .update({ last_synced_at: now.toISOString(), updated_at: now.toISOString() })
          .eq("profile_id", profileId);
      }
    }

    // 11. Phase 1c — เตือน+ยืนยันส่งบอท 5 นาทีก่อนเริ่ม (จาก recall_calendar_events ที่ confirm_state='pending')
    {
      const remindHi = new Date(now.getTime() + 5 * 60 * 1000).toISOString(); // ≤5 นาทีก่อนเริ่ม
      const remindLo = new Date(now.getTime() - 15 * 60 * 1000).toISOString(); // grace นัดที่เพิ่งเริ่ม
      const { data: dueEvents } = await admin
        .from("recall_calendar_events")
        .select(
          "id, profile_id, source, google_event_id, meeting_url, meeting_key, title, starts_at",
        )
        .eq("confirm_state", "pending")
        .eq("is_deleted", false)
        .gte("starts_at", remindLo)
        .lte("starts_at", remindHi)
        .limit(30);
      // เคารพ toggle: event จากปฏิทิน (source='google') เตือนเฉพาะคนที่เปิด auto_remind · event ที่วางลิงก์เอง (source='line') เตือนเสมอ
      const remindEnabled = new Map<string, boolean>();
      // cache Google access token ต่อ profile (re-check สถานะ event ก่อนส่งบอท) — undefined = ยังไม่เคยขอ
      const calTokenCache = new Map<string, string | null>();
      const getCalToken = async (pid: string): Promise<string | null> => {
        if (calTokenCache.has(pid)) return calTokenCache.get(pid)!;
        let t: string | null = null;
        try {
          t = await getCalendarAccessTokenForProfile(admin, pid);
        } catch {
          t = null;
        }
        calTokenCache.set(pid, t);
        return t;
      };
      const isRemindEnabled = async (pid: string): Promise<boolean> => {
        if (remindEnabled.has(pid)) return remindEnabled.get(pid)!;
        const { data: s } = await admin
          .from("meeting_calendar_settings")
          .select("auto_remind_enabled")
          .eq("profile_id", pid)
          .maybeSingle();
        const on = Boolean((s as { auto_remind_enabled?: boolean } | null)?.auto_remind_enabled);
        remindEnabled.set(pid, on);
        return on;
      };
      for (const evRow of (dueEvents ?? []) as Record<string, unknown>[]) {
        const evId = String(evRow.id);
        const profileId = String(evRow.profile_id);
        if (String(evRow.source) === "google" && !(await isRemindEnabled(profileId))) continue; // ปิด toggle → ไม่เตือน event ปฏิทิน

        // defense-in-depth: re-check สถานะจริงกับ Google ก่อนส่งบอท — กัน cancel ที่ sweep ยังไม่ทัน
        // + recurring instance ที่ถูกยกเลิกเดี่ยว ๆ · ตรวจไม่ได้ (token พลาด/เครือข่าย) → ปล่อยผ่านตามเดิม (ไม่ block)
        if (String(evRow.source) === "google" && evRow.google_event_id) {
          const calToken = await getCalToken(profileId);
          if (calToken) {
            const live = await getCalendarEvent(calToken, String(evRow.google_event_id));
            if (live?.status === "cancelled") {
              await admin
                .from("recall_calendar_events")
                .update({ is_deleted: true, updated_at: now.toISOString() })
                .eq("id", evId);
              continue; // ยกเลิกแล้ว → ไม่ส่งบอท
            }
          }
        }

        const meetingUrl = String(evRow.meeting_url ?? "");
        if (!meetingUrl) continue;
        const key = evRow.meeting_key ? String(evRow.meeting_key) : normalizeMeetingUrl(meetingUrl);

        // reconcile (M2): มี bot job ห้องเดียวกัน + เวลาใกล้กัน active แล้ว (ผู้ใช้วางลิงก์สดไปแล้ว) → ไม่เตือนซ้ำ
        const startsMs = new Date(String(evRow.starts_at)).getTime();
        const { data: activeJobs } = await admin
          .from("assistant_jobs")
          .select("meeting_url, join_at, created_at")
          .eq("profile_id", profileId)
          .eq("source", "recall")
          .in("bot_state", [
            "awaiting_confirm",
            "creating",
            "scheduled",
            "joining",
            "in_waiting_room",
            "recording",
          ])
          .limit(50);
        const dup = (
          (activeJobs ?? []) as {
            meeting_url: string | null;
            join_at: string | null;
            created_at: string;
          }[]
        ).some(
          (j) =>
            j.meeting_url &&
            normalizeMeetingUrl(j.meeting_url) === key &&
            Math.abs(new Date(j.join_at ?? j.created_at).getTime() - startsMs) <= 30 * 60 * 1000,
        );
        if (dup) {
          await admin
            .from("recall_calendar_events")
            .update({ confirm_state: "confirmed", updated_at: now.toISOString() })
            .eq("id", evId);
          continue;
        }

        const { data: prof } = await admin
          .from("profiles")
          .select("line_user_id")
          .eq("id", profileId)
          .maybeSingle();
        const lineId = (prof as { line_user_id?: string } | null)?.line_user_id;
        if (!lineId) continue;

        const { remainUnits: remainSec } = await getServiceRemaining(admin, profileId, "bot");

        const platform = extractMeetingUrl(meetingUrl);
        const platformLabel = platform
          ? (SCHED_PLATFORM_LABEL[platform.platform] ?? "ห้องประชุม")
          : "ห้องประชุม";
        const joinAtText = new Intl.DateTimeFormat("th-TH", {
          timeZone: "Asia/Bangkok",
          dateStyle: "long",
          timeStyle: "short",
        }).format(new Date(String(evRow.starts_at)));
        await pushLineFlex(
          accessToken,
          lineId,
          buildBotConfirmFlex({
            platformLabel,
            remainMin: Math.floor(remainSec / 60),
            lowQuota: remainSec < 900,
            confirmData: `calsend:${evId}`,
            title: evRow.title ? String(evRow.title) : undefined,
            joinAtText,
          }),
        );
        await admin
          .from("recall_calendar_events")
          .update({
            confirm_state: "reminded",
            confirm_sent_at: now.toISOString(),
            updated_at: now.toISOString(),
          })
          .eq("id", evId);
      }
    }

    // ── Token expiry: เก็บกวาด lot หมดอายุ + เตือนล่วงหน้า 30/7 วัน (LINE) ──
    try {
      await admin.rpc("token_expire_sweep");

      const in7Iso = new Date(now.getTime() + 7 * 86400000).toISOString();
      const in30Iso = new Date(now.getTime() + 30 * 86400000).toISOString();
      // แบ่ง bucket ไม่ให้ทับกัน: 7วัน = (now, +7], 30วัน = (+7, +30] → lot นึงเข้า bucket เดียวต่อรอบ
      // skipShortLived (30วัน): ข้าม lot อายุรวม ≤31วัน (เช่น trial 30วัน) — ไม่งั้นจะเตือน 30วันทันทีตอนได้ trial
      const buckets: Array<{
        col: "reminded_7_at" | "reminded_30_at";
        loIso: string;
        hiIso: string;
        skipShortLived?: boolean;
      }> = [
        { col: "reminded_7_at", loIso: now.toISOString(), hiIso: in7Iso },
        { col: "reminded_30_at", loIso: in7Iso, hiIso: in30Iso, skipShortLived: true },
      ];
      for (const b of buckets) {
        const { data: lots } = await admin
          .from("token_lots")
          .select("id, profile_id, remaining_tokens, expires_at, granted_at")
          .eq("status", "active")
          .gt("remaining_tokens", 0)
          .gt("expires_at", b.loIso)
          .lte("expires_at", b.hiIso)
          .is(b.col, null)
          .limit(2000);
        const byProfile = new Map<string, { tokens: number; earliest: string; ids: string[] }>();
        for (const l of (lots ?? []) as Array<{
          id: string;
          profile_id: string;
          remaining_tokens: number;
          expires_at: string;
          granted_at: string;
        }>) {
          if (
            b.skipShortLived &&
            new Date(l.expires_at).getTime() - new Date(l.granted_at).getTime() <= 31 * 86400000
          )
            continue;
          const g = byProfile.get(l.profile_id) ?? { tokens: 0, earliest: l.expires_at, ids: [] };
          g.tokens += Number(l.remaining_tokens);
          if (l.expires_at < g.earliest) g.earliest = l.expires_at;
          g.ids.push(l.id);
          byProfile.set(l.profile_id, g);
        }
        for (const [profileId, g] of Array.from(byProfile.entries())) {
          const { data: prof } = await admin
            .from("profiles")
            .select("line_user_id")
            .eq("id", profileId)
            .maybeSingle();
          const lineId = (prof as { line_user_id?: string } | null)?.line_user_id;
          if (lineId) {
            const dateStr = new Intl.DateTimeFormat("th-TH", {
              timeZone: "Asia/Bangkok",
              day: "numeric",
              month: "long",
              year: "numeric",
            }).format(new Date(g.earliest));
            await pushLine(
              accessToken,
              lineId,
              `⏳ เครดิต ${g.tokens.toLocaleString("th-TH")} ของคุณจะหมดอายุ ${dateStr}\nเติมเครดิตก่อนหมดอายุ เครดิตเก่าทั้งหมดจะถูกต่ออายุอีก 1 ปีให้อัตโนมัติ — พิมพ์ /web เพื่อเติมครับ`,
            ).catch(() => undefined); // push คนนึงล้ม (เช่นบล็อก OA) ต้องไม่ทำให้คนอื่นไม่ได้เตือน
          }
          // mark กันเตือนซ้ำ (rollover ตอนเติมจะ reset flag ให้เอง)
          await admin
            .from("token_lots")
            .update({ [b.col]: now.toISOString() })
            .in("id", g.ids);
        }
      }
    } catch {
      /* token expiry best-effort — ไม่ทำให้ scheduler ล้ม */
    }

    // ── Token auto top-up: เติมเครดิตอัตโนมัติเมื่อ balance < buffer (off-session charge) ──
    try {
      const STALE_LOCK_MS = 15 * 60 * 1000; // ปลดล็อก 'charging' ที่ค้างเกิน 15 นาที
      const COOLDOWN_MS = 10 * 60 * 1000; // กันชาร์จซ้ำถี่หลังเพิ่งเติม
      const stripe = getStripe();
      const { data: autos } = await admin
        .from("token_autotopup")
        .select(
          "profile_id, threshold_tokens, pack_code, stripe_customer_id, stripe_payment_method_id, status, charging_at, last_charged_at",
        )
        .eq("enabled", true)
        .not("stripe_payment_method_id", "is", null)
        .not("pack_code", "is", null);
      for (const a of (autos ?? []) as Array<{
        profile_id: string;
        threshold_tokens: number;
        pack_code: string;
        stripe_customer_id: string | null;
        stripe_payment_method_id: string;
        status: string;
        charging_at: string | null;
        last_charged_at: string | null;
      }>) {
        if (
          a.status === "charging" &&
          a.charging_at &&
          now.getTime() - new Date(a.charging_at).getTime() < STALE_LOCK_MS
        )
          continue;
        if (
          a.last_charged_at &&
          now.getTime() - new Date(a.last_charged_at).getTime() < COOLDOWN_MS
        )
          continue;
        const { data: acc } = await admin
          .from("token_accounts")
          .select("balance_tokens")
          .eq("profile_id", a.profile_id)
          .maybeSingle();
        const balance = Number((acc as { balance_tokens?: number } | null)?.balance_tokens ?? 0);
        if (balance >= Number(a.threshold_tokens)) continue;
        const { data: pack } = await admin
          .from("token_packs")
          .select("price, currency, tokens")
          .eq("code", a.pack_code)
          .eq("is_active", true)
          .maybeSingle();
        const customerId = a.stripe_customer_id;
        if (!pack || !customerId) continue;
        // กัน loop: ถ้าชาร์จแล้วยอดยังไม่พ้น buffer → ข้าม (PUT กันไว้แล้ว แต่ pack อาจถูกแก้ภายหลัง)
        if (Number((pack as { tokens: number }).tokens) <= Number(a.threshold_tokens)) continue;
        // lock กัน scheduler รอบถัดไปยิงซ้ำระหว่าง PI ค้าง
        await admin
          .from("token_autotopup")
          .update({
            status: "charging",
            charging_at: now.toISOString(),
            updated_at: now.toISOString(),
          })
          .eq("profile_id", a.profile_id);
        try {
          // off-session charge → สำเร็จ: webhook payment_intent.succeeded เติม token + reset status
          await stripe.paymentIntents.create({
            amount: Math.round(Number((pack as { price: number }).price) * 100),
            currency: String((pack as { currency?: string }).currency ?? "THB").toLowerCase(),
            customer: customerId,
            payment_method: a.stripe_payment_method_id,
            off_session: true,
            confirm: true,
            metadata: {
              kind: "token_topup",
              profile_id: a.profile_id,
              pack_code: a.pack_code,
              tokens: String(Number((pack as { tokens: number }).tokens)),
              auto: "1",
            },
          });
        } catch (chErr) {
          // บัตรถูกปฏิเสธ (off-session) → ปิด auto ทันที + แจ้ง LINE (ตามนโยบาย: ล้มครั้งแรกปิดเลย)
          await admin
            .from("token_autotopup")
            .update({
              enabled: false,
              status: "idle",
              charging_at: null,
              last_error: chErr instanceof Error ? chErr.message : "charge_failed",
              updated_at: now.toISOString(),
            })
            .eq("profile_id", a.profile_id);
          const { data: prof } = await admin
            .from("profiles")
            .select("line_user_id")
            .eq("id", a.profile_id)
            .maybeSingle();
          const lineId = (prof as { line_user_id?: string } | null)?.line_user_id;
          if (lineId)
            await pushLine(
              accessToken,
              lineId,
              "⚠️ เติมเครดิตอัตโนมัติไม่สำเร็จ (บัตรถูกปฏิเสธ) — ปิดระบบเติมอัตโนมัติแล้ว\nกรุณาอัปเดตบัตรหรือเติมเครดิตเองที่หน้าผู้ช่วย AI ครับ",
            );
        }
      }
    } catch {
      /* auto top-up best-effort — ไม่ทำให้ scheduler ล้ม */
    }

    await logRun(true);
    return NextResponse.json({ ok: true, ...counts });
  } catch (e) {
    await logRun(false, e instanceof Error ? e.message : String(e));
    return NextResponse.json({ ok: false, error: "scheduler_failed" }, { status: 500 });
  }
}
