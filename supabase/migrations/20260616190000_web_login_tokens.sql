-- Magic-link tokens สำหรับ LINE user เคลมบัญชีขึ้นเว็บ (one-time, อายุสั้น)
CREATE TABLE IF NOT EXISTS public.web_login_tokens (
  token      text PRIMARY KEY,
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  used_at    timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.web_login_tokens ENABLE ROW LEVEL SECURITY;
-- ไม่มี policy → เข้าถึงผ่าน service role (admin client) เท่านั้น
CREATE INDEX IF NOT EXISTS idx_web_login_tokens_profile ON public.web_login_tokens (profile_id);
