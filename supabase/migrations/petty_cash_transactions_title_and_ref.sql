BEGIN;

ALTER TABLE public.petty_cash_transactions
  ADD COLUMN IF NOT EXISTS title TEXT NULL,
  ADD COLUMN IF NOT EXISTS reference_url TEXT NULL;

CREATE INDEX IF NOT EXISTS idx_petty_cash_transactions_title ON public.petty_cash_transactions(title);

NOTIFY pgrst, 'reload config';

COMMIT;
