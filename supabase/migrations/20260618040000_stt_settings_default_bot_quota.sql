-- ผู้ช่วย AI — default bot quota ผู้ใช้ใหม่ (super_admin ปรับได้ เหมือน default_quota_seconds เดิม)
--   ใช้ตอน auto-onboarding (_provision.ensureBotQuota) — default 7200 วินาที = 120 นาที
ALTER TABLE public.stt_settings
  ADD COLUMN IF NOT EXISTS default_bot_quota_seconds int NOT NULL DEFAULT 7200
    CHECK (default_bot_quota_seconds >= 0 AND default_bot_quota_seconds <= 6000000);
