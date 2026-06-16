-- assistant_audio: web อัปไป <profileId>/ (self-folder policy) · LINE /mom ไม่ใช้ bucket (โหลดเสียงจาก LINE ตรง)
-- → org-folder policies ไม่ถูกใช้แล้ว ลบทิ้งให้กระชับ (เหลือ self-folder + service role)
DROP POLICY IF EXISTS assistant_audio_member_insert ON storage.objects;
DROP POLICY IF EXISTS assistant_audio_member_select ON storage.objects;
DROP POLICY IF EXISTS assistant_audio_member_delete ON storage.objects;
