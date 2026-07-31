-- ผู้ช่วยขาย TMC — คลังรูปห้องพัก (ดึงจาก landing site iprite/tmc)
--
-- ทำไมต้องเก็บรูปเอง ไม่ลิงก์รูปจากเว็บ landing ตรง ๆ:
--   เว็บ landing แปลงรูปเป็น .webp ตอน build (ชื่อไฟล์มี hash) แต่ **LINE ส่งรูปได้เฉพาะ JPEG/PNG**
--   → ต้องอัปโหลดไฟล์ต้นฉบับ .jpeg เข้า Storage ของเราเอง แล้วใช้ public URL ที่ LINE ดึงได้
--
-- category มาจาก Gemini vision (อ่านรูปแล้วจัดหมวด) — ชื่อไฟล์เดิมไม่มีความหมาย (1.jpeg, DSC04857.jpeg)
-- ลูกค้าถาม "ขอรูปห้องนอน" จึงต้องพึ่งหมวดที่ AI ติดให้ ไม่ใช่ชื่อไฟล์
CREATE TABLE IF NOT EXISTS public.tmc_villa_photos (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id       uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  villa_slug   text NOT NULL,              -- thammachat-grand / thammachat-villa / ...
  villa_name   text NOT NULL,              -- ชื่อไทยที่ลูกค้าเรียก
  file_name    text NOT NULL,
  storage_path text NOT NULL,              -- path ใน bucket tmc-villa
  public_url   text NOT NULL,
  category     text NOT NULL DEFAULT 'อื่นๆ',
  caption      text,
  sort_order   int NOT NULL DEFAULT 0,
  is_active    boolean NOT NULL DEFAULT true,
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, villa_slug, file_name)
);
CREATE INDEX IF NOT EXISTS tmc_villa_photos_lookup_idx
  ON public.tmc_villa_photos (org_id, villa_slug, category) WHERE is_active;

ALTER TABLE public.tmc_villa_photos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tmc_villa_photos_select ON public.tmc_villa_photos;
CREATE POLICY tmc_villa_photos_select ON public.tmc_villa_photos FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.organization_members m
          WHERE m.organization_id = org_id AND m.user_id = auth.uid())
);
-- เขียนผ่าน service-role เท่านั้น (สคริปต์นำเข้า)
