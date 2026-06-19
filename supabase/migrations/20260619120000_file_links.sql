-- =========================================================
-- Short-code ลิงก์ดาวน์โหลดไฟล์ (MoM/เสียง) ที่ส่งทาง LINE → app.perpos.io/f/<code>
--   code = สุ่ม unguessable (bearer) → map ไป job + kind · route สร้าง signed URL สดทุกครั้ง
--   ลบพร้อมไฟล์ที่ 48 ชม. (PDPA cleanup ใน scheduler)
-- =========================================================
CREATE TABLE IF NOT EXISTS public.file_links (
  code       text PRIMARY KEY,
  job_id     uuid NOT NULL REFERENCES public.assistant_jobs(id) ON DELETE CASCADE,
  kind       text NOT NULL CHECK (kind IN ('mom', 'audio')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_file_links_created ON public.file_links (created_at);

ALTER TABLE public.file_links ENABLE ROW LEVEL SECURITY;
-- ไม่มี policy เปิด → service role เท่านั้น (route handler ใช้ admin client)
