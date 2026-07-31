-- ผู้ช่วยขาย TMC — ร่องรอยที่มาของความรู้แต่ละบทความ
--
-- ความรู้เพิ่มได้ 2 ทาง: หน้าเว็บ (web) และแท็ก @perpos ในกลุ่ม LINE ของทีมแอดมิน (line)
-- ทางที่ 2 เขียนทับของเดิมได้โดย AI เป็นคนตัดสิน → ต้องเก็บ "ข้อความต้นฉบับที่แอดมินพิมพ์"
-- ไว้เสมอ ไม่งั้นพอข้อมูลเพี้ยนจะสืบไม่ได้ว่ามาจากไหน ใครพิมพ์ และของเดิมคืออะไร
ALTER TABLE public.tmc_kb_articles
  ADD COLUMN IF NOT EXISTS source              text NOT NULL DEFAULT 'web'
    CHECK (source IN ('web','line','seed')),
  ADD COLUMN IF NOT EXISTS source_note         text,
  ADD COLUMN IF NOT EXISTS source_line_user_id text,
  ADD COLUMN IF NOT EXISTS previous_content    text;

COMMENT ON COLUMN public.tmc_kb_articles.source_note IS
  'ข้อความดิบที่แอดมินพิมพ์ในกลุ่ม LINE ก่อน AI เรียบเรียง';
COMMENT ON COLUMN public.tmc_kb_articles.previous_content IS
  'เนื้อหาก่อนการแก้ครั้งล่าสุดจากช่องทาง LINE — ใช้กู้คืนเมื่อ AI เรียบเรียงผิด';
