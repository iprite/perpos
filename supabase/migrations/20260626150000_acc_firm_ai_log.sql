-- ============================================================
-- acc_firm_ai_log — บันทึก cost/audit ของการเรียก AI ใน acc_firm
-- (เริ่มจาก F3 close-check narration — acc-firm-cockpit §3.5, D6)
--
-- ADDITIVE: ตารางใหม่ 1 ตัว ไม่แตะของเดิม.
-- เขียนผ่าน service-role (API route /api/acc-firm/*) เป็นหลัก →
-- RLS เป็น backstop (org isolation + ให้ firm member อ่าน log ของตัวเอง).
-- write ของ user ปกติถูก deny โดยปริยาย (ไม่มี policy FOR INSERT/UPDATE/DELETE);
-- service-role bypass RLS จึงเขียนได้.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.acc_firm_ai_log (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_org_id   uuid        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  client_org_id uuid        REFERENCES public.organizations(id) ON DELETE SET NULL,  -- client ที่ถูกตรวจ (nullable)
  feature       text        NOT NULL,                          -- เช่น 'close_check'
  model         text        NOT NULL,                          -- เช่น 'gpt-4o-mini' (cost คิดเฉพาะ openai)
  input_tokens  int         NOT NULL DEFAULT 0,
  output_tokens int         NOT NULL DEFAULT 0,
  cost_usd      numeric(10,6) NOT NULL DEFAULT 0,
  triggered_by  uuid        REFERENCES public.profiles(id) ON DELETE SET NULL,  -- user ที่สั่ง (audit)
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- index บน (firm_org_id, created_at) — query log ของ firm เรียงเวลาล่าสุด
CREATE INDEX IF NOT EXISTS acc_firm_ai_log_org_created_idx
  ON public.acc_firm_ai_log (firm_org_id, created_at DESC);

ALTER TABLE public.acc_firm_ai_log ENABLE ROW LEVEL SECURITY;

-- ── RLS ─────────────────────────────────────────────────────
-- SELECT: สมาชิกของ firm org อ่าน log ของ firm ตัวเองได้
--   ใช้ helper is_org_member (SECURITY DEFINER, มีจริง — นิยามใน
--   rls_fix_organization_members_recursion.sql) แทน inline EXISTS
--   organization_members ของ acc_firm เดิม → ผลลัพธ์เทียบเท่า (เช็คเป็นสมาชิก
--   org โดยไม่ดู is_active เหมือน acc_firm_client_configs / ocr_processing_jobs)
--   และกัน RLS recursion บน organization_members.
DROP POLICY IF EXISTS acc_firm_ai_log_select ON public.acc_firm_ai_log;
CREATE POLICY acc_firm_ai_log_select ON public.acc_firm_ai_log
  FOR SELECT
  TO authenticated
  USING (public.is_org_member(acc_firm_ai_log.firm_org_id, auth.uid()));

-- super_admin: full access (สอดคล้องกับทุกตาราง acc_firm เดิม)
DROP POLICY IF EXISTS acc_firm_ai_log_super_admin ON public.acc_firm_ai_log;
CREATE POLICY acc_firm_ai_log_super_admin ON public.acc_firm_ai_log
  FOR ALL
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'super_admin')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'super_admin')
  );

-- หมายเหตุ: ไม่มี policy INSERT/UPDATE/DELETE สำหรับ user ปกติ →
-- write เกิดได้เฉพาะทาง service-role (API layer) ซึ่ง bypass RLS.
-- เป็น log ที่ระบบเขียน ไม่ใช่ข้อมูลที่ user แก้เอง.

-- audit trigger: เป็น log อยู่แล้ว (immutable, append-only) ไม่ต้อง fn_audit_log_changes
-- (ต่างจาก acc_firm_client_configs/ocr_processing_jobs ที่เป็น mutable entity).
