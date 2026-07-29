-- p2p_group — ปิดช่อง 2 จุดที่รีวิวจับได้ (2026-07-29)
--
-- (1) ด่านสิทธิ์ viewer ข้ามได้: RLS เดิมเป็น `is_org_member` เฉย ๆ ⇒ สมาชิก org คนไหนก็ยิง PostgREST
--     ด้วย token ตัวเองอ่านตาราง "ตัวเลขอ่อนไหว" ได้ตรง ๆ (พิสูจน์แล้ว: สวมสิทธิ์ authenticated เห็น
--     cost_amount เต็มจำนวน) — ด่าน 403 ที่ API / strip ที่ server / guard หน้าเว็บ อยู่ชั้นแอปทั้งหมด
--     จึงข้ามได้หมด. แถมคนที่เป็นสมาชิก org แต่ "ไม่มีแถวใน module_members" (เข้าหน้าโมดูลไม่ได้ด้วยซ้ำ)
--     ก็อ่านได้เหมือนกัน
--     ⇒ ย้ายด่านลง DB: ตารางอ่อนไหวต้องผ่าน p2pg_has_money_access() = owner|manager ของโมดูล (หรือ super_admin)
--     ⇒ viewer ยังต้องเห็น "รายได้ + จำนวนพนักงาน" → เปิดผ่าน view `p2pg_financials_basic` ที่มีเฉพาะคอลัมน์
--        ที่ไม่อ่อนไหว (ไม่ใช่ปิดทั้งตารางแล้วให้แอปกรองเอง — บทเรียน bi: รัดชั้น DB แล้วภาระย้ายไปกองที่โค้ด)
--
-- (2) id ที่อ้างข้าม org: FK เดิมเป็นคอลัมน์เดียว ⇒ ชี้ไปแถวของ org อื่นได้
--     ⇒ FK แบบผูก org (composite (id, org_id)) ตาม pattern gov_procure_catalog
--     ⇒ `loan_id` คงเป็น FK เดี่ยว + ON DELETE SET NULL (composite + SET NULL จะ null org_id ที่ NOT NULL —
--        บทเรียน gov-procure-catalog B1) แล้วบังคับ org เดียวกันที่ API layer แทน

-- ─────────────────────────────────────────────────────────────
-- 1. ด่านสิทธิ์ระดับ DB
-- ─────────────────────────────────────────────────────────────
-- ใช้ auth.uid() ภายในโดยตั้งใจ (ไม่รับ p_user เป็นพารามิเตอร์) — กันเอาไปหยั่งว่า "ผู้ใช้ X เป็น manager ไหม"
CREATE OR REPLACE FUNCTION p2pg_has_money_access(p_org uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM module_members m
    WHERE m.org_id = p_org
      AND m.module_key = 'p2p_group'
      AND m.user_id = auth.uid()
      AND m.is_active
      AND m.module_role IN ('owner', 'manager')
  ) OR EXISTS (
    SELECT 1 FROM profiles p
    WHERE p.id = auth.uid() AND p.role = 'super_admin'
  );
$$;

REVOKE ALL ON FUNCTION p2pg_has_money_access(uuid) FROM public, anon;
-- authenticated ต้องมี EXECUTE จริง ๆ เพราะ policy expression รันด้วยสิทธิ์ผู้เรียก
-- (Supabase advisor จะเตือนว่าเรียกผ่าน /rest/v1/rpc ได้ — ยอมรับได้: คืนแค่ boolean ว่า
--  "ตัวผู้เรียกเอง" มีสิทธิ์ไหม ไม่รับ p_user จึงเอาไปหยั่งสิทธิ์คนอื่นไม่ได้)
GRANT EXECUTE ON FUNCTION p2pg_has_money_access(uuid) TO authenticated;

-- ตารางที่ "ทั้งตารางเป็นตัวเลขอ่อนไหว" + p2pg_financials (มีคอลัมน์อ่อนไหวปนอยู่)
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'p2pg_financials','p2pg_investments','p2pg_dividends','p2pg_loans',
    'p2pg_intercompany','p2pg_bank_accounts','p2pg_bank_balances'
  ] LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_select', t);
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR SELECT USING (is_org_member(org_id, auth.uid()) AND p2pg_has_money_access(org_id))',
      t || '_select', t);
  END LOOP;
