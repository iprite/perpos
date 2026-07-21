-- Migration: 20260721150000_acc_doc_sequences_and_lock.sql
-- Phase 1.3 (เลขที่เอกสารปลอดภัย) + 1.4 (ล็อกเอกสารที่ออกแล้ว)
--
-- 1.3 ปัญหาเดิม: nextDocNumber ใช้ COUNT(*)+1
--     • สองคนกดพร้อมกัน → นับได้เลขเดียวกัน → unique violation (ผู้ใช้เห็น error ดิบ) หรือแย่กว่านั้น
--     • ลบเอกสารทิ้ง → count ลด → เลขวนกลับมาใช้ซ้ำ = เลขที่ใบกำกับภาษีซ้ำ (ผิดกฎหมาย)
--     • เอกสาร void ทำให้ count เพี้ยน
--     แก้: sequence table + RPC atomic ต่อ (org, ชนิด, ปี) — เลขเดินหน้าอย่างเดียว
--          ไม่ย้อนกลับแม้ลบ/ยกเลิก (ตรงกับหลัก "เลขที่ใบกำกับต้องเรียงและไม่ซ้ำ")
--
-- 1.4 ปัญหาเดิม: DELETE เอกสารได้ทุกสถานะ + hard delete
--     พ.ร.บ.การบัญชี ม.14 ให้เก็บเอกสารประกอบการลงบัญชี 5 ปี
--     แก้: soft delete (deleted_at) + ลบจริงได้เฉพาะ draft ที่ยังไม่ลงบัญชี

-- ═══════════════════════════════════════════════════════════════════════════
-- §1.3 acc_doc_sequences — ตัวนับเลขเอกสาร (atomic)
-- ═══════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.acc_doc_sequences (
  org_id    uuid    NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  -- ชนิด: doc_type ของ acc_documents · 'journal' สำหรับ acc_journal_entries
  doc_kind  text    NOT NULL,
  year      integer NOT NULL,
  last_seq  integer NOT NULL DEFAULT 0 CHECK (last_seq >= 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (org_id, doc_kind, year)
);

ALTER TABLE public.acc_doc_sequences ENABLE ROW LEVEL SECURITY;
-- deny-all: แตะได้เฉพาะ service role ผ่าน RPC (ไม่มี policy = ปฏิเสธทุก role ปกติ)
-- ผู้ใช้ไม่ควรอ่าน/แก้ตัวนับได้เอง — แก้ได้ = ปลอมเลขเอกสารได้

-- ── RPC: จองเลขถัดไปแบบ atomic ────────────────────────────────────────────
-- INSERT ... ON CONFLICT DO UPDATE ... RETURNING = ล็อกแถวใน transaction เดียว
-- สอง request พร้อมกันจะถูก serialize โดย row lock → ไม่มีทางได้เลขซ้ำ
CREATE OR REPLACE FUNCTION public.next_acc_doc_number(
  p_org_id   uuid,
  p_doc_kind text,
  p_year     integer,
  p_prefix   text
) RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_seq integer;
BEGIN
  INSERT INTO public.acc_doc_sequences (org_id, doc_kind, year, last_seq, updated_at)
  VALUES (p_org_id, p_doc_kind, p_year, 1, now())
  ON CONFLICT (org_id, doc_kind, year)
  DO UPDATE SET last_seq = public.acc_doc_sequences.last_seq + 1,
                updated_at = now()
  RETURNING last_seq INTO v_seq;

  RETURN p_prefix || '-' || p_year::text || '-' || lpad(v_seq::text, 4, '0');
END;
$$;

-- service role เท่านั้น (API route ใช้ admin client) — ห้าม client เรียกตรง
REVOKE ALL ON FUNCTION public.next_acc_doc_number(uuid, text, integer, text) FROM public;
REVOKE ALL ON FUNCTION public.next_acc_doc_number(uuid, text, integer, text) FROM anon;
REVOKE ALL ON FUNCTION public.next_acc_doc_number(uuid, text, integer, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.next_acc_doc_number(uuid, text, integer, text) TO service_role;

-- ── backfill: ตั้งตัวนับจากเลขสูงสุดที่มีอยู่จริง ─────────────────────────
-- ต้องทำ ไม่งั้นเอกสารใบถัดไปจะได้เลข 0001 ซ้ำกับของเดิม
-- อ่านเลขท้าย 4 หลักจาก doc_number ที่ตรงรูปแบบ <prefix>-<ปี>-<NNNN> เท่านั้น
INSERT INTO public.acc_doc_sequences (org_id, doc_kind, year, last_seq)
SELECT d.org_id,
       d.doc_type,
       substring(d.doc_number from '-(\d{4})-\d+$')::integer AS yr,
       MAX(substring(d.doc_number from '-(\d+)$')::integer)  AS last_seq
  FROM public.acc_documents d
 WHERE d.doc_number ~ '-\d{4}-\d+$'
 GROUP BY d.org_id, d.doc_type, substring(d.doc_number from '-(\d{4})-\d+$')::integer
ON CONFLICT (org_id, doc_kind, year)
DO UPDATE SET last_seq = GREATEST(public.acc_doc_sequences.last_seq, EXCLUDED.last_seq);

INSERT INTO public.acc_doc_sequences (org_id, doc_kind, year, last_seq)
SELECT j.org_id,
       'journal',
       substring(j.entry_number from '-(\d{4})-\d+$')::integer,
       MAX(substring(j.entry_number from '-(\d+)$')::integer)
  FROM public.acc_journal_entries j
 WHERE j.entry_number ~ '-\d{4}-\d+$'
 GROUP BY j.org_id, substring(j.entry_number from '-(\d{4})-\d+$')::integer
ON CONFLICT (org_id, doc_kind, year)
DO UPDATE SET last_seq = GREATEST(public.acc_doc_sequences.last_seq, EXCLUDED.last_seq);

-- ═══════════════════════════════════════════════════════════════════════════
-- §1.4 soft delete — เก็บหลักฐาน 5 ปี (พ.ร.บ.การบัญชี ม.14)
-- ═══════════════════════════════════════════════════════════════════════════
ALTER TABLE public.acc_documents
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz,
  ADD COLUMN IF NOT EXISTS deleted_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL;

ALTER TABLE public.acc_purchase_documents
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz,
  ADD COLUMN IF NOT EXISTS deleted_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL;

-- query ปกติกรองด้วย deleted_at IS NULL → index partial ให้เร็ว
CREATE INDEX IF NOT EXISTS acc_documents_org_live_idx
  ON public.acc_documents(org_id, issue_date) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS acc_purchase_documents_org_live_idx
  ON public.acc_purchase_documents(org_id, issue_date) WHERE deleted_at IS NULL;

COMMENT ON COLUMN public.acc_documents.deleted_at IS
  'soft delete — เอกสารที่ออกแล้วห้ามลบจริง (พ.ร.บ.การบัญชี ม.14 เก็บ 5 ปี) · ลบจริงได้เฉพาะ draft';
COMMENT ON TABLE public.acc_doc_sequences IS
  'ตัวนับเลขเอกสารต่อ (org, ชนิด, ปี) — เดินหน้าอย่างเดียว ไม่ย้อนแม้ลบ/ยกเลิก · แก้ผ่าน RPC เท่านั้น';
