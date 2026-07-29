-- Vault guards — ปิดช่องที่พบตอน review ของ Phase 1
--
-- G1 `retention_until` แก้ตรง ๆ ได้: trigger เดิมยิงเฉพาะ UPDATE OF category_id/period_id/client_id
--    → `UPDATE ... SET retention_until = '2020-01-01'` ผ่านฉลุย (ละเมิด spec §9 "ไม่ยอมรับค่าจาก client")
--    แก้: คำนวณใหม่ทุก INSERT/UPDATE เสมอ
--
-- G2 เอกสารที่ติด legal_hold ลบได้ และเอกสาร active ลบทิ้งได้เลย
--    → ละเมิด spec §5 ข้อ 4 (เก็บ metadata + sha256 ไว้ตลอดเป็นหลักฐาน) และ §10 (ห้าม auto-delete)
--    แก้: DELETE ได้เฉพาะ draft ที่ไม่ติด legal hold · นอกนั้นต้องเดินผ่าน status
--         (active → pending_purge → purged) ซึ่งลบ "ไฟล์" ไม่ใช่ "แถว"
--
-- G3 ปลด legal_hold ได้ทุก non-viewer → ต้องเป็น owner ของ module หรือ super_admin

-- ── G1 ───────────────────────────────────────────────────────────────────────
DROP TRIGGER IF EXISTS acc_firm_vault_retention_trg ON acc_firm_vault_documents;
CREATE TRIGGER acc_firm_vault_retention_trg
  BEFORE INSERT OR UPDATE ON acc_firm_vault_documents
  FOR EACH ROW EXECUTE FUNCTION public.acc_firm_vault_set_retention();

-- ── G2 + G3 ──────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.acc_firm_vault_guard_delete()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  IF OLD.legal_hold THEN
    RAISE EXCEPTION 'ลบไม่ได้: เอกสารถูกระงับไว้ตามคำสั่ง (legal hold)'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF OLD.status <> 'draft' THEN
    RAISE EXCEPTION 'ลบไม่ได้: เอกสารที่บันทึกแล้วต้องผ่านขั้นตอนทำลายเอกสาร (pending_purge → purged) เพื่อคงหลักฐาน sha256 ไว้'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN OLD;
END;
$fn$;

DROP TRIGGER IF EXISTS acc_firm_vault_guard_delete_trg ON acc_firm_vault_documents;
CREATE TRIGGER acc_firm_vault_guard_delete_trg
  BEFORE DELETE ON acc_firm_vault_documents
  FOR EACH ROW EXECUTE FUNCTION public.acc_firm_vault_guard_delete();

CREATE OR REPLACE FUNCTION public.acc_firm_vault_guard_hold()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  -- ปลด legal hold = สิทธิ์ระดับเจ้าของสำนักงาน (หรือ super_admin / งานเบื้องหลังที่ไม่มี JWT)
  IF OLD.legal_hold AND NOT NEW.legal_hold AND auth.uid() IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM module_members mm
       WHERE mm.org_id     = OLD.firm_org_id
         AND mm.module_key = 'acc_firm'
         AND mm.user_id    = auth.uid()
         AND mm.is_active
         AND mm.module_role = 'owner'
    ) AND NOT EXISTS (
      SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin', 'super_admin')
    ) THEN
      RAISE EXCEPTION 'ปลดการระงับเอกสาร (legal hold) ได้เฉพาะเจ้าของสำนักงาน'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;

  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS acc_firm_vault_guard_hold_trg ON acc_firm_vault_documents;
CREATE TRIGGER acc_firm_vault_guard_hold_trg
  BEFORE UPDATE OF legal_hold ON acc_firm_vault_documents
  FOR EACH ROW EXECUTE FUNCTION public.acc_firm_vault_guard_hold();

-- ── G4 trigger function ไม่ควรเปิดเป็น RPC (Supabase advisor 0028/0029) ──────
-- หมายเหตุ: ห้าม REVOKE acc_firm_member/acc_firm_writer/acc_firm_member_path จาก authenticated —
-- RLS policy เรียกฟังก์ชันเหล่านี้ด้วยสิทธิ์ของผู้ใช้เอง ถอน EXECUTE แล้วทุก query จะ
-- "permission denied for function" (ปัญหาเดียวกับ is_org_member/is_admin เดิมของฐานนี้
-- ซึ่งแก้ถูกต้องได้ด้วยการย้ายไป schema ที่ไม่ expose — งานแยกต่างหาก)
REVOKE EXECUTE ON FUNCTION public.acc_firm_vault_set_retention() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.acc_firm_vault_guard_delete()  FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.acc_firm_vault_guard_hold()    FROM anon, authenticated;
