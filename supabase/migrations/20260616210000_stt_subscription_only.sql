-- โมเดล STT: subscription อย่างเดียว (ไม่มี topup) · แพ็ก 300 นาที/เดือน หมดอายุทุก 30 วัน (รีเซ็ตรอบ)
--   1) ปิดแพ็ก topup ทั้งหมด (ไม่ขายแล้ว) — code/RPC topup ยังอยู่แต่ไม่มี active plan ใช้
--   2) expire_stt_plan — ตอน subscription ถูกยกเลิก/ค้างชำระ → ล้างโควต้าแผนที่เหลือ (ไม่ให้นาทีค้างถาวร)

UPDATE public.stt_plans SET is_active = false, updated_at = now() WHERE kind = 'topup';

CREATE OR REPLACE FUNCTION public.expire_stt_plan(p_profile_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  -- subscription จบ → โควต้าแผนหมด เหลือเฉพาะ topup (ปัจจุบันไม่มี → 0)
  UPDATE public.stt_quota
     SET plan_seconds  = 0,
         limit_seconds = topup_seconds,
         used_seconds  = LEAST(used_seconds, topup_seconds),
         updated_at    = now()
   WHERE profile_id = p_profile_id;
END; $$;

REVOKE ALL ON FUNCTION public.expire_stt_plan(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.expire_stt_plan(uuid) TO service_role;
