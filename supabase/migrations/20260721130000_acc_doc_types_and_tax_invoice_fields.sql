-- Migration: 20260721130000_acc_doc_types_and_tax_invoice_fields.sql
-- Phase 1.1 + 1.2 ของแผน migrate ลูกค้า jtacc จาก PEAK → PERPOS accounting
--
-- 1.1 ขยายชนิดเอกสารขาย (acc_documents.doc_type)
--     เดิม: quotation | invoice | receipt  → ไม่มีใบกำกับภาษีเลย (ออกเอกสารตามกฎหมายไม่ได้)
--     เพิ่ม:
--       tax_invoice          ใบกำกับภาษี (ป.รัษฎากร ม.86/4)
--       receipt_tax_invoice  ใบเสร็จรับเงิน/ใบกำกับภาษี (รูปแบบที่ SME ไทยใช้บ่อยที่สุด)
--       credit_note          ใบลดหนี้ (ม.86/10)
--       debit_note           ใบเพิ่มหนี้ (ม.86/9)
--       billing_note         ใบวางบิล (ไม่ใช่เอกสารภาษี)
--       delivery_note        ใบส่งของ (ไม่ใช่เอกสารภาษี)
--
-- 1.2 ฟิลด์บังคับตาม ม.86/4 — เก็บเป็น "snapshot ตอนออกเอกสาร" ห้าม join สดตอนพิมพ์
--     เหตุผล: เอกสารภาษีที่ออกไปแล้วต้องไม่เปลี่ยนย้อนหลังเมื่อมีคนแก้ข้อมูลลูกค้า/ตั้งค่ากิจการ
--     (ถ้า join สดจาก acc_contacts / acc_org_settings ใบเก่าจะเปลี่ยนตาม = หลักฐานภาษีเพี้ยน)
--
--     ม.86/4 บังคับ: (1) คำว่า "ใบกำกับภาษี" (2) ชื่อ+ที่อยู่+เลขประจำตัวผู้เสียภาษีของผู้ประกอบการ
--     (3) ชื่อ+ที่อยู่ของผู้ซื้อ (4) หมายเลขลำดับ + เล่มที่ (ถ้ามี) (5) ชื่อ/ชนิด/ปริมาณ/มูลค่า
--     (6) จำนวน VAT แยกออกจากมูลค่าสินค้าชัดเจน (7) วัน เดือน ปี ที่ออก
--     + ประกาศอธิบดีฯ: ระบุ "สำนักงานใหญ่"/"สาขาที่ NNNNN" ของทั้งสองฝ่าย
--
--     acc_document_lines.unit — ปริมาณต้องมีหน่วยนับ (มีที่ master acc_products.unit
--     แต่ไม่เคยไหลลงบรรทัดเอกสาร → snapshot ลงบรรทัดด้วย)
--
-- ไม่มีตารางใหม่ → RLS / audit trigger ของ acc_documents + acc_document_lines คงเดิมทั้งหมด

-- ═══════════════════════════════════════════════════════════════════════════
-- §1.1 doc_type — ขยาย CHECK
-- ═══════════════════════════════════════════════════════════════════════════
ALTER TABLE public.acc_documents DROP CONSTRAINT IF EXISTS acc_documents_doc_type_check;
ALTER TABLE public.acc_documents ADD CONSTRAINT acc_documents_doc_type_check
  CHECK (doc_type IN (
    'quotation',            -- ใบเสนอราคา
    'invoice',              -- ใบแจ้งหนี้
    'receipt',              -- ใบเสร็จรับเงิน
    'tax_invoice',          -- ใบกำกับภาษี (ม.86/4)
    'receipt_tax_invoice',  -- ใบเสร็จรับเงิน/ใบกำกับภาษี
    'credit_note',          -- ใบลดหนี้ (ม.86/10)
    'debit_note',           -- ใบเพิ่มหนี้ (ม.86/9)
    'billing_note',         -- ใบวางบิล
    'delivery_note'         -- ใบส่งของ
  ));

