-- ============================================================================
-- bi — Phase 3 residual [n6]: รัด write policy ของแดชบอร์ดให้ "สมมาตรกับ SELECT"
--
-- ที่มา: security review ของ feature `bi-dashboard`
--   20260724100000_bi_dashboard_phase3.sql:93-95, 108-111 ตั้ง write เป็น
--   is_org_admin(org_id, …) ขณะที่ SELECT ถูกรัดเป็น "เจ้าของ" (created_by = auth.uid())
--   ⇒ policy ไม่สมมาตร = กับดักเงียบ: วันนี้ไม่มีผลเพราะตารางถูก REVOKE จาก
--   anon/authenticated แล้ว แต่ถ้าอนาคตมีใคร GRANT … TO authenticated กลับมา
--   (เคยเป็น default ของ Supabase ตอนสร้างตาราง) → org admin คนใดก็ได้จะ
--   UPDATE/DELETE แดชบอร์ดส่วนตัวของคนอื่นได้ทันที
--
-- ⚠️ ไฟล์ 20260724100000_bi_dashboard_phase3.sql apply prod ไปแล้ว → ห้ามแก้
--    ไฟล์นี้เป็น migration แยก, idempotent (DROP POLICY IF EXISTS ก่อน CREATE)
--
-- ผลกระทบต่อของที่ใช้งานอยู่: ไม่มี — ทุก read/write ของ dashboard/item
--   วิ่งผ่าน service-role (`createAdminClient()` → lib/bi/dashboards.ts)
--   ซึ่ง bypass RLS อยู่แล้ว · ด่านสิทธิ์จริงคือโค้ด (กรอง created_by เอง)
--
-- ⚠️ ห้ามแตะตาราง/policy อื่นนอกจาก bi_dashboards / bi_dashboard_items
-- ============================================================================

BEGIN;

-- ===========================================================================
-- 1) bi_dashboards — write = เจ้าของเท่านั้น (ทรงเดียวกับ SELECT)
-- ===========================================================================
DROP POLICY IF EXISTS bi_dashboards_write ON public.bi_dashboards;
CREATE POLICY bi_dashboards_write ON public.bi_dashboards
  FOR ALL
  USING      (created_by = auth.uid() AND public.is_org_member(org_id, auth.uid()))
  WITH CHECK (created_by = auth.uid() AND public.is_org_member(org_id, auth.uid()));

-- ===========================================================================
-- 2) bi_dashboard_items — item ไม่มี created_by (เจ้าของอยู่ที่ dashboard ที่เดียว)
--    ⇒ EXISTS-owner ผูกกับ bi_dashboards ที่ตัวเองเป็นเจ้าของ (ทรงเดียวกับ SELECT)
-- ===========================================================================
DROP POLICY IF EXISTS bi_dashboard_items_write ON public.bi_dashboard_items;
CREATE POLICY bi_dashboard_items_write ON public.bi_dashboard_items
  FOR ALL
  USING (EXISTS (
    SELECT 1 FROM public.bi_dashboards d
     WHERE d.id = dashboard_id
       AND d.created_by = auth.uid()
       AND public.is_org_member(d.org_id, auth.uid())
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.bi_dashboards d
     WHERE d.id = dashboard_id
       AND d.created_by = auth.uid()
       AND public.is_org_member(d.org_id, auth.uid())
  ));

-- ===========================================================================
-- 3) REVOKE ให้ครบ role — 20260724090000_bi_schema.sql:708-716 REVOKE จาก
--    anon, authenticated เท่านั้น (ขาด PUBLIC จริง — ต่างจากบรรทัด REVOKE ของ
--    function ในไฟล์เดียวกันที่ใส่ PUBLIC ครบ) ⇒ เติมให้ตรงกัน
--    idempotent โดยธรรมชาติ (REVOKE สิทธิ์ที่ไม่มีอยู่ = no-op)
-- ===========================================================================
REVOKE ALL ON TABLE
  public.bi_metrics,
  public.bi_threads,
  public.bi_messages,
  public.bi_dashboards,
  public.bi_dashboard_items,
  public.bi_query_log,
  public.bi_usage_daily
FROM PUBLIC, anon, authenticated;

COMMIT;

-- ===========================================================================
-- VERIFY หลัง apply (รันมือ — ไม่ใช่ส่วนหนึ่งของ migration)
--
-- 1) policy ทั้ง 4 ของสองตารางต้อง "สมมาตร" (ไม่มี is_org_admin เหลืออยู่):
--    SELECT tablename, policyname, cmd, qual, with_check
--      FROM pg_policies
--     WHERE schemaname = 'public'
--       AND tablename IN ('bi_dashboards','bi_dashboard_items')
--     ORDER BY tablename, policyname;
--    -- คาดหวัง: ทั้ง _select และ _write อ้าง created_by = auth.uid()
--    --           และไม่มีคำว่า is_org_admin ปรากฏเลย
--
-- 2) ACL ของตาราง bi_* ต้องไม่มี anon/authenticated/PUBLIC (relacl = NULL หรือ
--    เหลือเฉพาะ owner/service_role):
--    SELECT relname, relacl FROM pg_class
--     WHERE relname LIKE 'bi\_%' AND relkind = 'r';
--
-- 3) ของที่ใช้งานอยู่ยังทำงาน (service-role bypass RLS):
--    เปิดหน้า /<org>/bi/dashboard แล้ว pin/ย้าย/ลบการ์ด 1 ครั้ง — ต้องผ่านปกติ
-- ===========================================================================
