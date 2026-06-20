-- ── Cleanup: ลบระบบ quota เก่า (แทนที่ด้วย token ledger แล้วใน T1–T6) ───────────
-- ตาราง quota/ledger ต่อฟีเจอร์ (stt/bot/pdf) เลิกใช้ตั้งแต่ T2 (shim RPC → token_ledger)
-- · ไม่มี app reader / view / FK เหลือ (ตรวจแล้ว) · RPC shim (consume_*/hold_*/...) เขียน token_ledger ล้วน
--
-- ฟังก์ชัน subscription เก่า (apply_stt_payment/expire_stt_plan) ยังอ้าง stt_quota →
-- แทนด้วย no-op stub (subscription ปลดระวางแล้ว, subs active=0, payments=0) กัน dangling +
-- webhook stt-sub handler ที่ตายแล้วเรียกได้โดยไม่ error (คงลายเซ็นเดิม)

BEGIN;

-- 1) stub ฟังก์ชัน subscription เก่า (ตัด dependency กับ stt_quota)
CREATE OR REPLACE FUNCTION public.apply_stt_payment(
  p_profile_id uuid, p_plan_id uuid, p_kind text, p_amount numeric, p_currency text,
  p_minutes integer, p_status text, p_payment_intent text, p_invoice text, p_event_id text,
  p_meter text DEFAULT 'stt'
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  -- deprecated: ระบบ subscription/quota เก่าเลิกใช้แล้ว (ใช้ token packs แทน) — no-op
  RETURN jsonb_build_object('ok', false, 'deprecated', true);
END; $$;

CREATE OR REPLACE FUNCTION public.expire_stt_plan(p_profile_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  -- deprecated — no-op
  RETURN;
END; $$;

-- 2) drop ตาราง quota + ledger เก่า (ไม่มี dependency เหลือ)
DROP TABLE IF EXISTS public.stt_usage_transactions;
DROP TABLE IF EXISTS public.bot_usage_transactions;
DROP TABLE IF EXISTS public.pdf_usage_transactions;
DROP TABLE IF EXISTS public.stt_quota;
DROP TABLE IF EXISTS public.bot_quota;
DROP TABLE IF EXISTS public.pdf_quota;

NOTIFY pgrst, 'reload config';
COMMIT;
