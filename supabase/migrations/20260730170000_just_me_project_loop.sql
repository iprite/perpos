-- just_me — ระบบบริหารโครงการ full loop (feature `just-me-project-loop`, B1)
-- contract: .claude/feature-factory/specs/just-me-project-loop.md §3 (naming lock) + §4 (data model)
-- 2026-07-30
--
-- ขอบเขตไฟล์นี้ (ADDITIVE ล้วน — ไม่แก้ migration เก่า):
--   1) helper just_me_has_cost_access()                     — ด่านต้นทุน/margin ที่ชั้น DB (§4.6)
--   2) 15 ตารางใหม่ prefix just_me_*                        (§3.1/§4)
--   3) ALTER just_me_stock_movements +3 คอลัมน์ nullable    (§4.5) — ห้ามแตะ trigger/CHECK เดิม
--   4) RLS ทุกตารางใหม่ policy แยก _select/_insert/_update/_delete (ห้าม FOR ALL)
--   5) รัด policy ของ just_me_item_costs / just_me_stock_movements (ปิดช่อง FOR ALL เดิม)
--   6) 5 view สำหรับ viewer (เฉพาะคอลัมน์ที่ไม่อ่อนไหว — projects/boqs/boq_items/pr_items/stock_movements)
--   7) trigger invariant: BOQ freeze / PR freeze / งวดที่วางบิลแล้วห้ามแก้ยอด
--   8) bucket private `just_me_files`
--
-- ⛔ invariant ของคลังเดิมที่ห้ามพัง (spec §1.2):
--    - ห้าม CREATE OR REPLACE trigger function `just_me_movement_cost_prepare` / `_commit`
--    - ห้ามแตะ CHECK `movement_type` (receive|transfer|issue|return) — ผูกโครงการทำผ่านคอลัมน์ใหม่เท่านั้น
--    - unit_cost / total_cost คำนวณโดย trigger เท่านั้น
--
-- idempotent: CREATE ... IF NOT EXISTS / DROP POLICY IF EXISTS / ON CONFLICT DO NOTHING → รันซ้ำได้

-- ═══════════════════════════════════════════════════════════════════════════
-- 1) ด่านสิทธิ์ต้นทุน/margin ระดับ DB  (ลอก p2pg_has_money_access ทั้งท่า)
--    owner|manager ของ module just_me (หรือ super_admin) เท่านั้นที่เห็นต้นทุน
--    ใช้ auth.uid() ภายในโดยตั้งใจ — ไม่รับ p_user เป็นพารามิเตอร์ (กันเอาไปหยั่งสิทธิ์คนอื่น)
--    หมายเหตุ: ชุดคนกลุ่มนี้ = canWrite(role) ของ module just_me พอดี (owner|manager)
--    จึงใช้ predicate เดียวกันเป็น backstop ของการเขียนด้วย (ด่านจริงอยู่ที่ API `canWrite`)
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION just_me_has_cost_access(p_org uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM module_members m
    WHERE m.org_id = p_org
      AND m.module_key = 'just_me'
      AND m.user_id = auth.uid()
      AND m.is_active
      AND m.module_role IN ('owner', 'manager')
  ) OR EXISTS (
    SELECT 1 FROM profiles p
    WHERE p.id = auth.uid() AND p.role = 'super_admin'
  );
$$;

REVOKE ALL ON FUNCTION just_me_has_cost_access(uuid) FROM public, anon;
-- authenticated ต้องมี EXECUTE จริง เพราะ policy expression รันด้วยสิทธิ์ผู้เรียก
GRANT EXECUTE ON FUNCTION just_me_has_cost_access(uuid) TO authenticated;

COMMENT ON FUNCTION just_me_has_cost_access(uuid) IS
  'true เมื่อผู้เรียก (auth.uid()) เป็น owner/manager ของ module just_me ใน org นั้น หรือเป็น super_admin — ใช้เป็นด่านอ่านต้นทุน/margin ใน RLS';

-- ═══════════════════════════════════════════════════════════════════════════
-- 2) ตารางใหม่
--    ทุกตาราง: id uuid PK · org_id NOT NULL FK organizations · created_by · created_at
--    ตารางแม่ที่ถูกอ้างแบบ composite มี UNIQUE (id, org_id)
--    composite FK ใช้ ON DELETE CASCADE เท่านั้น (composite + SET NULL = null org_id ที่ NOT NULL)
--    FK ที่ต้องการ SET NULL → เป็นคอลัมน์เดียว + บังคับ org เดียวกันที่ API layer
-- ═══════════════════════════════════════════════════════════════════════════

-- 2.1 ค่าตั้งต้นบริษัท (1 แถวต่อ org, PK = org_id)
CREATE TABLE IF NOT EXISTS just_me_settings (
  org_id               uuid        PRIMARY KEY REFERENCES organizations(id) ON DELETE CASCADE,
  default_margin_pct   numeric     NOT NULL DEFAULT 20,
  default_overhead_pct numeric,
  cost_alert_pct       numeric     NOT NULL DEFAULT 10,
  pr_approval_required boolean     NOT NULL DEFAULT true,
  created_by           uuid        REFERENCES profiles(id) ON DELETE SET NULL,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);

-- 2.2 หมวดงาน (+ margin ชั้นหมวด)
CREATE TABLE IF NOT EXISTS just_me_work_categories (
  id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id             uuid        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  code               text,
  name               text        NOT NULL,
  default_margin_pct numeric,
  sort_order         int         NOT NULL DEFAULT 0,
  is_active          boolean     NOT NULL DEFAULT true,
  created_by         uuid        REFERENCES profiles(id) ON DELETE SET NULL,
  created_at         timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, org_id),
  UNIQUE (org_id, code)
);

