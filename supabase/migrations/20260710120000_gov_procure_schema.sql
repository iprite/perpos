-- ============================================================================
-- gov_procure — จัดซื้อครุภัณฑ์ภาครัฐ (Government Procurement Pipeline)
-- Schema DDL: gov_procure_orders + gov_procure_attachments + gov_procure_settings
-- Created at: 2026-07-10
--
-- Contract v1 (specs/gov_procure.md §3, LOCKED). Upgrade & replace ของ b2g (Q1=ii).
-- - ห้ามมีคอลัมน์ duration_days (N1: pure derived = receipt_date − contract_date)
-- - stage = แกน pipeline (enum 6 ค่า) + stage_manual_override
-- - commission แยก 5 field (AH–AL)
-- - RLS: select = is_org_member, write = is_org_admin (org isolation; field-level
--   finance-lock ต่อ role บังคับที่ API layer ตาม Q4 — ไม่ใช่ที่ RLS)
-- - ไม่ DROP b2g_orders (rollback safety §8) — data migrate อยู่ไฟล์ถัดไป
-- ============================================================================

-- ---------------------------------------------------------------------------
-- fn_set_updated_at — reuse ตัวเดิม (นิยามซ้ำแบบ idempotent, เผื่อรัน standalone)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- ===========================================================================
-- 1) gov_procure_orders — entity หลัก (order/งานจัดซื้อ)
-- ===========================================================================
CREATE TABLE IF NOT EXISTS gov_procure_orders (
  -- กลุ่ม A — ข้อมูลพื้นฐาน
  id                       uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                   uuid        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  created_by               uuid        NOT NULL REFERENCES profiles(id),
  seq_no                   int,                          -- ลำดับ No. (reset ต่อ batch/เดือน)
  customer_name            text        NOT NULL,         -- หน่วยงานภาครัฐ (เทศบาล/อบต.)
  department               text,                         -- กอง/หน่วยงาน (free-text + autocomplete)
  company                  text,                         -- '89 Global Work' | 'P2P Supply' (split KPI)
  qt_reference             text,                         -- เลขที่ QT (QT2026020001)
  product_description      text,                         -- รายการครุภัณฑ์/พัสดุ
  start_date               date,                         -- วันเริ่มงาน/วันที่ QT

  -- กลุ่ม B — การเงิน
  price_incl_vat           numeric(15,4),                -- ยอดเสนอราคา (รวม VAT)
  price_excl_vat           numeric(15,4),                -- ยอดก่อน VAT
  withholding_tax          numeric(15,4),                -- หัก ณ ที่จ่าย 1% (ภาครัฐหัก)
  net_receivable           numeric(15,4),                -- ยอดสุทธิรับจากภาครัฐ
  cost_price               numeric(15,4),                -- ราคาทุน (ต้นทุนซื้อของ)
  gross_profit             numeric(15,4),                -- กำไรขั้นต้น (stored + auto-suggest)
  security_deposit         numeric(15,4),                -- เงินประกันสัญญา

  -- กลุ่ม C — ทุนหมุนเวียน (เงินโอนซื้อของ)
  transfer_date            date,                         -- วันโอนเงินให้ไปซื้อของ
  transfer_round1          date,                         -- โอนรอบที่ 1
  transfer_round2          date,                         -- โอนรอบที่ 2

  -- กลุ่ม D — แบ่งรายได้/ต้นทุนภายใน 89
  customer_change          numeric(15,4),                -- ทอนลูกค้า (~10%)
  customer_change_slip     text,                         -- สถานะสลิป ('Done' | '-' | NULL)
  petty_cash               numeric(15,4),                -- petty cash (~5%)
  petty_cash_slip          text,                         -- สถานะสลิป
  transport_buy            numeric(15,4),                -- ค่าขนส่ง ซื้อ
  transport_sell           numeric(15,4),                -- ค่าขนส่ง ขาย
  transport_other          numeric(15,4),                -- ค่าขนส่ง อื่นๆ
  operate_89               numeric(15,4),                -- ค่าดำเนินการ 89 (~10%)
  total_cost_89            numeric(15,4),                -- ทุนรวม 89
  net_profit_89            numeric(15,4),                -- กำไรสุทธิ 89
  profit_pct               numeric(10,6),                -- % กำไร

  -- กลุ่ม E — คอมมิชชั่นทีมขาย (AH–AL)
  commission_base_profit   numeric(15,4),                -- กำไรสุทธิฐานคำนวณคอม (AH)
  commission_amount        numeric(15,4),                -- commission team (AI)
  commission_wht           numeric(15,4),                -- หัก ณ ที่จ่าย 3% ของคอม (AJ)
  commission_net_payable   numeric(15,4),                -- คงเหลือยอดโอนคอม (AK)
  commission_slip          text,                         -- สถานะสลิปคอม (AL)

  -- กลุ่ม F — Milestone timeline (แกน pipeline)
  contract_date            date,                         -- วันเซ็นสัญญา   (→ contracted)
  payment_order_date       date,                         -- วันสั่งซื้อ/ชำระ (→ procuring)
  delivery_date            date,                         -- วันส่งมอบ       (→ delivered, เริ่มนับ aging)
  receipt_date             date,                         -- วันรับเช็ค      (→ paid)
  finance_payment_date     date,                         -- วัน finance จ่าย/support (AX)
  support_payment_date     date,                         -- วันจ่าย support (AY)
  commission_payment_date  date,                         -- วันจ่ายคอม (AZ) — ไม่ใช่เงื่อนไข closed

  -- กลุ่ม G — สถานะ/หมายเหตุ
  stage                    text        NOT NULL DEFAULT 'quotation',
  stage_manual_override    boolean     NOT NULL DEFAULT false,
  notes                    text,                         -- หมายเหตุ (BA)

  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now(),

  -- NOTE: ไม่มี duration_days (N1: derived = receipt_date − contract_date, คำนวณตอนแสดง)
  CONSTRAINT gov_procure_orders_stage_chk
    CHECK (stage IN ('quotation','contracted','procuring','delivered','paid','closed')),
  CONSTRAINT gov_procure_orders_company_chk
    CHECK (company IS NULL OR company IN ('89 Global Work','P2P Supply'))
);

