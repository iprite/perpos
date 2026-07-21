-- desk_assets — public Storage bucket สำหรับรูป/screenshot ของ Product Documents + Presentation desk
--
-- เลิกฝังรูปเป็น base64 data URI ใน HTML (row บวม, ชน limit pdf-renderer 1.5MB) → อัปขึ้น Storage
-- แล้วอ้างด้วย public URL (absolute) แทน. public URL ทำงานทั้ง iframe srcDoc (admin) และ pdf-renderer
-- (Chromium setContent + networkidle ดึง absolute URL ได้).
--
-- โครง path: product-docs/<slug>/<asset-id>.<ext> · presentations/<slug>/<asset-id>.<ext>
-- เขียนผ่าน service role (factory upload ด้วย service key — bypass RLS) จึงไม่ต้องมี insert policy

BEGIN;

INSERT INTO storage.buckets (id, name, public)
VALUES ('desk_assets', 'desk_assets', true)
ON CONFLICT (id) DO UPDATE SET public = EXCLUDED.public;

-- อ่านสาธารณะ (รูปในเอกสาร/เด็คต้องโหลดได้จาก iframe + Chromium โดยไม่ต้อง auth)
DROP POLICY IF EXISTS "desk_assets_public_read" ON storage.objects;
CREATE POLICY "desk_assets_public_read" ON storage.objects
FOR SELECT
TO public
USING (bucket_id = 'desk_assets');

NOTIFY pgrst, 'reload config';

COMMIT;
