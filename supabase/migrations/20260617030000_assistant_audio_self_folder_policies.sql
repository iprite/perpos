-- Assistant v2 — per-profile storage
-- ให้ผู้ใช้อัป/อ่าน/ลบไฟล์เสียงใต้โฟลเดอร์ของตัวเอง (<uid>/...) สำหรับ assistant แบบ per-profile
-- คงนโยบายเดิม (org folder) ไว้ — ไม่ทำของเก่าหาย

CREATE POLICY assistant_audio_self_insert ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'assistant_audio' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY assistant_audio_self_select ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'assistant_audio' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY assistant_audio_self_delete ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'assistant_audio' AND (storage.foldername(name))[1] = auth.uid()::text);
