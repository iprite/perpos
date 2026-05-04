BEGIN;

CREATE TABLE IF NOT EXISTS public.google_drive_tokens (
  profile_id UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  refresh_token TEXT NOT NULL,
  access_token TEXT,
  expires_at TIMESTAMPTZ,
  scope TEXT,
  token_type TEXT,
  drive_root_folder_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_google_drive_tokens_expires_at
  ON public.google_drive_tokens(expires_at);

ALTER TABLE public.google_drive_tokens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "google_drive_tokens_none" ON public.google_drive_tokens;
CREATE POLICY "google_drive_tokens_none" ON public.google_drive_tokens
FOR ALL
TO authenticated
USING (false)
WITH CHECK (false);

REVOKE ALL ON public.google_drive_tokens FROM anon;
REVOKE ALL ON public.google_drive_tokens FROM authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.google_drive_tokens TO service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;

