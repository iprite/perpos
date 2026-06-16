-- Migration: 20260616170000_admin_audit_log.sql
-- บันทึก action ระดับแอปของ super admin (login-as, ลบ user, reset รหัส, ยกเลิก subscription,
-- ปรับสิทธิ์/โควต้า ฯลฯ) — แยกจาก audit_logs v2 (ที่เป็น tamper-evident hash chain ของ DML)
-- เพราะ action เหล่านี้ไม่ใช่ INSERT/UPDATE/DELETE ตรงๆ และบางอย่าง (auth.deleteUser, Stripe)
-- ไม่แตะตารางที่มี trigger จึงไม่ถูกบันทึกเลยในปัจจุบัน

BEGIN;

CREATE TABLE IF NOT EXISTS public.admin_audit_log (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id     uuid REFERENCES public.profiles(id) ON DELETE SET NULL,  -- super admin ที่กดสั่ง
  actor_email  text,
  action       text NOT NULL,                 -- e.g. 'user.delete', 'user.reset_password', 'impersonate.start'
  target_type  text,                          -- 'user' | 'org' | 'subscription' | 'stt_job' ...
  target_id    text,                          -- id ของเป้าหมาย (uuid/string)
  target_label text,                          -- ชื่อ/อีเมล เพื่ออ่านง่ายแม้เป้าหมายถูกลบ
  metadata     jsonb NOT NULL DEFAULT '{}',   -- รายละเอียดเพิ่มเติม (reason, old/new ฯลฯ)
  ip_address   text,
  user_agent   text,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_admin_audit_log_created   ON public.admin_audit_log (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_audit_log_actor     ON public.admin_audit_log (actor_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_audit_log_action    ON public.admin_audit_log (action, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_audit_log_target    ON public.admin_audit_log (target_type, target_id);

ALTER TABLE public.admin_audit_log ENABLE ROW LEVEL SECURITY;

-- อ่านได้เฉพาะ super admin; เขียนผ่าน service role (API routes) เท่านั้น — ไม่เปิด INSERT ให้ใคร
-- จึงกันการปลอม/ลบ log จากฝั่ง client (append-only โดยพฤตินัย)
DROP POLICY IF EXISTS admin_audit_log_read ON public.admin_audit_log;
CREATE POLICY admin_audit_log_read ON public.admin_audit_log
  FOR SELECT
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'super_admin'));

COMMIT;