-- 2.3 โครงการ
--     contract_amount / budget_cost = NULL แปลว่า "ยังไม่มีข้อมูล" ห้ามเขียน 0 แทน (spec §8 ข้อ 1)
CREATE TABLE IF NOT EXISTS just_me_projects (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                uuid        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  project_code          text        NOT NULL,
  name                  text        NOT NULL,
  status                text        NOT NULL DEFAULT 'survey'
                          CHECK (status IN ('survey','boq','quoted','won','in_progress',
                                            'completed','closed','lost','cancelled')),
  acc_contact_id        uuid        REFERENCES acc_contacts(id) ON DELETE SET NULL,
  customer_name         text,
  site_address          text,
  latitude              numeric,
  longitude             numeric,
  manager_id            uuid        REFERENCES profiles(id) ON DELETE SET NULL,
  start_date            date,
  end_date              date,
  contract_amount       numeric     CHECK (contract_amount IS NULL OR contract_amount >= 0),
  budget_cost           numeric     CHECK (budget_cost IS NULL OR budget_cost >= 0),
  margin_pct            numeric,
  retention_pct         numeric     NOT NULL DEFAULT 0 CHECK (retention_pct >= 0 AND retention_pct <= 100),
  budget_revised_at     timestamptz,
  quotation_document_id uuid        REFERENCES acc_documents(id) ON DELETE SET NULL,
  note                  text,
  created_by            uuid        REFERENCES profiles(id) ON DELETE SET NULL,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, org_id),
  UNIQUE (org_id, project_code)
);

COMMENT ON COLUMN just_me_projects.contract_amount IS 'มูลค่าสัญญา — NULL = ยังไม่มีสัญญา (ห้ามใส่ 0 แทน)';
COMMENT ON COLUMN just_me_projects.budget_cost IS 'งบต้นทุน baseline — เขียนตอน approve BOQ เท่านั้น · NULL = ยังไม่อนุมัติ BOQ';

-- 2.4 ไฟล์โครงการ (bucket private `just_me_files` — เข้าถึงผ่าน signed URL ≤60 วิ)
CREATE TABLE IF NOT EXISTS just_me_project_files (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id       uuid        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  project_id   uuid        NOT NULL,
  file_kind    text        NOT NULL DEFAULT 'other'
                 CHECK (file_kind IN ('survey_photo','drawing','contract','other')),
  file_name    text,
  storage_path text        NOT NULL,
  mime_type    text,
  size_bytes   bigint,
  uploaded_by  uuid        REFERENCES profiles(id) ON DELETE SET NULL,
  created_by   uuid        REFERENCES profiles(id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (project_id, org_id)
    REFERENCES just_me_projects(id, org_id) ON DELETE CASCADE
);

-- 2.5 ราคามาตรฐาน (price book)
--     material_cost_mode = 'auto'  → อ่าน just_me_item_costs.avg_cost ตอนใช้งาน
--                          'manual' → ใช้ material_unit_cost_manual
CREATE TABLE IF NOT EXISTS just_me_price_book (
  id                        uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                    uuid        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  item_id                   uuid        REFERENCES just_me_inventory_items(id) ON DELETE SET NULL,
  category_id               uuid        REFERENCES just_me_work_categories(id) ON DELETE SET NULL,
  name                      text        NOT NULL,
  unit                      text        NOT NULL,
  material_cost_mode        text        NOT NULL DEFAULT 'auto'
                              CHECK (material_cost_mode IN ('auto','manual')),
  material_unit_cost_manual numeric,
  labor_unit_cost           numeric     NOT NULL DEFAULT 0,
  overhead_unit_cost        numeric     NOT NULL DEFAULT 0,
  margin_pct                numeric,
  cost_alert_pct            numeric,
  baseline_material_cost    numeric,
  baseline_at               timestamptz,
  is_active                 boolean     NOT NULL DEFAULT true,
  created_by                uuid        REFERENCES profiles(id) ON DELETE SET NULL,
  created_at                timestamptz NOT NULL DEFAULT now(),
  updated_at                timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, org_id)
);

COMMENT ON COLUMN just_me_price_book.baseline_material_cost IS
  'ฐานเทียบเตือนราคาซื้อขยับ (ตั้งตอนกด "รับทราบราคาใหม่") — NULL = ยังไม่เคยตั้งฐาน ห้ามตีเป็น 0';

-- 2.6 BOQ (หัว)
CREATE TABLE IF NOT EXISTS just_me_boqs (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id       uuid        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  project_id   uuid        NOT NULL,
  revision_no  int         NOT NULL DEFAULT 1 CHECK (revision_no > 0),
  status       text        NOT NULL DEFAULT 'draft'
                 CHECK (status IN ('draft','approved','superseded')),
  title        text,
  approved_by  uuid        REFERENCES profiles(id) ON DELETE SET NULL,
  approved_at  timestamptz,
  total_cost   numeric,
  total_amount numeric,
  note         text,
  created_by   uuid        REFERENCES profiles(id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  -- CHECK ทิศเดียว (ห้ามสมมาตร — ลบ profile แล้ว SET NULL จะทำให้แถวเดิมผิด CHECK ถาวร)
  CHECK (approved_by IS NULL OR approved_at IS NOT NULL),
  UNIQUE (id, org_id),
  UNIQUE (project_id, revision_no),
  FOREIGN KEY (project_id, org_id)
    REFERENCES just_me_projects(id, org_id) ON DELETE CASCADE
);

-- 1 โครงการมี BOQ ที่ approved ได้ไม่เกิน 1 ฉบับ
CREATE UNIQUE INDEX IF NOT EXISTS just_me_boqs_one_approved_idx
  ON just_me_boqs(project_id) WHERE status = 'approved';

-- 2.7 บรรทัด BOQ — ต้นทุน 3 ก้อนเป็น snapshot ณ ตอนถอด BOQ (ไม่ join สด)
CREATE TABLE IF NOT EXISTS just_me_boq_items (
  id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id             uuid        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  boq_id             uuid        NOT NULL,
  category_id        uuid        REFERENCES just_me_work_categories(id) ON DELETE SET NULL,
  price_book_id      uuid        REFERENCES just_me_price_book(id) ON DELETE SET NULL,
  item_id            uuid        REFERENCES just_me_inventory_items(id) ON DELETE SET NULL,
  item_kind          text        NOT NULL DEFAULT 'material'
                       CHECK (item_kind IN ('material','labor','subcontract','other')),
  name               text        NOT NULL,
  unit               text        NOT NULL,
  qty                numeric     NOT NULL CHECK (qty > 0),
  material_unit_cost numeric     NOT NULL DEFAULT 0,
  labor_unit_cost    numeric     NOT NULL DEFAULT 0,
  overhead_unit_cost numeric     NOT NULL DEFAULT 0,
  margin_pct         numeric,
  margin_source      text        CHECK (margin_source IS NULL
                                        OR margin_source IN ('item','category','project','company')),
  unit_price         numeric     NOT NULL DEFAULT 0,
  amount             numeric     NOT NULL DEFAULT 0,
  cost_amount        numeric     NOT NULL DEFAULT 0,
  sort_order         int         NOT NULL DEFAULT 0,
  created_by         uuid        REFERENCES profiles(id) ON DELETE SET NULL,
  created_at         timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, org_id),
  FOREIGN KEY (boq_id, org_id)
    REFERENCES just_me_boqs(id, org_id) ON DELETE CASCADE
);

