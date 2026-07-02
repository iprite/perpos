import type { SupabaseClient } from '@supabase/supabase-js';
import { getCalendarAccessTokenForProfile, listUpcomingEvents, type GoogleCalendarEvent } from '@/lib/google/calendar';
import { extractMeetingUrl, normalizeMeetingUrl } from './recall';

/** หน้าต่าง sync ปฏิทินล่วงหน้า (poll) */
const SYNC_WINDOW_MS = 36 * 60 * 60 * 1000;

/** ดึงลิงก์ประชุมจาก event: conferenceData(video) → hangoutLink → summary/location/description */
function eventMeetingUrl(ev: GoogleCalendarEvent): { platform: string; url: string } | null {
  const video = ev.conferenceData?.entryPoints?.find((e) => e.entryPointType === 'video' && e.uri);
  if (video?.uri) { const m = extractMeetingUrl(video.uri); if (m) return m; }
  if (ev.hangoutLink) { const m = extractMeetingUrl(ev.hangoutLink); if (m) return m; }
  // รวม summary (ชื่อ event) ด้วย — ผู้ใช้มักวางลิงก์ในชื่อ event เอง (เช่น "meeting https://…")
  return extractMeetingUrl(`${ev.summary ?? ''} ${ev.location ?? ''} ${ev.description ?? ''}`);
}

/** ผู้ใช้ตอบ "ไม่เข้าร่วม" → ไม่ต้องส่งบอท */
function selfDeclined(ev: GoogleCalendarEvent): boolean {
  return (ev.attendees ?? []).some((a) => a.self && a.responseStatus === 'declined');
}

/**
 * sync ปฏิทิน Google ของ 1 profile → upsert recall_calendar_events (source='google')
 *   - เฉพาะ event ที่มีลิงก์ประชุม (GMeet/Zoom/Teams) + ไม่ใช่ all-day + ไม่ถูก decline/cancel
 *   - เวลาเปลี่ยน + ยังไม่ส่งบอท → reset reminder (เตือนเวลาใหม่)
 *   - event ที่เคย sync แล้วหายไปจากหน้าต่าง (ลบ/ยกเลิก) → mark is_deleted (เฉพาะที่ยังไม่ confirm)
 * throw ถูก swallow ภายใน — คืนจำนวนที่ sync ได้ (0 ถ้าไม่เชื่อม/พลาด)
 */
export async function syncProfileCalendar(admin: SupabaseClient, profileId: string, orgId: string | null): Promise<number> {
  let accessToken: string | null = null;
  try { accessToken = await getCalendarAccessTokenForProfile(admin, profileId); } catch { accessToken = null; }
  if (!accessToken) return 0;

  const now = new Date();
  const timeMax = new Date(now.getTime() + SYNC_WINDOW_MS);
  let events: GoogleCalendarEvent[];
  try {
    events = await listUpcomingEvents(accessToken, now.toISOString(), timeMax.toISOString());
  } catch {
    return 0;
  }

  const seen: string[] = [];
  for (const ev of events) {
    if (!ev.id || ev.status === 'cancelled') continue;
    const startsAtRaw = ev.start?.dateTime; // all-day (date เฉย ๆ) ข้าม — ไม่ใช่ประชุมตามเวลา
    if (!startsAtRaw) continue;
    const found = eventMeetingUrl(ev);
    if (!found) continue;
    if (selfDeclined(ev)) continue;

    seen.push(ev.id);
    const startsAt = new Date(startsAtRaw).toISOString();
    const endsAt = ev.end?.dateTime ? new Date(ev.end.dateTime).toISOString() : null;
    const meetingKey = normalizeMeetingUrl(found.url);

    const { data: existing } = await admin
      .from('recall_calendar_events')
      .select('id, starts_at, confirm_state')
      .eq('profile_id', profileId).eq('google_event_id', ev.id).maybeSingle();

    if (existing) {
      const ex = existing as { id: string; starts_at: string; confirm_state: string };
      const timeChanged = new Date(ex.starts_at).toISOString() !== startsAt;
      await admin.from('recall_calendar_events').update({
        title: ev.summary ?? null, meeting_url: found.url, meeting_key: meetingKey,
        starts_at: startsAt, ends_at: endsAt, is_deleted: false, updated_at: now.toISOString(),
        // เวลาเปลี่ยน + ยังไม่ส่งบอท → เตือนรอบใหม่ตามเวลาใหม่
        ...(timeChanged && ['pending', 'reminded'].includes(ex.confirm_state) ? { confirm_state: 'pending', confirm_sent_at: null } : {}),
      }).eq('id', ex.id);
    } else {
      await admin.from('recall_calendar_events').insert({
        profile_id: profileId, org_id: orgId, google_event_id: ev.id, source: 'google',
        title: ev.summary ?? null, meeting_url: found.url, meeting_key: meetingKey,
        starts_at: startsAt, ends_at: endsAt, confirm_state: 'pending',
      });
    }
  }

  // deletion detection: event ในหน้าต่างที่เคย sync แต่หายไป (ลบ/ยกเลิกฝั่ง Google) → mark deleted
  // เฉพาะ pending/reminded — ไม่แตะที่ confirm แล้ว (บอทกำลังจะเข้า/เข้าไปแล้ว)
  const { data: cached } = await admin
    .from('recall_calendar_events')
    .select('id, google_event_id')
    .eq('profile_id', profileId).eq('is_deleted', false)
    .not('google_event_id', 'is', null)
    .in('confirm_state', ['pending', 'reminded'])
    .gte('starts_at', now.toISOString()).lte('starts_at', timeMax.toISOString());
  const toDelete = ((cached ?? []) as { id: string; google_event_id: string }[])
    .filter((r) => !seen.includes(r.google_event_id))
    .map((r) => r.id);
  if (toDelete.length > 0) {
    await admin.from('recall_calendar_events').update({ is_deleted: true, updated_at: now.toISOString() }).in('id', toDelete);
  }

  return seen.length;
}
