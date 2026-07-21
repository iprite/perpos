/**
 * นัดประชุมล่วงหน้า (link + วันเวลา) → เขียน Google Calendar + cache recall_calendar_events
 * → scheduler เตือน+ส่งบอท 5 นาทีก่อนเริ่ม (Phase 1c) · reconcile กับ calendar-sync
 *
 * channel-agnostic: LINE webhook + web endpoint (/api/assistant/recall/trigger) ใช้ตัวเดียวกัน
 *   — caller จัดรูปข้อความ/การ์ดเองจาก result (ไม่ reply/แสดงผลในนี้)
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { getCalendarAccessTokenForProfile, createCalendarEvent } from "@/lib/google/calendar";
import { normalizeMeetingUrl } from "./recall";
import { PLATFORM_LABEL } from "./recall-bot";

/** ดึงชื่อ event จากข้อความผู้ใช้ (ตัด URL ออก) → fallback "ประชุม (<platform>)" */
export function deriveEventTitle(text: string, meetingUrl: string, platformLabel: string): string {
  // ตัด url + query/slug ที่ติดกันท้าย url ด้วย (GMeet regex หยุดก่อน `?` → เหลือ ?authuser=0 ค้าง)
  const escaped = meetingUrl.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const cleaned = text
    .replace(new RegExp(escaped + "\\S*", "g"), "")
    .replace(/https?:\/\/\S+/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned.length > 0 ? cleaned.slice(0, 200) : `ประชุม (${platformLabel})`;
}

/** วันเวลาไทย (Asia/Bangkok) แบบยาว — ใช้ในข้อความ/การ์ดของ caller */
export function formatJoinAt(joinAt: Date): string {
  return new Intl.DateTimeFormat("th-TH", {
    timeZone: "Asia/Bangkok",
    dateStyle: "long",
    timeStyle: "short",
  }).format(joinAt);
}

export type ScheduleMeetingResult =
  | { kind: "not_connected" } // ยังไม่เชื่อม Google Calendar / token เพิกถอน
  | { kind: "exists"; title: string; joinAtText: string; platformLabel: string } // มีนัดนี้อยู่แล้ว
  | {
      kind: "scheduled";
      eventId: string;
      googleEventId: string | null;
      title: string;
      joinAtText: string;
      platformLabel: string;
    };

/**
 * เขียนนัดประชุมล่วงหน้าลง Google Calendar + recall_calendar_events (ถ้ายังไม่ซ้ำ)
 * @param source 'line' (วางใน LINE) | 'web' (วางในหน้าเว็บ) — 'google' สงวนไว้ให้ calendar-sync
 * @returns discriminated result ให้ caller จัดรูปข้อความเอง
 */
export async function scheduleFutureMeeting(
  admin: SupabaseClient,
  args: {
    profileId: string;
    orgId: string;
    found: { platform: string; url: string };
    joinAt: Date;
    text: string;
    source: "line" | "web";
  },
): Promise<ScheduleMeetingResult> {
  const { profileId, orgId, found, joinAt, text, source } = args;
  const platformLabel = PLATFORM_LABEL[found.platform] ?? "ห้องประชุม";
  const joinAtText = formatJoinAt(joinAt);

  // ต้องเชื่อม Google ก่อน — refresh ล้ม/เพิกถอน (throw) ถือว่ายังไม่เชื่อม
  let accessToken: string | null = null;
  try {
    accessToken = await getCalendarAccessTokenForProfile(admin, profileId);
  } catch {
    accessToken = null;
  }
  if (!accessToken) return { kind: "not_connected" };

  // dedup ห้องเดียวกัน (meeting_key normalize) ในหน้าต่าง ±30 นาที ที่ยังไม่ถูกลบ → ไม่เขียนซ้ำ
  const meetingKey = normalizeMeetingUrl(found.url);
  const lo = new Date(joinAt.getTime() - 30 * 60 * 1000).toISOString();
  const hi = new Date(joinAt.getTime() + 30 * 60 * 1000).toISOString();
  const { data: existing } = await admin
    .from("recall_calendar_events")
    .select("id, title")
    .eq("profile_id", profileId)
    .eq("meeting_key", meetingKey)
    .eq("is_deleted", false)
    .gte("starts_at", lo)
    .lte("starts_at", hi)
    .limit(1)
    .maybeSingle();
  if (existing) {
    const ex = existing as { id: string; title: string | null };
    return { kind: "exists", title: ex.title ?? platformLabel, joinAtText, platformLabel };
  }

  const title = deriveEventTitle(text, found.url, platformLabel);
  let googleEventId: string | null = null;
  try {
    const ev = await createCalendarEvent({ accessToken, title, startsAt: joinAt.toISOString() });
    googleEventId = ev?.id ?? null;
  } catch {
    return { kind: "not_connected" }; // token เพิกถอน/หมดสิทธิ์ระหว่างสร้าง → ชวนเชื่อมใหม่
  }

  const { data: inserted } = await admin
    .from("recall_calendar_events")
    .insert({
      profile_id: profileId,
      org_id: orgId,
      google_event_id: googleEventId,
      source,
      title,
      meeting_url: found.url,
      meeting_key: meetingKey,
      starts_at: joinAt.toISOString(),
      confirm_state: "pending",
    })
    .select("id")
    .single();

  // เชื่อม + ใช้ปฏิทินแล้ว = opt-in sync ปฏิทินอัตโนมัติ (scheduler step 10/11 กวาด event อื่นมาเตือนให้ด้วย)
  await admin
    .from("meeting_calendar_settings")
    .upsert({ profile_id: profileId }, { onConflict: "profile_id", ignoreDuplicates: true });

  return {
    kind: "scheduled",
    eventId: (inserted as { id: string } | null)?.id ?? "",
    googleEventId,
    title,
    joinAtText,
    platformLabel,
  };
}
