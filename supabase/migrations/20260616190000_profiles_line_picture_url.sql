-- เก็บ URL รูปโปรไฟล์ LINE ของผู้ใช้ (ดึงจาก LINE profile API ตอน follow/provision)
-- ใช้แสดง avatar ในหน้า admin/stt-users และที่อื่นๆ
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS line_picture_url TEXT;
