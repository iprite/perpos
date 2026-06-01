-- B2G Orders table — ระบบติดตามคำสั่งซื้อ B2G (Business-to-Government)
-- Created at: 2026-05-30

CREATE TABLE IF NOT EXISTS b2g_orders (
  id                      uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                  uuid        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  created_by              uuid        NOT NULL REFERENCES profiles(id),

  -- ข้อมูลพื้นฐาน
  seq_no                  int,                          -- ลำดับ No.
  customer_name           text        NOT NULL,         -- ชื่อลูกค้า (หน่วยงานราชการ)
  department              text,                         -- กอง/หน่วยงาน/แผนก
  company                 text,                         -- บริษัทรับงาน: '89 Global Work' | 'P2P Supply'
  qt_reference            text,                         -- QT Reference เลขที่ใบเสนอราคา
  product_description     text,                         -- รายการสินค้า/บริการ
  start_date              date,                         -- วันที่เริ่มงาน

  -- การเงิน (Financial)
  price_incl_vat          numeric(15,4),                -- ยอดเสนอราคา (รวม VAT 7%)
  price_excl_vat          numeric(15,4),                -- ยอดเสนอก่อน VAT
  withholding_tax         numeric(15,4),                -- หัก ณ ที่จ่าย 1%
  net_receivable          numeric(15,4),                -- ยอดสุทธิที่รับจากลูกค้า
  cost_price              numeric(15,4),                -- ราคาทุน
  gross_profit            numeric(15,4),                -- กำไรขั้นต้น
  security_deposit        numeric(15,4),                -- เงินประกันสัญญา

  -- การโอนเงินซื้อของ
  transfer_date           date,                         -- วันที่โอนเงินให้ซื้อของ
  transfer_round1         date,                         -- โอนรอบที่ 1
  transfer_round2         date,                         -- โอนรอบที่ 2

  -- การแบ่งปันรายได้ภายใน (Internal Distribution)
  customer_change         numeric(15,4),                -- ทอนลูกค้า (10% ของยอดเสนอ)
  customer_change_slip    text,                         -- Slip สถานะ ('Done' | '-' | NULL)
  petty_cash              numeric(15,4),                -- Petty Cash (5% ของยอดเสนอ)
  petty_cash_slip         text,                         -- Slip สถานะ PettyCash
  transport_buy           numeric(15,4),                -- ค่าขนส่ง ซื้อ (THB)
  transport_sell          numeric(15,4),                -- ค่าขนส่ง ขาย (THB)
  transport_other         numeric(15,4),                -- ค่าขนส่ง อื่นๆ (THB)
  operate_89              numeric(15,4),                -- Operate 89 (10% ของยอดเสนอ)

  -- ยอดสุทธิ 89 (89 Company Net Summary)
  total_cost_89           numeric(15,4),                -- ทุน 89 = ทุนรวมทุกรายการ
  net_profit_89           numeric(15,4),                -- กำไร 89
  profit_pct              numeric(10,6),                -- % กำไร

  -- Timeline การดำเนินงาน
  contract_date           date,                         -- วันที่เซ็นสัญญา
  payment_order_date      date,                         -- วันที่ชำระเงิน/สั่งของ
  delivery_date           date,                         -- วันที่ส่งของ
  receipt_date            date,                         -- วันที่รับเงิน
  duration_days           int,                          -- ระยะเวลา (วัน จากสัญญา → รับเงิน)

  -- สถานะและการติดตาม
  job_status              text,                         -- สถานะงาน: 'รับเช็คแล้ว' | 'ส่งสินค้าแล้ว รอรับเช็ค' | 'เซ็นสัญญาแล้ว รอส่งของ'
  finance_payment_date    date,                         -- วันที่ Finance ชำระ/จ่าย
  support_payment_date    date,                         -- วันที่จ่าย Support
  commission_payment_date date,                         -- วันที่จ่ายค่าคอม
  notes                   text,                         -- หมายเหตุ

  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now()
);

-- ▶ RLS
ALTER TABLE b2g_orders ENABLE ROW LEVEL SECURITY;

-- สมาชิกองค์กรดูข้อมูลได้ทุกคน
CREATE POLICY "b2g_orders_select"
  ON b2g_orders FOR SELECT
  USING (is_org_member(org_id, auth.uid()));

-- เขียนข้อมูลผ่าน API layer (service role บายพาส RLS)
CREATE POLICY "b2g_orders_write"
  ON b2g_orders FOR ALL
  USING (is_org_admin(org_id, auth.uid()));

-- ▶ Index สำหรับ query performance
CREATE INDEX IF NOT EXISTS b2g_orders_org_id_idx       ON b2g_orders(org_id);
CREATE INDEX IF NOT EXISTS b2g_orders_org_status_idx   ON b2g_orders(org_id, job_status);
CREATE INDEX IF NOT EXISTS b2g_orders_org_company_idx  ON b2g_orders(org_id, company);
CREATE INDEX IF NOT EXISTS b2g_orders_qt_ref_idx       ON b2g_orders(qt_reference);

-- ▶ Auto-update updated_at
CREATE OR REPLACE FUNCTION fn_set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'b2g_orders_updated_at'
  ) THEN
    CREATE TRIGGER b2g_orders_updated_at
      BEFORE UPDATE ON b2g_orders
      FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();
  END IF;
END;
$$;
