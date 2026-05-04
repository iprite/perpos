BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT,
  role TEXT NOT NULL DEFAULT 'user' CONSTRAINT profiles_role_check CHECK (role IN ('admin','user')),
  is_active BOOLEAN NOT NULL DEFAULT FALSE,
  display_name TEXT,
  avatar_url TEXT,
  line_user_id TEXT,
  line_linked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_profiles_line_user_id
  ON public.profiles(line_user_id)
  WHERE line_user_id IS NOT NULL;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_role_check;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_role_check CHECK (role IN ('admin','user'));

UPDATE public.profiles
SET role = 'user'
WHERE role IS DISTINCT FROM 'admin';

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, role)
  VALUES (NEW.id, NEW.email, 'user')
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW
EXECUTE FUNCTION public.handle_new_user();

CREATE OR REPLACE FUNCTION public.current_role()
RETURNS TEXT
LANGUAGE sql
STABLE
AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
AS $$
  SELECT public.current_role() = 'admin';
$$;

CREATE TABLE IF NOT EXISTS public.user_permissions (
  user_id UUID NOT NULL,
  function_key TEXT NOT NULL,
  allowed BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, function_key)
);

CREATE INDEX IF NOT EXISTS idx_user_permissions_user_id ON public.user_permissions(user_id);

CREATE OR REPLACE FUNCTION public.has_permission(function_key TEXT, user_id UUID DEFAULT auth.uid())
RETURNS BOOLEAN
LANGUAGE sql
STABLE
AS $$
  SELECT
    EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = user_id
        AND p.is_active = TRUE
        AND (
          p.role = 'admin'
          OR EXISTS (
            SELECT 1
            FROM public.user_permissions up
            WHERE up.user_id = p.id
              AND up.function_key = function_key
              AND up.allowed = TRUE
          )
        )
    );
$$;

CREATE TABLE IF NOT EXISTS public.invites (
  token TEXT PRIMARY KEY,
  email TEXT,
  target_role TEXT NOT NULL CHECK (target_role IN ('admin','user')),
  created_by_profile_id UUID,
  expires_at TIMESTAMPTZ NOT NULL,
  accepted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_invites_expires_at ON public.invites(expires_at);
CREATE INDEX IF NOT EXISTS idx_invites_email ON public.invites(email);

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

CREATE TABLE IF NOT EXISTS public.news_agent_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  topics JSONB NOT NULL DEFAULT '[]'::jsonb,
  sources JSONB NOT NULL DEFAULT '[]'::jsonb,
  summary_style TEXT NOT NULL DEFAULT 'bullet' CHECK (summary_style IN ('bullet','brief','detailed')),
  max_items INT NOT NULL DEFAULT 10,
  is_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.delivery_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  news_agent_config_id UUID NOT NULL,
  cron TEXT NOT NULL,
  timezone TEXT NOT NULL DEFAULT 'Asia/Bangkok',
  is_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_delivery_schedules_config_id ON public.delivery_schedules(news_agent_config_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_delivery_schedules_config_id ON public.delivery_schedules(news_agent_config_id);

CREATE TABLE IF NOT EXISTS public.delivery_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID NOT NULL,
  channel TEXT NOT NULL DEFAULT 'line',
  status TEXT NOT NULL CHECK (status IN ('sent','failed')),
  error_message TEXT,
  payload JSONB,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_delivery_logs_profile_id ON public.delivery_logs(profile_id);
CREATE INDEX IF NOT EXISTS idx_delivery_logs_sent_at ON public.delivery_logs(sent_at DESC);

CREATE TABLE IF NOT EXISTS public.finance_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID NOT NULL,
  entry_type TEXT NOT NULL CHECK (entry_type IN ('income','expense')),
  amount NUMERIC(12,2) NOT NULL,
  currency TEXT NOT NULL DEFAULT 'THB',
  note TEXT,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_finance_entries_profile_id ON public.finance_entries(profile_id);
CREATE INDEX IF NOT EXISTS idx_finance_entries_occurred_at ON public.finance_entries(occurred_at DESC);

CREATE TABLE IF NOT EXISTS public.calendar_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID NOT NULL,
  starts_at TIMESTAMPTZ NOT NULL,
  title TEXT NOT NULL,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_calendar_events_profile_id ON public.calendar_events(profile_id);
CREATE INDEX IF NOT EXISTS idx_calendar_events_starts_at ON public.calendar_events(starts_at);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.line_link_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.news_agent_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.delivery_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.delivery_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.finance_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.calendar_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "profiles_select_own" ON public.profiles;
CREATE POLICY "profiles_select_own" ON public.profiles
FOR SELECT
TO authenticated
USING (id = auth.uid() OR public.is_admin());

DROP POLICY IF EXISTS "profiles_update_own" ON public.profiles;
CREATE POLICY "profiles_update_own" ON public.profiles
FOR UPDATE
TO authenticated
USING (id = auth.uid() OR public.is_admin())
WITH CHECK (id = auth.uid() OR public.is_admin());

DROP POLICY IF EXISTS "user_permissions_admin_all" ON public.user_permissions;
CREATE POLICY "user_permissions_admin_all" ON public.user_permissions
FOR ALL
TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "user_permissions_self_read" ON public.user_permissions;
CREATE POLICY "user_permissions_self_read" ON public.user_permissions
FOR SELECT
TO authenticated
USING (user_id = auth.uid() OR public.is_admin());

DROP POLICY IF EXISTS "invites_admin_all" ON public.invites;
CREATE POLICY "invites_admin_all" ON public.invites
FOR ALL
TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "line_link_tokens_self" ON public.line_link_tokens;
CREATE POLICY "line_link_tokens_self" ON public.line_link_tokens
FOR ALL
TO authenticated
USING (profile_id = auth.uid() OR public.is_admin())
WITH CHECK (profile_id = auth.uid() OR public.is_admin());

DROP POLICY IF EXISTS "news_agent_configs_admin_all" ON public.news_agent_configs;
CREATE POLICY "news_agent_configs_admin_all" ON public.news_agent_configs
FOR ALL
TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "delivery_schedules_admin_all" ON public.delivery_schedules;
CREATE POLICY "delivery_schedules_admin_all" ON public.delivery_schedules
FOR ALL
TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "delivery_logs_admin_all" ON public.delivery_logs;
CREATE POLICY "delivery_logs_admin_all" ON public.delivery_logs
FOR ALL
TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "finance_entries_owner_all" ON public.finance_entries;
CREATE POLICY "finance_entries_owner_all" ON public.finance_entries
FOR ALL
TO authenticated
USING (profile_id = auth.uid() OR public.is_admin())
WITH CHECK (profile_id = auth.uid() OR public.is_admin());

DROP POLICY IF EXISTS "calendar_events_owner_all" ON public.calendar_events;
CREATE POLICY "calendar_events_owner_all" ON public.calendar_events
FOR ALL
TO authenticated
USING (profile_id = auth.uid() OR public.is_admin())
WITH CHECK (profile_id = auth.uid() OR public.is_admin());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_permissions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.invites TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.line_link_tokens TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.news_agent_configs TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.delivery_schedules TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.delivery_logs TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.finance_entries TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.calendar_events TO authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
