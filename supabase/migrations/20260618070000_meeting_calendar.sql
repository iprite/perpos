-- =========================================================
-- Meeting Bot Phase 1 — Calendar (Option B: ปฏิทินเราเอง)
--   เก็บ setting การเตือน/auto-join + cache event ปฏิทิน (เขียนจาก LINE + sync จาก Google)
--   ไม่สร้าง token table ใหม่ — reuse google_drive_tokens (per-profile, scope calendar.events)
-- =========================================================

-- 1) setting ต่อ profile — เปิด/ปิดการเตือน+ส่งบอทจากปฏิทิน (toggle UI = Phase 1d)
CREATE TABLE IF NOT EXISTS public.meeting_calendar_settings (
  profile_id          uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  auto_remind_enabled boolean NOT NULL DEFAULT true,  -- sync ปฏิทิน + เตือน 5 นาทีก่อน
  last_synced_at      timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.meeting_calendar_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS meeting_calendar_settings_select_own ON public.meeting_calendar_settings;
CREATE POLICY meeting_calendar_settings_select_own ON public.meeting_calendar_settings
  FOR SELECT TO authenticated USING (profile_id = auth.uid());

-- 2) cache event ปฏิทินที่มีลิงก์ประชุม — source ของบอท (เขียนจาก LINE หรือ sync จาก Google)
--    confirm_state: pending → reminded (ส่งการ์ดยืนยันแล้ว) → confirmed/declined (ผู้ใช้กด) — Phase 1c
CREATE TABLE IF NOT EXISTS public.recall_calendar_events (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id      uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  org_id          uuid REFERENCES public.organizations(id) ON DELETE SET NULL,
  google_event_id text,                          -- id ฝั่ง Google (null = ยังไม่ได้ผูก/เขียนเอง)
  source          text NOT NULL DEFAULT 'google' CHECK (source IN ('line', 'google')),
  title           text,
  meeting_url     text NOT NULL,
  starts_at       timestamptz NOT NULL,
  ends_at         timestamptz,
  confirm_state   text NOT NULL DEFAULT 'pending',-- pending|reminded|confirmed|declined
  confirm_sent_at timestamptz,
  bot_job_id      uuid REFERENCES public.assistant_jobs(id) ON DELETE SET NULL,
  is_deleted      boolean NOT NULL DEFAULT false, -- event ถูกลบ/ยกเลิกฝั่ง Google
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
-- 1 google_event ต่อ profile = 1 แถว (sync upsert)
CREATE UNIQUE INDEX IF NOT EXISTS uq_recall_cal_google_event
  ON public.recall_calendar_events (profile_id, google_event_id) WHERE google_event_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_recall_cal_due
  ON public.recall_calendar_events (starts_at) WHERE is_deleted = false AND confirm_state = 'pending';
CREATE INDEX IF NOT EXISTS idx_recall_cal_profile
  ON public.recall_calendar_events (profile_id, starts_at DESC);

ALTER TABLE public.recall_calendar_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS recall_calendar_events_select_own ON public.recall_calendar_events;
CREATE POLICY recall_calendar_events_select_own ON public.recall_calendar_events
  FOR SELECT TO authenticated USING (profile_id = auth.uid());
-- INSERT/UPDATE/DELETE = service role เท่านั้น (Route Handler / scheduler) — ไม่มี policy เปิดให้ user
