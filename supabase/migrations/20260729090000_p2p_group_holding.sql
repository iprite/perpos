-- p2p_group — โมดูลบริษัทโฮลดิ้ง (P2P Group) Phase 1
-- contract: .claude/module-factory/specs/p2p_group.md (v1, freeze 2026-07-29)
--
-- ขอบเขต: ทะเบียนบริษัทในเครือ · ตัวเลขงบรายเดือน (hybrid manual/accounting) ·
--          เงินลงทุน/ปันผล · รายการระหว่างบริษัท + สัญญาเงินกู้ · treasury (ธนาคาร/ยอดคงเหลือ)
--
-- กฎ org_id: ทุกตารางเก็บ org ของ "โฮลดิ้ง" เสมอ (ไม่ใช่ org ของบริษัทลูก)
--            บริษัทลูกเป็นแถวใน p2pg_companies · ผูกกับ org จริงผ่าน org_ref_id (super_admin เท่านั้น)

-- ─────────────────────────────────────────────────────────────
-- 1. ทะเบียนบริษัทในเครือ
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS p2pg_companies (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name                  text NOT NULL,
  legal_name            text,
  tax_id                text,
  company_type          text NOT NULL DEFAULT 'subsidiary'
                          CHECK (company_type IN ('holding','subsidiary','associate','joint_venture')),
  company_status        text NOT NULL DEFAULT 'active'
                          CHECK (company_status IN ('active','dormant','closed')),
  ownership_pct         numeric(5,2) CHECK (ownership_pct IS NULL OR (ownership_pct >= 0 AND ownership_pct <= 100)),
  registered_capital    numeric(16,2),
  paid_up_capital       numeric(16,2),
  registered_date       date,
  fiscal_year_end_month int CHECK (fiscal_year_end_month IS NULL OR fiscal_year_end_month BETWEEN 1 AND 12),
  business_type         text,
  address               text,
  directors             text[] NOT NULL DEFAULT '{}',
  -- ผูกกับ org จริงในระบบ → เปิดทาง auto-pull งบข้าม org (service-role)
  -- ตั้งได้เฉพาะ super_admin (บังคับที่ API layer) — กัน IDOR ข้ามองค์กร
  org_ref_id            uuid REFERENCES organizations(id) ON DELETE SET NULL,
  org_link_by           uuid REFERENCES profiles(id) ON DELETE SET NULL,
  org_link_at           timestamptz,
  sort_order            int NOT NULL DEFAULT 100,
  note                  text,
  created_by            uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT p2pg_companies_org_ref_uniq UNIQUE (org_id, org_ref_id)
);
CREATE INDEX IF NOT EXISTS p2pg_companies_org_idx ON p2pg_companies(org_id);

-- ─────────────────────────────────────────────────────────────
-- 2. ตัวเลขงบรายเดือนต่อบริษัท (hybrid)
--    ตัวเลขเงินเป็น NULL เมื่อ "ยังไม่มีข้อมูล" — ห้าม default 0 (กัน %กำไรเพี้ยน)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS p2pg_financials (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id            uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  company_id        uuid NOT NULL REFERENCES p2pg_companies(id) ON DELETE CASCADE,
  period_month      date NOT NULL,                         -- วันที่ 1 ของเดือนเสมอ
  source            text NOT NULL DEFAULT 'manual' CHECK (source IN ('manual','accounting')),
  revenue           numeric(16,2),
  cogs              numeric(16,2),
  opex              numeric(16,2),
  other_income      numeric(16,2),
  net_profit        numeric(16,2),
  cash_balance      numeric(16,2),
  total_assets      numeric(16,2),
  total_liabilities numeric(16,2),
  equity            numeric(16,2),
  ar                numeric(16,2),
  ap                numeric(16,2),
  headcount         int CHECK (headcount IS NULL OR headcount >= 0),
  is_locked         boolean NOT NULL DEFAULT false,
  note              text,
  created_by        uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT p2pg_financials_period_uniq UNIQUE (company_id, period_month),
  CONSTRAINT p2pg_financials_period_is_month_start CHECK (date_trunc('month', period_month)::date = period_month)
);
CREATE INDEX IF NOT EXISTS p2pg_financials_org_period_idx ON p2pg_financials(org_id, period_month);

