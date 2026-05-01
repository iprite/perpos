BEGIN;

CREATE TABLE IF NOT EXISTS public.petty_cash_line_pending (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  line_user_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('CATEGORY_CONFIRM')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','used','cancelled','expired')),
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '15 minutes'),
  used_at TIMESTAMPTZ NULL
);

CREATE INDEX IF NOT EXISTS idx_petty_cash_line_pending_active
  ON public.petty_cash_line_pending(line_user_id, status, expires_at DESC);

ALTER TABLE public.petty_cash_line_pending ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "petty_cash_line_pending_internal_all" ON public.petty_cash_line_pending;
CREATE POLICY "petty_cash_line_pending_internal_all" ON public.petty_cash_line_pending
FOR ALL
TO authenticated
USING (public.current_role() IN ('admin','operation'))
WITH CHECK (public.current_role() IN ('admin','operation'));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.petty_cash_line_pending TO authenticated;

ALTER TABLE public.petty_cash_transactions
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'app',
  ADD COLUMN IF NOT EXISTS line_user_id TEXT NULL,
  ADD COLUMN IF NOT EXISTS raw_text TEXT NULL;

CREATE INDEX IF NOT EXISTS idx_petty_cash_transactions_line_user_id ON public.petty_cash_transactions(line_user_id);

INSERT INTO public.petty_cash_categories (name, sort_order)
VALUES
  ('ค่าธรรมเนียม', 35),
  ('ค่าส่งเอกสาร', 40),
  ('ซ่อมบำรุง', 50),
  ('อื่นๆ', 999)
ON CONFLICT (name) DO NOTHING;

NOTIFY pgrst, 'reload config';

COMMIT;