END $$;

-- p2pg_companies: ทะเบียนบริษัท viewer เห็นได้ตามสัญญา (§4) → คง is_org_member เหมือนเดิม

-- ⚠️ กับดักที่ทดสอบแล้วเจอ: policy เดิมชื่อ `<t>_write` เป็น **FOR ALL** ซึ่ง "ALL" รวม SELECT ด้วย
--    ⇒ policy แบบ permissive จะ OR กัน → แม้ `_select` จะรัดแล้ว แต่ `_write` (is_org_admin) ก็ยัง
--      เปิดให้อ่านได้อยู่ดี (ยืนยันด้วยการสวมสิทธิ์ viewer แล้วยังเห็นแถว)
--    ⇒ ต้องแยกเป็น INSERT/UPDATE/DELETE ไม่ใช้ FOR ALL อีก
DO $$
DECLARE t text;
DECLARE gate text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'p2pg_companies','p2pg_financials','p2pg_investments','p2pg_dividends',
    'p2pg_loans','p2pg_intercompany','p2pg_bank_accounts','p2pg_bank_balances'
  ] LOOP
    -- ตารางอ่อนไหวให้เขียนได้เฉพาะคนที่มีสิทธิ์เห็นตัวเลขด้วย (backstop ของ canWriteP2pGroup ที่ API)
    gate := CASE WHEN t = 'p2pg_companies'
                 THEN 'is_org_admin(org_id, auth.uid())'
                 ELSE 'is_org_admin(org_id, auth.uid()) AND p2pg_has_money_access(org_id)' END;

    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_write', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_insert', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_update', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_delete', t);

    EXECUTE format('CREATE POLICY %I ON %I FOR INSERT WITH CHECK (%s)', t || '_insert', t, gate);
    EXECUTE format('CREATE POLICY %I ON %I FOR UPDATE USING (%s) WITH CHECK (%s)',
                   t || '_update', t, gate, gate);
    EXECUTE format('CREATE POLICY %I ON %I FOR DELETE USING (%s)', t || '_delete', t, gate);
  END LOOP;
END $$;

-- ─────────────────────────────────────────────────────────────
-- 2. view สำหรับ viewer — เฉพาะคอลัมน์ที่ไม่อ่อนไหว
--    security_invoker = false (default) → view รันด้วยสิทธิ์เจ้าของ ข้าม RLS ของตารางฐานได้
--    แต่ตัว view กรอง is_org_member เอง และไม่มีคอลัมน์อ่อนไหวให้เลือกตั้งแต่แรก
-- ─────────────────────────────────────────────────────────────
-- security_barrier: กัน leaky operator (ฟังก์ชันที่ผู้ใช้ใส่ใน WHERE ถูกประเมินก่อนตัวกรอง org)
-- ⚠️ Supabase advisor จะขึ้น ERROR `security_definer_view` กับ view นี้ — **เป็นข้อยกเว้นที่ตั้งใจ**
--    view ต้องข้าม RLS ของตารางฐานถึงจะให้ viewer เห็นรายได้ได้ · ความปลอดภัยมาจาก
--    (ก) ไม่มีคอลัมน์อ่อนไหวใน view เลย (ข) กรอง is_org_member เอง (ค) GRANT แค่ SELECT (ห้ามให้ INSERT/UPDATE
--    เพราะ view นี้ auto-updatable) (ง) REVOKE จาก anon/public
DROP VIEW IF EXISTS p2pg_financials_basic;
CREATE VIEW p2pg_financials_basic
WITH (security_invoker = false, security_barrier = true) AS
SELECT id, org_id, company_id, period_month, source, revenue, headcount, is_locked, note,
       created_at, updated_at
FROM p2pg_financials
WHERE is_org_member(org_id, auth.uid());

REVOKE ALL ON p2pg_financials_basic FROM public, anon;
GRANT SELECT ON p2pg_financials_basic TO authenticated;

COMMENT ON VIEW p2pg_financials_basic IS
  'งบรายเดือนเฉพาะคอลัมน์ที่ viewer เห็นได้ (รายได้/จำนวนพนักงาน) — ห้ามเพิ่มคอลัมน์กำไร/ต้นทุน/เงินสด/สินทรัพย์เข้ามาเด็ดขาด';

