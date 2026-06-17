-- Admin console: System Settings, Scheduler run log, Announcements
-- ทุกตารางเข้าถึงผ่าน service role (createAdminClient) เท่านั้น
-- เปิด RLS แต่ไม่สร้าง policy → anon/authenticated ถูก deny อัตโนมัติ, service role bypass

BEGIN;

-- ── 1. app_settings — key/value config ระดับระบบ (feature flags, ค่าปรับได้) ──────
CREATE TABLE IF NOT EXISTS public.app_settings (
  key         text PRIMARY KEY,
  value       jsonb NOT NULL DEFAULT '{}'::jsonb,
  description text,
  updated_by  uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  updated_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.app_settings FROM anon, authenticated;

-- ── 2. scheduler_runs — log สรุปการรัน cron scheduler แต่ละครั้ง ──────────────────
CREATE TABLE IF NOT EXISTS public.scheduler_runs (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ran_at        timestamptz NOT NULL DEFAULT now(),
  duration_ms   integer NOT NULL DEFAULT 0,
  ok            boolean NOT NULL DEFAULT true,
  stuck_failed  integer NOT NULL DEFAULT 0,   -- งานค้าง processing ที่ถูก mark failed
  requeued      integer NOT NULL DEFAULT 0,   -- งาน pending ที่ยิงซ้ำ
  requeue_gaveup integer NOT NULL DEFAULT 0,  -- งาน pending ที่เกินเวลา → ยอมแพ้
  cleaned_jobs  integer NOT NULL DEFAULT 0,   -- งานที่ถูก PDPA cleanup
  error_message text
);

CREATE INDEX IF NOT EXISTS scheduler_runs_ran_at_idx ON public.scheduler_runs (ran_at DESC);

ALTER TABLE public.scheduler_runs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.scheduler_runs FROM anon, authenticated;

-- ── 3. announcements — ประกาศถึงผู้ใช้ (in-app banner) ─────────────────────────────
CREATE TABLE IF NOT EXISTS public.announcements (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title       text NOT NULL,
  body        text NOT NULL DEFAULT '',
  level       text NOT NULL DEFAULT 'info'
                CHECK (level IN ('info','success','warning','critical')),
  is_active   boolean NOT NULL DEFAULT true,
  starts_at   timestamptz,
  ends_at     timestamptz,
  created_by  uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS announcements_active_idx ON public.announcements (is_active, starts_at, ends_at);

ALTER TABLE public.announcements ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.announcements FROM anon, authenticated;

NOTIFY pgrst, 'reload config';

COMMIT;
