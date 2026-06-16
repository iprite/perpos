-- Fix: security_definer_view ERROR (Supabase security advisor)
--
-- ปัญหา: vw_gl_posted_items และ vw_tax_output_vat ถูกสร้างแบบ default view
-- (owner = postgres, ไม่มี security_invoker) → query รันด้วยสิทธิ์ owner
-- → bypass RLS ของตารางต้นทาง (journal_items/journal_entries/accounts/contacts/invoices)
-- ทั้งสอง view ยังถูก GRANT SELECT ให้ทั้ง `authenticated` และ `anon`
-- → ใครก็ตามที่ถือ anon key สาธารณะ สามารถอ่าน GL / ภาษีขาย (output VAT)
--   ของ "ทุกองค์กร" ผ่าน PostgREST ได้ = cross-tenant + anonymous data leak
--   (ตัว .eq("organization_id", ...) ที่ฝั่ง app ไม่ใช่ขอบเขตความปลอดภัย —
--    เรียก REST ตรง ๆ ใส่ org อื่นได้)
--
-- วิธีแก้:
-- 1) ตั้ง security_invoker = true → view บังคับใช้ RLS ของตารางต้นทางตาม role ผู้เรียก
--    ตารางต้นทางทั้งหมดมี RLS แบบ org-membership อยู่แล้ว (is_org_member / inv_select)
--    → สมาชิก org เห็นเฉพาะ org ตัวเอง, ผู้ใช้ org อื่น/anon ถูกตัด
-- 2) REVOKE SELECT จาก anon (defense-in-depth — anon ไม่ควรอ่าน 2 view นี้เลย;
--    anon ไม่มีสิทธิ์ select ตารางต้นทางอยู่แล้ว แต่ตัด grant ออกให้สะอาด)
--
-- หมายเหตุ: ต้องใช้ Postgres 15+ (security_invoker) — Supabase รองรับ

BEGIN;

ALTER VIEW public.vw_gl_posted_items SET (security_invoker = true);
ALTER VIEW public.vw_tax_output_vat SET (security_invoker = true);

REVOKE SELECT ON public.vw_gl_posted_items FROM anon;
REVOKE SELECT ON public.vw_tax_output_vat FROM anon;

-- authenticated ยังต้อง SELECT ได้ (RLS ตารางต้นทางกรองให้เห็นเฉพาะ org ตัวเอง)
GRANT SELECT ON public.vw_gl_posted_items TO authenticated;
GRANT SELECT ON public.vw_tax_output_vat TO authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
