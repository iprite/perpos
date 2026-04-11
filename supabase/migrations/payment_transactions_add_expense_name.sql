BEGIN;

ALTER TABLE public.payment_transactions
ADD COLUMN IF NOT EXISTS expense_name TEXT NULL;

CREATE INDEX IF NOT EXISTS idx_payment_transactions_expense_name ON public.payment_transactions(expense_name);

NOTIFY pgrst, 'reload config';

COMMIT;
