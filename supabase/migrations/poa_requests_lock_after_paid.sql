BEGIN;

CREATE OR REPLACE FUNCTION public.enforce_poa_requests_paid_lock()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  old_filtered JSONB;
  new_filtered JSONB;
BEGIN
  IF TG_OP <> 'UPDATE' THEN
    RETURN NEW;
  END IF;

  IF OLD.status IN ('paid', 'completed', 'issued') THEN
    old_filtered := to_jsonb(OLD) - ARRAY['employer_address', 'employer_tel', 'employer_type', 'status'];
    new_filtered := to_jsonb(NEW) - ARRAY['employer_address', 'employer_tel', 'employer_type', 'status'];

    IF new_filtered IS DISTINCT FROM old_filtered THEN
      RAISE EXCEPTION 'คำขอชำระเงินแล้ว ไม่สามารถแก้ไขข้อมูลได้ (ยกเว้น ที่อยู่/โทร/ประเภทกิจการ)';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_poa_requests_paid_lock ON public.poa_requests;
CREATE TRIGGER trg_enforce_poa_requests_paid_lock
BEFORE UPDATE ON public.poa_requests
FOR EACH ROW
EXECUTE FUNCTION public.enforce_poa_requests_paid_lock();

NOTIFY pgrst, 'reload config';

COMMIT;
