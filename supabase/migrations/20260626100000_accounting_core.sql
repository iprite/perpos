-- ─── Accounting Core (module: accounting) ────────────────────────────────────
-- โมดูลบัญชี & การเงิน — SME/solopreneur cockpit + accountant workspace
-- Migration: สร้าง 12 ตาราง acc_* fresh (ขนานกับตารางบัญชีเดิม — ไม่ migrate ข้อมูล)
-- Contract: specs/accounting.md §4 (Data Contract v4) + PRODUCTION BUILD PLAN B1
-- Created at: 2026-06-26
--
-- กฎ (CONTEXT §7):
--   • ทุกตาราง: org_id NOT NULL REFERENCES organizations(id) ON DELETE CASCADE
--   • id uuid PK DEFAULT gen_random_uuid() · created_at timestamptz NOT NULL DEFAULT now()
--     (ยกเว้น acc_org_settings — org_id เป็น PK, ไม่มี id)
--   • เงิน = numeric(14,2) · enum = text + CHECK (ไม่ใช้ CREATE TYPE — pattern hrm/tmc)
--   • ENABLE RLS ทุกตาราง · SELECT = is_org_member · write (ALL) = is_org_admin
--     (org isolation; write จริงคุมที่ API layer ด้วย canModuleWrite)
--   • created_by uuid → profiles(id) ON DELETE SET NULL บน 8 ตารางเงิน (audit Tier-2)
--   • audit trigger fn_audit_log_changes() บน 9 ตารางเงิน/control
--   • idempotency (BLOCKER 2): partial unique payroll/depreciation บน acc_journal_entries
--   • CHECK สมดุล (BLOCKER 1): acc_journal_lines debit/credit XOR + >= 0
--   • seed CoA + acc_org_settings row = ไม่อยู่ใน migration นี้ (ไป B5 provisioning ต่อ org)
--   • ไม่มี RPC ในไฟล์นี้ → ไม่มี REVOKE

-- ═══════════════════════════════════════════════════════════════════════════
-- §4.11 acc_org_settings — ตั้งค่าองค์กร/ภาษี (1 แถวต่อ org; org_id = PK)
-- ═══════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.acc_org_settings (
  org_id              uuid PRIMARY KEY REFERENCES public.organizations(id) ON DELETE CASCADE,
  is_vat_registered   boolean NOT NULL DEFAULT false,         -- Non-VAT default
  vat_rate            numeric(5,2) NOT NULL DEFAULT 7,
  fiscal_start_month  integer NOT NULL DEFAULT 1 CHECK (fiscal_start_month BETWEEN 1 AND 12),
  doc_number_prefix   jsonb,                                  -- { quotation:"QT", invoice:"INV", ... }
  address             text,
  tax_id              text,
  org_name            text,                                   -- ชื่อบริษัทบนเอกสาร
  logo_data_url       text,                                   -- โลโก้ PNG (data URL)
  signature_data_url  text,                                   -- ลายเซนผู้มีอำนาจ PNG (data URL)
  created_at          timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.acc_org_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "acc_org_settings_select" ON public.acc_org_settings
  FOR SELECT USING (is_org_member(org_id, auth.uid()));
CREATE POLICY "acc_org_settings_write" ON public.acc_org_settings
  FOR ALL USING (is_org_admin(org_id, auth.uid()));

-- ═══════════════════════════════════════════════════════════════════════════
-- §4.1 acc_contacts — ลูกค้า/ผู้ขาย (รวมตารางเดียว)
-- ═══════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.acc_contacts (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  kind        text NOT NULL CHECK (kind IN ('customer','vendor','both')),
  name        text NOT NULL,
  tax_id      text,
  branch      text,
  address     text,
  phone       text,
  email       text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS acc_contacts_org_id_idx ON public.acc_contacts(org_id);

ALTER TABLE public.acc_contacts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "acc_contacts_select" ON public.acc_contacts
  FOR SELECT USING (is_org_member(org_id, auth.uid()));
CREATE POLICY "acc_contacts_write" ON public.acc_contacts
  FOR ALL USING (is_org_admin(org_id, auth.uid()));

-- ═══════════════════════════════════════════════════════════════════════════
-- acc_products (entity 12, v4 addendum) — สินค้า/บริการ (master catalog)
-- ═══════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.acc_products (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  kind        text NOT NULL CHECK (kind IN ('good','service')),
  code        text,
  name        text NOT NULL,
  unit        text,
  unit_price  numeric(14,2) NOT NULL DEFAULT 0,
  is_active   boolean NOT NULL DEFAULT true,
  description text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, code)
);

CREATE INDEX IF NOT EXISTS acc_products_org_id_idx ON public.acc_products(org_id);

ALTER TABLE public.acc_products ENABLE ROW LEVEL SECURITY;
CREATE POLICY "acc_products_select" ON public.acc_products
  FOR SELECT USING (is_org_member(org_id, auth.uid()));
CREATE POLICY "acc_products_write" ON public.acc_products
  FOR ALL USING (is_org_admin(org_id, auth.uid()));

-- ═══════════════════════════════════════════════════════════════════════════
-- §4.5 acc_accounts — ผังบัญชี (chart of accounts) [หลังบ้าน]
-- หมายเหตุ: parent_id self-FK SET NULL · unique(org,code) · index(org,account_type)
-- ═══════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.acc_accounts (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  code          text NOT NULL,
  name          text NOT NULL,
  account_type  text NOT NULL CHECK (account_type IN ('asset','liability','equity','income','expense')),
  parent_id     uuid REFERENCES public.acc_accounts(id) ON DELETE SET NULL,
  is_active     boolean NOT NULL DEFAULT true,
  is_system     boolean NOT NULL DEFAULT false,
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, code)
);