-- ─────────────────────────────────────────────────────────────
-- 3. เงินลงทุนของโฮลดิ้งในบริษัทลูก
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS p2pg_investments (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id              uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  company_id          uuid NOT NULL REFERENCES p2pg_companies(id) ON DELETE CASCADE,
  invest_date         date NOT NULL,
  shares              bigint CHECK (shares IS NULL OR shares >= 0),
  cost_amount         numeric(16,2) NOT NULL CHECK (cost_amount >= 0),
  ownership_pct_after numeric(5,2) CHECK (ownership_pct_after IS NULL OR (ownership_pct_after >= 0 AND ownership_pct_after <= 100)),
  method              text NOT NULL DEFAULT 'cost' CHECK (method IN ('cost','equity')),
  note                text,
  created_by          uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS p2pg_investments_org_idx ON p2pg_investments(org_id, company_id);

-- ─────────────────────────────────────────────────────────────
-- 4. เงินปันผล
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS p2pg_dividends (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  company_id      uuid NOT NULL REFERENCES p2pg_companies(id) ON DELETE CASCADE,
  declared_date   date NOT NULL,
  paid_date       date,
  amount_declared numeric(16,2) NOT NULL CHECK (amount_declared >= 0),
  amount_received numeric(16,2) CHECK (amount_received IS NULL OR amount_received >= 0),
  wht_amount      numeric(16,2) CHECK (wht_amount IS NULL OR wht_amount >= 0),
  status          text NOT NULL DEFAULT 'declared' CHECK (status IN ('declared','paid','cancelled')),
  note            text,
  created_by      uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS p2pg_dividends_org_idx ON p2pg_dividends(org_id, company_id);

-- ─────────────────────────────────────────────────────────────
-- 5. สัญญาเงินกู้ยืมระหว่างบริษัท (ตัวแม่)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS p2pg_loans (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id              uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  lender_company_id   uuid NOT NULL REFERENCES p2pg_companies(id) ON DELETE CASCADE,
  borrower_company_id uuid NOT NULL REFERENCES p2pg_companies(id) ON DELETE CASCADE,
  contract_no         text,
  principal           numeric(16,2) NOT NULL CHECK (principal >= 0),
  interest_rate       numeric(6,3) CHECK (interest_rate IS NULL OR interest_rate >= 0),
  start_date          date NOT NULL,
  due_date            date,
  status              text NOT NULL DEFAULT 'active' CHECK (status IN ('active','repaid','written_off')),
  note                text,
  created_by          uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT p2pg_loans_two_parties CHECK (lender_company_id <> borrower_company_id)
);
CREATE INDEX IF NOT EXISTS p2pg_loans_org_idx ON p2pg_loans(org_id);

-- ─────────────────────────────────────────────────────────────
-- 6. รายการระหว่างบริษัท (รายธุรกรรม) — ใช้ทั้ง reconcile และ elimination
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS p2pg_intercompany (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                 uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  txn_date               date NOT NULL,
  from_company_id        uuid NOT NULL REFERENCES p2pg_companies(id) ON DELETE CASCADE,
  to_company_id          uuid NOT NULL REFERENCES p2pg_companies(id) ON DELETE CASCADE,
  ic_type                text NOT NULL CHECK (ic_type IN (
                           'loan','loan_repayment','interest','management_fee','service',
                           'goods','expense_reimburse','dividend','capital')),
  amount                 numeric(16,2) NOT NULL CHECK (amount >= 0),
  currency               text NOT NULL DEFAULT 'THB',
  loan_id                uuid REFERENCES p2pg_loans(id) ON DELETE SET NULL,
  description            text,
  doc_ref                text,
  status                 text NOT NULL DEFAULT 'open' CHECK (status IN ('open','settled','cancelled')),
  settled_date           date,
  counterparty_confirmed boolean NOT NULL DEFAULT false,
  confirmed_at           timestamptz,
  confirmed_by           uuid REFERENCES profiles(id) ON DELETE SET NULL,
  note                   text,
  created_by             uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT p2pg_ic_two_parties CHECK (from_company_id <> to_company_id)
);
CREATE INDEX IF NOT EXISTS p2pg_ic_org_date_idx ON p2pg_intercompany(org_id, txn_date);
CREATE INDEX IF NOT EXISTS p2pg_ic_loan_idx ON p2pg_intercompany(loan_id) WHERE loan_id IS NOT NULL;

-- ─────────────────────────────────────────────────────────────
-- 7. บัญชีธนาคารของทุกบริษัทในกลุ่ม
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS p2pg_bank_accounts (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id       uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  company_id   uuid NOT NULL REFERENCES p2pg_companies(id) ON DELETE CASCADE,
  bank_name    text NOT NULL,
  account_name text,
  account_no   text,
  account_type text NOT NULL DEFAULT 'current' CHECK (account_type IN ('current','savings','fixed','other')),
  currency     text NOT NULL DEFAULT 'THB',
  is_active    boolean NOT NULL DEFAULT true,
  note         text,
  created_by   uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS p2pg_bank_accounts_org_idx ON p2pg_bank_accounts(org_id, company_id);

-- ─────────────────────────────────────────────────────────────
-- 8. ยอดคงเหลือธนาคาร ณ วันที่
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS p2pg_bank_balances (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  bank_account_id uuid NOT NULL REFERENCES p2pg_bank_accounts(id) ON DELETE CASCADE,
  as_of_date      date NOT NULL,
  balance         numeric(16,2) NOT NULL,
  source          text NOT NULL DEFAULT 'manual' CHECK (source IN ('manual','import')),
  note            text,
  created_by      uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT p2pg_bank_balances_uniq UNIQUE (bank_account_id, as_of_date)
);
CREATE INDEX IF NOT EXISTS p2pg_bank_balances_org_idx ON p2pg_bank_balances(org_id, as_of_date);

-- ─────────────────────────────────────────────────────────────
-- updated_at triggers
-- ─────────────────────────────────────────────────────────────
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'p2pg_companies','p2pg_financials','p2pg_investments','p2pg_dividends',
    'p2pg_loans','p2pg_intercompany','p2pg_bank_accounts','p2pg_bank_balances'
  ] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON %I', t || '_touch', t);
    EXECUTE format(
      'CREATE TRIGGER %I BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at()',
      t || '_touch', t);
  END LOOP;
END $$;

-- ─────────────────────────────────────────────────────────────
-- RLS — org isolation (สิทธิ์เขียนบังคับที่ API layer ผ่าน canWriteP2pGroup)
-- ─────────────────────────────────────────────────────────────
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'p2pg_companies','p2pg_financials','p2pg_investments','p2pg_dividends',
    'p2pg_loans','p2pg_intercompany','p2pg_bank_accounts','p2pg_bank_balances'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_select', t);
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR SELECT USING (is_org_member(org_id, auth.uid()))',
      t || '_select', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_write', t);
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR ALL USING (is_org_admin(org_id, auth.uid())) WITH CHECK (is_org_admin(org_id, auth.uid()))',
      t || '_write', t);
  END LOOP;
END $$;

-- ─────────────────────────────────────────────────────────────
-- Seed — โฮลดิ้ง + 3 บริษัทในเครือ (idempotent, org เดียวเท่านั้น)
-- org_ref_id ตั้งที่นี่ = super_admin path ตาม contract §4
-- ─────────────────────────────────────────────────────────────
INSERT INTO p2pg_companies (org_id, name, legal_name, company_type, ownership_pct, org_ref_id, sort_order)
SELECT h.id, v.name, v.legal_name, v.company_type, v.ownership_pct, ref.id, v.sort_order
FROM organizations h
CROSS JOIN (VALUES
  ('พีทูพี โฮลดิ้ง',    'บริษัท พีทูพี โฮลดิ้ง จำกัด',      'holding',    NULL::numeric, 'p2pholding',   10),
  ('พีทูพี โซลูชั่นส์', 'บริษัท พีทูพี โซลูชั่นส์ จำกัด',   'subsidiary', NULL::numeric, 'p2psolutions', 20),
  ('พีทูพี ซัพพลาย',    'บริษัท พีทูพี ซัพพลาย จำกัด',      'subsidiary', NULL::numeric, 'p2psupply',    30),
  ('เจทีแอคเคาท์ติ้ง',  'บริษัท เจทีแอคเคาท์ติ้ง จำกัด',    'subsidiary', NULL::numeric, 'jtacc',        40)
) AS v(name, legal_name, company_type, ownership_pct, ref_slug, sort_order)
LEFT JOIN organizations ref ON ref.slug = v.ref_slug
WHERE h.slug = 'p2pholding'
  AND NOT EXISTS (
    SELECT 1 FROM p2pg_companies c WHERE c.org_id = h.id AND c.name = v.name
  );
