-- วัดต้นทุน STT job ที่ fail "หลังเรียก Gemini แล้ว" + แก้บั๊กนับ thinking token ซ้ำ
--
-- ปัญหาที่พบ (ส.ค. 2026 — บิล GCP มี Gemini แต่ usage_events = 0):
-- 1) trigger เดิมวัดเฉพาะ status='completed' — ไฟล์เสียง 82 นาทีที่ fail ด้วย MAX_TOKENS
--    (1 ส.ค.) เรียก Gemini เต็มไฟล์ เงินถูกเก็บจริง แต่ไม่มี usage_event เลย
--    → ตอนนี้ stt-worker เขียน token columns ลง job แม้ fail (เฉพาะกรณี Gemini ตอบแล้ว)
--    และ trigger นี้นับ job ที่ fail แบบมี token ด้วย · fail ก่อนถึง Gemini (เช็คโควตา/
--    ดาวน์โหลดพัง) ไม่มี token → ไม่นับ (ถูกต้อง เพราะไม่มีต้นทุน AI)
-- 2) worker เก็บ output_tokens = candidates + thoughts อยู่แล้ว (parseGeminiUsage)
--    แต่ trigger เดิมบวก thoughts_tokens ซ้ำอีกรอบ → ต้นทุน output สูงเกินจริง
--    เมื่อโมเดลใช้ thinking · แก้เป็นใช้ output_tokens ตรง ๆ

CREATE OR REPLACE FUNCTION public.usage_event_from_assistant_job()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_audio_in  bigint;
  v_text_in   bigint;
  v_out       bigint;
  v_cost      numeric;
  v_seconds   numeric;
BEGIN
  IF NEW.status NOT IN ('completed', 'failed') THEN RETURN NEW; END IF;
  -- กันยิงซ้ำเมื่อ update แถวที่จบไปแล้ว (เช่น แก้ error_message ของ job ที่ fail)
  IF TG_OP = 'UPDATE' AND OLD.status IN ('completed', 'failed') THEN RETURN NEW; END IF;

  IF COALESCE(NEW.kind, 'stt') = 'pdf_compress' THEN
    IF NEW.status <> 'completed' THEN RETURN NEW; END IF; -- pdf_compress ไม่มีต้นทุน AI ค้างเมื่อ fail
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

  -- fail แบบไม่มี token = ยังไม่ถึง Gemini (โควตาไม่พอ/ดาวน์โหลดพัง/stuck-sweep) → ไม่มีต้นทุน AI
  IF NEW.status = 'failed'
     AND NEW.prompt_tokens IS NULL AND NEW.output_tokens IS NULL THEN
    RETURN NEW;
  END IF;

  v_seconds  := COALESCE(NEW.duration_seconds, 0);
  v_audio_in := COALESCE(NEW.audio_input_tokens, GREATEST(0, ROUND(v_seconds * 32)));
  v_text_in  := GREATEST(0, COALESCE(NEW.prompt_tokens, v_audio_in) - v_audio_in);
  -- ⚠️ output_tokens จาก worker "รวม thoughts แล้ว" (parseGeminiUsage) — ห้ามบวก thoughts ซ้ำ
  v_out      := COALESCE(NEW.output_tokens, NEW.thoughts_tokens, 0);

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
                        'exact', NEW.prompt_tokens IS NOT NULL,
                        'failed', NEW.status = 'failed'),
     COALESCE(NEW.updated_at, now()))
  ON CONFLICT DO NOTHING;

  INSERT INTO public.usage_events
    (org_id, profile_id, service, feature, resource, quantity, unit, cost_usd,
     ref_table, ref_id, meta, created_at)
  VALUES
    (NEW.org_id, NEW.profile_id, 'compute', 'assistant.stt_compute', 'stt-worker',
     1, 'job', public.usage_price_usd('compute:stt_job'),
     'assistant_jobs', NEW.id,
     jsonb_build_object('seconds', v_seconds, 'failed', NEW.status = 'failed'),
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
$$;