COMMENT ON COLUMN just_me_boq_items.margin_source IS
  'ชั้นที่ margin ถูก resolve มา (item|category|project|company) — margin ที่ตั้งมือบนบรรทัดบันทึกเป็น item';

-- 2.8 ผู้ขาย
CREATE TABLE IF NOT EXISTS just_me_vendors (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id       uuid        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name         text        NOT NULL,
  tax_id       text,
  phone        text,
  email        text,
  address      text,
  contact_name text,
  note         text,
  is_active    boolean     NOT NULL DEFAULT true,
  created_by   uuid        REFERENCES profiles(id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, org_id)
);

-- 2.9 ใบขอซื้อ (PR) — project_id NULL = ซื้อเข้าคลังกลาง
CREATE TABLE IF NOT EXISTS just_me_purchase_requests (
  id                   uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id               uuid        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  pr_code              text        NOT NULL,
  project_id           uuid,
  boq_id               uuid        REFERENCES just_me_boqs(id) ON DELETE SET NULL,
  status               text        NOT NULL DEFAULT 'draft'
                         CHECK (status IN ('draft','submitted','approved','ordered',
                                           'partially_received','received','cancelled')),
  needed_date          date,
  warehouse_id         uuid        REFERENCES just_me_warehouses(id) ON DELETE SET NULL,
  selected_vendor_id   uuid        REFERENCES just_me_vendors(id) ON DELETE SET NULL,
  submitted_at         timestamptz,
  approved_at          timestamptz,
  approved_by          uuid        REFERENCES profiles(id) ON DELETE SET NULL,
  total_estimated_cost numeric,
  total_selected_cost  numeric,
  over_budget_reason   text,
  note                 text,
  created_by           uuid        REFERENCES profiles(id) ON DELETE SET NULL,
  created_at           timestamptz NOT NULL DEFAULT now(),
  CHECK (approved_by IS NULL OR approved_at IS NOT NULL),
  UNIQUE (id, org_id),
  UNIQUE (org_id, pr_code),
  -- composite FK (nullable → MATCH SIMPLE: ไม่บังคับเมื่อ project_id เป็น NULL)
  FOREIGN KEY (project_id, org_id)
    REFERENCES just_me_projects(id, org_id) ON DELETE CASCADE
);

COMMENT ON COLUMN just_me_purchase_requests.over_budget_reason IS
  'เหตุผลที่ยอมให้ยอดสะสมต่อ boq_item เกินปริมาณใน BOQ (owner อนุมัติ) — เช็คยอดจริงอยู่ที่ lib/just-me/purchasing.ts';

-- 2.10 บรรทัด PR
CREATE TABLE IF NOT EXISTS just_me_pr_items (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id              uuid        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  pr_id               uuid        NOT NULL,
  boq_item_id         uuid        REFERENCES just_me_boq_items(id) ON DELETE SET NULL,
  item_id             uuid        REFERENCES just_me_inventory_items(id) ON DELETE SET NULL,
  name                text        NOT NULL,
  unit                text        NOT NULL,
  qty                 numeric     NOT NULL CHECK (qty > 0),
  estimated_unit_cost numeric,
  selected_unit_cost  numeric,
  received_qty        numeric     NOT NULL DEFAULT 0 CHECK (received_qty >= 0),
  sort_order          int         NOT NULL DEFAULT 0,
  created_by          uuid        REFERENCES profiles(id) ON DELETE SET NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, org_id),
  FOREIGN KEY (pr_id, org_id)
    REFERENCES just_me_purchase_requests(id, org_id) ON DELETE CASCADE
);

-- 2.11 ใบเสนอราคาผู้ขายต่อ PR (เทียบราคา)
CREATE TABLE IF NOT EXISTS just_me_vendor_quotes (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  pr_id         uuid        NOT NULL,
  vendor_id     uuid        NOT NULL,
  status        text        NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending','received','selected','rejected')),
  quote_no      text,
  quote_date    date,
  total_amount  numeric,
  delivery_days int,
  credit_terms  text,
  file_path     text,
  note          text,
  created_by    uuid        REFERENCES profiles(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, org_id),
  UNIQUE (pr_id, vendor_id),
  FOREIGN KEY (pr_id, org_id)
    REFERENCES just_me_purchase_requests(id, org_id) ON DELETE CASCADE,
  FOREIGN KEY (vendor_id, org_id)
    REFERENCES just_me_vendors(id, org_id) ON DELETE CASCADE
);

-- 1 PR เลือกผู้ขายได้เจ้าเดียว
CREATE UNIQUE INDEX IF NOT EXISTS just_me_vendor_quotes_one_selected_idx
  ON just_me_vendor_quotes(pr_id) WHERE status = 'selected';

CREATE TABLE IF NOT EXISTS just_me_vendor_quote_items (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id     uuid        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  quote_id   uuid        NOT NULL,
  pr_item_id uuid        NOT NULL,
  unit_cost  numeric,
  qty        numeric     CHECK (qty IS NULL OR qty > 0),
  note       text,
  created_by uuid        REFERENCES profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (quote_id, pr_item_id),
  FOREIGN KEY (quote_id, org_id)
    REFERENCES just_me_vendor_quotes(id, org_id) ON DELETE CASCADE,
  FOREIGN KEY (pr_item_id, org_id)
    REFERENCES just_me_pr_items(id, org_id) ON DELETE CASCADE
);

