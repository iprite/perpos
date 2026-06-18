-- =========================================================
-- Meeting Bot — First-use consent (PDPA §8)
-- ของเดิม: user อัดไฟล์ตัวเอง · ฟีเจอร์บอท = เข้าไปบันทึก "ผู้ร่วมประชุมคนอื่น"
-- จึงต้องให้ผู้ส่งลิงก์ยืนยันรับผิดชอบการขอความยินยอมในห้องครั้งแรกก่อนส่งบอท
-- (footer disclaimer ไม่พอ — ต้องเป็น explicit acknowledgement)
-- =========================================================
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS bot_consent_at timestamptz;

COMMENT ON COLUMN public.profiles.bot_consent_at IS
  'เวลาที่ผู้ใช้กดยอมรับเงื่อนไขการใช้บอทประชุมครั้งแรก (PDPA consent) — null = ยังไม่เคยยอมรับ';
