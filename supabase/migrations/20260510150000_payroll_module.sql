-- ============================================================
-- Payroll Module Migration
-- ============================================================

-- payroll_departments
CREATE TABLE IF NOT EXISTS public.payroll_departments (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  code            text,
  name            text NOT NULL,
  active          boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.payroll_departments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "org_member_all" ON public.payroll_departments;
CREATE POLICY "org_member_all" ON public.payroll_departments
  FOR ALL USING (
    organization_id IN (
      SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid()
    )
  );

-- payroll_employees
CREATE TABLE IF NOT EXISTS public.payroll_employees (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  employee_code   text NOT NULL,
  first_name      text NOT NULL,
  last_name       text NOT NULL,
  department_id   uuid REFERENCES public.payroll_departments(id) ON DELETE SET NULL,
  position        text,
  base_salary     numeric(18,2) NOT NULL DEFAULT 0,
  tax_id          text,
  bank_name       text,
  bank_account    text,
  start_date      date,
  end_date        date,
  status          text NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive','terminated')),
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, employee_code)
);

ALTER TABLE public.payroll_employees ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "org_member_all" ON public.payroll_employees;
CREATE POLICY "org_member_all" ON public.payroll_employees
  FOR ALL USING (
    organization_id IN (
      SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid()
    )
  );

-- payroll_pay_items
CREATE TABLE IF NOT EXISTS public.payroll_pay_items (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  code              text NOT NULL,
  name              text NOT NULL,
  item_type         text NOT NULL CHECK (item_type IN ('earning','deduction')),
  is_recurring      boolean NOT NULL DEFAULT true,
  account_label     text,
  linked_account_id uuid,
  ytd_type          text NOT NULL DEFAULT 'none' CHECK (ytd_type IN ('none','income40_1')),
  is_system         boolean NOT NULL DEFAULT false,
  active            boolean NOT NULL DEFAULT true,
  sort_order        int NOT NULL DEFAULT 0,
  created_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, code)
);

ALTER TABLE public.payroll_pay_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "org_member_all" ON public.payroll_pay_items;
CREATE POLICY "org_member_all" ON public.payroll_pay_items
  FOR ALL USING (
    organization_id IN (
      SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid()
    )
  );

-- payroll_funds
CREATE TABLE IF NOT EXISTS public.payroll_funds (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  fund_type       text NOT NULL CHECK (fund_type IN ('ssf','pvd','gf','other')),
  name            text NOT NULL,
  employee_rate   numeric(5,4) NOT NULL DEFAULT 0,
  employer_rate   numeric(5,4) NOT NULL DEFAULT 0,
  ceiling_wage    numeric(18,2),
  active          boolean NOT NULL DEFAULT true,
  notes           text,
  created_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.payroll_funds ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "org_member_all" ON public.payroll_funds;
CREATE POLICY "org_member_all" ON public.payroll_funds
  FOR ALL USING (
    organization_id IN (
      SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid()
    )
  );

-- payroll_account_settings
CREATE TABLE IF NOT EXISTS public.payroll_account_settings (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  setting_key       text NOT NULL,
  account_label     text,
  linked_account_id uuid,
  UNIQUE (organization_id, setting_key)
);

ALTER TABLE public.payroll_account_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "org_member_all" ON public.payroll_account_settings;
CREATE POLICY "org_member_all" ON public.payroll_account_settings
  FOR ALL USING (
    organization_id IN (
      SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid()
    )
  );

-- payroll_runs
CREATE TABLE IF NOT EXISTS public.payroll_runs (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  run_number        text NOT NULL,
  period_year       int NOT NULL,
  period_month      int NOT NULL,
  status            text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','pending_approval','approved','paid','cancelled')),
  total_earnings    numeric(18,2) NOT NULL DEFAULT 0,
  total_deductions  numeric(18,2) NOT NULL DEFAULT 0,
  total_net         numeric(18,2) NOT NULL DEFAULT 0,
  notes             text,
  journal_entry_id  uuid,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, period_year, period_month)
);

ALTER TABLE public.payroll_runs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "org_member_all" ON public.payroll_runs;
CREATE POLICY "org_member_all" ON public.payroll_runs
  FOR ALL USING (
    organization_id IN (
      SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid()
    )
  );

-- payroll_run_lines (one per employee per run)
CREATE TABLE IF NOT EXISTS public.payroll_run_lines (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id            uuid NOT NULL REFERENCES public.payroll_runs(id) ON DELETE CASCADE,
  employee_id       uuid NOT NULL REFERENCES public.payroll_employees(id),
  base_salary       numeric(18,2) NOT NULL DEFAULT 0,
  total_earnings    numeric(18,2) NOT NULL DEFAULT 0,
  total_deductions  numeric(18,2) NOT NULL DEFAULT 0,
  net_salary        numeric(18,2) NOT NULL DEFAULT 0
);

ALTER TABLE public.payroll_run_lines ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "org_member_all" ON public.payroll_run_lines;
CREATE POLICY "org_member_all" ON public.payroll_run_lines
  FOR ALL USING (
    run_id IN (
      SELECT id FROM public.payroll_runs
      WHERE organization_id IN (
        SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid()
      )
    )
  );

-- payroll_run_line_items (one per pay item per line) — no RLS, access via parent
CREATE TABLE IF NOT EXISTS public.payroll_run_line_items (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  line_id     uuid NOT NULL REFERENCES public.payroll_run_lines(id) ON DELETE CASCADE,
  pay_item_id uuid NOT NULL REFERENCES public.payroll_pay_items(id),
  amount      numeric(18,2) NOT NULL DEFAULT 0
);