-- 2.12 ต้นทุนที่ไม่ผ่านคลัง (ค่าแรง/ผู้รับเหมาช่วง/ขนส่ง)
CREATE TABLE IF NOT EXISTS just_me_project_costs (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      uuid        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  project_id  uuid        NOT NULL,
  cost_kind   text        NOT NULL DEFAULT 'other'
                CHECK (cost_kind IN ('labor','subcontract','transport','other')),
  cost_date   date        NOT NULL,
  description text,
  amount      numeric     NOT NULL CHECK (amount > 0),
  vendor_id   uuid        REFERENCES just_me_vendors(id) ON DELETE SET NULL,
  boq_item_id uuid        REFERENCES just_me_boq_items(id) ON DELETE SET NULL,
  file_path   text,
  recorded_by uuid        REFERENCES profiles(id) ON DELETE SET NULL,
  created_by  uuid        REFERENCES profiles(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (project_id, org_id)
    REFERENCES just_me_projects(id, org_id) ON DELETE CASCADE
);

-- 2.13 งวดงาน — ยอดรวมของงวดที่ยังไม่ cancelled ต้องไม่เกิน contract_amount (เช็คที่ API)
CREATE TABLE IF NOT EXISTS just_me_project_billings (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id              uuid        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  project_id          uuid        NOT NULL,
  seq                 int         NOT NULL CHECK (seq > 0),
  title               text,
  percent_of_contract numeric     CHECK (percent_of_contract IS NULL
                                         OR (percent_of_contract > 0 AND percent_of_contract <= 100)),
  amount              numeric     NOT NULL CHECK (amount >= 0),
  retention_amount    numeric     NOT NULL DEFAULT 0 CHECK (retention_amount >= 0),
  due_date            date,
  status              text        NOT NULL DEFAULT 'planned'
                        CHECK (status IN ('planned','ready','invoiced','paid','cancelled')),
  invoice_document_id uuid        REFERENCES acc_documents(id) ON DELETE SET NULL,
  invoiced_at         timestamptz,
  paid_at             timestamptz,
  note                text,
  created_by          uuid        REFERENCES profiles(id) ON DELETE SET NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, seq),
  FOREIGN KEY (project_id, org_id)
    REFERENCES just_me_projects(id, org_id) ON DELETE CASCADE
);

-- 2.14 ความคืบหน้า — ใช้ done_qty เป็นหลัก · percent ใช้เมื่อวัดเป็นปริมาณไม่ได้
CREATE TABLE IF NOT EXISTS just_me_project_progress (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  project_id    uuid        NOT NULL,
  boq_item_id   uuid        REFERENCES just_me_boq_items(id) ON DELETE SET NULL,
  progress_date date        NOT NULL,
  done_qty      numeric     CHECK (done_qty IS NULL OR done_qty >= 0),
  percent       numeric     CHECK (percent IS NULL OR (percent >= 0 AND percent <= 100)),
  note          text,
  recorded_by   uuid        REFERENCES profiles(id) ON DELETE SET NULL,
  created_by    uuid        REFERENCES profiles(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  -- ไม่มีข้อมูล = ไม่ต้องบันทึกแถว (ห้ามบันทึกแถวว่างแล้วให้ UI ตีเป็น 0%)
  CHECK (done_qty IS NOT NULL OR percent IS NOT NULL),
  FOREIGN KEY (project_id, org_id)
    REFERENCES just_me_projects(id, org_id) ON DELETE CASCADE
);

-- ═══════════════════════════════════════════════════════════════════════════
-- 3) ดัชนี
-- ═══════════════════════════════════════════════════════════════════════════
CREATE INDEX IF NOT EXISTS just_me_work_categories_org_idx    ON just_me_work_categories(org_id, sort_order);
CREATE INDEX IF NOT EXISTS just_me_projects_org_status_idx    ON just_me_projects(org_id, status);
CREATE INDEX IF NOT EXISTS just_me_projects_manager_idx       ON just_me_projects(org_id, manager_id);
CREATE INDEX IF NOT EXISTS just_me_project_files_project_idx  ON just_me_project_files(project_id, created_at DESC);
CREATE INDEX IF NOT EXISTS just_me_project_files_org_idx      ON just_me_project_files(org_id);
CREATE INDEX IF NOT EXISTS just_me_price_book_org_active_idx  ON just_me_price_book(org_id, is_active);
CREATE INDEX IF NOT EXISTS just_me_price_book_item_idx        ON just_me_price_book(item_id);
CREATE INDEX IF NOT EXISTS just_me_boqs_project_idx           ON just_me_boqs(project_id, revision_no DESC);
CREATE INDEX IF NOT EXISTS just_me_boqs_org_status_idx        ON just_me_boqs(org_id, status);
CREATE INDEX IF NOT EXISTS just_me_boq_items_boq_idx          ON just_me_boq_items(boq_id, sort_order);
CREATE INDEX IF NOT EXISTS just_me_boq_items_org_idx          ON just_me_boq_items(org_id);
CREATE INDEX IF NOT EXISTS just_me_vendors_org_active_idx     ON just_me_vendors(org_id, is_active);
CREATE INDEX IF NOT EXISTS just_me_pr_org_status_idx          ON just_me_purchase_requests(org_id, status);
CREATE INDEX IF NOT EXISTS just_me_pr_project_idx             ON just_me_purchase_requests(project_id, created_at DESC);
CREATE INDEX IF NOT EXISTS just_me_pr_items_pr_idx            ON just_me_pr_items(pr_id, sort_order);
CREATE INDEX IF NOT EXISTS just_me_pr_items_boq_item_idx      ON just_me_pr_items(boq_item_id);
CREATE INDEX IF NOT EXISTS just_me_pr_items_org_idx           ON just_me_pr_items(org_id);
CREATE INDEX IF NOT EXISTS just_me_vendor_quotes_pr_idx       ON just_me_vendor_quotes(pr_id, status);
CREATE INDEX IF NOT EXISTS just_me_vendor_quotes_org_idx      ON just_me_vendor_quotes(org_id);
CREATE INDEX IF NOT EXISTS just_me_vendor_quote_items_quote_idx ON just_me_vendor_quote_items(quote_id);
CREATE INDEX IF NOT EXISTS just_me_vendor_quote_items_org_idx   ON just_me_vendor_quote_items(org_id);
CREATE INDEX IF NOT EXISTS just_me_project_costs_project_idx  ON just_me_project_costs(project_id, cost_date DESC);
CREATE INDEX IF NOT EXISTS just_me_project_costs_org_idx      ON just_me_project_costs(org_id);
CREATE INDEX IF NOT EXISTS just_me_billings_project_idx       ON just_me_project_billings(project_id, seq);
CREATE INDEX IF NOT EXISTS just_me_billings_org_status_idx    ON just_me_project_billings(org_id, status);
CREATE INDEX IF NOT EXISTS just_me_progress_project_idx       ON just_me_project_progress(project_id, progress_date DESC);
CREATE INDEX IF NOT EXISTS just_me_progress_boq_item_idx      ON just_me_project_progress(boq_item_id, progress_date DESC);
CREATE INDEX IF NOT EXISTS just_me_progress_org_idx           ON just_me_project_progress(org_id);

