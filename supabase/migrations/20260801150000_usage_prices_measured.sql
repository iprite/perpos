-- ── แทนราคาที่ "เดาไว้ตอน seed" ด้วยตัวเลขที่วัดจากของจริง ────────────────────
--
-- แหล่งข้อมูล (2026-08-01)
--   Cloud Run  : Cloud Monitoring 30 วัน (cpu/memory allocation_time + request_count)
--                × ราคา asia-southeast1 ($0.000024/vCPU-s, $0.0000025/GiB-s, $0.40/ล้าน req)
--   Recall.ai  : billing API ของ workspace จริง — ยืนยัน bot = $0.50/ชม. (ตรงกับที่ตั้งไว้)
--                และเจอ SKU ที่ตกหล่น: recording_retention_storage $0.00694444 เซนต์/storage-hour
--
-- ต้นทุน Cloud Run 30 วันของ perpos (ไม่รวม exapp): ~$0.44 ≈ ฿15/เดือน
--   stt-worker $0.1772 (7 งาน) · pdf-compress $0.2620 (7 งาน) · pdf-renderer $0.0023 · ocr $0.0010
--
-- ⚠️ ตัวเลข "ต่องาน" ของ worker สูงกว่าที่คิดมาก เพราะ `--no-cpu-throttling` ทำให้ CPU ถูกจอง
--    ตลอดอายุ instance ไม่ใช่เฉพาะตอนมี request → ที่ปริมาณงานน้อย ต้นทุนต่องานถูกครอบด้วยเวลา idle
--    ยิ่งงานเยอะ ต้นทุนต่องานยิ่งถูกลง — ต้องวัดซ้ำเมื่อ volume เปลี่ยน อย่าถือเป็นค่าคงที่ถาวร

BEGIN;

UPDATE public.usage_prices
SET unit_cost_usd = 0.037430000000, label = 'บีบ PDF — ต่อ 1 งาน (วัดจริง 30 วัน)', updated_at = now()
WHERE key = 'compute:pdf_compress_job';

UPDATE public.usage_prices
SET unit_cost_usd = 0.000160000000, label = 'PDF renderer — ต่อ 1 งาน (วัดจริง 30 วัน)',
    unit = 'job', updated_at = now()
WHERE key = 'compute:pdf_page';

UPDATE public.usage_prices
SET unit_cost_usd = 0.000029000000, label = 'Cloud Run — ต่อวินาที (1 vCPU + 2 GiB)', updated_at = now()
WHERE key = 'compute:cloudrun_second';

INSERT INTO public.usage_prices (key, service, label, unit, unit_cost_usd) VALUES
  ('compute:ocr_job',     'compute', 'OCR worker — ต่อ 1 งาน (วัดจริง 30 วัน)',        'job',    0.000100000000),
  ('compute:stt_job',     'compute', 'STT worker — compute ต่อ 1 งาน (วัดจริง 30 วัน)', 'job',    0.025310000000),
  ('recall:storage_hour', 'recall',  'Recall.ai — เก็บไฟล์บันทึก (ต่อ storage-hour)',   'second', 0.000069444400)
ON CONFLICT (key) DO NOTHING;

-- ── STT: เพิ่มต้นทุน compute ที่หายไป ────────────────────────────────────────
-- เดิม trigger นับแต่ค่า Gemini · แต่ compute ของ stt-worker = $0.0253/งาน เทียบกับ
-- Gemini ~$0.0756/งาน → คิดเป็น ~1/3 ของต้นทุนงานนั้น ถ้าไม่นับ ราคาขายจะตั้งต่ำไป
CREATE OR REPLACE FUNCTION public.usage_event_from_assistant_job()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_audio_in  bigint;
  v_text_in   bigint;
  v_out       bigint;
  v_cost      numeric;
  v_seconds   numeric;
