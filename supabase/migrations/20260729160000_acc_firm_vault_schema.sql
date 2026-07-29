-- ═══════════════════════════════════════════════════════════════════════════
-- Client Document Vault (คลังเอกสารลูกค้า) — Phase 1 schema
-- spec: docs/specs/jtacc-document-vault.md  (decisions §11)
--
-- D1  tenant = organizations/organization_members/module_members ที่มีอยู่
--     → ทุกตารางใช้ `firm_org_id` (ไม่มี firms/firm_members ใหม่)
-- D2  ทะเบียนลูกค้า = acc_firm_service_clients (ลูกค้าไม่จำเป็นต้องมี org ใน perpos)
-- D6  acc_firm_vault_categories = seed กลาง ไม่มี firm_org_id
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 0. helper: สิทธิ์ระดับ module (ท่าเดียวกับ policy ของ bucket client_documents) ──
CREATE OR REPLACE FUNCTION public.acc_firm_member(p_firm_org_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM module_members mm
    WHERE mm.org_id      = p_firm_org_id
      AND mm.module_key  = 'acc_firm'
      AND mm.user_id     = auth.uid()
      AND mm.is_active
  ) OR EXISTS (
    SELECT 1 FROM profiles p
    WHERE p.id = auth.uid() AND p.role IN ('admin', 'super_admin')
  );
$$;

CREATE OR REPLACE FUNCTION public.acc_firm_writer(p_firm_org_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM module_members mm
    WHERE mm.org_id      = p_firm_org_id
      AND mm.module_key  = 'acc_firm'
      AND mm.user_id     = auth.uid()
      AND mm.is_active
      AND mm.module_role <> 'viewer'
  ) OR EXISTS (
    SELECT 1 FROM profiles p
    WHERE p.id = auth.uid() AND p.role IN ('admin', 'super_admin')
  );
$$;

