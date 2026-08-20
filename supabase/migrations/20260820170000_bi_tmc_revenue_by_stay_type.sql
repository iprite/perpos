-- BI (scope tmc): รายได้ค่าห้องต้องยึด "ประเภทการเข้าพัก" ไม่ใช่ตัวเลขในช่อง room_rate
--
-- กติกาเดียวกับฝั่งแอป (apps/perpos/src/lib/tmc/stay-types.ts · stayRevenueOf):
--   การเข้าพักที่ไม่ใช่ paid = ไม่ได้รับเงิน แม้จะมีค่าห้องกรอกไว้
--   (ใบอินฟลูฯ มักใส่ราคาเต็มไว้เป็น "มูลค่าห้องที่แลกไป" · ใบฟรีเคยกรอก 10 ฿ / 4 ฿)
-- ถ้า BI ยังรวม room_rate ตรง ๆ คำตอบของผู้ช่วยจะขัดกับแดชบอร์ด/การ์ด LINE

CREATE OR REPLACE FUNCTION public.tmc_stay_revenue(p_stay_type text, p_room_rate numeric)
RETURNS numeric
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
           WHEN COALESCE(p_stay_type, '') IN ('influencer', 'management', 'free') THEN 0::numeric
           ELSE COALESCE(p_room_rate, 0)::numeric
         END;
$$;

CREATE OR REPLACE FUNCTION public.tmc_is_revenue_stay(p_stay_type text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT COALESCE(p_stay_type, '') NOT IN ('influencer', 'management', 'free');
$$;

COMMENT ON FUNCTION public.tmc_stay_revenue(text, numeric) IS
  'ค่าห้องที่นับเป็นรายได้จริงของ 1 การเข้าพัก — ประเภทที่ไม่คิดเงิน (influencer/management/free) ได้ 0 เสมอ · คู่กับ stayRevenueOf ใน lib/tmc/stay-types.ts';

-- #8 รายได้ค่าห้องพัก
UPDATE public.bi_metrics
   SET sql_template = $tpl$
SELECT {{dim_select}}
       sum(public.tmc_stay_revenue(o.stay_type, o.room_rate))::numeric AS value,
       count(*)::bigint                                                AS stay_count
FROM tmc_stays o, __p
WHERE o.org_id = __p.org_id {{time_filter}} {{filters}}
{{group_by}}
ORDER BY 2 DESC NULLS LAST
$tpl$,
       definition_th = 'ผลรวมค่าห้องของการเข้าพักในช่วงที่เลือก ยึดวันเช็คอิน (check_in) — ตรงกับ totals.stays.revenue บนหน้าภาพรวม TMC · **นับเฉพาะการเข้าพักที่คิดเงิน** (ประเภทอินฟลูเอนเซอร์/ผู้บริหาร/ให้ฟรี = 0 เสมอ แม้จะมีค่าห้องกรอกไว้) · ไม่รวมอาหาร/เครื่องดื่ม ไม่รวมเงินมัดจำ และไม่ได้หักส่วนลดโปรโมชัน (promotion_pct) ออกอีกชั้น',
       excludes = ARRAY[
         'การเข้าพักที่ไม่คิดเงิน (อินฟลูเอนเซอร์/ผู้บริหาร/ให้ฟรี) — นับเป็น 0 แม้จะมีตัวเลขค่าห้อง',
         'อาหาร/เครื่องดื่ม/หมูกระทะ/บาร์บีคิว',
         'เงินมัดจำ',
         'ส่วนลดโปรโมชันที่ยังไม่หัก'
       ]::text[],
       updated_at = now()
 WHERE key = 'tmc.stay_room_revenue';

-- #10 ค่าห้องเฉลี่ยต่อคืน (ADR) — คืนของห้องที่ให้ฟรีมีค่า 0 ตามกติกาเดียวกัน
UPDATE public.bi_metrics
   SET sql_template = $tpl$
SELECT {{dim_select}}
       (sum(o.night_rate) / NULLIF(count(*), 0))::numeric AS value,
       sum(o.night_rate)::numeric AS room_revenue,
       count(*)::bigint AS nights
FROM (
  SELECT s.*, n.night_date::date AS night_date,
         (public.tmc_stay_revenue(s.stay_type, s.room_rate)
          / GREATEST(coalesce(s.check_out, s.check_in + 1) - s.check_in, 1))::numeric AS night_rate
  FROM tmc_stays s
  CROSS JOIN LATERAL generate_series(s.check_in, coalesce(s.check_out, s.check_in + 1) - 1, interval '1 day') AS n(night_date)
  WHERE public.tmc_is_revenue_stay(s.stay_type)
) o, __p
WHERE o.org_id = __p.org_id {{time_filter}} {{filters}}
{{group_by}}
ORDER BY 2 DESC NULLS LAST
$tpl$,
       definition_th = 'ค่าห้องเฉลี่ยต่อคืนที่ขายได้ (ADR) — ค่าห้องของแต่ละการเข้าพักหารจำนวนคืนของการเข้าพักนั้น แล้วเฉลี่ยทุกคืนในช่วง · **นับเฉพาะการเข้าพักที่คิดเงิน** คืนที่ให้ฟรี (อินฟลูเอนเซอร์/ผู้บริหาร/ให้ฟรี) ถูกตัดออกทั้งตัวตั้งและตัวหาร ตามหลัก ADR สากล ⇒ ต่างจากอัตราการเข้าพักที่นับคืนฟรีเป็นห้องที่มีคนพัก',
       excludes = ARRAY[
         'คืนที่ให้ฟรี (อินฟลูเอนเซอร์/ผู้บริหาร/ให้ฟรี) — ไม่นับทั้งตัวตั้งและตัวหาร',
         'อาหาร/เครื่องดื่ม',
         'เงินมัดจำ'
       ]::text[],
       updated_at = now()
 WHERE key = 'tmc.stay_adr';
