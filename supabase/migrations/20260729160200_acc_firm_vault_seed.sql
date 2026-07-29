-- Seed taxonomy เอกสาร (spec §3) + retention default (spec §5)
-- retention_years: SRC=7 · BOK/TAX=10 · REG/ENG=0 (ถาวร) · ADM=5
-- is_sensitive = มีข้อมูลส่วนบุคคล/อ่อนไหว → ดาวน์โหลดได้เฉพาะ role owner (บังคับที่ API)

INSERT INTO acc_firm_vault_categories
  (code, group_code, name_th, name_en, frequency, retention_years, is_sensitive, required_by_default, sort_order)
VALUES
  -- ── REG · ทะเบียน & KYC (ถาวร) ────────────────────────────────────────────
  ('REG-01', 'REG', 'หนังสือรับรองบริษัท',              'Company affidavit',        'once',    0, false, true,  10),
  ('REG-02', 'REG', 'บอจ.2 / บอจ.3 / บอจ.5',            'DBD forms',                'once',    0, false, true,  11),
  ('REG-03', 'REG', 'ภ.พ.20 (ทะเบียนภาษีมูลค่าเพิ่ม)',   'VAT registration',         'once',    0, false, false, 12),
  ('REG-04', 'REG', 'ใบอนุญาตเฉพาะธุรกิจ',              'Business licenses',        'once',    0, false, false, 13),
  ('REG-05', 'REG', 'ผังผู้ถือหุ้น / บัญชีรายชื่อผู้ถือหุ้น', 'Shareholder structure', 'once',   0, true,  false, 14),
  ('REG-06', 'REG', 'สำเนาบัตรประชาชนกรรมการ',          'Director ID copies',       'once',    0, true,  false, 15),

  -- ── ENG · สัญญา & กฎหมาย (ถาวร) ──────────────────────────────────────────
  ('ENG-01', 'ENG', 'สัญญาจ้างทำบัญชี',                 'Engagement letter',        'once',    0, false, true,  20),
  ('ENG-02', 'ENG', 'หนังสือมอบอำนาจ',                  'Power of attorney',        'once',    0, false, false, 21),
  ('ENG-03', 'ENG', 'DPA (ข้อตกลงประมวลผลข้อมูล)',      'Data processing agreement','once',    0, false, true,  22),
  ('ENG-04', 'ENG', 'NDA',                              'Non-disclosure agreement', 'once',    0, false, false, 23),
  ('ENG-05', 'ENG', 'หนังสือแจ้งเป็นผู้ทำบัญชี (e-Accountant)', 'e-Accountant notice','once',   0, false, true,  24),
  ('ENG-06', 'ENG', 'หนังสือรับรองของผู้บริหาร',         'Representation letter',    'yearly',  0, false, false, 25),

  -- ── SRC · เอกสารประกอบการลงบัญชี (7 ปี, รายเดือน) ─────────────────────────
  ('SRC-01', 'SRC', 'ใบกำกับภาษีขาย',                   'Output tax invoices',      'monthly', 7, false, true,  30),
  ('SRC-02', 'SRC', 'ใบกำกับภาษีซื้อ',                  'Input tax invoices',       'monthly', 7, false, true,  31),
  ('SRC-03', 'SRC', 'ใบเสร็จรับเงิน',                   'Receipts',                 'monthly', 7, false, true,  32),
  ('SRC-04', 'SRC', 'ใบแจ้งหนี้',                       'Invoices',                 'monthly', 7, false, false, 33),
  ('SRC-05', 'SRC', 'ใบสำคัญรับ-จ่าย (voucher)',        'Vouchers',                 'monthly', 7, false, false, 34),
  ('SRC-06', 'SRC', 'Statement ธนาคาร',                 'Bank statements',          'monthly', 7, false, true,  35),
  ('SRC-07', 'SRC', 'เอกสารเงินเดือน (payroll)',        'Payroll documents',        'monthly', 7, true,  false, 36),

  -- ── BOK · สมุดบัญชี & งบการเงิน (10 ปี, รายปี) ────────────────────────────
  ('BOK-01', 'BOK', 'สมุดรายวัน',                       'Journals',                 'yearly', 10, false, true,  40),
  ('BOK-02', 'BOK', 'บัญชีแยกประเภท',                   'General ledger',           'yearly', 10, false, true,  41),
  ('BOK-03', 'BOK', 'งบทดลอง',                          'Trial balance',            'yearly', 10, false, true,  42),
  ('BOK-04', 'BOK', 'กระดาษทำการ (working paper)',      'Working papers',           'yearly', 10, false, false, 43),
  ('BOK-05', 'BOK', 'งบการเงิน',                        'Financial statements',     'yearly', 10, false, true,  44),
  ('BOK-06', 'BOK', 'สบช.3',                            'SorBorChor 3',             'yearly', 10, false, true,  45),

  -- ── TAX · แบบภาษี & ประกันสังคม (10 ปี) ──────────────────────────────────
  ('TAX-01', 'TAX', 'ภ.ง.ด.1',                          'PND 1',                    'monthly',10, true,  false, 50),
  ('TAX-02', 'TAX', 'ภ.ง.ด.3',                          'PND 3',                    'monthly',10, false, false, 51),
  ('TAX-03', 'TAX', 'ภ.ง.ด.53',                         'PND 53',                   'monthly',10, false, false, 52),
  ('TAX-04', 'TAX', 'ภ.ง.ด.54',                         'PND 54',                   'monthly',10, false, false, 53),
  ('TAX-05', 'TAX', 'ภ.พ.30',                           'PP 30',                    'monthly',10, false, false, 54),
  ('TAX-06', 'TAX', 'ภ.พ.36',                           'PP 36',                    'monthly',10, false, false, 55),
  ('TAX-07', 'TAX', 'สปส.1-10',                         'SSO 1-10',                 'monthly',10, true,  false, 56),
  ('TAX-08', 'TAX', 'ภ.ง.ด.51',                         'PND 51',                   'yearly', 10, false, false, 57),
  ('TAX-09', 'TAX', 'ภ.ง.ด.50',                         'PND 50',                   'yearly', 10, false, true,  58),
  ('TAX-10', 'TAX', 'หนังสือรับรองหัก ณ ที่จ่าย (50 ทวิ)','WHT certificates',        'monthly',10, false, false, 59),
  ('TAX-11', 'TAX', 'TP Disclosure Form',               'TP disclosure form',       'yearly', 10, false, false, 60),

  -- ── ADM · งานสำนักงาน (5 ปี) ─────────────────────────────────────────────
  ('ADM-01', 'ADM', 'ใบรับ-คืนเอกสาร',                  'Custody receipts',         'monthly', 5, false, false, 70),
  ('ADM-02', 'ADM', 'ใบทวงเอกสาร',                      'Document requests',        'monthly', 5, false, false, 71),
  ('ADM-03', 'ADM', 'บันทึกการสำรองข้อมูล (backup log)','Backup log',               'monthly', 5, false, false, 72)
