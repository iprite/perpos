BEGIN;

UPDATE public.petty_cash_transactions
SET
  title = COALESCE(title, note),
  note = NULL
WHERE title IS NULL
  AND note IS NOT NULL;

NOTIFY pgrst, 'reload config';

COMMIT;
