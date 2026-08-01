-- ── ocr-worker เก็บ token จริง → เลิกใช้ค่าประมาณต่องาน ────────────────────────
--
-- เดิม `gemini:ocr_job` เป็นค่าประมาณ $0.0078/งาน เพราะ ocr_processing_jobs ไม่มีคอลัมน์ token
-- ตอนนี้ worker สะสม usageMetadata ของ Gemini ทั้ง 3 call (extract → classify → journal)
-- แล้วเขียนลงแถวงานพร้อม status → trigger คิดต้นทุนจาก token จริงได้เหมือน assistant_jobs
--
-- สองอย่างที่เปลี่ยนพฤติกรรม
--   1) มี token จริง → คิดตามราคาโมเดล · ไม่มี (งานเก่า / worker เวอร์ชันเก่ายังไม่ deploy)
--      → ถอยไปใช้ค่าประมาณต่องานเหมือนเดิม ไม่ทำให้ต้นทุนหาย
--   2) นับงานที่ **ล้ม** ด้วย ถ้ามี token — เอกสารพัง/โดน safety filter ก็จ่ายค่า call ที่ยิงไปแล้ว
--      (trigger เดิมนับเฉพาะ completed → ต้นทุนส่วนนี้หายเงียบ ๆ)

BEGIN;

ALTER TABLE public.ocr_processing_jobs
  ADD COLUMN IF NOT EXISTS input_tokens  integer,
  ADD COLUMN IF NOT EXISTS output_tokens integer,
  ADD COLUMN IF NOT EXISTS ai_calls      integer,
  ADD COLUMN IF NOT EXISTS model         text;

COMMENT ON COLUMN public.ocr_processing_jobs.input_tokens IS
  'token รวมของ Gemini ทุก call ในงานนี้ (ocr-worker เขียน) — NULL = งานก่อนมีการเก็บ';

CREATE OR REPLACE FUNCTION public.usage_event_from_ocr_job()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_in    bigint := COALESCE(NEW.input_tokens, 0);
  v_out   bigint := COALESCE(NEW.output_tokens, 0);
  v_exact boolean := NEW.input_tokens IS NOT NULL;
  v_cost  numeric;
BEGIN
  IF NEW.status NOT IN ('completed', 'failed') THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND OLD.status = NEW.status THEN RETURN NEW; END IF;
  -- งานที่ล้มก่อนยิง Gemini เลย (เช่นสิทธิ์ไม่ผ่าน) ไม่มีต้นทุน AI → ไม่ต้องบันทึก
  IF NEW.status = 'failed' AND NOT v_exact THEN RETURN NEW; END IF;

  v_cost := CASE
    WHEN v_exact THEN v_in  * public.usage_price_usd('gemini-2.5-flash:text_in')
                    + v_out * public.usage_price_usd('gemini-2.5-flash:out')
    ELSE public.usage_price_usd('gemini:ocr_job')   -- งานเก่าที่ไม่มี token
  END;

  INSERT INTO public.usage_events
    (org_id, profile_id, service, feature, resource, quantity, unit,
     input_tokens, output_tokens, cost_usd, ref_table, ref_id, meta, created_at)
  VALUES
    (NEW.firm_org_id, NEW.triggered_by, 'gemini', 'acc_firm.ocr',
     COALESCE(NEW.model, 'gemini-2.5-flash'),
     CASE WHEN v_exact THEN v_in + v_out ELSE 1 END,
     CASE WHEN v_exact THEN 'token' ELSE 'job' END,
     v_in, v_out, v_cost,
     'ocr_processing_jobs', NEW.id,
     jsonb_build_object('client_org_id', NEW.client_org_id, 'estimated', NOT v_exact,
                        'ai_calls', NEW.ai_calls, 'job_status', NEW.status),
     COALESCE(NEW.updated_at, now()))
  ON CONFLICT DO NOTHING;

  -- compute ของ worker คิดเฉพาะงานที่ทำจนจบ
  IF NEW.status = 'completed' THEN
    INSERT INTO public.usage_events
      (org_id, profile_id, service, feature, resource, quantity, unit, cost_usd,
       ref_table, ref_id, meta, created_at)
    VALUES
      (NEW.firm_org_id, NEW.triggered_by, 'compute', 'acc_firm.ocr_compute', 'ocr-worker',
       1, 'job', public.usage_price_usd('compute:ocr_job'),
       'ocr_processing_jobs', NEW.id,
       jsonb_build_object('client_org_id', NEW.client_org_id),
       COALESCE(NEW.updated_at, now()))
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'usage_event_from_ocr_job failed: %', SQLERRM;
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS usage_event_ocr_job ON public.ocr_processing_jobs;
CREATE TRIGGER usage_event_ocr_job
  AFTER INSERT OR UPDATE OF status ON public.ocr_processing_jobs
  FOR EACH ROW EXECUTE FUNCTION public.usage_event_from_ocr_job();

UPDATE public.usage_prices
SET label = 'OCR ถอดบิล — Gemini ต่อ 1 งาน (ใช้เฉพาะงานเก่าที่ไม่มี token)', updated_at = now()
WHERE key = 'gemini:ocr_job';

COMMIT;
