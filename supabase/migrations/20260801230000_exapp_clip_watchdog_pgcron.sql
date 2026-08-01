-- ── ย้าย watchdog ของ exapp clip-renderer จาก Cloud Run → pg_cron ─────────────
--
-- ปัญหา: Cloud Scheduler ยิง POST /watchdog ทุก 10 นาที (4,464 ครั้ง/เดือน) เข้า
-- `exapp-clip-renderer` ซึ่งเป็น **8 vCPU / 8 GiB + --no-cpu-throttling**
-- ทุก ping ปลุก 8 คอร์ขึ้นมา ~36 วินาที ทั้งที่งานคือ SELECT+UPDATE ไม่กี่แถว
--   ⇒ ต้นทุน ฿0.198/ping × 4,464 = **฿886/เดือน (92% ของบิล Cloud Run ของ exapp)**
--   ⇒ ในเดือน ก.ค. render จริงมีแค่ ~11 ครั้ง คิดเป็น ฿2.18
--
-- watchdog ไม่ต้องใช้ CPU เลย — ตรรกะทั้งหมดเป็น UPDATE เดียวบน `exapp.ai_clips`
-- ย้ายมาเป็น pg_cron ในฐานเดียวกัน (exapp ใช้ Supabase project เดียวกับ perpos, schema `exapp`)
--
-- ⚠️ ห้ามถอด `--no-cpu-throttling` ออกจาก service — clip-renderer ตอบ 202 แล้วค่อย render ต่อ
--    แบบ fire-and-forget (เหมือน stt-worker) ถ้าถอด CPU จะถูกตัดกลางการ render
--    ปัญหาอยู่ที่ "ใครปลุกมัน" ไม่ใช่ตัว flag
--
-- หมายเหตุจากโค้ดเดิม: docstring ของ watchdog.js เขียนว่าเกิน MAX_ATTEMPTS ต้อง mark
-- `failed_permanent` แต่ CHECK constraint ของ ai_clips ไม่มีสถานะนั้น (มีแค่ pending/
-- scripting/composing/rendering/done/failed) และโค้ดจริงเขียน 'failed' ทั้งสองกรณี
-- ⇒ ยึดตามโค้ดจริง ไม่ยกความคลาดเคลื่อนของคอมเมนต์มาด้วย

BEGIN;

CREATE EXTENSION IF NOT EXISTS pg_cron;

/**
 * ตรวจ clip ที่ค้างใน status='rendering' เกินเวลา → mark failed
 * คืนจำนวนแถวที่แก้ (ไว้ดูใน cron.job_run_details)
 */
CREATE OR REPLACE FUNCTION exapp.run_clip_watchdog(
  p_timeout_min int DEFAULT 15,
  p_max_attempts int DEFAULT 3
) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = exapp, public AS $fn$
DECLARE
  v_fixed integer;
BEGIN
  UPDATE exapp.ai_clips
  SET status     = 'failed',
      error_msg  = CASE
        WHEN COALESCE(render_attempts, 0) >= p_max_attempts
          THEN format('Render ล้มเหลวหลังจาก %s ครั้ง — กรุณาสร้างคลิปใหม่', p_max_attempts)
        ELSE format('Render timeout หลังจาก %s นาที — กด "ลองใหม่" ได้', p_timeout_min)
      END,
      updated_at = now()
  WHERE status = 'rendering'
    AND render_started_at < now() - make_interval(mins => p_timeout_min);

  GET DIAGNOSTICS v_fixed = ROW_COUNT;
  RETURN v_fixed;
END;
$fn$;

-- เรียกได้เฉพาะ service-role / cron — ห้ามให้ client แตะ
REVOKE ALL ON FUNCTION exapp.run_clip_watchdog(int, int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION exapp.run_clip_watchdog(int, int) TO service_role;

-- ทุก 10 นาที (คงจังหวะเดิม — pg_cron ไม่มีต้นทุนต่อครั้ง)
SELECT cron.unschedule('exapp-clip-watchdog')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'exapp-clip-watchdog');

SELECT cron.schedule('exapp-clip-watchdog', '*/10 * * * *',
  $cron$SELECT exapp.run_clip_watchdog();$cron$);

COMMIT;
