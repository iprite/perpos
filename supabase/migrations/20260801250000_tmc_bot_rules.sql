-- ผู้ช่วยขาย TMC — "กฎประจำตัวบอท" (always-on instructions)
--
-- ปัญหาเดิม: ความรู้ทุกชิ้นถูกหยิบมาใช้ด้วย similarity กับคำถามลูกค้า
--   → คำสั่งเชิงพฤติกรรมอย่าง "เรียกลูกค้าว่าคุณท่านทุกคำ" ไม่มีทางแมตช์กับคำถามเรื่องราคา
--   → เขียนลงคลังความรู้เท่าไรบอทก็ไม่ทำตาม
-- ตารางนี้จึงแยกออกมา: ทุกแถวที่ is_active ถูกยัดเข้า prompt "ทุกครั้ง" ไม่ผ่าน retrieval
--
-- ⚠️ กฎห้ามทับกติกาความถูกต้อง (ห้ามเดา / ห้ามยืนยันการจอง / ต้องส่งต่อคน)
--    ด่านกันอยู่ 2 ชั้น: isUnsafeRule() ตอนสร้าง + ลำดับใน prompt (กติกาความถูกต้องอยู่หลังกฎเสมอ)
CREATE TABLE IF NOT EXISTS public.tmc_bot_rules (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id              uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  rule                text NOT NULL,                 -- ประโยคคำสั่งเดียว สั้น ชัด
  is_active           boolean NOT NULL DEFAULT true,
  sort_order          int NOT NULL DEFAULT 0,        -- น้อย = อยู่บนสุดของ prompt
  source              text NOT NULL DEFAULT 'web'    -- web = พิมพ์ในหน้าเว็บ · line = สั่งในกลุ่ม
                        CHECK (source IN ('web','line')),
  source_note         text,                          -- ข้อความดิบที่แอดมินพิมพ์ในกลุ่ม
  source_line_user_id text,
  previous_rule       text,                          -- ข้อความก่อนถูกเขียนทับ (กู้คืนได้)
  created_by          uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  updated_by          uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS tmc_bot_rules_org_idx
  ON public.tmc_bot_rules (org_id, is_active, sort_order);

ALTER TABLE public.tmc_bot_rules ENABLE ROW LEVEL SECURITY;

-- อ่าน = สมาชิก org · เขียน = owner/admin/management/team_lead (ท่าเดียวกับ tmc_kb_articles)
DO $$
DECLARE
  member_check text := 'EXISTS (SELECT 1 FROM public.organization_members m
                                WHERE m.organization_id = org_id AND m.user_id = auth.uid())';
  writer_check text := 'EXISTS (SELECT 1 FROM public.organization_members m
                                WHERE m.organization_id = org_id AND m.user_id = auth.uid()
                                  AND m.role IN (''owner'',''admin'',''management'',''team_lead''))';
BEGIN
  EXECUTE format('DROP POLICY IF EXISTS tmc_bot_rules_select ON public.tmc_bot_rules');
  EXECUTE format('DROP POLICY IF EXISTS tmc_bot_rules_insert ON public.tmc_bot_rules');
  EXECUTE format('DROP POLICY IF EXISTS tmc_bot_rules_update ON public.tmc_bot_rules');
  EXECUTE format('DROP POLICY IF EXISTS tmc_bot_rules_delete ON public.tmc_bot_rules');
  EXECUTE format('CREATE POLICY tmc_bot_rules_select ON public.tmc_bot_rules FOR SELECT USING (%s)', member_check);
  EXECUTE format('CREATE POLICY tmc_bot_rules_insert ON public.tmc_bot_rules FOR INSERT WITH CHECK (%s)', writer_check);
  EXECUTE format('CREATE POLICY tmc_bot_rules_update ON public.tmc_bot_rules FOR UPDATE USING (%s)', writer_check);
  EXECUTE format('CREATE POLICY tmc_bot_rules_delete ON public.tmc_bot_rules FOR DELETE USING (%s)', writer_check);
END $$;

-- ─── ร่างจากกลุ่ม LINE รองรับกฎด้วย (ยังต้องกดยืนยันเหมือนเดิม) ───────────────
ALTER TABLE public.tmc_kb_drafts
  ADD COLUMN IF NOT EXISTS kind           text NOT NULL DEFAULT 'article',
  ADD COLUMN IF NOT EXISTS target_rule_id uuid REFERENCES public.tmc_bot_rules(id) ON DELETE SET NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'tmc_kb_drafts_kind_check'
  ) THEN
    ALTER TABLE public.tmc_kb_drafts
      ADD CONSTRAINT tmc_kb_drafts_kind_check CHECK (kind IN ('article','rule'));
  END IF;
END $$;
