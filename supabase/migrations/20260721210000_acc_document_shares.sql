-- acc_document_shares — ลิงก์สาธารณะสำหรับส่งเอกสารให้ลูกค้าปลายทาง (Phase 2 self-service)
--
-- ลูกค้าของ SME ส่วนใหญ่ไม่มีบัญชีในระบบ และไม่ควรต้องมี → ส่ง "ลิงก์ที่เดาไม่ได้"
-- ให้เปิดดู/โหลด PDF ได้เลย. token = ความลับ (capability URL) จึงต้อง:
--   • สุ่มยาวพอจนเดาไม่ได้ (สร้างฝั่ง API ด้วย crypto)
--   • เพิกถอนได้ (revoked_at) + หมดอายุได้ (expires_at)
--   • ผูกกับเอกสารใบเดียว ไม่ใช่ทั้ง org (หลุด 1 ลิงก์ = หลุด 1 ใบ)
-- ตารางนี้ RLS deny-all — อ่าน/เขียนผ่าน service role ใน route handler เท่านั้น

CREATE TABLE IF NOT EXISTS public.acc_document_shares (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id         uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  document_id    uuid NOT NULL REFERENCES public.acc_documents(id) ON DELETE CASCADE,
  token          text NOT NULL UNIQUE,
  expires_at     timestamptz,
  revoked_at     timestamptz,
  view_count     integer NOT NULL DEFAULT 0,
  last_viewed_at timestamptz,
  created_by     uuid REFERENCES public.profiles(id),
  created_at     timestamptz NOT NULL DEFAULT now()
);

-- 1 เอกสาร = 1 ลิงก์ที่ยังใช้ได้ (ออกใหม่ = เพิกถอนใบเดิมก่อน) → ป้องกันลิงก์ค้างเต็มไปหมด
CREATE UNIQUE INDEX IF NOT EXISTS acc_document_shares_active_uniq
  ON public.acc_document_shares (document_id)
  WHERE revoked_at IS NULL;

CREATE INDEX IF NOT EXISTS acc_document_shares_org_idx
  ON public.acc_document_shares (org_id, created_at DESC);

ALTER TABLE public.acc_document_shares ENABLE ROW LEVEL SECURITY;
-- ไม่มี policy = deny-all สำหรับ anon/authenticated (service role bypass RLS)
