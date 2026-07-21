-- Migration: 20260721140000_acc_purchase_documents.sql
-- ฝั่งซื้อ — ทะเบียนใบกำกับภาษีซื้อ (ภาษีซื้อของ ภ.พ.30 + รายงานภาษีซื้อ)
--
-- ปัญหาเดิม: ระบบไม่มีที่บันทึก "ใบกำกับภาษีซื้อ" เลย
--   • OCR ถอดบิล → เขียนตรงเข้า acc_journal_entries (source='ai') ข้ามการเก็บตัวเอกสาร
--   • ภ.พ.30 ช่อง purchase_vat จึงต้องกรอกมือทุกเดือนทุกราย (งาน jtacc หนักขึ้น ไม่ใช่เบาลง)
--   • ทำรายงานภาษีซื้อยื่นสรรพากรไม่ได้
--
-- ตาราง purchase_documents ของเดิมเป็นซากรุ่นเก่า (organization_id, ไม่มี RLS/audit,
-- 0 แถว, component orphaned ไม่มีหน้าไหน route ถึง) → ไม่รื้อมาใช้ สร้างใหม่ตาม convention acc_*
--
-- หมายเหตุสำคัญ 2 ข้อที่ต่างจากฝั่งขาย:
--   1. doc_number = เลขที่บน "ใบกำกับของผู้ขาย" → ไม่ generate เอง + unique ต่อ (org, ผู้ขาย, เลขที่)
--      เพื่อกันคีย์บิลใบเดิมซ้ำ (ภาษีซื้อเบิ้ล = ยื่นผิด)
--   2. tax_year/tax_month แยกจาก issue_date — ป.รัษฎากร ม.82/3 + ประกาศฯ ยอมให้นำภาษีซื้อ
--      ไปใช้ในเดือนที่ได้รับใบกำกับได้ (ภายใน 6 เดือน) เอกสารลงวันที่ ม.ค. อาจเครดิตเดือน ก.พ. ได้

-- ═══════════════════════════════════════════════════════════════════════════
-- §1 acc_purchase_documents — หัวเอกสารซื้อ
-- ═══════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.acc_purchase_documents (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id             uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  doc_type           text NOT NULL DEFAULT 'tax_invoice'
                       CHECK (doc_type IN (
                         'tax_invoice',           -- ใบกำกับภาษี (เต็มรูป)
                         'receipt_tax_invoice',   -- ใบเสร็จรับเงิน/ใบกำกับภาษี
                         'credit_note',           -- ใบลดหนี้จากผู้ขาย → ลดภาษีซื้อ
                         'debit_note',            -- ใบเพิ่มหนี้จากผู้ขาย → เพิ่มภาษีซื้อ
                         'receipt',               -- ใบเสร็จ/บิลเงินสด (ไม่มี VAT เครดิตไม่ได้)
                         'abbreviated_tax_invoice'-- ใบกำกับภาษีอย่างย่อ (ม.86/6 — เครดิตไม่ได้)
                       )),
  -- เลขที่บนเอกสารของผู้ขาย (ไม่ใช่เลขที่เราออกเอง)
  doc_number         text NOT NULL,
  contact_id         uuid REFERENCES public.acc_contacts(id) ON DELETE SET NULL,
  issue_date         date NOT NULL,               -- วันที่บนใบกำกับ

  -- งวดภาษีที่นำภาษีซื้อไปใช้ (ปกติ = เดือนของ issue_date แต่เลื่อนได้ ม.82/3)
  tax_year           integer NOT NULL,
  tax_month          integer NOT NULL CHECK (tax_month BETWEEN 1 AND 12),

  -- ผู้ขาย (snapshot จากใบกำกับที่ได้รับ — ห้าม join สด ใบภาษีต้องไม่เปลี่ยนย้อนหลัง)
  seller_name        text,
  seller_address     text,
  seller_tax_id      text,
  seller_branch      text,
  -- ผู้ซื้อ = กิจการเรา (snapshot จาก acc_org_settings ตอนบันทึก)
  buyer_name         text,
  buyer_address      text,
  buyer_tax_id       text,
  buyer_branch       text,

  vat_rate           numeric(5,2),                -- 7 / 0 · NULL = ไม่เกี่ยวกับ VAT
  subtotal           numeric(14,2) NOT NULL DEFAULT 0,
  vat_amount         numeric(14,2) NOT NULL DEFAULT 0,
  total              numeric(14,2) NOT NULL DEFAULT 0,
  wht_rate           numeric(5,2)  NOT NULL DEFAULT 0,   -- เราหัก ณ ที่จ่ายผู้ขาย
  wht_amount         numeric(14,2) NOT NULL DEFAULT 0,

  -- ภาษีซื้อต้องห้าม (ม.82/5) เช่น ค่ารับรอง, รถยนต์นั่ง — บันทึกได้แต่เครดิตไม่ได้
  -- ใบกำกับอย่างย่อ/ใบเสร็จ ก็เครดิตไม่ได้ → กันไว้ที่ CHECK ด้านล่าง
  is_vat_claimable   boolean NOT NULL DEFAULT true,
  non_claimable_note text,

  status             text NOT NULL DEFAULT 'recorded'
                       CHECK (status IN ('draft','recorded','void')),
  ref_document_id    uuid REFERENCES public.acc_purchase_documents(id) ON DELETE RESTRICT,
  journal_entry_id   uuid REFERENCES public.acc_journal_entries(id) ON DELETE SET NULL,
  ocr_job_id         uuid,                        -- ที่มาจาก OCR (ocr_processing_jobs.id)
  note               text,
  created_by         uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at         timestamptz NOT NULL DEFAULT now(),

  -- กันคีย์บิลใบเดิมซ้ำ (ผู้ขายเดียวกัน + เลขที่เดียวกัน = ใบเดียวกัน)
  UNIQUE (org_id, contact_id, doc_number),
  -- เอกสารที่กฎหมายไม่ให้เครดิตภาษีซื้อ ต้องบังคับ is_vat_claimable = false
  CONSTRAINT acc_purchase_documents_claimable_chk CHECK (
    is_vat_claimable = false
    OR doc_type IN ('tax_invoice','receipt_tax_invoice','credit_note','debit_note')
  )
);

