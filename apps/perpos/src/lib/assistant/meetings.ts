/**
 * getMeetingsData — ข้อมูลหน้า /assistant/meetings ของผู้ใช้คนเดียว (per-profile)
 *
 * ใช้ตอน SSR (initial) — client view โหลดต่อด้วย browser supabase (RLS) ทุก 30 วิ
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { getTokenSummary } from "@/lib/assistant/token-balance";

export type MeetingJob = {
  id: string;
  created_at: string;
  meeting_url: string | null;
  file_name: string | null;
  bot_state: string | null;
  status: string | null;
  hold_seconds: number | null;
  duration_seconds: number | null;
  mom_drive_url: string | null;
  source: string | null;
  transcript_json: { meeting_title?: string } | null;
};

export type MeetingCalEvent = {
  id: string;
  title: string | null;
  meeting_url: string | null;
  starts_at: string;
  confirm_state: string;
};

export type MeetingsData = {
  botSeconds: number;
  jobs: MeetingJob[];
  upcoming: MeetingCalEvent[];
};

const JOB_COLS =
  "id, created_at, meeting_url, file_name, bot_state, status, hold_seconds, duration_seconds, mom_drive_url, source, transcript_json";

export async function getMeetingsData(
  admin: SupabaseClient,
  userId: string,
): Promise<MeetingsData> {
  const [summary, { data: jobs }, { data: upcoming }] = await Promise.all([
    getTokenSummary(admin, userId),
    admin
      .from("assistant_jobs")
      .select(JOB_COLS)
      .eq("profile_id", userId)
      .eq("source", "recall")
      .order("created_at", { ascending: false })
      .limit(30),
    admin
      .from("recall_calendar_events")
      .select("id, title, meeting_url, starts_at, confirm_state")
      .eq("profile_id", userId)
      .eq("is_deleted", false)
      .in("confirm_state", ["pending", "reminded"])
      .gte("starts_at", new Date().toISOString())
      .order("starts_at", { ascending: true })
      .limit(10),
  ]);

  return {
    botSeconds: summary.remaining.bot_seconds,
    jobs: (jobs ?? []) as MeetingJob[],
    upcoming: (upcoming ?? []) as MeetingCalEvent[],
  };
}
