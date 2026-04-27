BEGIN;

CREATE OR REPLACE FUNCTION public.guard_delete_sales_quotes_only_draft()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.status IS DISTINCT FROM 'draft' THEN
    RAISE EXCEPTION 'quote_not_draft'
      USING ERRCODE = 'P0001',
            DETAIL = 'Delete allowed only when status = draft';
  END IF;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_delete_sales_quotes_only_draft ON public.sales_quotes;
CREATE TRIGGER trg_guard_delete_sales_quotes_only_draft
BEFORE DELETE ON public.sales_quotes
FOR EACH ROW
EXECUTE FUNCTION public.guard_delete_sales_quotes_only_draft();

NOTIFY pgrst, 'reload config';

COMMIT;

