-- ── watchdog ทุก 1 นาที + ล้าง log ของ pg_cron ────────────────────────────────
--
-- ทำไมถี่ขึ้นได้: ตอนยิงเข้า Cloud Run แต่ละครั้ง ฿0.198 (ทุก 1 นาที = ฿8,860/เดือน)
-- จึงต้องยอมถ่างเป็น 10 นาที · ย้ายมา pg_cron แล้วรอบละ ~15 มิลลิวินาที
-- ⇒ ข้อจำกัดด้านต้นทุนหายไป เหลือแค่ "ผู้ใช้ควรรู้เร็วแค่ไหนว่าคลิปพัง"
--    เดิม: เจอที่ t=15–25 นาที · ใหม่: t=15–16 นาที (ตัดความหน่วงฟรี ~9 นาที)
--
-- ⚠️ สิ่งที่ **ไม่ฟรี**: `cron.job_run_details` บันทึก 1 แถวต่อการรัน 1 ครั้ง และ
--    **pg_cron ไม่ลบให้เอง** — ตอนตรวจพบ 19,250 แถว / 11 MB สะสมใน 13 วัน (จาก 2 job)
--    Supabase คิดเงินตามขนาดฐานข้อมูล ⇒ ปล่อยไว้ = จ่ายค่า disk เพิ่มเรื่อย ๆ
--    ยิ่งเปลี่ยนเป็นทุก 1 นาทียิ่งโตเร็วขึ้นเท่าตัว (~600 MB/ปี บนฐานที่ตอนนี้ 227 MB)
--    ⇒ ต้องมีตัวล้างคู่กันเสมอ ไม่งั้นการ "ประหยัด Cloud Run" จะไปโผล่เป็นค่า disk แทน

BEGIN;

-- 1) ถี่ขึ้นเป็นทุก 1 นาที
SELECT cron.alter_job(
  (SELECT jobid FROM cron.job WHERE jobname = 'exapp-clip-watchdog'),
  schedule => '* * * * *'
);

-- 2) ล้าง log การรันที่เก่ากว่า 7 วัน (พอสำหรับไล่ปัญหาย้อนหลัง)
CREATE OR REPLACE FUNCTION public.purge_cron_run_details(p_keep_days int DEFAULT 7)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = cron, public AS $fn$
DECLARE v_deleted integer;
BEGIN
  DELETE FROM cron.job_run_details
  WHERE end_time < now() - make_interval(days => p_keep_days);
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$fn$;

REVOKE ALL ON FUNCTION public.purge_cron_run_details(int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.purge_cron_run_details(int) TO service_role;

SELECT cron.unschedule('purge-cron-run-details')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'purge-cron-run-details');

-- ตี 3 ครึ่งทุกวัน (เลี่ยงชนงานอื่นที่รันต้นชั่วโมง)
SELECT cron.schedule('purge-cron-run-details', '30 3 * * *',
  $cron$SELECT public.purge_cron_run_details(7);$cron$);

COMMIT;