CREATE INDEX IF NOT EXISTS acc_purchase_documents_org_id_idx
  ON public.acc_purchase_documents(org_id);
CREATE INDEX IF NOT EXISTS acc_purchase_documents_org_taxperiod_idx
  ON public.acc_purchase_documents(org_id, tax_year, tax_month);
CREATE INDEX IF NOT EXISTS acc_purchase_documents_org_date_idx
  ON public.acc_purchase_documents(org_id, issue_date);
CREATE INDEX IF NOT EXISTS acc_purchase_documents_contact_idx
  ON public.acc_purchase_documents(contact_id);
CREATE INDEX IF NOT EXISTS acc_purchase_documents_journal_idx
  ON public.acc_purchase_documents(journal_entry_id);
CREATE INDEX IF NOT EXISTS acc_purchase_documents_ocr_job_idx
  ON public.acc_purchase_documents(ocr_job_id) WHERE ocr_job_id IS NOT NULL;

ALTER TABLE public.acc_purchase_documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "acc_purchase_documents_select" ON public.acc_purchase_documents
  FOR SELECT USING (is_org_member(org_id, auth.uid()));
CREATE POLICY "acc_purchase_documents_write" ON public.acc_purchase_documents
  FOR ALL USING (is_org_admin(org_id, auth.uid()));