CREATE INDEX IF NOT EXISTS acc_accounts_org_id_idx        ON public.acc_accounts(org_id);
CREATE INDEX IF NOT EXISTS acc_accounts_org_type_idx      ON public.acc_accounts(org_id, account_type);

ALTER TABLE public.acc_accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "acc_accounts_select" ON public.acc_accounts
  FOR SELECT USING (is_org_member(org_id, auth.uid()));
CREATE POLICY "acc_accounts_write" ON public.acc_accounts
  FOR ALL USING (is_org_admin(org_id, auth.uid()));

-- ═══════════════════════════════════════════════════════════════════════════
-- §4.8 acc_periods — งวดบัญชี / ปิดงวด [หลังบ้าน]
-- (ประกาศก่อน acc_journal_entries เพราะ journal.period_id → periods)
-- ═══════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.acc_periods (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  year        integer NOT NULL,
  month       integer NOT NULL CHECK (month BETWEEN 1 AND 12),
  status      text NOT NULL DEFAULT 'open' CHECK (status IN ('open','closed')),
  closed_at   timestamptz,
  closed_by   uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, year, month)
);

CREATE INDEX IF NOT EXISTS acc_periods_org_id_idx ON public.acc_periods(org_id);

ALTER TABLE public.acc_periods ENABLE ROW LEVEL SECURITY;
CREATE POLICY "acc_periods_select" ON public.acc_periods
  FOR SELECT USING (is_org_member(org_id, auth.uid()));
CREATE POLICY "acc_periods_write" ON public.acc_periods
  FOR ALL USING (is_org_admin(org_id, auth.uid()));

-- ═══════════════════════════════════════════════════════════════════════════
-- §4.6 acc_journal_entries — สมุดรายวัน (header) [หลังบ้าน]
-- idempotency (BLOCKER 2): partial unique payroll/depreciation แยกตาม source
-- ═══════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.acc_journal_entries (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id         uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  entry_number   text NOT NULL,
  entry_date     date NOT NULL,
  description    text,
  status         text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','posted','void')),
  period_id      uuid REFERENCES public.acc_periods(id) ON DELETE SET NULL,
  source         text NOT NULL DEFAULT 'manual'
                   CHECK (source IN ('manual','document','payroll','depreciation','ai')),
  source_ref_id  uuid,
  period_year    integer,                                  -- ใส่เฉพาะ payroll/depreciation
  period_month   integer CHECK (period_month IS NULL OR period_month BETWEEN 1 AND 12),
  total_debit    numeric(14,2) NOT NULL DEFAULT 0,
  total_credit   numeric(14,2) NOT NULL DEFAULT 0,
  created_by     uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, entry_number)
);

