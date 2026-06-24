import type { SupabaseClient } from "@supabase/supabase-js";
import { getDriveAccessTokenForRow } from "./drive";

const CALENDAR_API = "https://www.googleapis.com/calendar/v3/calendars/primary/events";

type GoogleTokenRow = {
  profile_id: string;
  refresh_token: string;
  access_token: string | null;
  expires_at: string | null;
  scope: string | null;
  token_type: string | null;
  drive_root_folder_id: string | null;
};

/**
 * คืน access token ของ Google สำหรับ profile (refresh + persist อัตโนมัติ) — reuse google_drive_tokens
 * คืน null ถ้ายังไม่เชื่อม Google (ไม่มี row) → ฝั่งเรียกต้องชวนผู้ใช้เชื่อมก่อน
 */
export async function getCalendarAccessTokenForProfile(
  admin: SupabaseClient,
  profileId: string,
): Promise<string | null> {
  const { data } = await admin
    .from("google_drive_tokens")
    .select(
      "profile_id, refresh_token, access_token, expires_at, scope, token_type, drive_root_folder_id",
    )
    .eq("profile_id", profileId)
    .maybeSingle();
  const row = data as GoogleTokenRow | null;
  if (!row?.refresh_token) return null;
  return getDriveAccessTokenForRow(row, async (patch) => {
    await admin
      .from("google_drive_tokens")
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq("profile_id", profileId);
  });
}

export type CalendarEventResult = {
  id: string;
  htmlLink?: string;
};

/**
 * Create a Google Calendar event using an existing access token.
 * Returns the event ID on success, null if the token lacks Calendar scope.
 */
export async function createCalendarEvent(args: {
  accessToken: string;
  title: string;
  startsAt: string; // ISO string
  durationMinutes?: number;
  timeZone?: string;
}): Promise<CalendarEventResult | null> {
  const { accessToken, title, startsAt, durationMinutes = 60, timeZone = "Asia/Bangkok" } = args;

  const start = new Date(startsAt);
  const end = new Date(start.getTime() + durationMinutes * 60 * 1000);

  const body = JSON.stringify({
    summary: title,
    start: { dateTime: start.toISOString(), timeZone },
    end: { dateTime: end.toISOString(), timeZone },
  });

  const res = await fetch(CALENDAR_API, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body,
  });

  if (!res.ok) {
    const errData = await res.json().catch(() => null);
    const msg = errData?.error?.message || errData?.error || res.statusText || `http_${res.status}`;
    throw new Error(String(msg));
  }

  const data = await res.json().catch(() => null);
  if (!data?.id) return null;
  return { id: String(data.id), htmlLink: data.htmlLink };
}

/**
 * Delete a Google Calendar event by ID. Fails silently.
 */
export async function deleteCalendarEvent(args: {
  accessToken: string;
  eventId: string;
}): Promise<void> {
  await fetch(`${CALENDAR_API}/${encodeURIComponent(args.eventId)}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${args.accessToken}` },
  }).catch(() => null);
}

export type GoogleCalendarEvent = {
  id: string;
  status?: string; // 'confirmed' | 'cancelled' | …
  summary?: string;
  location?: string;
  description?: string;
  hangoutLink?: string;
  start?: { dateTime?: string; date?: string };
  end?: { dateTime?: string; date?: string };
  conferenceData?: { entryPoints?: { entryPointType?: string; uri?: string }[] };
  attendees?: { self?: boolean; responseStatus?: string }[];
};

/**
 * ดึง event ปฏิทินหลัก (primary) ในหน้าต่างเวลา (singleEvents → กาง recurring เป็นครั้ง ๆ)
 * throw ถ้า token ใช้ไม่ได้ — ฝั่งเรียก (sync) ต้อง catch ไม่ให้ล้มทั้ง loop
 */
export async function listUpcomingEvents(
  accessToken: string,
  timeMinIso: string,
  timeMaxIso: string,
): Promise<GoogleCalendarEvent[]> {
  const url = new URL(CALENDAR_API);
  url.searchParams.set("timeMin", timeMinIso);
  url.searchParams.set("timeMax", timeMaxIso);
  url.searchParams.set("singleEvents", "true");
  url.searchParams.set("orderBy", "startTime");
  url.searchParams.set("maxResults", "50");
  const res = await fetch(url.toString(), { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Calendar list failed: ${res.status} ${text.slice(0, 200)}`);
  }
  const json = (await res.json()) as { items?: GoogleCalendarEvent[] };
  return json.items ?? [];
}

/**
 * ดึง event เดี่ยวตาม id (รวม instance ของ recurring) — ใช้ re-check สถานะก่อนส่งบอท (defense-in-depth)
 * คืน { status } ('confirmed' | 'cancelled' | …) · 404/410 (ลบทิ้ง/ไม่พบ) → ถือเป็น 'cancelled'
 * คืน null ถ้าตรวจไม่ได้ (token พลาด / เครือข่าย / 5xx) — ฝั่งเรียกต้องตีความว่า "ยืนยันไม่ได้" ไม่ใช่ "ยกเลิก"
 */
export async function getCalendarEvent(
  accessToken: string,
  eventId: string,
): Promise<{ status: string } | null> {
  const res = await fetch(`${CALENDAR_API}/${encodeURIComponent(eventId)}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  }).catch(() => null);
  if (!res) return null;
  if (res.status === 404 || res.status === 410) return { status: "cancelled" };
  if (!res.ok) return null;
  const json = (await res.json().catch(() => null)) as { status?: string } | null;
  if (!json) return null;
  return { status: String(json.status ?? "confirmed") };
}
