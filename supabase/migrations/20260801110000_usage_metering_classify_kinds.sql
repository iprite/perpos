-- ── แก้การจัดหมวดต้นทุนของ assistant_jobs ตาม kind ─────────────────────────────
-- ปัญหาที่เจอหลัง backfill: job kind='pdf_compress' ถูกนับเป็น service='gemini' ทั้งที่
-- worker บีบ PDF ด้วย pikepdf/Pillow ไม่ได้เรียก Gemini เลย → ต้นทุนออกมา 0 และไปโผล่ผิดหมวด
--
-- กติกาใหม่: kind ที่ใช้ AI จริง (stt / kind อื่นที่มี token) → 'gemini'
--            kind ที่เป็นงานประมวลผลล้วน (pdf_compress) → 'compute' คิดเป็นต่อ job

BEGIN;

INSERT INTO public.usage_prices (key, service, label, unit, unit_cost_usd) VALUES
  ('compute:pdf_compress_job', 'compute', 'บีบ PDF — ต่อ 1 งาน (Cloud Run)', 'job', 0.000500000)
ON CONFLICT (key) DO NOTHING;

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

-- แก้แถวที่ backfill ไปผิดหมวดแล้ว (event ของ pdf_compress ที่ถูกนับเป็น gemini/token)
UPDATE public.usage_events
SET service  = 'compute',
    resource = 'pdf-compress-worker',
    unit     = 'job',
    quantity = 1,
    input_tokens = 0,
    output_tokens = 0,
    cost_usd = public.usage_price_usd('compute:pdf_compress_job')
WHERE feature = 'assistant.pdf_compress' AND service = 'gemini';

COMMIT;
