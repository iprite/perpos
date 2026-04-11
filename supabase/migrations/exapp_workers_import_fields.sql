BEGIN;

ALTER TABLE public.workers
  ADD COLUMN IF NOT EXISTS alien_identification_number TEXT,
  ADD COLUMN IF NOT EXISTS birth_date DATE,
  ADD COLUMN IF NOT EXISTS father_name_en TEXT,
  ADD COLUMN IF NOT EXISTS os_passport_type TEXT,
  ADD COLUMN IF NOT EXISTS os_sex TEXT,
  ADD COLUMN IF NOT EXISTS os_worker_type TEXT,
  ADD COLUMN IF NOT EXISTS os_wp_type TEXT,
  ADD COLUMN IF NOT EXISTS passport_expire_date DATE,
  ADD COLUMN IF NOT EXISTS passport_issue_at TEXT,
  ADD COLUMN IF NOT EXISTS passport_issue_country TEXT,
  ADD COLUMN IF NOT EXISTS passport_issue_date DATE,
  ADD COLUMN IF NOT EXISTS passport_type TEXT,
  ADD COLUMN IF NOT EXISTS profile_pic_url TEXT,
  ADD COLUMN IF NOT EXISTS visa_exp_date DATE,
  ADD COLUMN IF NOT EXISTS visa_iss_date DATE,
  ADD COLUMN IF NOT EXISTS visa_issued_at TEXT,
  ADD COLUMN IF NOT EXISTS visa_number TEXT,
  ADD COLUMN IF NOT EXISTS visa_type TEXT,
  ADD COLUMN IF NOT EXISTS wp_expire_date DATE,
  ADD COLUMN IF NOT EXISTS wp_issue_date DATE,
  ADD COLUMN IF NOT EXISTS wp_number TEXT,
  ADD COLUMN IF NOT EXISTS wp_type TEXT;

CREATE INDEX IF NOT EXISTS idx_workers_passport_no ON public.workers(passport_no);

NOTIFY pgrst, 'reload config';

COMMIT;

