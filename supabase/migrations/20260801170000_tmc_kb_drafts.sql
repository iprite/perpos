-- ผู้ช่วยขาย TMC — ร่างความรู้ที่รอแอดมินกดยืนยันในกลุ่ม LINE
--
-- เดิม: แท็ก @perpos แล้วบันทึกทันที → AI เรียบเรียงผิดก็เขียนทับของจริงไปแล้ว
-- ใหม่: AI เรียบเรียงเสร็จ → ส่งการ์ดสรุปให้ทวนในกลุ่ม → กด "ยืนยันบันทึก" ถึงจะเขียนจริง
--
-- ร่างหมดอายุ 24 ชม. · กดยืนยันซ้ำไม่เขียนซ้ำ (status คุมอยู่)
CREATE TABLE IF NOT EXISTS public.tmc_kb_drafts (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id            uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  group_id          text NOT NULL,
  line_user_id      text,
  note              text NOT NULL,               -- ข้อความดิบที่แอดมินพิมพ์
  action            text NOT NULL CHECK (action IN ('create','update')),
  target_article_id uuid REFERENCES public.tmc_kb_articles(id) ON DELETE SET NULL,
  target_title      text,                        -- ชื่อบทความเดิมที่จะถูกเขียนทับ (โชว์ในการ์ด)
  category          text NOT NULL,
  title             text NOT NULL,
  content           text NOT NULL,
  keywords          text[] NOT NULL DEFAULT '{}',
  status            text NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending','applied','cancelled','expired')),
  applied_article_id uuid,
  expires_at        timestamptz NOT NULL DEFAULT now() + interval '24 hours',
  created_at        timestamptz NOT NULL DEFAULT now(),
  decided_at        timestamptz
);
CREATE INDEX IF NOT EXISTS tmc_kb_drafts_org_status_idx
  ON public.tmc_kb_drafts (org_id, status, created_at DESC);

ALTER TABLE public.tmc_kb_drafts ENABLE ROW LEVEL SECURITY;

-- อ่านได้: สมาชิก org · เขียน: service-role เท่านั้น (มาจาก webhook)
DROP POLICY IF EXISTS tmc_kb_drafts_select ON public.tmc_kb_drafts;
CREATE POLICY tmc_kb_drafts_select ON public.tmc_kb_drafts FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.organization_members m
          WHERE m.organization_id = org_id AND m.user_id = auth.uid())
);
