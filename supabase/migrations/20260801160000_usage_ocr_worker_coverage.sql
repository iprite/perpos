-- ── ปิดจุดบอด: ต้นทุน Gemini ของ ocr-worker ไม่เคยถูกนับเลย ────────────────────
--
-- ที่มา: เทียบจำนวน request จริงของ generativelanguage API (920 ครั้ง/30 วัน จาก Cloud Monitoring
-- ของโปรเจกต์ gen-lang-client-0874375942) กับสิ่งที่ระบบบันทึกได้ แล้วไล่หาเส้นทางที่หลุด
--
-- ocr-worker เรียก Gemini 3 ครั้งต่องาน (extract → classify → journal) แต่:
--   · ไม่ผ่าน `aiChat` ฝั่งแอป (เป็น service แยกบน Cloud Run)  → recordUsage ไม่เห็น
--   · `ocr_processing_jobs` ไม่มีคอลัมน์ token เลย                → trigger คิดจากของจริงไม่ได้
-- ⇒ เป็นจุดบอด **ถาวร** ไม่ใช่แค่ช่วงก่อน deploy (ต่างจาก bi/tmc ที่ผ่าน aiChat)
--
-- ทางแก้ตอนนี้: trigger คิดเป็น "ต่อ 1 งาน" ด้วยราคาประมาณการ (ท่าเดียวกับ pdf_compress)
--   → worker ไม่ต้อง redeploy · ต้นทุนผูก firm_org_id ได้ถูกต้อง
--
-- ⚠️ `gemini:ocr_job` เป็น **ค่าประมาณ ยังไม่ได้ calibrate** (ตั้งจาก 3 calls × ~2k in / ~800 out)
--    ทางแก้ที่ถูกต้องกว่าคือให้ ocr-worker เก็บ `usageMetadata` ลงตาราง แล้วเปลี่ยน trigger
--    มาคิดจาก token จริงเหมือน assistant_jobs — ต้อง redeploy worker จึงยกไปทำทีหลัง

BEGIN;

INSERT INTO public.usage_prices (key, service, label, unit, unit_cost_usd) VALUES
  ('gemini:ocr_job', 'gemini', 'OCR ถอดบิล — Gemini ต่อ 1 งาน (ประมาณการ 3 calls)', 'job', 0.007800000000)
ON CONFLICT (key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.usage_event_from_ocr_job()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  IF NEW.status <> 'completed' THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND OLD.status = 'completed' THEN RETURN NEW; END IF;

  -- ค่า Gemini (ประมาณการต่องาน)
  INSERT INTO public.usage_events
    (org_id, profile_id, service, feature, resource, quantity, unit, cost_usd,
     ref_table, ref_id, meta, created_at)
  VALUES
    (NEW.firm_org_id, NEW.triggered_by, 'gemini', 'acc_firm.ocr', 'gemini-2.5-flash',
     1, 'job', public.usage_price_usd('gemini:ocr_job'),
     'ocr_processing_jobs', NEW.id,
     jsonb_build_object('client_org_id', NEW.client_org_id, 'estimated', true),
     COALESCE(NEW.updated_at, now()))
  ON CONFLICT DO NOTHING;

  -- ค่า compute ของ worker เอง (วัดจริงจาก Cloud Monitoring)
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

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- metering พังห้ามทำให้งาน OCR ที่เสร็จแล้ว rollback
  RAISE WARNING 'usage_event_from_ocr_job failed: %', SQLERRM;
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS usage_event_ocr_job ON public.ocr_processing_jobs;
CREATE TRIGGER usage_event_ocr_job
  AFTER INSERT OR UPDATE OF status ON public.ocr_processing_jobs
  FOR EACH ROW EXECUTE FUNCTION public.usage_event_from_ocr_job();

-- backfill งาน OCR ที่ผ่านมา (idempotent ด้วย usage_events_ref_uniq)
INSERT INTO public.usage_events
  (org_id, profile_id, service, feature, resource, quantity, unit, cost_usd,
   ref_table, ref_id, meta, created_at)
SELECT j.firm_org_id, j.triggered_by, 'gemini', 'acc_firm.ocr', 'gemini-2.5-flash',
       1, 'job', public.usage_price_usd('gemini:ocr_job'),
       'ocr_processing_jobs', j.id,
       jsonb_build_object('backfill', true, 'estimated', true),
       COALESCE(j.updated_at, j.created_at)
FROM public.ocr_processing_jobs j WHERE j.status = 'completed'
ON CONFLICT DO NOTHING;

INSERT INTO public.usage_events
  (org_id, profile_id, service, feature, resource, quantity, unit, cost_usd,
   ref_table, ref_id, meta, created_at)
SELECT j.firm_org_id, j.triggered_by, 'compute', 'acc_firm.ocr_compute', 'ocr-worker',
       1, 'job', public.usage_price_usd('compute:ocr_job'),
       'ocr_processing_jobs', j.id, '{"backfill":true}'::jsonb,
       COALESCE(j.updated_at, j.created_at)
FROM public.ocr_processing_jobs j WHERE j.status = 'completed'
ON CONFLICT DO NOTHING;

COMMIT;