CREATE INDEX IF NOT EXISTS acc_journal_entries_org_id_idx      ON public.acc_journal_entries(org_id);
CREATE INDEX IF NOT EXISTS acc_journal_entries_org_date_idx    ON public.acc_journal_entries(org_id, entry_date);
CREATE INDEX IF NOT EXISTS acc_journal_entries_org_period_idx  ON public.acc_journal_entries(org_id, period_id);
CREATE INDEX IF NOT EXISTS acc_journal_entries_org_status_idx  ON public.acc_journal_entries(org_id, status);

-- BLOCKER 2 — idempotency ต่อ source (ยิงซ้ำ → skip กันยอดเบิ้ล)
-- payroll: 1 journal ต่อ run (source_ref_id = run_id)
CREATE UNIQUE INDEX IF NOT EXISTS acc_journal_entries_payroll_uniq
  ON public.acc_journal_entries(org_id, source, source_ref_id)
  WHERE source = 'payroll';
-- depreciation: 1 journal ต่อ (asset, งวด) — สินทรัพย์ตัวเดียวลงได้หลายงวด
CREATE UNIQUE INDEX IF NOT EXISTS acc_journal_entries_depr_uniq
  ON public.acc_journal_entries(org_id, source, source_ref_id, period_year, period_month)
  WHERE source = 'depreciation';

ALTER TABLE public.acc_journal_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "acc_journal_entries_select" ON public.acc_journal_entries
  FOR SELECT USING (is_org_member(org_id, auth.uid()));
CREATE POLICY "acc_journal_entries_write" ON public.acc_journal_entries
  FOR ALL USING (is_org_admin(org_id, auth.uid()));

-- ═══════════════════════════════════════════════════════════════════════════
-- §4.7 acc_journal_lines — บรรทัด Dr/Cr [หลังบ้าน]
-- CHECK สมดุล (BLOCKER 1): debit/credit >= 0 + อย่างใดอย่างหนึ่ง > 0 (XOR)
-- account_id → accounts RESTRICT (กันลบบัญชีที่ถูกอ้างใน journal)
-- ═══════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.acc_journal_lines (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id            uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  journal_entry_id  uuid NOT NULL REFERENCES public.acc_journal_entries(id) ON DELETE CASCADE,
  account_id        uuid NOT NULL REFERENCES public.acc_accounts(id) ON DELETE RESTRICT,
  debit             numeric(14,2) NOT NULL DEFAULT 0,
  credit            numeric(14,2) NOT NULL DEFAULT 0,
  line_note         text,
  sort_order        integer NOT NULL DEFAULT 0,
  created_by        uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT acc_journal_lines_nonneg_chk CHECK (debit >= 0 AND credit >= 0),
  CONSTRAINT acc_journal_lines_xor_chk    CHECK ((debit > 0) <> (credit > 0))
);

CREATE INDEX IF NOT EXISTS acc_journal_lines_org_id_idx   ON public.acc_journal_lines(org_id);
CREATE INDEX IF NOT EXISTS acc_journal_lines_entry_idx    ON public.acc_journal_lines(journal_entry_id);
CREATE INDEX IF NOT EXISTS acc_journal_lines_account_idx  ON public.acc_journal_lines(account_id);  -- report group-by (สำคัญสุด)

ALTER TABLE public.acc_journal_lines ENABLE ROW LEVEL SECURITY;
CREATE POLICY "acc_journal_lines_select" ON public.acc_journal_lines
  FOR SELECT USING (is_org_member(org_id, auth.uid()));