-- ═══════════════════════════════════════════════════════════════════════════
-- §2 acc_purchase_document_lines — บรรทัดรายการ (account_id = บัญชีค่าใช้จ่าย/สินทรัพย์)
-- ═══════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.acc_purchase_document_lines (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  document_id   uuid NOT NULL REFERENCES public.acc_purchase_documents(id) ON DELETE CASCADE,
  item_name     text NOT NULL DEFAULT '',
  description   text NOT NULL DEFAULT '',
  qty           numeric(12,2) NOT NULL DEFAULT 0,
  unit          text,
  unit_price    numeric(14,2) NOT NULL DEFAULT 0,
  amount        numeric(14,2) NOT NULL DEFAULT 0,
  -- บัญชีปลายทางของบรรทัดนี้ (Dr) — ใช้ตอน auto journal
  account_id    uuid REFERENCES public.acc_accounts(id) ON DELETE SET NULL,
  sort_order    integer NOT NULL DEFAULT 0,
  created_by    uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS acc_purchase_document_lines_org_id_idx
  ON public.acc_purchase_document_lines(org_id);
CREATE INDEX IF NOT EXISTS acc_purchase_document_lines_document_idx
  ON public.acc_purchase_document_lines(document_id);

ALTER TABLE public.acc_purchase_document_lines ENABLE ROW LEVEL SECURITY;
CREATE POLICY "acc_purchase_document_lines_select" ON public.acc_purchase_document_lines
  FOR SELECT USING (is_org_member(org_id, auth.uid()));
CREATE POLICY "acc_purchase_document_lines_write" ON public.acc_purchase_document_lines
  FOR ALL USING (is_org_admin(org_id, auth.uid()));

-- ═══════════════════════════════════════════════════════════════════════════
-- §3 audit trigger (มาตรฐาน acc_* — hash-chain audit log เดิม)
-- ═══════════════════════════════════════════════════════════════════════════
DROP TRIGGER IF EXISTS audit_acc_purchase_documents ON public.acc_purchase_documents;
CREATE TRIGGER audit_acc_purchase_documents
  AFTER INSERT OR UPDATE OR DELETE ON public.acc_purchase_documents
  FOR EACH ROW EXECUTE FUNCTION public.fn_audit_log_changes();

DROP TRIGGER IF EXISTS audit_acc_purchase_document_lines ON public.acc_purchase_document_lines;
CREATE TRIGGER audit_acc_purchase_document_lines
  AFTER INSERT OR UPDATE OR DELETE ON public.acc_purchase_document_lines
  FOR EACH ROW EXECUTE FUNCTION public.fn_audit_log_changes();

-- ═══════════════════════════════════════════════════════════════════════════
-- §4 auto journal — idempotency ต่อเอกสารซื้อ 1 ใบ = 1 journal
--    ใช้ source='document' ที่มีใน enum อยู่แล้ว (source_ref_id = purchase doc id)
--    partial unique เลียนแบบ payroll/depreciation (BLOCKER 2 ของ accounting_core)
--    ⚠️ ครอบทั้งเอกสารขายและซื้อที่ source='document' — id เป็น uuid จึงไม่ชนกัน
-- ═══════════════════════════════════════════════════════════════════════════
CREATE UNIQUE INDEX IF NOT EXISTS acc_journal_entries_document_uniq
  ON public.acc_journal_entries(org_id, source, source_ref_id)
  WHERE source = 'document';

COMMENT ON TABLE public.acc_purchase_documents IS
  'ทะเบียนใบกำกับภาษีซื้อ — ฐานของภาษีซื้อใน ภ.พ.30 + รายงานภาษีซื้อ (doc_number = เลขที่ของผู้ขาย)';
COMMENT ON COLUMN public.acc_purchase_documents.tax_year IS
  'ปีของงวดภาษีที่นำภาษีซื้อไปใช้ — แยกจาก issue_date เพราะ ม.82/3 ให้เลื่อนใช้ได้ภายใน 6 เดือน';
COMMENT ON COLUMN public.acc_purchase_documents.is_vat_claimable IS
  'เครดิตภาษีซื้อได้หรือไม่ — false สำหรับภาษีซื้อต้องห้าม (ม.82/5) / ใบกำกับอย่างย่อ / ใบเสร็จ';
-- ชนิดแบบ ภ.ง.ด. ที่ต้องยื่นสำหรับภาษีหัก ณ ที่จ่ายของบิลนี้
-- pnd53 = ผู้ขายเป็นนิติบุคคล (ค่าตั้งต้น) · pnd3 = บุคคลธรรมดา
-- ตัดสินบัญชีปลายทางตอน auto journal (2212 vs 2211) — ลงผิดบัญชี = ยื่นแบบผิด
ALTER TABLE public.acc_purchase_documents
  ADD COLUMN IF NOT EXISTS wht_form text NOT NULL DEFAULT 'pnd53'
    CHECK (wht_form IN ('pnd3','pnd53'));
