-- Migration: 20260721120000_acc_org_settings_branch.sql
-- เพิ่ม "สาขา" ของกิจการผู้ขาย ใน acc_org_settings
--
-- ป.รัษฎากร ม.86/4 (4) บังคับให้ใบกำกับภาษีแสดง "สำนักงานใหญ่" หรือ "สาขาที่ NNNNN"
-- ของทั้งผู้ขายและผู้ซื้อ · ฝั่งผู้ซื้อมีแล้วที่ acc_contacts.branch (text อิสระ)
-- แต่ฝั่งผู้ขาย (กิจการเจ้าของ org) ยังไม่มีที่เก็บเลย → เอกสารพิมพ์ไม่ครบตามกฎหมาย
--
-- ใช้ text อิสระให้สอดคล้องกับ acc_contacts.branch (เช่น "สำนักงานใหญ่", "สาขาที่ 00001")

ALTER TABLE public.acc_org_settings
  ADD COLUMN IF NOT EXISTS branch text;

COMMENT ON COLUMN public.acc_org_settings.branch IS
  'สาขาของกิจการผู้ขาย สำหรับแสดงบนใบกำกับภาษี (ม.86/4) เช่น "สำนักงานใหญ่" หรือ "สาขาที่ 00001"';
