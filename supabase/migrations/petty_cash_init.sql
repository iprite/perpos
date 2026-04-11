BEGIN;

CREATE TABLE IF NOT EXISTS public.petty_cash_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (name)
);

DROP TRIGGER IF EXISTS trg_petty_cash_categories_set_updated_at ON public.petty_cash_categories;
CREATE TRIGGER trg_petty_cash_categories_set_updated_at
BEFORE UPDATE ON public.petty_cash_categories
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX IF NOT EXISTS idx_petty_cash_categories_active ON public.petty_cash_categories(is_active, sort_order);

CREATE TABLE IF NOT EXISTS public.petty_cash_settings (
  id INT PRIMARY KEY,
  low_balance_threshold NUMERIC(12,2) NOT NULL DEFAULT 0,
  in_app_alert_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DROP TRIGGER IF EXISTS trg_petty_cash_settings_set_updated_at ON public.petty_cash_settings;
CREATE TRIGGER trg_petty_cash_settings_set_updated_at
BEFORE UPDATE ON public.petty_cash_settings
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.petty_cash_settings (id, low_balance_threshold, in_app_alert_enabled)
VALUES (1, 0, TRUE)
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.petty_cash_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  txn_type TEXT NOT NULL CHECK (txn_type IN ('TOP_UP','SPEND')),
  amount NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  occurred_at DATE NOT NULL,
  category_name TEXT NULL,
  note TEXT NULL,
  receipt_object_path TEXT NULL,
  receipt_file_name TEXT NULL,
  created_by_profile_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DROP TRIGGER IF EXISTS trg_petty_cash_transactions_set_updated_at ON public.petty_cash_transactions;
CREATE TRIGGER trg_petty_cash_transactions_set_updated_at
BEFORE UPDATE ON public.petty_cash_transactions
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX IF NOT EXISTS idx_petty_cash_transactions_occurred_at ON public.petty_cash_transactions(occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_petty_cash_transactions_type ON public.petty_cash_transactions(txn_type);
CREATE INDEX IF NOT EXISTS idx_petty_cash_transactions_category_name ON public.petty_cash_transactions(category_name);

ALTER TABLE public.petty_cash_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.petty_cash_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.petty_cash_transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "petty_cash_categories_internal_select" ON public.petty_cash_categories;
CREATE POLICY "petty_cash_categories_internal_select" ON public.petty_cash_categories
FOR SELECT
TO authenticated
USING (public.current_role() IN ('admin','sale','operation'));

DROP POLICY IF EXISTS "petty_cash_categories_internal_write" ON public.petty_cash_categories;
CREATE POLICY "petty_cash_categories_internal_write" ON public.petty_cash_categories
FOR ALL
TO authenticated
USING (public.current_role() IN ('admin','operation'))
WITH CHECK (public.current_role() IN ('admin','operation'));

DROP POLICY IF EXISTS "petty_cash_settings_internal_select" ON public.petty_cash_settings;
CREATE POLICY "petty_cash_settings_internal_select" ON public.petty_cash_settings
FOR SELECT
TO authenticated
USING (public.current_role() IN ('admin','sale','operation'));

DROP POLICY IF EXISTS "petty_cash_settings_internal_write" ON public.petty_cash_settings;
CREATE POLICY "petty_cash_settings_internal_write" ON public.petty_cash_settings
FOR ALL
TO authenticated
USING (public.current_role() IN ('admin','operation'))
WITH CHECK (public.current_role() IN ('admin','operation'));

DROP POLICY IF EXISTS "petty_cash_transactions_internal_select" ON public.petty_cash_transactions;
CREATE POLICY "petty_cash_transactions_internal_select" ON public.petty_cash_transactions
FOR SELECT
TO authenticated
USING (public.current_role() IN ('admin','sale','operation'));

DROP POLICY IF EXISTS "petty_cash_transactions_internal_write" ON public.petty_cash_transactions;
CREATE POLICY "petty_cash_transactions_internal_write" ON public.petty_cash_transactions
FOR ALL
TO authenticated
USING (public.current_role() IN ('admin','operation'))
WITH CHECK (public.current_role() IN ('admin','operation'));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.petty_cash_categories TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.petty_cash_settings TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.petty_cash_transactions TO authenticated;

INSERT INTO public.petty_cash_categories (name, sort_order)
VALUES
  ('ค่าเดินทาง', 10),
  ('อุปกรณ์สำนักงาน', 20),
  ('อาหาร/เครื่องดื่ม', 30)
ON CONFLICT (name) DO NOTHING;

INSERT INTO storage.buckets (id, name, public)
VALUES ('petty_cash_receipts', 'petty_cash_receipts', false)
ON CONFLICT (id) DO UPDATE SET public = EXCLUDED.public;

DROP POLICY IF EXISTS "petty_cash_receipts_authenticated_insert" ON storage.objects;
CREATE POLICY "petty_cash_receipts_authenticated_insert" ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'petty_cash_receipts'
  AND public.current_role() IN ('admin','operation')
);

DROP POLICY IF EXISTS "petty_cash_receipts_authenticated_update" ON storage.objects;
CREATE POLICY "petty_cash_receipts_authenticated_update" ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'petty_cash_receipts'
  AND public.current_role() IN ('admin','operation')
)
WITH CHECK (
  bucket_id = 'petty_cash_receipts'
  AND public.current_role() IN ('admin','operation')
);

DROP POLICY IF EXISTS "petty_cash_receipts_authenticated_delete" ON storage.objects;
CREATE POLICY "petty_cash_receipts_authenticated_delete" ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'petty_cash_receipts'
  AND public.current_role() IN ('admin','operation')
);

NOTIFY pgrst, 'reload config';

COMMIT;

