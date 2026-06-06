-- Migration: 20260606154000_acc_firm_ocr_tables.sql
-- Create acc_firm_client_configs and ocr_processing_jobs tables, alter journal_entries, and apply RLS.

-- 1. Create acc_firm_client_configs
CREATE TABLE IF NOT EXISTS public.acc_firm_client_configs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  client_org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  vat_registered boolean NOT NULL DEFAULT true,
  withholding_tax_required boolean NOT NULL DEFAULT true,
  accounting_method text NOT NULL DEFAULT 'accrual' CHECK (accounting_method IN ('accrual', 'cash')),
  custom_posting_rules jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (firm_org_id, client_org_id)
);

CREATE INDEX IF NOT EXISTS idx_acc_firm_client_configs_firm_client 
  ON public.acc_firm_client_configs (firm_org_id, client_org_id);

ALTER TABLE public.acc_firm_client_configs ENABLE ROW LEVEL SECURITY;

-- 2. Create RLS Policies for acc_firm_client_configs
DROP POLICY IF EXISTS client_configs_select ON public.acc_firm_client_configs;
CREATE POLICY client_configs_select ON public.acc_firm_client_configs
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.organization_members om
      WHERE om.organization_id = acc_firm_client_configs.firm_org_id
        AND om.user_id = auth.uid()
        AND om.is_active = true
    )
  );

DROP POLICY IF EXISTS client_configs_write ON public.acc_firm_client_configs;
CREATE POLICY client_configs_write ON public.acc_firm_client_configs
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.organization_members om
      WHERE om.organization_id = acc_firm_client_configs.firm_org_id
        AND om.user_id = auth.uid()
        AND om.is_active = true
        AND om.role IN ('owner', 'admin', 'team_lead')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.organization_members om
      WHERE om.organization_id = acc_firm_client_configs.firm_org_id
        AND om.user_id = auth.uid()
        AND om.is_active = true
        AND om.role IN ('owner', 'admin', 'team_lead')
    )
  );

DROP POLICY IF EXISTS client_configs_super_admin ON public.acc_firm_client_configs;
CREATE POLICY client_configs_super_admin ON public.acc_firm_client_configs
  FOR ALL
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'super_admin')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'super_admin')
  );

-- 3. Create ocr_processing_jobs
CREATE TABLE IF NOT EXISTS public.ocr_processing_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  client_org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  document_url text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  extracted_json jsonb DEFAULT NULL,
  classified_json jsonb DEFAULT NULL,
  draft_journal_id uuid REFERENCES public.journal_entries(id) ON DELETE SET NULL,
  error_message text,
  correlation_id uuid NOT NULL DEFAULT gen_random_uuid(),
  triggered_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ocr_jobs_status ON public.ocr_processing_jobs (firm_org_id, status);
CREATE INDEX IF NOT EXISTS idx_ocr_jobs_client ON public.ocr_processing_jobs (client_org_id);

ALTER TABLE public.ocr_processing_jobs ENABLE ROW LEVEL SECURITY;

-- 4. Create RLS Policies for ocr_processing_jobs
DROP POLICY IF EXISTS ocr_jobs_select ON public.ocr_processing_jobs;
CREATE POLICY ocr_jobs_select ON public.ocr_processing_jobs
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.organization_members om
      WHERE om.organization_id = ocr_processing_jobs.firm_org_id
        AND om.user_id = auth.uid()
        AND om.is_active = true
    )
  );

DROP POLICY IF EXISTS ocr_jobs_write ON public.ocr_processing_jobs;
CREATE POLICY ocr_jobs_write ON public.ocr_processing_jobs
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.organization_members om
      WHERE om.organization_id = ocr_processing_jobs.firm_org_id
        AND om.user_id = auth.uid()
        AND om.is_active = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.organization_members om
      WHERE om.organization_id = ocr_processing_jobs.firm_org_id
        AND om.user_id = auth.uid()
        AND om.is_active = true
    )
  );

DROP POLICY IF EXISTS ocr_jobs_super_admin ON public.ocr_processing_jobs;
CREATE POLICY ocr_jobs_super_admin ON public.ocr_processing_jobs
  FOR ALL
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'super_admin')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'super_admin')
  );

-- 5. Alter journal_entries table
ALTER TABLE public.journal_entries 
  ADD COLUMN IF NOT EXISTS created_by_ai boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS ocr_job_id uuid REFERENCES public.ocr_processing_jobs(id) ON DELETE SET NULL;

-- 6. Add triggers for updated_at
DROP TRIGGER IF EXISTS trg_acc_firm_client_configs_updated_at ON public.acc_firm_client_configs;
CREATE TRIGGER trg_acc_firm_client_configs_updated_at
BEFORE UPDATE ON public.acc_firm_client_configs
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_ocr_processing_jobs_updated_at ON public.ocr_processing_jobs;
CREATE TRIGGER trg_ocr_processing_jobs_updated_at
BEFORE UPDATE ON public.ocr_processing_jobs
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

-- 7. Add audit triggers for new tables
DROP TRIGGER IF EXISTS trg_audit_acc_firm_client_configs ON public.acc_firm_client_configs;
CREATE TRIGGER trg_audit_acc_firm_client_configs
  AFTER INSERT OR UPDATE OR DELETE ON public.acc_firm_client_configs
  FOR EACH ROW EXECUTE FUNCTION public.fn_audit_log_changes();

DROP TRIGGER IF EXISTS trg_audit_ocr_processing_jobs ON public.ocr_processing_jobs;
CREATE TRIGGER trg_audit_ocr_processing_jobs
  AFTER INSERT OR UPDATE OR DELETE ON public.ocr_processing_jobs
  FOR EACH ROW EXECUTE FUNCTION public.fn_audit_log_changes();
