-- Migration: 20260607090000_acc_firm_ocr_hardening.sql
-- Hardening for acc_firm OCR pipeline:
--   1. Denormalize triggered_by_email onto ocr_processing_jobs (for Cloud Run worker audit
--      attribution; module-auth does not expose email).
--   2. Tighten ocr_processing_jobs write RLS to non-viewer acc_firm module members
--      (was: any active organization member), matching requireModuleMember in the API.

-- 1. Add triggered_by_email
ALTER TABLE public.ocr_processing_jobs
  ADD COLUMN IF NOT EXISTS triggered_by_email text;

-- 2. Replace write policy: require acc_firm module membership, non-viewer role.
DROP POLICY IF EXISTS ocr_jobs_write ON public.ocr_processing_jobs;
CREATE POLICY ocr_jobs_write ON public.ocr_processing_jobs
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.module_members mm
      WHERE mm.org_id = ocr_processing_jobs.firm_org_id
        AND mm.module_key = 'acc_firm'
        AND mm.user_id = auth.uid()
        AND mm.is_active = true
        AND mm.module_role <> 'viewer'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.module_members mm
      WHERE mm.org_id = ocr_processing_jobs.firm_org_id
        AND mm.module_key = 'acc_firm'
        AND mm.user_id = auth.uid()
        AND mm.is_active = true
        AND mm.module_role <> 'viewer'
    )
  );
