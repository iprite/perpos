-- Migration: 20260617070000_profiles_personal_org_id.sql
--
-- เป้าหมาย: เลิก "เดา" personal org ของผู้ใช้ด้วย regex/prefix ใน app layer
--   (assistant-auth.ts resolveHomeOrg เคยหา personal org จากชื่อ "พื้นที่ส่วนตัว%"
--    หรือ slug ~ '^u[a-z0-9]{10}$' — เปราะ: ถ้าใครเปลี่ยนชื่อ org/slug จะหาไม่เจอเงียบ ๆ)
--
-- แทนที่ด้วยคอลัมน์ตรง ๆ บน profiles ที่ provisioning เขียนตอนสร้าง/reuse personal org
-- → resolveHomeOrg อ่านคอลัมน์นี้ deterministic
--
-- backfill ใช้ logic regex เดิม "ครั้งสุดท้าย" แล้วเลิกพึ่ง pattern ตลอดไป

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS personal_org_id uuid
    REFERENCES public.organizations(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.profiles.personal_org_id IS
  'home org ของผู้ใช้ (per-profile assistant ใช้เป็นที่เก็บไฟล์/เรียก worker) — เขียนโดย provisionLineUser; แทนการเดาด้วย regex';

-- backfill: personal org = owner membership ของ org ที่ชื่อ/slug เข้าเกณฑ์ personal (เกณฑ์เดิม)
WITH personal AS (
  SELECT DISTINCT ON (om.user_id) om.user_id, om.organization_id
  FROM public.organization_members om
  JOIN public.organizations o ON o.id = om.organization_id
  WHERE om.role = 'owner'
    AND (o.name LIKE 'พื้นที่ส่วนตัว%' OR o.slug ~ '^u[a-z0-9]{10}$')
  ORDER BY om.user_id, o.created_at
)
UPDATE public.profiles p
SET personal_org_id = personal.organization_id
FROM personal
WHERE personal.user_id = p.id
  AND p.personal_org_id IS NULL;