CREATE POLICY "acc_journal_lines_write" ON public.acc_journal_lines
  FOR ALL USING (is_org_admin(org_id, auth.uid()));

-- ═══════════════════════════════════════════════════════════════════════════
-- §4.4 acc_entries — รายรับ/รายจ่าย (สมุดง่ายของเจ้าของ) [หน้าบ้าน]
-- journal_entry_id → journal_entries SET NULL (link เมื่อนักบัญชีลงบัญชีแล้ว)
-- ═══════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.acc_entries (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id            uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  kind              text NOT NULL CHECK (kind IN ('income','expense')),
  entry_date        date NOT NULL,
  amount            numeric(14,2) NOT NULL DEFAULT 0,
  category          text,
  description       text,
  contact_id        uuid REFERENCES public.acc_contacts(id) ON DELETE SET NULL,
  source            text NOT NULL DEFAULT 'manual'
                      CHECK (source IN ('manual','document','payroll','line','ai')),
  source_ref_id     uuid,
  wht_rate          numeric(5,2) CHECK (wht_rate IS NULL OR wht_rate IN (1,2,3,5,10,15)),
  wht_amount        numeric(14,2),
  journal_entry_id  uuid REFERENCES public.acc_journal_entries(id) ON DELETE SET NULL,
  created_by        uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS acc_entries_org_id_idx       ON public.acc_entries(org_id);
CREATE INDEX IF NOT EXISTS acc_entries_org_date_idx     ON public.acc_entries(org_id, entry_date);
CREATE INDEX IF NOT EXISTS acc_entries_org_source_idx   ON public.acc_entries(org_id, source, source_ref_id);

ALTER TABLE public.acc_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "acc_entries_select" ON public.acc_entries
  FOR SELECT USING (is_org_member(org_id, auth.uid()));
CREATE POLICY "acc_entries_write" ON public.acc_entries
  FOR ALL USING (is_org_admin(org_id, auth.uid()));

-- ═══════════════════════════════════════════════════════════════════════════
-- §4.2 acc_documents — เอกสารขาย (ใบเสนอราคา/ใบแจ้งหนี้/ใบเสร็จ) [หน้าบ้าน]
-- contact_id → contacts SET NULL · converted_from_id self-FK SET NULL (chain)
-- unique(org,doc_type,doc_number) · index(org,status,due_date) สำหรับ overdue
-- ═══════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.acc_documents (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id             uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  doc_type           text NOT NULL CHECK (doc_type IN ('quotation','invoice','receipt')),
  doc_number         text NOT NULL,
  contact_id         uuid REFERENCES public.acc_contacts(id) ON DELETE SET NULL,
  issue_date         date NOT NULL,
  due_date           date,
  status             text NOT NULL DEFAULT 'draft'
                       CHECK (status IN ('draft','sent','accepted','paid','void','overdue')),
  vat_enabled        boolean NOT NULL DEFAULT false,         -- snapshot org setting ตอนออก
  subtotal           numeric(14,2) NOT NULL DEFAULT 0,
  vat_amount         numeric(14,2) NOT NULL DEFAULT 0,
  total              numeric(14,2) NOT NULL DEFAULT 0,
  wht_rate           numeric(5,2) NOT NULL DEFAULT 0,        -- % หัก ณ ที่จ่าย (0 = ไม่หัก)
  wht_amount         numeric(14,2) NOT NULL DEFAULT 0,
  converted_from_id  uuid REFERENCES public.acc_documents(id) ON DELETE SET NULL,
  note               text,
  created_by         uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at         timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, doc_type, doc_number)
);

CREATE INDEX IF NOT EXISTS acc_documents_org_id_idx           ON public.acc_documents(org_id);
CREATE INDEX IF NOT EXISTS acc_documents_org_date_idx         ON public.acc_documents(org_id, issue_date);
CREATE INDEX IF NOT EXISTS acc_documents_org_status_due_idx   ON public.acc_documents(org_id, status, due_date);
CREATE INDEX IF NOT EXISTS acc_documents_contact_idx          ON public.acc_documents(contact_id);

