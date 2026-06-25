-- ─── HRM Core (module: hrm) ──────────────────────────────────────────────────
-- โมดูลบริหารทรัพยากรบุคคล (HR ครบวงจร) สำหรับธุรกิจจิ๋ว ≤10 คน
-- Migration #1 of 2: สร้าง 10 ตาราง hrm_* fresh (payroll_* prod EMPTY → ไม่ migrate ข้อมูล)
-- Contract: specs/hrm.md §4 (Data Contract — ชื่อ field/enum canonical)
-- Created at: 2026-06-25
--
-- กฎ (CONTEXT §7):
--   • ทุกตาราง: org_id NOT NULL REFERENCES organizations(id) ON DELETE CASCADE
--   • id uuid PK DEFAULT gen_random_uuid() · created_at timestamptz NOT NULL DEFAULT now()
--   • enum = text + CHECK (ไม่ใช้ CREATE TYPE — ตาม pattern tmc/jaquar)
--   • ENABLE RLS ทุกตาราง · SELECT = is_org_member · write = is_org_admin (org isolation;
--     write จริงคุมที่ API layer ด้วย canModuleWrite)
--   • ไม่มี RPC / audit trigger รอบนี้
--   • ห้ามแตะ/drop payroll_* หรือ hrm_records (migration #2 จัดการตอน B5)

-- ═══════════════════════════════════════════════════════════════════════════
-- 4.1 hrm_employees — พนักงาน (core แฟ้ม 360°)
-- ═══════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.hrm_employees (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id              uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  employee_code       text NOT NULL,
  first_name          text NOT NULL,
  last_name           text NOT NULL,
  department_tag      text,
  position            text,
  employment_type     text NOT NULL DEFAULT 'monthly'
                        CHECK (employment_type IN ('monthly','daily','contract')),
  base_salary         numeric(14,2) NOT NULL DEFAULT 0,
  tax_id              text,
  ssn                 text,
  bank_name           text,
  bank_account        text,
  phone               text,
  birth_date          date,
  start_date          date,
  probation_end_date  date,
  contract_end_date   date,
  end_date            date,
  status              text NOT NULL DEFAULT 'active'
                        CHECK (status IN ('active','inactive','terminated')),
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS hrm_employees_org_id_idx       ON public.hrm_employees(org_id);
CREATE INDEX IF NOT EXISTS hrm_employees_org_code_idx     ON public.hrm_employees(org_id, employee_code);

ALTER TABLE public.hrm_employees ENABLE ROW LEVEL SECURITY;
CREATE POLICY "hrm_employees_select" ON public.hrm_employees
  FOR SELECT USING (is_org_member(org_id, auth.uid()));
CREATE POLICY "hrm_employees_write" ON public.hrm_employees
  FOR ALL USING (is_org_admin(org_id, auth.uid()));

-- ═══════════════════════════════════════════════════════════════════════════
-- 4.2 hrm_pay_items — เงินเพิ่ม/เงินหัก
-- ═══════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.hrm_pay_items (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  code          text NOT NULL,
  name          text NOT NULL,
  item_type     text NOT NULL CHECK (item_type IN ('earning','deduction')),
  is_recurring  boolean NOT NULL DEFAULT false,
  account_label text,
  ytd_type      text NOT NULL DEFAULT 'none'
                  CHECK (ytd_type IN ('none','income40_1')),
  is_system     boolean NOT NULL DEFAULT false,
  active        boolean NOT NULL DEFAULT true,
  sort_order    integer NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS hrm_pay_items_org_id_idx ON public.hrm_pay_items(org_id);

ALTER TABLE public.hrm_pay_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "hrm_pay_items_select" ON public.hrm_pay_items
  FOR SELECT USING (is_org_member(org_id, auth.uid()));
CREATE POLICY "hrm_pay_items_write" ON public.hrm_pay_items
  FOR ALL USING (is_org_admin(org_id, auth.uid()));

-- ═══════════════════════════════════════════════════════════════════════════
-- 4.3 hrm_funds — กองทุน & ประกันสังคม
-- ═══════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.hrm_funds (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id         uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  fund_type      text NOT NULL CHECK (fund_type IN ('sso','pvd','gf','other')),
  name           text NOT NULL,
  employee_rate  numeric(7,4) NOT NULL DEFAULT 0,
  employer_rate  numeric(7,4) NOT NULL DEFAULT 0,
  ceiling_wage   numeric(14,2),
  active         boolean NOT NULL DEFAULT true,
  notes          text,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS hrm_funds_org_id_idx ON public.hrm_funds(org_id);

ALTER TABLE public.hrm_funds ENABLE ROW LEVEL SECURITY;
CREATE POLICY "hrm_funds_select" ON public.hrm_funds
  FOR SELECT USING (is_org_member(org_id, auth.uid()));
CREATE POLICY "hrm_funds_write" ON public.hrm_funds
  FOR ALL USING (is_org_admin(org_id, auth.uid()));

-- ═══════════════════════════════════════════════════════════════════════════
-- 4.4 hrm_account_settings — การบันทึกบัญชี
-- ═══════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.hrm_account_settings (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  setting_key   text NOT NULL,
  account_label text,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS hrm_account_settings_org_id_idx ON public.hrm_account_settings(org_id);

ALTER TABLE public.hrm_account_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "hrm_account_settings_select" ON public.hrm_account_settings
  FOR SELECT USING (is_org_member(org_id, auth.uid()));
CREATE POLICY "hrm_account_settings_write" ON public.hrm_account_settings
  FOR ALL USING (is_org_admin(org_id, auth.uid()));

-- ═══════════════════════════════════════════════════════════════════════════
-- 4.5 hrm_payroll_runs — รอบจ่ายเงินเดือน
-- ═══════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.hrm_payroll_runs (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id               uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  run_number           text NOT NULL,
  period_year          integer NOT NULL,
  period_month         integer NOT NULL,
  status               text NOT NULL DEFAULT 'draft'
                         CHECK (status IN ('draft','pending_approval','approved','paid','cancelled')),
  total_earnings       numeric(14,2) NOT NULL DEFAULT 0,
  total_deductions     numeric(14,2) NOT NULL DEFAULT 0,
  total_net            numeric(14,2) NOT NULL DEFAULT 0,
  total_employer_cost  numeric(14,2) NOT NULL DEFAULT 0,
  notes                text,
  created_at           timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS hrm_payroll_runs_org_id_idx        ON public.hrm_payroll_runs(org_id);
CREATE INDEX IF NOT EXISTS hrm_payroll_runs_org_period_idx    ON public.hrm_payroll_runs(org_id, period_year, period_month);

ALTER TABLE public.hrm_payroll_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "hrm_payroll_runs_select" ON public.hrm_payroll_runs
  FOR SELECT USING (is_org_member(org_id, auth.uid()));
CREATE POLICY "hrm_payroll_runs_write" ON public.hrm_payroll_runs
  FOR ALL USING (is_org_admin(org_id, auth.uid()));

-- ═══════════════════════════════════════════════════════════════════════════
-- 4.6 hrm_payslips — สลิปรายคนในแต่ละรอบ (denormalized)
-- ═══════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.hrm_payslips (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id            uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  run_id            uuid NOT NULL REFERENCES public.hrm_payroll_runs(id) ON DELETE CASCADE,
  employee_id       uuid NOT NULL REFERENCES public.hrm_employees(id) ON DELETE CASCADE,
  base_salary       numeric(14,2) NOT NULL DEFAULT 0,
  ot_hours          numeric(8,2)  NOT NULL DEFAULT 0,
  ot_amount         numeric(14,2) NOT NULL DEFAULT 0,
  absence_days      numeric(6,2)  NOT NULL DEFAULT 0,
  late_count        integer NOT NULL DEFAULT 0,
  earnings_json     jsonb NOT NULL DEFAULT '[]'::jsonb,
  deductions_json   jsonb NOT NULL DEFAULT '[]'::jsonb,
  sso_employee      numeric(14,2) NOT NULL DEFAULT 0,
  sso_employer      numeric(14,2) NOT NULL DEFAULT 0,
  pvd_employee      numeric(14,2) NOT NULL DEFAULT 0,
  pvd_employer      numeric(14,2) NOT NULL DEFAULT 0,
  wht_amount        numeric(14,2) NOT NULL DEFAULT 0,
  gross             numeric(14,2) NOT NULL DEFAULT 0,
  total_deductions  numeric(14,2) NOT NULL DEFAULT 0,
  net_pay           numeric(14,2) NOT NULL DEFAULT 0,
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS hrm_payslips_org_id_idx      ON public.hrm_payslips(org_id);
CREATE INDEX IF NOT EXISTS hrm_payslips_run_id_idx       ON public.hrm_payslips(run_id);
CREATE INDEX IF NOT EXISTS hrm_payslips_employee_id_idx  ON public.hrm_payslips(employee_id);

ALTER TABLE public.hrm_payslips ENABLE ROW LEVEL SECURITY;
CREATE POLICY "hrm_payslips_select" ON public.hrm_payslips
  FOR SELECT USING (is_org_member(org_id, auth.uid()));
CREATE POLICY "hrm_payslips_write" ON public.hrm_payslips
  FOR ALL USING (is_org_admin(org_id, auth.uid()));

-- ═══════════════════════════════════════════════════════════════════════════
-- 4.7 hrm_leave_types — ประเภทการลา + โควตา
-- ═══════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.hrm_leave_types (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id               uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  code                 text NOT NULL,
  name                 text NOT NULL,
  quota_days_per_year  numeric(6,2) NOT NULL DEFAULT 0,
  is_paid              boolean NOT NULL DEFAULT true,
  active               boolean NOT NULL DEFAULT true,
  created_at           timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS hrm_leave_types_org_id_idx ON public.hrm_leave_types(org_id);

ALTER TABLE public.hrm_leave_types ENABLE ROW LEVEL SECURITY;
CREATE POLICY "hrm_leave_types_select" ON public.hrm_leave_types
  FOR SELECT USING (is_org_member(org_id, auth.uid()));
CREATE POLICY "hrm_leave_types_write" ON public.hrm_leave_types
  FOR ALL USING (is_org_admin(org_id, auth.uid()));

-- ═══════════════════════════════════════════════════════════════════════════
-- 4.8 hrm_leave_requests — ใบลา
-- ═══════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.hrm_leave_requests (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id         uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  employee_id    uuid NOT NULL REFERENCES public.hrm_employees(id) ON DELETE CASCADE,
  leave_type_id  uuid NOT NULL REFERENCES public.hrm_leave_types(id) ON DELETE CASCADE,
  start_date     date NOT NULL,
  end_date       date NOT NULL,
  days           numeric(6,2) NOT NULL DEFAULT 0,
  reason         text,
  status         text NOT NULL DEFAULT 'pending'
                   CHECK (status IN ('pending','approved','rejected','cancelled')),
  approved_by    uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  decided_at     timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS hrm_leave_requests_org_id_idx        ON public.hrm_leave_requests(org_id);
CREATE INDEX IF NOT EXISTS hrm_leave_requests_employee_id_idx   ON public.hrm_leave_requests(employee_id);
CREATE INDEX IF NOT EXISTS hrm_leave_requests_leave_type_id_idx ON public.hrm_leave_requests(leave_type_id);

ALTER TABLE public.hrm_leave_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "hrm_leave_requests_select" ON public.hrm_leave_requests
  FOR SELECT USING (is_org_member(org_id, auth.uid()));
CREATE POLICY "hrm_leave_requests_write" ON public.hrm_leave_requests
  FOR ALL USING (is_org_admin(org_id, auth.uid()));

-- ═══════════════════════════════════════════════════════════════════════════
-- 4.9 hrm_attendance — เวลาทำงานรายวัน
-- ═══════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.hrm_attendance (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id       uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  employee_id  uuid NOT NULL REFERENCES public.hrm_employees(id) ON DELETE CASCADE,
  work_date    date NOT NULL,
  status       text NOT NULL CHECK (status IN ('present','absent','leave','holiday')),
  check_in     time,
  check_out    time,
  is_late      boolean NOT NULL DEFAULT false,
  ot_hours     numeric(8,2) NOT NULL DEFAULT 0,
  note         text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, employee_id, work_date)
);

CREATE INDEX IF NOT EXISTS hrm_attendance_org_id_idx        ON public.hrm_attendance(org_id);
CREATE INDEX IF NOT EXISTS hrm_attendance_employee_id_idx   ON public.hrm_attendance(employee_id);
CREATE INDEX IF NOT EXISTS hrm_attendance_org_emp_date_idx  ON public.hrm_attendance(org_id, employee_id, work_date);

ALTER TABLE public.hrm_attendance ENABLE ROW LEVEL SECURITY;
CREATE POLICY "hrm_attendance_select" ON public.hrm_attendance
  FOR SELECT USING (is_org_member(org_id, auth.uid()));
CREATE POLICY "hrm_attendance_write" ON public.hrm_attendance
  FOR ALL USING (is_org_admin(org_id, auth.uid()));

-- ═══════════════════════════════════════════════════════════════════════════
-- 4.10 hrm_documents — เอกสาร HR
-- ═══════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.hrm_documents (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  employee_id   uuid NOT NULL REFERENCES public.hrm_employees(id) ON DELETE CASCADE,
  doc_type      text NOT NULL
                  CHECK (doc_type IN ('payslip','salary_cert','contract','other')),
  title         text NOT NULL,
  issued_date   date,
  ref_run_id    uuid REFERENCES public.hrm_payroll_runs(id) ON DELETE SET NULL,
  storage_path  text,
  status        text NOT NULL DEFAULT 'draft'
                  CHECK (status IN ('draft','issued')),
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS hrm_documents_org_id_idx       ON public.hrm_documents(org_id);
CREATE INDEX IF NOT EXISTS hrm_documents_employee_id_idx  ON public.hrm_documents(employee_id);
CREATE INDEX IF NOT EXISTS hrm_documents_ref_run_id_idx   ON public.hrm_documents(ref_run_id);

ALTER TABLE public.hrm_documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "hrm_documents_select" ON public.hrm_documents
  FOR SELECT USING (is_org_member(org_id, auth.uid()));
CREATE POLICY "hrm_documents_write" ON public.hrm_documents
  FOR ALL USING (is_org_admin(org_id, auth.uid()));