-- ── 1. ขยายทะเบียนลูกค้าเดิม (D2) ────────────────────────────────────────────
ALTER TABLE acc_firm_service_clients
  ADD COLUMN IF NOT EXISTS tax_id                  text,
  ADD COLUMN IF NOT EXISTS entity_type             text
    CHECK (entity_type IS NULL OR entity_type IN
           ('company', 'partnership', 'juristic_partnership', 'individual', 'foundation', 'other')),
  ADD COLUMN IF NOT EXISTS vat_registered          boolean NOT NULL DEFAULT false,
  -- วันสิ้นรอบบัญชี — เก็บเป็น MM-DD ของทุกปี (ปกติ 12-31)
  ADD COLUMN IF NOT EXISTS fiscal_year_end_month   smallint NOT NULL DEFAULT 12
    CHECK (fiscal_year_end_month BETWEEN 1 AND 12),
  ADD COLUMN IF NOT EXISTS fiscal_year_end_day     smallint NOT NULL DEFAULT 31
    CHECK (fiscal_year_end_day BETWEEN 1 AND 31),
  -- ม.13: สถานที่เก็บเอกสารจริง + แจ้งย้ายต่อ DBD แล้วหรือยัง
  ADD COLUMN IF NOT EXISTS storage_location        text,
  ADD COLUMN IF NOT EXISTS dbd_relocation_notified boolean NOT NULL DEFAULT false,
  -- ผูกกับ org ใน perpos ถ้าลูกค้าใช้ระบบด้วย (optional — ส่วนใหญ่เป็น NULL)
  ADD COLUMN IF NOT EXISTS client_org_id           uuid REFERENCES organizations(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS acc_firm_service_clients_org_ref_idx
  ON acc_firm_service_clients (client_org_id) WHERE client_org_id IS NOT NULL;

-- ── 2. taxonomy กลาง (D6 — ไม่มี firm_org_id, อ่านได้ทุกคนที่ login) ──────────
CREATE TABLE IF NOT EXISTS acc_firm_vault_categories (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code                text NOT NULL UNIQUE,          -- REG-01, SRC-03, …
  group_code          text NOT NULL
                        CHECK (group_code IN ('REG', 'ENG', 'SRC', 'BOK', 'TAX', 'ADM')),
  name_th             text NOT NULL,
  name_en             text,
  frequency           text NOT NULL DEFAULT 'monthly'
                        CHECK (frequency IN ('once', 'monthly', 'yearly')),
  -- 0 = เก็บถาวร (REG/ENG) — trigger จะแปลงเป็น 9999-12-31
  retention_years     smallint NOT NULL DEFAULT 7 CHECK (retention_years BETWEEN 0 AND 50),
  is_sensitive        boolean NOT NULL DEFAULT false,
  required_by_default boolean NOT NULL DEFAULT false,
  sort_order          smallint NOT NULL DEFAULT 100,
  is_active           boolean NOT NULL DEFAULT true,
  created_at          timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE acc_firm_vault_categories ENABLE ROW LEVEL SECURITY;

-- นิยามกลาง: อ่านได้ทุก user ที่ login · เขียนได้เฉพาะ service-role/super_admin
CREATE POLICY vault_categories_select ON acc_firm_vault_categories
  FOR SELECT TO authenticated USING (true);

-- ── 3. งวด (period) ต่อลูกค้า ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS acc_firm_vault_periods (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_org_id   uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  client_id     uuid NOT NULL REFERENCES acc_firm_service_clients(id) ON DELETE CASCADE,
  kind          text NOT NULL CHECK (kind IN ('month', 'year')),
  period_start  date NOT NULL,
  period_end    date NOT NULL,
  fiscal_year   int  NOT NULL,
  closed_at     timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  CHECK (period_end >= period_start),
  UNIQUE (client_id, kind, period_start)
);

CREATE INDEX IF NOT EXISTS vault_periods_client_idx
  ON acc_firm_vault_periods (firm_org_id, client_id, period_start DESC);

-- ── 4. template checklist ต่อ firm ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS acc_firm_vault_templates (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_org_id    uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name           text NOT NULL,
  entity_type    text,
  vat_registered boolean,
  is_default     boolean NOT NULL DEFAULT false,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS acc_firm_vault_template_items (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid NOT NULL REFERENCES acc_firm_vault_templates(id) ON DELETE CASCADE,
  category_id uuid NOT NULL REFERENCES acc_firm_vault_categories(id) ON DELETE RESTRICT,
  is_required boolean NOT NULL DEFAULT true,
  -- due_rule: 'PERIOD_END+7d' | 'PERIOD_END+150d' | NULL (ไม่มีกำหนด)
  due_rule    text,
  UNIQUE (template_id, category_id)
);

CREATE INDEX IF NOT EXISTS vault_templates_firm_idx
  ON acc_firm_vault_templates (firm_org_id);

-- ── 5. checklist จริงต่อ client-period ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS acc_firm_vault_checklist (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_org_id      uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  client_id        uuid NOT NULL REFERENCES acc_firm_service_clients(id) ON DELETE CASCADE,
  period_id        uuid NOT NULL REFERENCES acc_firm_vault_periods(id) ON DELETE CASCADE,
  category_id      uuid NOT NULL REFERENCES acc_firm_vault_categories(id) ON DELETE RESTRICT,
  status           text NOT NULL DEFAULT 'missing'
                     CHECK (status IN ('missing', 'received', 'verified', 'na')),
  is_required      boolean NOT NULL DEFAULT true,
  due_date         date,
  waived_reason    text,
  last_reminded_at timestamptz,
  updated_by       uuid REFERENCES profiles(id) ON DELETE SET NULL,
  updated_at       timestamptz NOT NULL DEFAULT now(),
  created_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (period_id, category_id)
);

CREATE INDEX IF NOT EXISTS vault_checklist_open_idx
  ON acc_firm_vault_checklist (firm_org_id, status, due_date)
  WHERE status = 'missing';

-- ── 6. เอกสาร + เวอร์ชัน ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS acc_firm_vault_documents (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_org_id    uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  client_id      uuid NOT NULL REFERENCES acc_firm_service_clients(id) ON DELETE CASCADE,
  period_id      uuid REFERENCES acc_firm_vault_periods(id) ON DELETE SET NULL,
  category_id    uuid NOT NULL REFERENCES acc_firm_vault_categories(id) ON DELETE RESTRICT,
  title          text NOT NULL,
  -- path = {firm_org_id}/{client_id}/{fiscal_year}/{category_code}/{uuid}.{ext}
  storage_path   text NOT NULL,
  mime_type      text,
  size_bytes     bigint,
  sha256         text NOT NULL,
  doc_date       date,
  amount         numeric(14, 2),
  counterparty   text,
  classification text NOT NULL DEFAULT 'internal'
                   CHECK (classification IN ('public', 'internal', 'confidential', 'personal_data')),
  status         text NOT NULL DEFAULT 'active'
                   CHECK (status IN ('draft', 'active', 'superseded', 'pending_purge', 'purged')),
  -- คำนวณโดย trigger เท่านั้น — ห้ามรับค่าจาก client payload (AC §9)
  retention_until date NOT NULL DEFAULT '9999-12-31',
  legal_hold     boolean NOT NULL DEFAULT false,
  purge_approved_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  purged_at      timestamptz,
  version        int NOT NULL DEFAULT 1,
  source         text NOT NULL DEFAULT 'web'
                   CHECK (source IN ('web', 'line', 'email', 'scan', 'api')),
  uploaded_by    uuid REFERENCES profiles(id) ON DELETE SET NULL,
  uploaded_at    timestamptz NOT NULL DEFAULT now(),
  note           text
);

-- กัน upload ซ้ำ (AC §9 ข้อ 2) — เอกสารที่ถูกทำลายแล้วไม่กันไฟล์ใหม่
CREATE UNIQUE INDEX IF NOT EXISTS vault_documents_sha_uniq
  ON acc_firm_vault_documents (firm_org_id, client_id, sha256)
  WHERE status <> 'purged';

CREATE INDEX IF NOT EXISTS vault_documents_client_idx
  ON acc_firm_vault_documents (firm_org_id, client_id, uploaded_at DESC);
CREATE INDEX IF NOT EXISTS vault_documents_period_idx
  ON acc_firm_vault_documents (period_id, category_id);
CREATE INDEX IF NOT EXISTS vault_documents_retention_idx
  ON acc_firm_vault_documents (retention_until)
  WHERE status = 'active' AND legal_hold = false;

CREATE TABLE IF NOT EXISTS acc_firm_vault_document_versions (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id  uuid NOT NULL REFERENCES acc_firm_vault_documents(id) ON DELETE CASCADE,
  version      int  NOT NULL,
  storage_path text NOT NULL,
  sha256       text NOT NULL,
  size_bytes   bigint,
  created_by   uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (document_id, version)
);

-- ── 7. ทะเบียนรับ-ส่งเอกสาร (custody log) ────────────────────────────────────
CREATE TABLE IF NOT EXISTS acc_firm_vault_custody_log (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_org_id   uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  client_id     uuid NOT NULL REFERENCES acc_firm_service_clients(id) ON DELETE CASCADE,
  direction     text NOT NULL CHECK (direction IN ('in', 'out')),
  handed_by     text,                                   -- ชื่อคนฝั่งลูกค้า (ไม่ใช่ user ในระบบ)
  received_by   uuid REFERENCES profiles(id) ON DELETE SET NULL,
  method        text NOT NULL DEFAULT 'in_person'
                  CHECK (method IN ('in_person', 'courier', 'line', 'email', 'other')),
  item_summary  text NOT NULL,
  item_count    int,
  signature_path text,                                  -- bucket acc_vault
  photo_path    text,
  receipt_no    text,
  occurred_at   timestamptz NOT NULL DEFAULT now(),
  note          text,
  created_by    uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS vault_custody_client_idx
  ON acc_firm_vault_custody_log (firm_org_id, client_id, occurred_at DESC);

-- ── 8. access log + audit (append-only, PDPA) ────────────────────────────────
CREATE TABLE IF NOT EXISTS acc_firm_vault_access_log (
  id          bigserial PRIMARY KEY,
  firm_org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  document_id uuid REFERENCES acc_firm_vault_documents(id) ON DELETE SET NULL,
  user_id     uuid REFERENCES profiles(id) ON DELETE SET NULL,
  action      text NOT NULL CHECK (action IN ('view', 'download', 'share', 'delete', 'upload')),
  ip          text,
  user_agent  text,
  at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS vault_access_log_doc_idx
  ON acc_firm_vault_access_log (document_id, at DESC);

CREATE TABLE IF NOT EXISTS acc_firm_vault_audit (
  id          bigserial PRIMARY KEY,
  firm_org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  actor_id    uuid REFERENCES profiles(id) ON DELETE SET NULL,
  entity      text NOT NULL,
  entity_id   uuid,
  action      text NOT NULL,
  before      jsonb,
  after       jsonb,
  at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS vault_audit_entity_idx
  ON acc_firm_vault_audit (firm_org_id, entity, entity_id, at DESC);

-- ── 9. incident (ม.15 / PDPA) ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS acc_firm_vault_incidents (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_org_id         uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  client_id           uuid REFERENCES acc_firm_service_clients(id) ON DELETE SET NULL,
  type                text NOT NULL
                        CHECK (type IN ('document_lost', 'document_damaged', 'data_breach')),
  severity            text NOT NULL DEFAULT 'medium'
                        CHECK (severity IN ('low', 'medium', 'high')),
  occurred_at         timestamptz,
  discovered_at       timestamptz NOT NULL DEFAULT now(),
  reported_to_dbd_at  timestamptz,    -- ม.15: ภายใน 15 วันนับแต่ discovered_at
  reported_to_pdpc_at timestamptz,    -- PDPA: ภายใน 72 ชั่วโมง
  status              text NOT NULL DEFAULT 'open'
                        CHECK (status IN ('open', 'reported', 'closed')),
  description         text NOT NULL,
  created_by          uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS vault_incidents_open_idx
  ON acc_firm_vault_incidents (firm_org_id, status, discovered_at DESC);

-- ═══════════════════════════════════════════════════════════════════════════
-- 10. trigger: retention_until คำนวณเองเสมอ (AC §9 ข้อสุดท้าย)
--     ฐาน = period_end ของงวด · ไม่มีงวด → วันสิ้นรอบบัญชีของปีที่อัปโหลด
--     retention_years = 0 → เก็บถาวร (9999-12-31)
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.acc_firm_vault_set_retention()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_years  smallint;
  v_base   date;
  v_month  smallint;
  v_day    smallint;
BEGIN
  SELECT retention_years INTO v_years
    FROM acc_firm_vault_categories WHERE id = NEW.category_id;

  IF v_years IS NULL THEN
    RAISE EXCEPTION 'unknown category_id %', NEW.category_id;
  END IF;

  IF v_years = 0 THEN
    NEW.retention_until := DATE '9999-12-31';
    RETURN NEW;
  END IF;

  IF NEW.period_id IS NOT NULL THEN
    SELECT period_end INTO v_base
      FROM acc_firm_vault_periods WHERE id = NEW.period_id;
  END IF;

  IF v_base IS NULL THEN
    SELECT fiscal_year_end_month, fiscal_year_end_day INTO v_month, v_day
      FROM acc_firm_service_clients WHERE id = NEW.client_id;
    v_base := make_date(
      EXTRACT(YEAR FROM COALESCE(NEW.uploaded_at, now()))::int,
      COALESCE(v_month, 12),
      LEAST(
        COALESCE(v_day, 31),
        EXTRACT(DAY FROM (
          make_date(EXTRACT(YEAR FROM COALESCE(NEW.uploaded_at, now()))::int,
                    COALESCE(v_month, 12), 1) + INTERVAL '1 month - 1 day'
        ))::int
      )
    );
  END IF;

  NEW.retention_until := (v_base + make_interval(years => v_years))::date;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS acc_firm_vault_retention_trg ON acc_firm_vault_documents;
CREATE TRIGGER acc_firm_vault_retention_trg
  BEFORE INSERT OR UPDATE OF category_id, period_id, client_id
  ON acc_firm_vault_documents
  FOR EACH ROW EXECUTE FUNCTION public.acc_firm_vault_set_retention();

-- ═══════════════════════════════════════════════════════════════════════════
-- 11. RLS — firm member อ่านได้ / non-viewer เขียนได้ (ทุกตารางที่มี firm_org_id)
-- ═══════════════════════════════════════════════════════════════════════════
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'acc_firm_vault_periods',
    'acc_firm_vault_templates',
    'acc_firm_vault_checklist',
    'acc_firm_vault_documents',
    'acc_firm_vault_custody_log',
    'acc_firm_vault_incidents',
    'acc_firm_vault_access_log',
    'acc_firm_vault_audit'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_select', t);
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR SELECT TO authenticated USING (acc_firm_member(firm_org_id))',
      t || '_select', t);
  END LOOP;

  -- เขียนได้เฉพาะ non-viewer · log 2 ตัวเป็น append-only จึงให้แค่ INSERT
  FOREACH t IN ARRAY ARRAY[
    'acc_firm_vault_periods',
    'acc_firm_vault_templates',
    'acc_firm_vault_checklist',
    'acc_firm_vault_documents',
    'acc_firm_vault_custody_log',
    'acc_firm_vault_incidents'
  ] LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_write', t);
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR ALL TO authenticated
         USING (acc_firm_writer(firm_org_id)) WITH CHECK (acc_firm_writer(firm_org_id))',
      t || '_write', t);
  END LOOP;

  FOREACH t IN ARRAY ARRAY['acc_firm_vault_access_log', 'acc_firm_vault_audit'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_insert', t);
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR INSERT TO authenticated WITH CHECK (acc_firm_member(firm_org_id))',
      t || '_insert', t);
  END LOOP;
END $$;

-- ตารางลูกที่ไม่มี firm_org_id — สืบสิทธิ์จากพ่อ
ALTER TABLE acc_firm_vault_template_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY vault_template_items_select ON acc_firm_vault_template_items
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM acc_firm_vault_templates t
             WHERE t.id = template_id AND acc_firm_member(t.firm_org_id))
  );
CREATE POLICY vault_template_items_write ON acc_firm_vault_template_items
  FOR ALL TO authenticated USING (
    EXISTS (SELECT 1 FROM acc_firm_vault_templates t
             WHERE t.id = template_id AND acc_firm_writer(t.firm_org_id))
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM acc_firm_vault_templates t
             WHERE t.id = template_id AND acc_firm_writer(t.firm_org_id))
  );

ALTER TABLE acc_firm_vault_document_versions ENABLE ROW LEVEL SECURITY;
CREATE POLICY vault_doc_versions_select ON acc_firm_vault_document_versions
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM acc_firm_vault_documents d
             WHERE d.id = document_id AND acc_firm_member(d.firm_org_id))
  );
