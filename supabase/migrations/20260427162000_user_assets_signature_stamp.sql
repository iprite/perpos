BEGIN;

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE TABLE IF NOT EXISTS public.user_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  asset_type TEXT NOT NULL CHECK (asset_type IN ('signature','stamp')),
  storage_provider TEXT NOT NULL DEFAULT 'supabase',
  storage_bucket TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  file_name TEXT,
  mime_type TEXT,
  size_bytes BIGINT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_user_assets_profile_type ON public.user_assets(profile_id, asset_type);
CREATE INDEX IF NOT EXISTS idx_user_assets_profile_id ON public.user_assets(profile_id);

DROP TRIGGER IF EXISTS trg_user_assets_set_updated_at ON public.user_assets;
CREATE TRIGGER trg_user_assets_set_updated_at
BEFORE UPDATE ON public.user_assets
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.user_assets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "user_assets_self_manage" ON public.user_assets;
CREATE POLICY "user_assets_self_manage" ON public.user_assets
FOR ALL
TO authenticated
USING (
  profile_id = auth.uid()
  AND public.current_role() IN ('admin','sale','operation')
)
WITH CHECK (
  profile_id = auth.uid()
  AND public.current_role() IN ('admin','sale','operation')
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_assets TO authenticated;

NOTIFY pgrst, 'reload config';

COMMIT;
