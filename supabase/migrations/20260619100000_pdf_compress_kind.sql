-- ผู้ช่วย AI kind ที่ 2: บีบขนาด PDF (pdf_compress) — per-profile, page-based quota
--   มิเตอร์ = "จำนวนหน้า" (ต่างจาก stt ที่เป็น "วินาที") → ตารางแยก pdf_* เด็ดขาด
--   โครง mirror จาก stt_quota/stt_settings/refund_stt_job (ดู docs/PDF_COMPRESS_FEATURE.md §4)
--
-- P1a (Foundation): DB + RPC + bucket + คอลัมน์ pdf_drive_url
--   gate (kinds.ts) + onboarding (_provision.ts) แก้ในโค้ดแยก

BEGIN;

-- ── 1. ลงทะเบียน module `pdf_compress` ────────────────────────────────────────
INSERT INTO module_registry (key, label, href_slug, description, is_specific, is_builtin, is_active, is_personal, sort_order)
VALUES ('pdf_compress', 'บีบขนาด PDF', 'assistant/pdf', 'ลดขนาดไฟล์ PDF คงความชัด — ระดับบุคคล', false, true, true, true, 8)
ON CONFLICT (key) DO NOTHING;

-- ── 2. pdf_quota (per profile) — limit/used หน้า (admin ปรับ limit ได้) ─────────
CREATE TABLE IF NOT EXISTS public.pdf_quota (
  profile_id  uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  limit_pages int NOT NULL DEFAULT 20,
  used_pages  int NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.pdf_quota ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS pdf_quota_select_own ON public.pdf_quota;
CREATE POLICY pdf_quota_select_own ON public.pdf_quota
  FOR SELECT TO authenticated USING (profile_id = auth.uid());

-- ── 3. ledger ทุก debit/refund (หน้า) ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.pdf_usage_transactions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id  uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  job_id      uuid REFERENCES public.assistant_jobs(id) ON DELETE SET NULL,
  kind        text NOT NULL CHECK (kind IN ('debit', 'refund')),
  pages       int NOT NULL,
  source      text,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_pdf_usage_profile ON public.pdf_usage_transactions (profile_id, created_at DESC);
ALTER TABLE public.pdf_usage_transactions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS pdf_usage_select_own ON public.pdf_usage_transactions;
CREATE POLICY pdf_usage_select_own ON public.pdf_usage_transactions
  FOR SELECT TO authenticated USING (profile_id = auth.uid());

-- ── 4. pdf_settings (singleton) — default trial หน้าสำหรับผู้ใช้ใหม่ ───────────
CREATE TABLE IF NOT EXISTS public.pdf_settings (
  id                  boolean PRIMARY KEY DEFAULT true CHECK (id),
  default_quota_pages int NOT NULL DEFAULT 20 CHECK (default_quota_pages >= 0 AND default_quota_pages <= 1000000),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  updated_by          uuid REFERENCES public.profiles(id) ON DELETE SET NULL
);
INSERT INTO public.pdf_settings (id, default_quota_pages) VALUES (true, 20)
ON CONFLICT (id) DO NOTHING;
ALTER TABLE public.pdf_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS pdf_settings_super_admin ON public.pdf_settings;
CREATE POLICY pdf_settings_super_admin ON public.pdf_settings
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'super_admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'super_admin'));

-- ── 5a. consume_pdf_quota (atomic reserve) — เรียกตอนยืนยันบีบ ─────────────────
CREATE OR REPLACE FUNCTION public.consume_pdf_quota(p_profile_id uuid, p_pages int, p_job_id uuid, p_source text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_limit int; v_used int; v_remaining int;
BEGIN
  IF p_pages IS NULL OR p_pages < 0 THEN p_pages := 0; END IF;
  INSERT INTO public.pdf_quota(profile_id) VALUES (p_profile_id) ON CONFLICT (profile_id) DO NOTHING;
  SELECT limit_pages, used_pages INTO v_limit, v_used
    FROM public.pdf_quota WHERE profile_id = p_profile_id FOR UPDATE;
  v_remaining := v_limit - v_used;
  IF p_pages > v_remaining THEN
    RETURN jsonb_build_object('ok', false, 'remaining_pages', v_remaining, 'limit_pages', v_limit, 'used_pages', v_used);
  END IF;
  UPDATE public.pdf_quota SET used_pages = used_pages + p_pages, updated_at = now() WHERE profile_id = p_profile_id;
  INSERT INTO public.pdf_usage_transactions(profile_id, job_id, kind, pages, source)
    VALUES (p_profile_id, p_job_id, 'debit', p_pages, p_source);
  RETURN jsonb_build_object('ok', true, 'remaining_pages', v_remaining - p_pages, 'limit_pages', v_limit, 'used_pages', v_used + p_pages);
END; $$;

-- ── 5b. refund_pdf_quota (คืนตรง ๆ ตามจำนวน) ──────────────────────────────────
CREATE OR REPLACE FUNCTION public.refund_pdf_quota(p_profile_id uuid, p_pages int, p_job_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF p_pages IS NULL OR p_pages <= 0 THEN RETURN; END IF;
  UPDATE public.pdf_quota SET used_pages = GREATEST(0, used_pages - p_pages), updated_at = now() WHERE profile_id = p_profile_id;
  INSERT INTO public.pdf_usage_transactions(profile_id, job_id, kind, pages, source)
    VALUES (p_profile_id, p_job_id, 'refund', p_pages, 'refund');
END; $$;

-- ── 5c. refund_pdf_job (idempotent, ผูกกับ job) — worker ตาย/scheduler sweep คืนได้ ─
CREATE OR REPLACE FUNCTION public.refund_pdf_job(p_job_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_profile uuid; v_pages int;
BEGIN
  IF p_job_id IS NULL THEN RETURN false; END IF;
  IF EXISTS (SELECT 1 FROM public.pdf_usage_transactions WHERE job_id = p_job_id AND kind = 'refund') THEN
    RETURN false;
  END IF;
  SELECT profile_id, pages INTO v_profile, v_pages
    FROM public.pdf_usage_transactions WHERE job_id = p_job_id AND kind = 'debit' LIMIT 1;
  IF v_profile IS NULL OR v_pages IS NULL OR v_pages <= 0 THEN RETURN false; END IF;
  UPDATE public.pdf_quota SET used_pages = GREATEST(0, used_pages - v_pages), updated_at = now()
    WHERE profile_id = v_profile;
  INSERT INTO public.pdf_usage_transactions(profile_id, job_id, kind, pages, source)
    VALUES (v_profile, p_job_id, 'refund', v_pages, 'auto-refund');
  RETURN true;
END; $$;

-- ── 5d. ความปลอดภัย: RPC เรียกได้เฉพาะ service_role ─────────────────────────────
--   ⚠️ Supabase grant EXECUTE ให้ anon+authenticated เป็น default → REVOKE FROM PUBLIC ไม่พอ
--   ต้อง REVOKE จาก anon, authenticated ตรง ๆ (กัน user เติม/คืนโควต้าเองผ่าน anon key)
REVOKE ALL ON FUNCTION public.consume_pdf_quota(uuid, int, uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.refund_pdf_quota(uuid, int, uuid)        FROM PUBLIC;
REVOKE ALL ON FUNCTION public.refund_pdf_job(uuid)                     FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.consume_pdf_quota(uuid, int, uuid, text) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.refund_pdf_quota(uuid, int, uuid)        FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.refund_pdf_job(uuid)                     FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_pdf_quota(uuid, int, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.refund_pdf_quota(uuid, int, uuid)        TO service_role;
GRANT EXECUTE ON FUNCTION public.refund_pdf_job(uuid)                     TO service_role;

-- ── 6. assistant_jobs: ลิงก์ไฟล์บน Google Drive (mirror mom_drive_url) ──────────
ALTER TABLE public.assistant_jobs ADD COLUMN IF NOT EXISTS pdf_drive_url text;

-- ── 7. Storage bucket assistant_pdf (private) ─────────────────────────────────
--   file_size_limit = 100MB (จุดบังคับใช้แข็งสุด — กัน worker OOM/ถม storage) · เฉพาะ application/pdf
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('assistant_pdf', 'assistant_pdf', false, 104857600, ARRAY['application/pdf'])
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- per-profile: อ่าน/อัป/ลบเฉพาะไฟล์ใต้โฟลเดอร์ <uid>/ ของตัวเอง (service role bypass RLS)
DROP POLICY IF EXISTS assistant_pdf_self_insert ON storage.objects;
DROP POLICY IF EXISTS assistant_pdf_self_select ON storage.objects;
DROP POLICY IF EXISTS assistant_pdf_self_delete ON storage.objects;
CREATE POLICY assistant_pdf_self_insert ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'assistant_pdf' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY assistant_pdf_self_select ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'assistant_pdf' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY assistant_pdf_self_delete ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'assistant_pdf' AND (storage.foldername(name))[1] = auth.uid()::text);

COMMIT;
