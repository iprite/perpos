BEGIN;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS display_name TEXT,
  ADD COLUMN IF NOT EXISTS avatar_url TEXT,
  ADD COLUMN IF NOT EXISTS line_user_id TEXT,
  ADD COLUMN IF NOT EXISTS line_linked_at TIMESTAMPTZ;

CREATE UNIQUE INDEX IF NOT EXISTS uq_profiles_line_user_id
  ON public.profiles(line_user_id)
  WHERE line_user_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.notification_events (
  key TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INT NOT NULL DEFAULT 0
);

ALTER TABLE public.notification_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "notification_events_read" ON public.notification_events;
CREATE POLICY "notification_events_read" ON public.notification_events
FOR SELECT
TO authenticated
USING (true);

GRANT SELECT ON public.notification_events TO authenticated;

CREATE TABLE IF NOT EXISTS public.user_notification_settings (
  profile_id UUID NOT NULL,
  event_key TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (profile_id, event_key)
);

CREATE INDEX IF NOT EXISTS idx_user_notification_settings_profile_id
  ON public.user_notification_settings(profile_id);

ALTER TABLE public.user_notification_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "user_notification_settings_self" ON public.user_notification_settings;
CREATE POLICY "user_notification_settings_self" ON public.user_notification_settings
FOR ALL
TO authenticated
USING (profile_id = auth.uid() OR public.is_admin())
WITH CHECK (profile_id = auth.uid() OR public.is_admin());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_notification_settings TO authenticated;

CREATE TABLE IF NOT EXISTS public.line_link_tokens (
  token TEXT PRIMARY KEY,
  profile_id UUID NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_line_link_tokens_profile_id
  ON public.line_link_tokens(profile_id);

CREATE INDEX IF NOT EXISTS idx_line_link_tokens_expires_at
  ON public.line_link_tokens(expires_at);

ALTER TABLE public.line_link_tokens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "line_link_tokens_self" ON public.line_link_tokens;
CREATE POLICY "line_link_tokens_self" ON public.line_link_tokens
FOR ALL
TO authenticated
USING (profile_id = auth.uid() OR public.is_admin())
WITH CHECK (profile_id = auth.uid() OR public.is_admin());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.line_link_tokens TO authenticated;

INSERT INTO public.notification_events (key, name, description, is_active, sort_order)
VALUES
  ('poa_request_created', 'มีคำขอ POA ใหม่', 'แจ้งเตือนเมื่อมีคำขอ POA เข้ามาใหม่', TRUE, 10),
  ('order_created', 'เปิดออเดอร์ใหม่', 'แจ้งเตือนเมื่อมีการเปิดออเดอร์ใหม่', TRUE, 20),
  ('order_status_started', 'ออเดอร์เริ่มดำเนินการ', 'แจ้งเตือนเมื่อออเดอร์เข้าสู่สถานะเริ่มดำเนินการ', TRUE, 30)
ON CONFLICT (key) DO NOTHING;

NOTIFY pgrst, 'reload schema';

COMMIT;