-- ═══════════════════════════════════════════════════════════════════════════
-- 4) ALTER just_me_stock_movements — ผูกการเบิก/รับของเข้ากับโครงการ (ADDITIVE ล้วน)
--    ⛔ ไม่แตะ CHECK movement_type · ไม่แตะ trigger ต้นทุน (avg_cost เพี้ยนแล้วกู้ไม่ได้)
--    FK เดี่ยว + ON DELETE SET NULL โดยตั้งใจ (ไม่ใช่ composite) — ลบโครงการแล้วประวัติคลังต้องอยู่ครบ
--    การกัน "อ้าง project ข้าม org" ทำที่ API layer (เทียบ org_id ก่อน insert)
-- ═══════════════════════════════════════════════════════════════════════════
ALTER TABLE just_me_stock_movements
  ADD COLUMN IF NOT EXISTS project_id          uuid REFERENCES just_me_projects(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS boq_item_id         uuid REFERENCES just_me_boq_items(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS purchase_request_id uuid REFERENCES just_me_purchase_requests(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS just_me_stock_movements_project_idx
  ON just_me_stock_movements(project_id, created_at DESC);
CREATE INDEX IF NOT EXISTS just_me_stock_movements_pr_idx
  ON just_me_stock_movements(purchase_request_id);
CREATE INDEX IF NOT EXISTS just_me_stock_movements_boq_item_idx
  ON just_me_stock_movements(boq_item_id);

-- ═══════════════════════════════════════════════════════════════════════════
-- 5) RLS ตารางใหม่
--    - SELECT กลุ่ม "ต้นทุนอ่อนไหว" : is_org_member AND just_me_has_cost_access
--    - SELECT กลุ่มทั่วไป            : is_org_member
--    - เขียน (ทุกตาราง)              : is_org_member AND just_me_has_cost_access  (= owner|manager)
--    ⛔ ห้าม FOR ALL — permissive policy OR กัน จะทำให้ _write เปิดช่องอ่านย้อนกลับ (LESSONS 2026-07-29)
-- ═══════════════════════════════════════════════════════════════════════════
DO $rls$
DECLARE
  t          text;
  -- ตารางที่มีคอลัมน์ต้นทุน/กำไรปนอยู่ → อ่านตรงได้เฉพาะ owner|manager
  -- (just_me_projects = budget_cost/margin_pct · just_me_boqs = total_cost
  --  → viewer/ผู้รับเหมาช่วงอ่านผ่าน view `_basic` แทน)
  v_cost     text[] := ARRAY['just_me_work_categories','just_me_price_book','just_me_boq_items',
                             'just_me_purchase_requests','just_me_pr_items','just_me_vendor_quotes',
                             'just_me_vendor_quote_items','just_me_project_costs',
                             'just_me_projects','just_me_boqs'];
  v_basic    text[] := ARRAY['just_me_settings','just_me_project_files',
                             'just_me_vendors','just_me_project_billings',
                             'just_me_project_progress'];
  v_all      text[];
  v_write    text := 'is_org_member(org_id, auth.uid()) AND just_me_has_cost_access(org_id)';
  v_read     text;
BEGIN
  v_all := v_cost || v_basic;

  FOREACH t IN ARRAY v_all LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);

    -- สิทธิ์ระดับตาราง (ไม่พึ่ง default privileges ของ project) — ด่านจริงคือ policy ด้านล่าง
    EXECUTE format('REVOKE ALL ON %I FROM anon', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %I TO authenticated', t);
    EXECUTE format('GRANT ALL ON %I TO service_role', t);

    v_read := CASE WHEN t = ANY (v_cost)
                   THEN 'is_org_member(org_id, auth.uid()) AND just_me_has_cost_access(org_id)'
                   ELSE 'is_org_member(org_id, auth.uid())' END;

    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_select', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_insert', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_update', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_delete', t);

    EXECUTE format('CREATE POLICY %I ON %I FOR SELECT USING (%s)', t || '_select', t, v_read);
    EXECUTE format('CREATE POLICY %I ON %I FOR INSERT WITH CHECK (%s)', t || '_insert', t, v_write);
    EXECUTE format('CREATE POLICY %I ON %I FOR UPDATE USING (%s) WITH CHECK (%s)',
                   t || '_update', t, v_write, v_write);
    EXECUTE format('CREATE POLICY %I ON %I FOR DELETE USING (%s)', t || '_delete', t, v_write);
  END LOOP;
END
$rls$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 6) รัดของเดิม 2 ตาราง (ปิดช่อง viewer ยิง PostgREST ตรงแล้วเห็นต้นทุน)
--    policy เดิมชื่อจริง (จาก 20260529221800 / 20260730120000):
--      just_me_stock_movements_select · just_me_stock_movements_write (FOR ALL, is_org_member)
--      just_me_item_costs_select      · just_me_item_costs_write      (FOR ALL, is_org_admin)
--    → DROP _write (FOR ALL) แล้วสร้าง _insert/_update/_delete แยก **โดยคง predicate เขียนเดิมเป๊ะ**
--      (ADDITIVE: ไม่เปลี่ยนว่าใครเขียนได้ เปลี่ยนเฉพาะ "ใครอ่านได้")
--    หมายเหตุ: trigger ต้นทุนเป็น SECURITY DEFINER จึงเขียน just_me_item_costs ได้ตามเดิม
-- ═══════════════════════════════════════════════════════════════════════════
DROP POLICY IF EXISTS "just_me_item_costs_select" ON just_me_item_costs;
CREATE POLICY "just_me_item_costs_select"
  ON just_me_item_costs FOR SELECT
  USING (is_org_member(org_id, auth.uid()) AND just_me_has_cost_access(org_id));

DROP POLICY IF EXISTS "just_me_item_costs_write"  ON just_me_item_costs;
DROP POLICY IF EXISTS "just_me_item_costs_insert" ON just_me_item_costs;
DROP POLICY IF EXISTS "just_me_item_costs_update" ON just_me_item_costs;
DROP POLICY IF EXISTS "just_me_item_costs_delete" ON just_me_item_costs;

CREATE POLICY "just_me_item_costs_insert"
  ON just_me_item_costs FOR INSERT
  WITH CHECK (is_org_admin(org_id, auth.uid()));
CREATE POLICY "just_me_item_costs_update"
  ON just_me_item_costs FOR UPDATE
  USING (is_org_admin(org_id, auth.uid()))
  WITH CHECK (is_org_admin(org_id, auth.uid()));
CREATE POLICY "just_me_item_costs_delete"
  ON just_me_item_costs FOR DELETE
  USING (is_org_admin(org_id, auth.uid()));