CREATE POLICY vault_doc_versions_insert ON acc_firm_vault_document_versions
  FOR INSERT TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM acc_firm_vault_documents d
             WHERE d.id = document_id AND acc_firm_writer(d.firm_org_id))
  );

-- ═══════════════════════════════════════════════════════════════════════════
-- 12. append-only จริง — แก้/ลบ log ไม่ได้แม้แต่ service-role (AC §9 ข้อ 5)
--     ต้อง REVOKE ระดับ GRANT เพราะ service_role bypass RLS
-- ═══════════════════════════════════════════════════════════════════════════
REVOKE UPDATE, DELETE, TRUNCATE ON acc_firm_vault_access_log
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE UPDATE, DELETE, TRUNCATE ON acc_firm_vault_audit
  FROM PUBLIC, anon, authenticated, service_role;

COMMENT ON TABLE acc_firm_vault_access_log IS
  'PDPA access trail — append-only. UPDATE/DELETE ถูก REVOKE จากทุก role โดยตั้งใจ (ห้าม GRANT คืน)';
COMMENT ON TABLE acc_firm_vault_audit IS
  'Vault audit trail — append-only. UPDATE/DELETE ถูก REVOKE จากทุก role โดยตั้งใจ (ห้าม GRANT คืน)';
COMMENT ON COLUMN acc_firm_vault_documents.retention_until IS
  'คำนวณโดย trigger acc_firm_vault_retention_trg เท่านั้น — ค่าที่ client ส่งมาถูกเขียนทับเสมอ';
