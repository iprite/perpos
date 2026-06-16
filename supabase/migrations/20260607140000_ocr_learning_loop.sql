-- Migration: 20260607140000_ocr_learning_loop.sql
-- Create ocr_vendor_mappings and ocr_feedback_logs tables, apply RLS and audit triggers.

-- 1. Create ocr_vendor_mappings
CREATE TABLE IF NOT EXISTS public.ocr_vendor_mappings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  vendor_tax_id text,
  vendor_name text NOT NULL,
  debit_account_id uuid NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  contact_id uuid REFERENCES public.contacts(id) ON DELETE SET NULL,
  use_count integer NOT NULL DEFAULT 1,
  last_used_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_ocr_vendor_mappings_name UNIQUE (org_id, vendor_name),
  CONSTRAINT uq_ocr_vendor_mappings_tax_id UNIQUE (org_id, vendor_tax_id)
);

CREATE INDEX IF NOT EXISTS idx_ocr_vendor_mappings_org ON public.ocr_vendor_mappings (org_id);
CREATE INDEX IF NOT EXISTS idx_ocr_vendor_mappings_lookup ON public.ocr_vendor_mappings (org_id, vendor_tax_id, vendor_name);

ALTER TABLE public.ocr_vendor_mappings ENABLE ROW LEVEL SECURITY;

-- 2. Create ocr_feedback_logs
CREATE TABLE IF NOT EXISTS public.ocr_feedback_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.ocr_processing_jobs(id) ON DELETE CASCADE,
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  original_classified jsonb NOT NULL,
  approved_classified jsonb NOT NULL,
  original_journal jsonb NOT NULL,
  approved_journal jsonb NOT NULL,
  is_edited boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ocr_feedback_logs_org ON public.ocr_feedback_logs (org_id);
CREATE INDEX IF NOT EXISTS idx_ocr_feedback_logs_job ON public.ocr_feedback_logs (job_id);

ALTER TABLE public.ocr_feedback_logs ENABLE ROW LEVEL SECURITY;

-- 3. RLS Policies for ocr_vendor_mappings
DROP POLICY IF EXISTS ocr_vendor_mappings_select ON public.ocr_vendor_mappings;
CREATE POLICY ocr_vendor_mappings_select ON public.ocr_vendor_mappings
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.organization_members om
      WHERE om.organization_id = ocr_vendor_mappings.org_id
        AND om.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS ocr_vendor_mappings_write ON public.ocr_vendor_mappings;
CREATE POLICY ocr_vendor_mappings_write ON public.ocr_vendor_mappings
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.module_members mm
      WHERE mm.org_id = ocr_vendor_mappings.org_id
        AND mm.module_key = 'acc_firm'
        AND mm.user_id = auth.uid()
        AND mm.is_active = true
        AND mm.module_role <> 'viewer'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.module_members mm
      WHERE mm.org_id = ocr_vendor_mappings.org_id
        AND mm.module_key = 'acc_firm'
        AND mm.user_id = auth.uid()
        AND mm.is_active = true
        AND mm.module_role <> 'viewer'
    )
  );

-- 4. RLS Policies for ocr_feedback_logs
DROP POLICY IF EXISTS ocr_feedback_logs_select ON public.ocr_feedback_logs;
CREATE POLICY ocr_feedback_logs_select ON public.ocr_feedback_logs
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.organization_members om
      WHERE om.organization_id = ocr_feedback_logs.org_id
        AND om.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS ocr_feedback_logs_write ON public.ocr_feedback_logs;
CREATE POLICY ocr_feedback_logs_write ON public.ocr_feedback_logs
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.module_members mm
      WHERE mm.org_id = ocr_feedback_logs.org_id
        AND mm.module_key = 'acc_firm'
        AND mm.user_id = auth.uid()
        AND mm.is_active = true
        AND mm.module_role <> 'viewer'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.module_members mm
      WHERE mm.org_id = ocr_feedback_logs.org_id
        AND mm.module_key = 'acc_firm'
        AND mm.user_id = auth.uid()
        AND mm.is_active = true
        AND mm.module_role <> 'viewer'
    )
  );

-- 5. Add triggers for updated_at
DROP TRIGGER IF EXISTS trg_ocr_vendor_mappings_updated_at ON public.ocr_vendor_mappings;
CREATE TRIGGER trg_ocr_vendor_mappings_updated_at
BEFORE UPDATE ON public.ocr_vendor_mappings
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

-- 6. Add audit triggers for new tables
DROP TRIGGER IF EXISTS trg_audit_ocr_vendor_mappings ON public.ocr_vendor_mappings;
CREATE TRIGGER trg_audit_ocr_vendor_mappings
  AFTER INSERT OR UPDATE OR DELETE ON public.ocr_vendor_mappings
  FOR EACH ROW EXECUTE FUNCTION public.fn_audit_log_changes();

DROP TRIGGER IF EXISTS trg_audit_ocr_feedback_logs ON public.ocr_feedback_logs;
CREATE TRIGGER trg_audit_ocr_feedback_logs
  AFTER INSERT OR UPDATE OR DELETE ON public.ocr_feedback_logs
  FOR EACH ROW EXECUTE FUNCTION public.fn_audit_log_changes();
