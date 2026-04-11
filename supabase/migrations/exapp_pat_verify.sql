BEGIN;

DO $$
DECLARE
  c BIGINT;
BEGIN
  SELECT COUNT(*) INTO c FROM public.pat;
  RAISE NOTICE 'pat_count=%', c;
END;
$$;

COMMIT;