ALTER TABLE public.acc_documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "acc_documents_select" ON public.acc_documents
  FOR SELECT USING (is_org_member(org_id, auth.uid()));
CREATE POLICY "acc_documents_write" ON public.acc_documents
  FOR ALL USING (is_org_admin(org_id, auth.uid()));

-- ═══════════════════════════════════════════════════════════════════════════
-- §4.3 acc_document_lines — รายการในเอกสาร (+discount, +product_id v4)
-- document_id → documents CASCADE · product_id → products SET NULL
-- amount = qty×unit_price − discount (เช็คเชิง app — discount_type ทำให้ไม่ deterministic ใน CHECK)
-- ═══════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.acc_document_lines (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  document_id   uuid NOT NULL REFERENCES public.acc_documents(id) ON DELETE CASCADE,
  item_name     text NOT NULL DEFAULT '',
  description   text NOT NULL DEFAULT '',
  qty           numeric(12,2) NOT NULL DEFAULT 0,
  unit_price    numeric(14,2) NOT NULL DEFAULT 0,
  discount      numeric(14,2) NOT NULL DEFAULT 0,
  discount_type text NOT NULL DEFAULT 'amount' CHECK (discount_type IN ('amount','percent')),
  amount        numeric(14,2) NOT NULL DEFAULT 0,
  sort_order    integer NOT NULL DEFAULT 0,
  product_id    uuid REFERENCES public.acc_products(id) ON DELETE SET NULL,
  created_by    uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS acc_document_lines_org_id_idx     ON public.acc_document_lines(org_id);
CREATE INDEX IF NOT EXISTS acc_document_lines_document_idx   ON public.acc_document_lines(document_id);

ALTER TABLE public.acc_document_lines ENABLE ROW LEVEL SECURITY;
CREATE POLICY "acc_document_lines_select" ON public.acc_document_lines
  FOR SELECT USING (is_org_member(org_id, auth.uid()));
CREATE POLICY "acc_document_lines_write" ON public.acc_document_lines
  FOR ALL USING (is_org_admin(org_id, auth.uid()));

-- ═══════════════════════════════════════════════════════════════════════════
-- §4.9 acc_tax_filings — แบบภาษี (PP30 / PND1/3/53) [หลังบ้าน]
-- unique(org,tax_kind,period) → pnd1 upsert/รวมยอด (สะพาน payroll)
-- ═══════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.acc_tax_filings (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  tax_kind      text NOT NULL CHECK (tax_kind IN ('pp30','pnd1','pnd3','pnd53')),
  period_year   integer NOT NULL,
  period_month  integer NOT NULL CHECK (period_month BETWEEN 1 AND 12),
  status        text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','ready','filed')),
  sales_vat     numeric(14,2),
  purchase_vat  numeric(14,2),
  net_payable   numeric(14,2),
  wht_total     numeric(14,2),
  due_date      date NOT NULL,
  filed_at      timestamptz,
  created_by    uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, tax_kind, period_year, period_month)
);

CREATE INDEX IF NOT EXISTS acc_tax_filings_org_id_idx ON public.acc_tax_filings(org_id);

ALTER TABLE public.acc_tax_filings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "acc_tax_filings_select" ON public.acc_tax_filings
  FOR SELECT USING (is_org_member(org_id, auth.uid()));
CREATE POLICY "acc_tax_filings_write" ON public.acc_tax_filings
  FOR ALL USING (is_org_admin(org_id, auth.uid()));