DROP POLICY IF EXISTS "just_me_stock_movements_select" ON just_me_stock_movements;
CREATE POLICY "just_me_stock_movements_select"
  ON just_me_stock_movements FOR SELECT
  USING (is_org_member(org_id, auth.uid()) AND just_me_has_cost_access(org_id));

DROP POLICY IF EXISTS "just_me_stock_movements_write"  ON just_me_stock_movements;
DROP POLICY IF EXISTS "just_me_stock_movements_insert" ON just_me_stock_movements;
DROP POLICY IF EXISTS "just_me_stock_movements_update" ON just_me_stock_movements;
DROP POLICY IF EXISTS "just_me_stock_movements_delete" ON just_me_stock_movements;

CREATE POLICY "just_me_stock_movements_insert"
  ON just_me_stock_movements FOR INSERT
  WITH CHECK (is_org_member(org_id, auth.uid()));
CREATE POLICY "just_me_stock_movements_update"
  ON just_me_stock_movements FOR UPDATE
  USING (is_org_member(org_id, auth.uid()))
  WITH CHECK (is_org_member(org_id, auth.uid()));
CREATE POLICY "just_me_stock_movements_delete"
  ON just_me_stock_movements FOR DELETE
  USING (is_org_member(org_id, auth.uid()));

-- ═══════════════════════════════════════════════════════════════════════════
-- 7) view สำหรับ viewer — เฉพาะคอลัมน์ที่ไม่อ่อนไหว
--    security_invoker = false → view รันด้วยสิทธิ์เจ้าของ จึงข้าม RLS ของตารางฐานได้
--    ความปลอดภัยมาจาก: (ก) ไม่มีคอลัมน์ต้นทุนใน view เลย (ข) กรอง is_org_member เอง
--    (ค) GRANT แค่ SELECT (ง) REVOKE จาก public/anon
--    security_barrier = true → กัน leaky operator (predicate ของผู้ใช้ถูกประเมินก่อนตัวกรอง org)
-- ═══════════════════════════════════════════════════════════════════════════
DROP VIEW IF EXISTS just_me_boq_items_sell;
CREATE VIEW just_me_boq_items_sell
WITH (security_invoker = false, security_barrier = true) AS
SELECT id, org_id, boq_id, category_id, name, unit, qty, unit_price, amount, sort_order
FROM just_me_boq_items
WHERE is_org_member(org_id, auth.uid());

REVOKE ALL ON just_me_boq_items_sell FROM public, anon;
GRANT SELECT ON just_me_boq_items_sell TO authenticated;

COMMENT ON VIEW just_me_boq_items_sell IS
  'ทางอ่านของ viewer/ผู้รับเหมาช่วง: บรรทัด BOQ เฉพาะฝั่งราคาขาย — ห้ามเพิ่ม material/labor/overhead_unit_cost, cost_amount, margin_pct, margin_source เด็ดขาด · เป็น security definer view โดยตั้งใจ (Supabase advisor จะเตือน security_definer_view = ข้อยกเว้นที่บันทึกไว้ใน spec §4.6 ข้อ 4)';

DROP VIEW IF EXISTS just_me_stock_movements_basic;
CREATE VIEW just_me_stock_movements_basic
WITH (security_invoker = false, security_barrier = true) AS
SELECT id, org_id, item_id, movement_type, source_warehouse_id, destination_warehouse_id,
       quantity, reference_no, note, created_by, created_at,
       requested_by, requester_name,
       project_id, boq_item_id, purchase_request_id
FROM just_me_stock_movements
WHERE is_org_member(org_id, auth.uid());

REVOKE ALL ON just_me_stock_movements_basic FROM public, anon;
GRANT SELECT ON just_me_stock_movements_basic TO authenticated;

COMMENT ON VIEW just_me_stock_movements_basic IS
  'ทางอ่านของ viewer/ผู้รับเหมาช่วง: ประวัติการเคลื่อนไหวคลังแบบไม่มีต้นทุน (ตัด unit_cost/total_cost) — ห้ามเพิ่มคอลัมน์ต้นทุนเข้าไปเด็ดขาด · security definer view โดยตั้งใจ (spec §4.6)';

DROP VIEW IF EXISTS just_me_pr_items_basic;
CREATE VIEW just_me_pr_items_basic
WITH (security_invoker = false, security_barrier = true) AS
SELECT id, org_id, pr_id, name, unit, qty, received_qty
FROM just_me_pr_items
WHERE is_org_member(org_id, auth.uid());

REVOKE ALL ON just_me_pr_items_basic FROM public, anon;
GRANT SELECT ON just_me_pr_items_basic TO authenticated;

COMMENT ON VIEW just_me_pr_items_basic IS
  'ทางอ่านของ viewer/ผู้รับเหมาช่วง: บรรทัด PR เฉพาะปริมาณ/ยอดรับ (ตัด estimated_unit_cost/selected_unit_cost) — ห้ามเพิ่มคอลัมน์ต้นทุนเข้าไปเด็ดขาด · security definer view โดยตั้งใจ (spec §4.6)';

DROP VIEW IF EXISTS just_me_projects_basic;
CREATE VIEW just_me_projects_basic
WITH (security_invoker = false, security_barrier = true) AS
SELECT id, org_id, project_code, name, status, customer_name, acc_contact_id,
       site_address, latitude, longitude, manager_id, start_date, end_date,
       contract_amount, retention_pct, quotation_document_id, note,
       created_at, updated_at
FROM just_me_projects
WHERE is_org_member(org_id, auth.uid());

REVOKE ALL ON just_me_projects_basic FROM public, anon;
GRANT SELECT ON just_me_projects_basic TO authenticated;

COMMENT ON VIEW just_me_projects_basic IS
  'ทางอ่านของ viewer/ผู้รับเหมาช่วง: โครงการโดยไม่มีฝั่งต้นทุน — ห้ามเพิ่ม budget_cost, margin_pct, budget_revised_at (หรือคอลัมน์ต้นทุน/กำไรใด ๆ) เข้าไปเด็ดขาด · contract_amount เปิดได้เพราะเป็นราคาขายที่ลูกค้าก็เห็น · security definer view โดยตั้งใจ (spec §4.6)';

DROP VIEW IF EXISTS just_me_boqs_basic;
CREATE VIEW just_me_boqs_basic
WITH (security_invoker = false, security_barrier = true) AS
SELECT id, org_id, project_id, revision_no, status, title,
       approved_by, approved_at, total_amount, note, created_by, created_at
