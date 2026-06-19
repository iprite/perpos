-- P1c: เก็บผลลัพธ์งานบีบ PDF (kind=pdf_compress) — pages/size/path ใน jsonb เดียว
--   { source_path, output_path, pages, size_before, size_after, ratio, no_gain }
ALTER TABLE public.assistant_jobs ADD COLUMN IF NOT EXISTS pdf_meta jsonb;