-- ─────────────────────────────────────────────────────────────
-- 3. FK แบบผูก org (กันอ้าง id ข้าม org)
-- ─────────────────────────────────────────────────────────────
ALTER TABLE p2pg_companies      ADD CONSTRAINT p2pg_companies_id_org_uniq      UNIQUE (id, org_id);
ALTER TABLE p2pg_bank_accounts  ADD CONSTRAINT p2pg_bank_accounts_id_org_uniq  UNIQUE (id, org_id);

ALTER TABLE p2pg_financials
  DROP CONSTRAINT IF EXISTS p2pg_financials_company_id_fkey,
  ADD  CONSTRAINT p2pg_financials_company_org_fkey
       FOREIGN KEY (company_id, org_id) REFERENCES p2pg_companies(id, org_id) ON DELETE CASCADE;

ALTER TABLE p2pg_investments
  DROP CONSTRAINT IF EXISTS p2pg_investments_company_id_fkey,
  ADD  CONSTRAINT p2pg_investments_company_org_fkey
       FOREIGN KEY (company_id, org_id) REFERENCES p2pg_companies(id, org_id) ON DELETE CASCADE;

ALTER TABLE p2pg_dividends
  DROP CONSTRAINT IF EXISTS p2pg_dividends_company_id_fkey,
  ADD  CONSTRAINT p2pg_dividends_company_org_fkey
       FOREIGN KEY (company_id, org_id) REFERENCES p2pg_companies(id, org_id) ON DELETE CASCADE;

ALTER TABLE p2pg_bank_accounts
  DROP CONSTRAINT IF EXISTS p2pg_bank_accounts_company_id_fkey,
  ADD  CONSTRAINT p2pg_bank_accounts_company_org_fkey
       FOREIGN KEY (company_id, org_id) REFERENCES p2pg_companies(id, org_id) ON DELETE CASCADE;

ALTER TABLE p2pg_loans
  DROP CONSTRAINT IF EXISTS p2pg_loans_lender_company_id_fkey,
  DROP CONSTRAINT IF EXISTS p2pg_loans_borrower_company_id_fkey,
  ADD  CONSTRAINT p2pg_loans_lender_org_fkey
       FOREIGN KEY (lender_company_id, org_id) REFERENCES p2pg_companies(id, org_id) ON DELETE CASCADE,
  ADD  CONSTRAINT p2pg_loans_borrower_org_fkey
       FOREIGN KEY (borrower_company_id, org_id) REFERENCES p2pg_companies(id, org_id) ON DELETE CASCADE;

ALTER TABLE p2pg_intercompany
  DROP CONSTRAINT IF EXISTS p2pg_intercompany_from_company_id_fkey,
  DROP CONSTRAINT IF EXISTS p2pg_intercompany_to_company_id_fkey,
  ADD  CONSTRAINT p2pg_intercompany_from_org_fkey
       FOREIGN KEY (from_company_id, org_id) REFERENCES p2pg_companies(id, org_id) ON DELETE CASCADE,
  ADD  CONSTRAINT p2pg_intercompany_to_org_fkey
       FOREIGN KEY (to_company_id, org_id) REFERENCES p2pg_companies(id, org_id) ON DELETE CASCADE;

ALTER TABLE p2pg_bank_balances
  DROP CONSTRAINT IF EXISTS p2pg_bank_balances_bank_account_id_fkey,
  ADD  CONSTRAINT p2pg_bank_balances_account_org_fkey
       FOREIGN KEY (bank_account_id, org_id) REFERENCES p2pg_bank_accounts(id, org_id) ON DELETE CASCADE;

-- `p2pg_intercompany.loan_id` คงเป็น FK เดี่ยว + ON DELETE SET NULL โดยตั้งใจ
-- (composite + SET NULL จะพยายาม null `org_id` ที่ NOT NULL → ลบสัญญาไม่ได้ทั้งระบบ)
-- ความเป็น org เดียวกันบังคับที่ API layer (`refs` ใน api/p2p-group/_configs.ts)