-- ═══════════════════════════════════════════════════════════════════════════
-- §1.2 acc_documents — ฟิลด์ ม.86/4 (snapshot)
-- ═══════════════════════════════════════════════════════════════════════════
ALTER TABLE public.acc_documents
  -- ผู้ขาย (snapshot จาก acc_org_settings ตอนออก)
  ADD COLUMN IF NOT EXISTS seller_name     text,
  ADD COLUMN IF NOT EXISTS seller_address  text,
  ADD COLUMN IF NOT EXISTS seller_tax_id   text,
  ADD COLUMN IF NOT EXISTS seller_branch   text,
  -- ผู้ซื้อ (snapshot จาก acc_contacts ตอนออก)
  ADD COLUMN IF NOT EXISTS buyer_name      text,
  ADD COLUMN IF NOT EXISTS buyer_address   text,
  ADD COLUMN IF NOT EXISTS buyer_tax_id    text,
  ADD COLUMN IF NOT EXISTS buyer_branch    text,
  -- เล่มที่ (ม.86/4 (4) "หมายเลขลำดับของใบกำกับภาษี และหมายเลขลำดับของเล่ม ถ้ามี")
  ADD COLUMN IF NOT EXISTS book_number     text,
  -- อัตรา VAT ที่ใช้จริงกับใบนี้ (7 / 0 / null=ยกเว้น) — เดิมเก็บแต่ยอด แยกอัตราไม่ได้
  ADD COLUMN IF NOT EXISTS vat_rate        numeric(5,2),
  -- ใบลดหนี้/ใบเพิ่มหนี้ ต้องอ้างใบกำกับภาษีเดิม (ม.86/10 (3), ม.86/9 (3))
  -- RESTRICT: ห้ามลบใบกำกับที่ถูกอ้างอิงอยู่ (หลักฐานภาษีต้องครบชุด)
  ADD COLUMN IF NOT EXISTS ref_document_id uuid REFERENCES public.acc_documents(id) ON DELETE RESTRICT,
  -- วัน-เวลาที่ออกเอกสารจริง (issue_date เป็น date เท่านั้น) — ม.86/4 (7)
  ADD COLUMN IF NOT EXISTS issued_at       timestamptz;

CREATE INDEX IF NOT EXISTS acc_documents_ref_document_idx
  ON public.acc_documents(ref_document_id) WHERE ref_document_id IS NOT NULL;

COMMENT ON COLUMN public.acc_documents.seller_name IS 'snapshot ชื่อผู้ประกอบการตอนออกเอกสาร (ม.86/4 (2)) — ห้าม join สด';
COMMENT ON COLUMN public.acc_documents.buyer_name IS 'snapshot ชื่อผู้ซื้อตอนออกเอกสาร (ม.86/4 (3)) — ห้าม join สด';
COMMENT ON COLUMN public.acc_documents.book_number IS 'เล่มที่ของใบกำกับภาษี (ม.86/4 (4)) — ว่างได้ถ้าไม่ได้ออกเป็นเล่ม';
COMMENT ON COLUMN public.acc_documents.vat_rate IS 'อัตรา VAT ที่ใช้กับเอกสารใบนี้ (7 / 0) · NULL = ไม่เกี่ยวกับ VAT / ยกเว้น';
COMMENT ON COLUMN public.acc_documents.ref_document_id IS 'ใบกำกับภาษีเดิมที่ใบลดหนี้/ใบเพิ่มหนี้อ้างถึง (ม.86/10, ม.86/9)';
COMMENT ON COLUMN public.acc_documents.issued_at IS 'วัน-เวลาที่ออกเอกสารจริง (ม.86/4 (7)) — issue_date เก็บได้แค่วันที่';

-- ═══════════════════════════════════════════════════════════════════════════
-- §1.2b acc_document_lines — หน่วยนับ (ม.86/4 (5) "ปริมาณ")
-- ═══════════════════════════════════════════════════════════════════════════
ALTER TABLE public.acc_document_lines
  ADD COLUMN IF NOT EXISTS unit text;

COMMENT ON COLUMN public.acc_document_lines.unit IS 'หน่วยนับของบรรทัด (snapshot จาก acc_products.unit ตอนออกเอกสาร) — ม.86/4 (5)';

-- ═══════════════════════════════════════════════════════════════════════════
-- Backfill เอกสารเดิม (มีน้อยมาก — ยังไม่ได้เปิดใช้จริง)
--   issued_at ← created_at · vat_rate ← อัตราของ org เฉพาะใบที่เปิด VAT
--   ผู้ขาย/ผู้ซื้อ: เติมจากค่าปัจจุบันเป็น best-effort (ใบเดิมยังไม่ใช่เอกสารภาษี)
-- ═══════════════════════════════════════════════════════════════════════════
UPDATE public.acc_documents d
   SET issued_at = COALESCE(d.issued_at, d.created_at),
       vat_rate  = COALESCE(d.vat_rate, CASE WHEN d.vat_enabled THEN s.vat_rate ELSE 0 END),
       seller_name    = COALESCE(d.seller_name, s.org_name),
       seller_address = COALESCE(d.seller_address, s.address),
       seller_tax_id  = COALESCE(d.seller_tax_id, s.tax_id),
       seller_branch  = COALESCE(d.seller_branch, s.branch)
  FROM public.acc_org_settings s
 WHERE s.org_id = d.org_id;

UPDATE public.acc_documents d
   SET buyer_name    = COALESCE(d.buyer_name, c.name),
       buyer_address = COALESCE(d.buyer_address, c.address),
       buyer_tax_id  = COALESCE(d.buyer_tax_id, c.tax_id),
       buyer_branch  = COALESCE(d.buyer_branch, c.branch)
  FROM public.acc_contacts c
 WHERE c.id = d.contact_id;

UPDATE public.acc_document_lines l
   SET unit = COALESCE(l.unit, p.unit)
  FROM public.acc_products p
 WHERE p.id = l.product_id;
