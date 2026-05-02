BEGIN;

ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS business_type TEXT;

CREATE OR REPLACE FUNCTION public.poa_requests_auto_create_customer_for_representative()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  rep_profile_id uuid;
  rep_code text;

  employer_name text;
  employer_tax_id text;
  employer_tel text;
  employer_address text;
  employer_business_type text;

  resolved_customer_id uuid;
BEGIN
  employer_name := nullif(btrim(NEW.employer_name), '');
  IF employer_name IS NULL THEN
    RETURN NEW;
  END IF;

  rep_profile_id := NEW.representative_profile_id;
  rep_code := nullif(btrim(NEW.representative_rep_code), '');

  IF rep_profile_id IS NULL AND rep_code IS NOT NULL THEN
    SELECT cr.profile_id
    INTO rep_profile_id
    FROM public.company_representatives cr
    WHERE cr.rep_code = rep_code
      AND cr.profile_id IS NOT NULL
    LIMIT 1;
  END IF;

  IF rep_profile_id IS NULL THEN
    rep_code := coalesce(rep_code, nullif(btrim(NEW.representative_import_temp_id), ''));
    IF rep_code IS NOT NULL THEN
      SELECT cr.profile_id
      INTO rep_profile_id
      FROM public.company_representatives cr
      WHERE cr.rep_code = rep_code
        AND cr.profile_id IS NOT NULL
      LIMIT 1;
    END IF;
  END IF;

  IF rep_profile_id IS NULL THEN
    RETURN NEW;
  END IF;

  NEW.representative_profile_id := rep_profile_id;
  NEW.representative_rep_code := coalesce(nullif(btrim(NEW.representative_rep_code), ''), rep_code);

  IF NEW.customer_id IS NOT NULL THEN
    resolved_customer_id := NEW.customer_id;
  END IF;

  employer_tax_id := nullif(btrim(NEW.employer_tax_id), '');
  employer_tel := nullif(btrim(NEW.employer_tel), '');
  employer_address := nullif(btrim(NEW.employer_address), '');
  employer_business_type := nullif(btrim(NEW.employer_type), '');

  IF resolved_customer_id IS NULL AND employer_tax_id IS NOT NULL THEN
    SELECT c.id
    INTO resolved_customer_id
    FROM public.customers c
    WHERE nullif(btrim(c.tax_id), '') = employer_tax_id
    ORDER BY c.created_at ASC, c.id ASC
    LIMIT 1;
  END IF;

  IF resolved_customer_id IS NULL THEN
    SELECT c.id
    INTO resolved_customer_id
    FROM public.customers c
    WHERE lower(btrim(c.name)) = lower(employer_name)
      AND (
        employer_tel IS NULL
        OR nullif(btrim(c.phone), '') = employer_tel
      )
    ORDER BY c.created_at ASC, c.id ASC
    LIMIT 1;
  END IF;

  IF resolved_customer_id IS NULL THEN
    INSERT INTO public.customers (name, phone, tax_id, address, business_type, created_by_profile_id)
    VALUES (employer_name, employer_tel, employer_tax_id, employer_address, employer_business_type, rep_profile_id)
    RETURNING id INTO resolved_customer_id;
  ELSE
    UPDATE public.customers c
    SET
      phone = COALESCE(nullif(btrim(c.phone), ''), employer_tel),
      tax_id = COALESCE(nullif(btrim(c.tax_id), ''), employer_tax_id),
      address = COALESCE(nullif(btrim(c.address), ''), employer_address),
      business_type = COALESCE(nullif(btrim(c.business_type), ''), employer_business_type)
    WHERE c.id = resolved_customer_id;
  END IF;

  NEW.customer_id := resolved_customer_id;

  INSERT INTO public.customer_representatives (customer_id, profile_id, status)
  VALUES (resolved_customer_id, rep_profile_id, 'active')
  ON CONFLICT (customer_id, profile_id) DO UPDATE SET status = 'active';

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_poa_requests_auto_create_customer_for_representative ON public.poa_requests;
CREATE TRIGGER trg_poa_requests_auto_create_customer_for_representative
BEFORE INSERT ON public.poa_requests
FOR EACH ROW
EXECUTE FUNCTION public.poa_requests_auto_create_customer_for_representative();

NOTIFY pgrst, 'reload config';

COMMIT;

