BEGIN;

UPDATE public.company_representatives
SET gender = CASE
  WHEN lower(coalesce(gender, '')) = 'male' THEN 'ชาย'
  WHEN lower(coalesce(gender, '')) = 'female' THEN 'หญิง'
  ELSE NULLIF(gender, '')
END,
status = CASE
  WHEN status = 'ปกติ' THEN 'ปกติ'
  WHEN status IS NULL OR status = '' THEN NULL
  ELSE 'ไม่ปกติ'
END,
updated_at = NOW();

NOTIFY pgrst, 'reload config';

COMMIT;

