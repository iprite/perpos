-- Migration: 20260616160000_stt_settings.sql
-- ตั้งค่าระดับแพลตฟอร์มสำหรับฟีเจอร์แกะเสียง/MoM (singleton row)
--   - default_quota_seconds: โควต้าเริ่มต้นที่ผู้ใช้ LINE ใหม่ได้รับตอน auto-onboarding
--     ใช้แทนค่า hardcode 18000 ใน api/line/_provision.ts ให้ super admin ปรับจาก UI ได้

BEGIN;

CREATE TABLE IF NOT EXISTS public.stt_settings (
  id                    boolean PRIMARY KEY DEFAULT true CHECK (id),  -- singleton: มีได้แค่ 1 row
  default_quota_seconds int NOT NULL DEFAULT 18000 CHECK (default_quota_seconds >= 0 AND default_quota_seconds <= 6000000),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  updated_by            uuid REFERENCES public.profiles(id) ON DELETE SET NULL
);

-- seed row เดียว (300 นาที = ค่าเดิม)
INSERT INTO public.stt_settings (id, default_quota_seconds)
VALUES (true, 18000)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.stt_settings ENABLE ROW LEVEL SECURITY;

-- อ่าน/เขียนได้เฉพาะ super admin ผ่าน authenticated; API routes ใช้ admin client (service role) อยู่แล้ว
DROP POLICY IF EXISTS stt_settings_super_admin ON public.stt_settings;
CREATE POLICY stt_settings_super_admin ON public.stt_settings
  FOR ALL
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'super_admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'super_admin'));

COMMIT;