FROM just_me_boqs
WHERE is_org_member(org_id, auth.uid());

REVOKE ALL ON just_me_boqs_basic FROM public, anon;
GRANT SELECT ON just_me_boqs_basic TO authenticated;

COMMENT ON VIEW just_me_boqs_basic IS
  'ทางอ่านของ viewer/ผู้รับเหมาช่วง: หัว BOQ โดยไม่มี total_cost — ห้ามเพิ่มคอลัมน์ต้นทุนเข้าไปเด็ดขาด · total_amount เปิดได้เพราะเป็นยอดขาย · security definer view โดยตั้งใจ (spec §4.6)';

-- ═══════════════════════════════════════════════════════════════════════════
-- 8) trigger invariant
--    ⚠️ ทุกตัวเป็น BEFORE UPDATE/DELETE **ทุกคอลัมน์** ไม่ใช่ `UPDATE OF <col>`
--       (UPDATE OF = ด่านที่เลี่ยงได้ด้วยการไม่แตะคอลัมน์นั้น — LESSONS 2026-07-29)
--    ⚠️ ทุกตัวปล่อยผ่านเมื่อ "แถวแม่ไม่มีแล้ว" = กำลังถูกลบแบบ cascade (ลบโครงการ/องค์กร)
--       ไม่งั้น trigger จะบล็อกการลบ org ทั้งก้อน
-- ═══════════════════════════════════════════════════════════════════════════

-- 8.1 BOQ ที่อนุมัติแล้ว freeze — ทางออกเดียวคือถูกแทนที่ด้วย revision ใหม่ (approved → superseded)
CREATE OR REPLACE FUNCTION just_me_boq_freeze()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF NOT EXISTS (SELECT 1 FROM just_me_projects p WHERE p.id = OLD.project_id) THEN
      RETURN OLD;  -- cascade จากการลบโครงการ
    END IF;
    IF OLD.status IN ('approved','superseded') THEN
      RAISE EXCEPTION 'ลบ BOQ ที่เคยอนุมัติแล้วไม่ได้ (revision %) — เก็บไว้เป็นประวัติ', OLD.revision_no
        USING ERRCODE = 'insufficient_privilege';
    END IF;
    RETURN OLD;
  END IF;

  IF OLD.status = 'approved' THEN
    IF NEW.status = 'superseded'
       AND NEW.project_id   IS NOT DISTINCT FROM OLD.project_id
       AND NEW.org_id       IS NOT DISTINCT FROM OLD.org_id
       AND NEW.revision_no  IS NOT DISTINCT FROM OLD.revision_no
       AND NEW.total_cost   IS NOT DISTINCT FROM OLD.total_cost
       AND NEW.total_amount IS NOT DISTINCT FROM OLD.total_amount
       AND NEW.approved_by  IS NOT DISTINCT FROM OLD.approved_by
       AND NEW.approved_at  IS NOT DISTINCT FROM OLD.approved_at
    THEN
      RETURN NEW;
    END IF;
    RAISE EXCEPTION 'BOQ ที่อนุมัติแล้วแก้ไม่ได้ (revision %) — ให้สร้าง revision ใหม่แทน', OLD.revision_no
      USING ERRCODE = 'insufficient_privilege';
  ELSIF OLD.status = 'superseded' THEN
    RAISE EXCEPTION 'BOQ ที่ถูกแทนที่แล้วแก้ไม่ได้ (revision %)', OLD.revision_no
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_just_me_boq_freeze ON just_me_boqs;
CREATE TRIGGER trg_just_me_boq_freeze
  BEFORE UPDATE OR DELETE ON just_me_boqs
  FOR EACH ROW EXECUTE FUNCTION just_me_boq_freeze();

-- 8.2 บรรทัด BOQ แก้/เพิ่ม/ลบได้เฉพาะตอนฉบับนั้นเป็น draft
CREATE OR REPLACE FUNCTION just_me_boq_item_freeze()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_status text;
BEGIN
  IF TG_OP <> 'INSERT' THEN
    SELECT status INTO v_status FROM just_me_boqs WHERE id = OLD.boq_id;
    IF v_status IS NULL THEN
      -- cascade จากการลบ BOQ/โครงการ
      IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
      RETURN NEW;
    END IF;
    IF v_status <> 'draft' THEN
      RAISE EXCEPTION 'บรรทัด BOQ แก้ไม่ได้เพราะฉบับนี้สถานะ % — ให้สร้าง revision ใหม่', v_status
        USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;

  IF TG_OP <> 'DELETE' THEN
    SELECT status INTO v_status FROM just_me_boqs WHERE id = NEW.boq_id;
    IF v_status IS NOT NULL AND v_status <> 'draft' THEN
      RAISE EXCEPTION 'เพิ่ม/ย้ายบรรทัดเข้า BOQ ที่สถานะ % ไม่ได้', v_status
        USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;

  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_just_me_boq_item_freeze ON just_me_boq_items;
CREATE TRIGGER trg_just_me_boq_item_freeze
  BEFORE INSERT OR UPDATE OR DELETE ON just_me_boq_items
  FOR EACH ROW EXECUTE FUNCTION just_me_boq_item_freeze();

