/**
 * POST /api/assistant/recall/calendar-cancel  (requireAssistantUser)
 *   web "ยกเลิกนัดประชุม" (recall_calendar_events) — หยุดเตือน/ส่งบอทตามนัด
 *   body: { eventId }
 *   - มี bot_job_id active → ยกเลิกบอทด้วย (cancelBotJob)
 *   - นัดที่ "เราสร้างให้" (source line/web + มี google_event_id) → ลบ event ใน Google Calendar ด้วย
 *   - นัดที่ผู้ใช้สร้างเอง (source google) → ไม่ลบปฏิทินผู้ใช้ แค่ mark is_deleted (เลิกติดตาม)
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAssistantUser } from "../../../_lib/assistant-auth";
import { createAdminClient } from "../../../_lib/supabase";
import { cancelBotJob, type CancelBotJobRow } from "@/lib/assistant/recall-bot";
import { getCalendarAccessTokenForProfile, deleteCalendarEvent } from "@/lib/google/calendar";

export async function POST(req: NextRequest) {
  const auth = await requireAssistantUser(req);
  if (!auth.ok) return auth.res;

  const body = (await req.json().catch(() => ({}))) as { eventId?: string };
  const eventId = String(body.eventId ?? "");
  if (!eventId) return NextResponse.json({ ok: false, reason: "missing_event" });

  const admin = createAdminClient();
  const { data: evData } = await admin
    .from("recall_calendar_events")
    .select("id, source, google_event_id, bot_job_id, is_deleted")
    .eq("id", eventId)
    .eq("profile_id", auth.userId) // เจ้าของเท่านั้น
    .maybeSingle();
  const ev = evData as {
    id: string;
    source: string;
    google_event_id: string | null;
    bot_job_id: string | null;
    is_deleted: boolean;
  } | null;
  if (!ev) return NextResponse.json({ ok: false, reason: "not_found" });
  if (ev.is_deleted) return NextResponse.json({ ok: true, alreadyCancelled: true });

  // 1. ถ้ามีบอทผูกกับนัดนี้และยัง active → ยกเลิกบอทด้วย
  if (ev.bot_job_id) {
    const { data: jobData } = await admin
      .from("assistant_jobs")
      .select("id, profile_id, recall_bot_id, bot_state, recording_started_at")
      .eq("id", ev.bot_job_id)
      .eq("profile_id", auth.userId)
      .maybeSingle();
    const job = jobData as CancelBotJobRow | null;
    if (job) await cancelBotJob(admin, job).catch(() => undefined);
  }

  // 2. นัดที่ "เราสร้างให้" → ลบ event ในปฏิทิน Google ด้วย (best-effort)
  //    นัดที่ผู้ใช้สร้างเอง (source='google') → ไม่แตะปฏิทินเขา แค่เลิกติดตาม
  if ((ev.source === "line" || ev.source === "web") && ev.google_event_id) {
    try {
      const accessToken = await getCalendarAccessTokenForProfile(admin, auth.userId);
      if (accessToken)
        await deleteCalendarEvent({ accessToken, eventId: ev.google_event_id });
    } catch {
      /* ลบปฏิทินไม่สำเร็จ → ยังถือว่ายกเลิกนัดในระบบสำเร็จ (is_deleted) */
    }
  }

  // 3. mark ลบ + เลิกเตือน/ส่งบอท
  await admin
    .from("recall_calendar_events")
    .update({
      is_deleted: true,
      confirm_state: "declined",
      updated_at: new Date().toISOString(),
    })
    .eq("id", eventId);

  return NextResponse.json({ ok: true });
}