ON CONFLICT (code) DO UPDATE SET
  name_th             = EXCLUDED.name_th,
  name_en             = EXCLUDED.name_en,
  group_code          = EXCLUDED.group_code,
  frequency           = EXCLUDED.frequency,
  retention_years     = EXCLUDED.retention_years,
  is_sensitive        = EXCLUDED.is_sensitive,
  required_by_default = EXCLUDED.required_by_default,
  sort_order          = EXCLUDED.sort_order;

-- ── template default: บริษัทจำกัด จด VAT ─────────────────────────────────────
-- สร้างให้ทุก org ที่เปิด module acc_firm อยู่แล้ว (ปัจจุบัน = jtacc)
-- due_rule: PERIOD_END+<n>d — คำนวณ due_date ตอน generate checklist
DO $$
DECLARE
  v_org uuid;
  v_tpl uuid;
BEGIN
  FOR v_org IN
    SELECT DISTINCT organization_id FROM org_module_settings
     WHERE module_key = 'acc_firm' AND is_enabled = true
  LOOP
    INSERT INTO acc_firm_vault_templates (firm_org_id, name, entity_type, vat_registered, is_default)
    VALUES (v_org, 'บริษัทจำกัด (จด VAT)', 'company', true, true)
    RETURNING id INTO v_tpl;

    INSERT INTO acc_firm_vault_template_items (template_id, category_id, is_required, due_rule)
    SELECT v_tpl, c.id, c.required_by_default,
           CASE c.code
             WHEN 'TAX-01' THEN 'PERIOD_END+7d'
             WHEN 'TAX-02' THEN 'PERIOD_END+7d'
             WHEN 'TAX-03' THEN 'PERIOD_END+7d'
             WHEN 'TAX-05' THEN 'PERIOD_END+15d'
             WHEN 'TAX-07' THEN 'PERIOD_END+15d'
             WHEN 'TAX-08' THEN 'PERIOD_END+60d'
             WHEN 'TAX-09' THEN 'PERIOD_END+150d'
             WHEN 'BOK-05' THEN 'PERIOD_END+150d'
             WHEN 'BOK-06' THEN 'PERIOD_END+150d'
             ELSE CASE WHEN c.frequency = 'monthly' THEN 'PERIOD_END+7d' ELSE NULL END
           END
      FROM acc_firm_vault_categories c
     WHERE c.is_active
       AND (c.group_code <> 'ADM');   -- งานสำนักงานไม่อยู่ใน checklist ที่ทวงลูกค้า
  END LOOP;
END $$;