BEGIN
  IF NEW.status <> 'completed' THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND OLD.status = 'completed' THEN RETURN NEW; END IF;

  -- งานประมวลผลล้วน (ไม่แตะ AI) → คิดเป็นต้นทุน compute ต่อ job
  IF COALESCE(NEW.kind, 'stt') = 'pdf_compress' THEN
    INSERT INTO public.usage_events
      (org_id, profile_id, service, feature, resource, quantity, unit, cost_usd,
       ref_table, ref_id, meta, created_at)
    VALUES
      (NEW.org_id, NEW.profile_id, 'compute', 'assistant.pdf_compress', 'pdf-compress-worker',
       1, 'job', public.usage_price_usd('compute:pdf_compress_job'),
       'assistant_jobs', NEW.id, jsonb_build_object('source', NEW.source),
       COALESCE(NEW.updated_at, now()))
    ON CONFLICT DO NOTHING;
    RETURN NEW;
  END IF;

  v_seconds  := COALESCE(NEW.duration_seconds, 0);
  v_audio_in := COALESCE(NEW.audio_input_tokens, GREATEST(0, ROUND(v_seconds * 32)));
  v_text_in  := GREATEST(0, COALESCE(NEW.prompt_tokens, v_audio_in) - v_audio_in);
  v_out      := COALESCE(NEW.output_tokens, 0) + COALESCE(NEW.thoughts_tokens, 0);

  v_cost := v_audio_in * public.usage_price_usd('gemini-2.5-flash:audio_in')
          + v_text_in  * public.usage_price_usd('gemini-2.5-flash:text_in')
          + v_out      * public.usage_price_usd('gemini-2.5-flash:out');

  INSERT INTO public.usage_events
    (org_id, profile_id, service, feature, resource, quantity, unit,
     input_tokens, output_tokens, cost_usd, ref_table, ref_id, meta, created_at)
  VALUES
    (NEW.org_id, NEW.profile_id, 'gemini',
     'assistant.' || COALESCE(NEW.kind, 'stt'),
     COALESCE(NEW.model, 'gemini-2.5-flash'),
     v_audio_in + v_text_in + v_out, 'token',
     v_audio_in + v_text_in, v_out, v_cost,
     'assistant_jobs', NEW.id,
     jsonb_build_object('seconds', v_seconds, 'source', NEW.source,
                        'exact', NEW.prompt_tokens IS NOT NULL),
     COALESCE(NEW.updated_at, now()))
  ON CONFLICT DO NOTHING;

  -- compute ของ worker เอง (แยก feature เพื่อไม่ชน unique index กับแถว gemini ข้างบน)
  INSERT INTO public.usage_events
    (org_id, profile_id, service, feature, resource, quantity, unit, cost_usd,
     ref_table, ref_id, meta, created_at)
  VALUES
    (NEW.org_id, NEW.profile_id, 'compute', 'assistant.stt_compute', 'stt-worker',
     1, 'job', public.usage_price_usd('compute:stt_job'),
     'assistant_jobs', NEW.id, jsonb_build_object('seconds', v_seconds),
     COALESCE(NEW.updated_at, now()))
  ON CONFLICT DO NOTHING;

  IF NEW.recall_bot_id IS NOT NULL AND v_seconds > 0 THEN
    INSERT INTO public.usage_events
      (org_id, profile_id, service, feature, resource, quantity, unit, cost_usd,
       ref_table, ref_id, meta, created_at)
    VALUES
      (NEW.org_id, NEW.profile_id, 'recall', 'assistant.meeting_bot', 'recall.ai',
       v_seconds, 'second', v_seconds * public.usage_price_usd('recall:bot_second'),
       'assistant_jobs', NEW.id, jsonb_build_object('bot_id', NEW.recall_bot_id),
       COALESCE(NEW.updated_at, now()))
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'usage_event_from_assistant_job failed: %', SQLERRM;
  RETURN NEW;
END;
$fn$;

-- backfill ต้นทุน compute ของงาน STT ที่ผ่านมา (idempotent ด้วย usage_events_ref_uniq)
INSERT INTO public.usage_events
  (org_id, profile_id, service, feature, resource, quantity, unit, cost_usd,
   ref_table, ref_id, meta, created_at)
SELECT j.org_id, j.profile_id, 'compute', 'assistant.stt_compute', 'stt-worker',
       1, 'job', public.usage_price_usd('compute:stt_job'),
       'assistant_jobs', j.id, '{"backfill":true}'::jsonb, COALESCE(j.updated_at, j.created_at)
FROM public.assistant_jobs j
WHERE j.status = 'completed' AND COALESCE(j.kind,'stt') <> 'pdf_compress'
ON CONFLICT DO NOTHING;

-- แถว pdf_compress เดิมคิดที่ราคาเดา ($0.0005) → ตีใหม่ด้วยราคาที่วัดจริง
UPDATE public.usage_events
SET cost_usd = public.usage_price_usd('compute:pdf_compress_job')
WHERE feature = 'assistant.pdf_compress' AND service = 'compute';

COMMIT;