-- 8.3 บรรทัด PR: ตั้งแต่ approved ขึ้นไปแก้ไม่ได้
--     ยกเว้น received_qty (ตอนรับของ) และ selected_unit_cost (ตอนเลือกผู้ขาย) ซึ่งเป็น flow ปกติ
CREATE OR REPLACE FUNCTION just_me_pr_item_freeze()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_status text;
BEGIN
  IF TG_OP = 'DELETE' THEN
    SELECT status INTO v_status FROM just_me_purchase_requests WHERE id = OLD.pr_id;
    IF v_status IS NULL THEN RETURN OLD; END IF;               -- cascade
    IF v_status NOT IN ('draft','submitted') THEN
      RAISE EXCEPTION 'ลบบรรทัดของใบขอซื้อที่สถานะ % ไม่ได้ — ให้ยกเลิกแล้วออกใบใหม่', v_status
        USING ERRCODE = 'insufficient_privilege';
    END IF;
    RETURN OLD;
  END IF;

  IF TG_OP = 'INSERT' THEN
    SELECT status INTO v_status FROM just_me_purchase_requests WHERE id = NEW.pr_id;
    IF v_status IS NOT NULL AND v_status NOT IN ('draft','submitted') THEN
      RAISE EXCEPTION 'เพิ่มบรรทัดเข้าใบขอซื้อที่สถานะ % ไม่ได้', v_status
        USING ERRCODE = 'insufficient_privilege';
    END IF;
    RETURN NEW;
  END IF;

  SELECT status INTO v_status FROM just_me_purchase_requests WHERE id = OLD.pr_id;
  IF v_status IS NULL OR v_status IN ('draft','submitted') THEN
    RETURN NEW;
  END IF;

  IF NEW.pr_id               IS NOT DISTINCT FROM OLD.pr_id
     AND NEW.org_id          IS NOT DISTINCT FROM OLD.org_id
     AND NEW.boq_item_id     IS NOT DISTINCT FROM OLD.boq_item_id
     AND NEW.item_id         IS NOT DISTINCT FROM OLD.item_id
     AND NEW.name            IS NOT DISTINCT FROM OLD.name
     AND NEW.unit            IS NOT DISTINCT FROM OLD.unit
     AND NEW.qty             IS NOT DISTINCT FROM OLD.qty
     AND NEW.estimated_unit_cost IS NOT DISTINCT FROM OLD.estimated_unit_cost
     AND NEW.sort_order      IS NOT DISTINCT FROM OLD.sort_order
  THEN
    RETURN NEW;  -- แก้ได้เฉพาะ received_qty / selected_unit_cost
  END IF;

  RAISE EXCEPTION 'บรรทัดของใบขอซื้อที่สถานะ % แก้ไม่ได้ (แก้ได้เฉพาะยอดรับของ/ราคาที่เลือก)', v_status
    USING ERRCODE = 'insufficient_privilege';
END;
$$;

DROP TRIGGER IF EXISTS trg_just_me_pr_item_freeze ON just_me_pr_items;
CREATE TRIGGER trg_just_me_pr_item_freeze
  BEFORE INSERT OR UPDATE OR DELETE ON just_me_pr_items
  FOR EACH ROW EXECUTE FUNCTION just_me_pr_item_freeze();

-- 8.4 งวดงานที่วางบิลแล้ว ห้ามแก้ยอด (เอกสารภาษีออกไปแล้ว)
CREATE OR REPLACE FUNCTION just_me_billing_amount_lock()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF OLD.status IN ('invoiced','paid')
     AND (NEW.amount IS DISTINCT FROM OLD.amount
          OR NEW.retention_amount IS DISTINCT FROM OLD.retention_amount)
  THEN
    RAISE EXCEPTION 'งวดที่วางบิลแล้วแก้ยอดไม่ได้ (งวดที่ %) — ต้องออกใบลดหนี้/เพิ่มหนี้ที่ระบบบัญชี', OLD.seq
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_just_me_billing_amount_lock ON just_me_project_billings;
CREATE TRIGGER trg_just_me_billing_amount_lock
  BEFORE UPDATE ON just_me_project_billings
  FOR EACH ROW EXECUTE FUNCTION just_me_billing_amount_lock();

-- 8.5 updated_at อัปเดตทุก UPDATE (ไม่ให้ client เขียนค่าเอง)
CREATE OR REPLACE FUNCTION just_me_touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_just_me_projects_touch ON just_me_projects;
CREATE TRIGGER trg_just_me_projects_touch
  BEFORE UPDATE ON just_me_projects
  FOR EACH ROW EXECUTE FUNCTION just_me_touch_updated_at();

DROP TRIGGER IF EXISTS trg_just_me_price_book_touch ON just_me_price_book;
CREATE TRIGGER trg_just_me_price_book_touch
  BEFORE UPDATE ON just_me_price_book
  FOR EACH ROW EXECUTE FUNCTION just_me_touch_updated_at();

DROP TRIGGER IF EXISTS trg_just_me_settings_touch ON just_me_settings;
CREATE TRIGGER trg_just_me_settings_touch
  BEFORE UPDATE ON just_me_settings
  FOR EACH ROW EXECUTE FUNCTION just_me_touch_updated_at();

-- ═══════════════════════════════════════════════════════════════════════════
-- 9) bucket private `just_me_files` (แบบ/รูปสำรวจ/สัญญา/ไฟล์ใบเสนอราคาผู้ขาย)
--    path convention: {org_id}/{project_id}/{uuid}.{ext}  → foldername[1] = org_id
--    ดาวน์โหลดจริงออก signed URL ≤60 วิ จาก API — policy นี้เป็นชั้นสอง
-- ═══════════════════════════════════════════════════════════════════════════
INSERT INTO storage.buckets (id, name, public)
VALUES ('just_me_files', 'just_me_files', false)
ON CONFLICT (id) DO NOTHING;

-- safe cast: path segment แรกที่ไม่ใช่ uuid ต้อง "ไม่ผ่าน" ไม่ใช่ "ระเบิด" (กัน 22P02 ทำ query ทั้งชุดพัง)
CREATE OR REPLACE FUNCTION public.just_me_org_path(p_segment text, p_writer boolean)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  BEGIN
    v_id := p_segment::uuid;
  EXCEPTION WHEN others THEN
    RETURN false;
  END;
  RETURN CASE
           WHEN p_writer THEN is_org_member(v_id, auth.uid()) AND just_me_has_cost_access(v_id)
           ELSE is_org_member(v_id, auth.uid())
         END;
END;
$$;

REVOKE ALL ON FUNCTION public.just_me_org_path(text, boolean) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.just_me_org_path(text, boolean) TO authenticated;

DROP POLICY IF EXISTS just_me_files_read   ON storage.objects;
DROP POLICY IF EXISTS just_me_files_write  ON storage.objects;
DROP POLICY IF EXISTS just_me_files_insert ON storage.objects;
DROP POLICY IF EXISTS just_me_files_update ON storage.objects;
DROP POLICY IF EXISTS just_me_files_delete ON storage.objects;

CREATE POLICY just_me_files_read ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'just_me_files'
         AND public.just_me_org_path((storage.foldername(name))[1], false));

CREATE POLICY just_me_files_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'just_me_files'
              AND public.just_me_org_path((storage.foldername(name))[1], true));

CREATE POLICY just_me_files_update ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'just_me_files'
         AND public.just_me_org_path((storage.foldername(name))[1], true))
  WITH CHECK (bucket_id = 'just_me_files'
              AND public.just_me_org_path((storage.foldername(name))[1], true));

CREATE POLICY just_me_files_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'just_me_files'
         AND public.just_me_org_path((storage.foldername(name))[1], true));
