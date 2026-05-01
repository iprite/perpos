BEGIN;

UPDATE public.petty_cash_transactions
SET
  title = CASE
    WHEN title IS NULL OR btrim(title) = '' THEN note
    WHEN note IS NULL OR btrim(note) = '' THEN title
    WHEN btrim(title) = btrim(note) THEN title
    ELSE (title || ' • ' || note)
  END,
  note = NULL
WHERE note IS NOT NULL;

NOTIFY pgrst, 'reload config';

COMMIT;