-- ▶ RLS
ALTER TABLE gov_procure_orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "gov_procure_orders_select"
  ON gov_procure_orders FOR SELECT
  USING (is_org_member(org_id, auth.uid()));

CREATE POLICY "gov_procure_orders_write"
  ON gov_procure_orders FOR ALL
  USING (is_org_admin(org_id, auth.uid()));

-- ▶ Index (tenant isolation + query)
CREATE INDEX IF NOT EXISTS gov_procure_orders_org_id_idx    ON gov_procure_orders(org_id);
CREATE INDEX IF NOT EXISTS gov_procure_orders_org_stage_idx ON gov_procure_orders(org_id, stage);
CREATE INDEX IF NOT EXISTS gov_procure_orders_org_company_idx ON gov_procure_orders(org_id, company);
CREATE INDEX IF NOT EXISTS gov_procure_orders_qt_ref_idx    ON gov_procure_orders(qt_reference);

-- ▶ updated_at trigger
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'gov_procure_orders_updated_at') THEN
    CREATE TRIGGER gov_procure_orders_updated_at
      BEFORE UPDATE ON gov_procure_orders
      FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();
  END IF;
END;
$$;

-- ===========================================================================
-- 2) gov_procure_attachments — สลิป/รูปเช็ค (1 order : N ไฟล์)
-- ===========================================================================
CREATE TABLE IF NOT EXISTS gov_procure_attachments (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id       uuid        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  order_id     uuid        NOT NULL REFERENCES gov_procure_orders(id) ON DELETE CASCADE,
  kind         text        NOT NULL,   -- customer_change_slip|petty_cash_slip|commission_slip|cheque_photo|other
  file_path    text        NOT NULL,   -- path ใน storage bucket 'gov-procure'
  file_name    text,                   -- ชื่อไฟล์เดิม
  uploaded_by  uuid        NOT NULL REFERENCES profiles(id),
  created_at   timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT gov_procure_attachments_kind_chk
    CHECK (kind IN ('customer_change_slip','petty_cash_slip','commission_slip','cheque_photo','other'))
);

-- ▶ RLS
ALTER TABLE gov_procure_attachments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "gov_procure_attachments_select"
  ON gov_procure_attachments FOR SELECT
  USING (is_org_member(org_id, auth.uid()));

CREATE POLICY "gov_procure_attachments_write"
  ON gov_procure_attachments FOR ALL
  USING (is_org_admin(org_id, auth.uid()));

-- ▶ Index
CREATE INDEX IF NOT EXISTS gov_procure_attachments_order_idx  ON gov_procure_attachments(order_id);
CREATE INDEX IF NOT EXISTS gov_procure_attachments_org_id_idx ON gov_procure_attachments(org_id);

-- ===========================================================================
-- 3) gov_procure_settings — ตั้งค่าต่อ org (1 row/org, PK = org_id)
-- ===========================================================================
CREATE TABLE IF NOT EXISTS gov_procure_settings (
  org_id                uuid        PRIMARY KEY REFERENCES organizations(id) ON DELETE CASCADE,
  sla_threshold         int         NOT NULL DEFAULT 30,   -- เกณฑ์ overdue (วัน)
  pct_customer_change   numeric(5,2) DEFAULT 10,           -- % ทอนลูกค้า (ช่วยกรอก)
  pct_petty             numeric(5,2) DEFAULT 5,            -- % petty cash
  pct_operate           numeric(5,2) DEFAULT 10,           -- % ค่าดำเนินการ 89
  line_alert_enabled    boolean     NOT NULL DEFAULT true, -- เปิด/ปิด LINE alert รวม (T1)
  line_recipients       jsonb,                             -- ผู้รับ (profile_id[] / role) — default owner+manager
  line_weekly_enabled   boolean     NOT NULL DEFAULT true, -- T2 รายงานพอร์ตรายสัปดาห์
  line_event_paid       boolean     NOT NULL DEFAULT true, -- T3 แจ้ง stage=paid
  line_event_delivered  boolean     NOT NULL DEFAULT false,-- T3 แจ้ง stage=delivered
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

-- ▶ RLS
ALTER TABLE gov_procure_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "gov_procure_settings_select"
  ON gov_procure_settings FOR SELECT
  USING (is_org_member(org_id, auth.uid()));

CREATE POLICY "gov_procure_settings_write"
  ON gov_procure_settings FOR ALL
  USING (is_org_admin(org_id, auth.uid()));

-- ▶ updated_at trigger
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'gov_procure_settings_updated_at') THEN
    CREATE TRIGGER gov_procure_settings_updated_at
      BEFORE UPDATE ON gov_procure_settings
      FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();
  END IF;
END;
$$;
