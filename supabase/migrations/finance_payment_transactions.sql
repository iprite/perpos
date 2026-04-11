BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE TABLE IF NOT EXISTS public.payment_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NULL,
  poa_request_id UUID NULL,
  txn_type TEXT NOT NULL CHECK (txn_type IN ('INCOME','EXPENSE')),
  source_type TEXT NOT NULL CHECK (source_type IN ('CUSTOMER','AGENT_POA','OPS')),
  amount NUMERIC(12,2) NOT NULL CHECK (amount >= 0),
  currency TEXT NOT NULL DEFAULT 'THB',
  txn_date DATE NOT NULL,
  reference_no TEXT NULL,
  note TEXT NULL,
  created_by_profile_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DROP TRIGGER IF EXISTS trg_payment_transactions_set_updated_at ON public.payment_transactions;
CREATE TRIGGER trg_payment_transactions_set_updated_at
BEFORE UPDATE ON public.payment_transactions
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX IF NOT EXISTS idx_payment_transactions_order_id ON public.payment_transactions(order_id);
CREATE INDEX IF NOT EXISTS idx_payment_transactions_poa_request_id ON public.payment_transactions(poa_request_id);
CREATE INDEX IF NOT EXISTS idx_payment_transactions_txn_date ON public.payment_transactions(txn_date);
CREATE INDEX IF NOT EXISTS idx_payment_transactions_type_source ON public.payment_transactions(txn_type, source_type);

ALTER TABLE public.payment_transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "payment_transactions_internal_select" ON public.payment_transactions;
CREATE POLICY "payment_transactions_internal_select" ON public.payment_transactions
FOR SELECT
TO authenticated
USING (public.current_role() IN ('admin','sale','operation'));

DROP POLICY IF EXISTS "payment_transactions_internal_write" ON public.payment_transactions;
CREATE POLICY "payment_transactions_internal_write" ON public.payment_transactions
FOR ALL
TO authenticated
USING (public.current_role() IN ('admin','sale','operation'))
WITH CHECK (public.current_role() IN ('admin','sale','operation'));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.payment_transactions TO authenticated;

NOTIFY pgrst, 'reload config';

COMMIT;

