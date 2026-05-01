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
  allow_rep_link BOOLEAN;
BEGIN
  IF TG_OP <> 'UPDATE' THEN
    RETURN NEW;
  END IF;

  allow_rep_link := current_user IN ('postgres', 'service_role', 'supabase_admin');

  IF OLD.status IN ('paid', 'completed', 'issued') THEN
    old_filtered := to_jsonb(OLD) - ARRAY['employer_address', 'employer_tel', 'employer_type', 'status']::text[];
    new_filtered := to_jsonb(NEW) - ARRAY['employer_address', 'employer_tel', 'employer_type', 'status']::text[];

    IF allow_rep_link THEN
      old_filtered := old_filtered - ARRAY['representative_profile_id', 'representative_rep_code']::text[];
      new_filtered := new_filtered - ARRAY['representative_profile_id', 'representative_rep_code']::text[];
    END IF;

    IF new_filtered IS DISTINCT FROM old_filtered THEN
      RAISE EXCEPTION 'คำขอชำระเงินแล้ว ไม่สามารถแก้ไขข้อมูลได้ (ยกเว้น ที่อยู่/โทร/ประเภทกิจการ)';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

NOTIFY pgrst, 'reload config';

COMMIT;