-- ═══════════════════════════════════════════════════════════════════════════
-- §4.10 acc_assets — ทะเบียนสินทรัพย์ + ค่าเสื่อม (lightweight) [หลังบ้าน]
-- asset_account_id → accounts RESTRICT · CHECK accumulated ≤ cost−salvage, life>0
-- ═══════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.acc_assets (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                    uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name                      text NOT NULL,
  asset_account_id          uuid NOT NULL REFERENCES public.acc_accounts(id) ON DELETE RESTRICT,
  acquire_date              date NOT NULL,
  cost                      numeric(14,2) NOT NULL DEFAULT 0,
  salvage_value             numeric(14,2) NOT NULL DEFAULT 0,
  useful_life_months        integer NOT NULL CHECK (useful_life_months > 0),
  depreciation_method       text NOT NULL DEFAULT 'straight_line'
                              CHECK (depreciation_method IN ('straight_line')),
  accumulated_depreciation  numeric(14,2) NOT NULL DEFAULT 0,
  status                    text NOT NULL DEFAULT 'active' CHECK (status IN ('active','disposed')),
  created_by                uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at                timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT acc_assets_cost_chk  CHECK (cost >= 0 AND salvage_value >= 0),
  CONSTRAINT acc_assets_accum_chk CHECK (accumulated_depreciation <= cost - salvage_value)
);

CREATE INDEX IF NOT EXISTS acc_assets_org_id_idx           ON public.acc_assets(org_id);
CREATE INDEX IF NOT EXISTS acc_assets_asset_account_idx    ON public.acc_assets(asset_account_id);

ALTER TABLE public.acc_assets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "acc_assets_select" ON public.acc_assets
  FOR SELECT USING (is_org_member(org_id, auth.uid()));
CREATE POLICY "acc_assets_write" ON public.acc_assets
  FOR ALL USING (is_org_admin(org_id, auth.uid()));

-- ═══════════════════════════════════════════════════════════════════════════
-- Audit triggers (CONTEXT §1 #4 · docs/audit.md §3.1) — 9 ตารางเงิน/control
--   documents · document_lines · entries · journal_entries · journal_lines ·
--   assets · tax_filings · periods · org_settings
-- fn_audit_log_changes() = SECURITY DEFINER, มีอยู่แล้วในระบบ
-- ═══════════════════════════════════════════════════════════════════════════
CREATE TRIGGER trg_audit_acc_documents
  AFTER INSERT OR UPDATE OR DELETE ON public.acc_documents
  FOR EACH ROW EXECUTE FUNCTION fn_audit_log_changes();

CREATE TRIGGER trg_audit_acc_document_lines
  AFTER INSERT OR UPDATE OR DELETE ON public.acc_document_lines
  FOR EACH ROW EXECUTE FUNCTION fn_audit_log_changes();

CREATE TRIGGER trg_audit_acc_entries
  AFTER INSERT OR UPDATE OR DELETE ON public.acc_entries
  FOR EACH ROW EXECUTE FUNCTION fn_audit_log_changes();

CREATE TRIGGER trg_audit_acc_journal_entries
  AFTER INSERT OR UPDATE OR DELETE ON public.acc_journal_entries
  FOR EACH ROW EXECUTE FUNCTION fn_audit_log_changes();

CREATE TRIGGER trg_audit_acc_journal_lines
  AFTER INSERT OR UPDATE OR DELETE ON public.acc_journal_lines
  FOR EACH ROW EXECUTE FUNCTION fn_audit_log_changes();

CREATE TRIGGER trg_audit_acc_assets
  AFTER INSERT OR UPDATE OR DELETE ON public.acc_assets
  FOR EACH ROW EXECUTE FUNCTION fn_audit_log_changes();

CREATE TRIGGER trg_audit_acc_tax_filings
  AFTER INSERT OR UPDATE OR DELETE ON public.acc_tax_filings
  FOR EACH ROW EXECUTE FUNCTION fn_audit_log_changes();

CREATE TRIGGER trg_audit_acc_periods
  AFTER INSERT OR UPDATE OR DELETE ON public.acc_periods
  FOR EACH ROW EXECUTE FUNCTION fn_audit_log_changes();

CREATE TRIGGER trg_audit_acc_org_settings
  AFTER INSERT OR UPDATE OR DELETE ON public.acc_org_settings
  FOR EACH ROW EXECUTE FUNCTION fn_audit_log_changes();

-- ─── จบ migration accounting_core (12 ตาราง · RLS · audit · idempotency) ──────
