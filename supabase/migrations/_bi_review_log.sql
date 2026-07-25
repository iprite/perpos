-- ============================================================================
-- _bi_review_log.sql — รีวิว `bi_query_log` รายสัปดาห์ → รายการสั่งงานปรับ semantic layer
-- ⚠️ ชื่อไฟล์ขึ้นต้นด้วย "_" เจตนา = ห้าม apply เป็น migration · **อ่านอย่างเดียว** รันมือ
--
-- นี่คือลูป Phase 4 (BI_FEATURE.md §9.3) — "BI ฉลาดขึ้น" มาจากการปิดช่องว่างที่ log ชี้
-- ไม่ใช่จากการเปลี่ยนโมเดล · ทุกบล็อกจบด้วย "ต้องทำอะไรต่อ" ไม่ใช่แค่ตัวเลขสวย ๆ
--
-- วิธีใช้: แก้ค่าใน 0) แล้วรันทั้งไฟล์ (SQL editor / MCP) — ไม่ต้องรันเป็นชุด
--   ปรับช่วง: แก้ `interval '7 days'` ในทุกบล็อก (7/30 วัน แล้วแต่ปริมาณคำถาม)
--   ปรับ org: ใส่ค่าใน CTE `scope_org` (NULL = ทุก org)
--
-- ตีความ `match_score` (คอลัมน์นี้เก็บครบทุกเส้นทางแล้วตั้งแต่ 2026-07-25):
--   answered/clarify → คะแนนของ metric ที่ใช้จริง
--   no_match/refused → คะแนนของ **ตัวที่ใกล้ที่สุดแม้ไม่ผ่านเกณฑ์** (`matched_metric_key`
--                      ในแถวเหล่านี้ = "ใกล้ที่สุด" ไม่ใช่ "ตัวที่ตอบ" — ต้องอ่านคู่ answer_status เสมอ)
--   dashboard (source='dashboard') → NULL เสมอ (การ์ดระบุ metric ตรง ๆ ไม่ผ่าน retrieval)
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 0) ภาพรวมสัปดาห์ — คำถามจริงมีเท่าไร ตอบได้กี่ %
--    ตอบได้ < ~70% = ปัญหา coverage (ไปดูบล็อก 2/3) ไม่ใช่ปัญหาโมเดล
-- ---------------------------------------------------------------------------
SELECT
  answer_status,
  count(*)                                                        AS n,
  round(100.0 * count(*) / sum(count(*)) OVER (), 1)              AS pct,
  count(DISTINCT profile_id)                                      AS users,
  round(avg(latency_ms))                                          AS avg_ms,
  round(sum(cost_usd)::numeric, 4)                                AS cost_usd
FROM public.bi_query_log
WHERE created_at >= now() - interval '7 days'
  AND source <> 'dashboard'          -- การ์ดแดชบอร์ดไม่ใช่ "คำถาม" ของคน
GROUP BY answer_status
ORDER BY n DESC;

-- ---------------------------------------------------------------------------
-- 1) 👎 ทุกอัน = ต้องอ่านด้วยตา (ปริมาณน้อยเสมอ ห้ามข้าม)
--    ตอบได้แต่โดน 👎 = นิยามไม่ตรงที่ผู้ใช้เข้าใจ → แก้ definition_th/label_th หรือแยก metric
-- ---------------------------------------------------------------------------
SELECT
  created_at::date       AS day,
  answer_status,
  matched_metric_key,
  match_score,
  question,
  feedback_note,
  params
FROM public.bi_query_log
WHERE created_at >= now() - interval '7 days'
  AND feedback = 'down'
ORDER BY created_at DESC;

-- ---------------------------------------------------------------------------
-- 2) ⭐ คำถามที่ตอบไม่ได้ทั้งที่ "เกือบตรง" — คิวงานอันดับหนึ่ง
--    score สูง (≥ 0.55) แต่ไม่ผ่านเกณฑ์ = ส่วนใหญ่แก้ได้ด้วยการเติม `synonyms[]`
--    ของ metric ที่ใกล้ที่สุด แล้ว `pnpm bi:embed` (ไม่ต้องเขียน metric ใหม่ ไม่ต้องแตะ SQL)
--    ⚠️ ห้ามเอาเลขจากที่นี่ไปลด MIN_SIMILARITY ตรง ๆ — ต้องวัดคู่ชุด "ห้ามเจอ" ตาม §3.2.1
-- ---------------------------------------------------------------------------
SELECT
  matched_metric_key                          AS nearest_metric,
  count(*)                                    AS misses,
  round(max(match_score), 4)                  AS best_score,
  round(avg(match_score), 4)                  AS avg_score,
  (array_agg(question ORDER BY match_score DESC))[1:5] AS sample_questions
FROM public.bi_query_log
WHERE created_at >= now() - interval '7 days'
  AND source <> 'dashboard'
  AND answer_status IN ('no_match', 'refused')
  AND match_score IS NOT NULL
  AND match_score >= 0.55
GROUP BY matched_metric_key
ORDER BY misses DESC, best_score DESC;

-- ---------------------------------------------------------------------------
-- 3) คำถามที่ "ไม่ใกล้อะไรเลย" (score < 0.55 หรือไม่มีคะแนน) = ช่องว่าง metric จริง
--    ตัวเลือกที่ถูกต้องมีสองทาง: เขียน metric ใหม่ตามกระบวนการ §3.2 หรือยอมรับว่านอกขอบเขต
--    (ห้ามลดเกณฑ์เพื่อให้ "ตอบได้" — นั่นคือการเปิดให้ตอบมั่ว)
-- ---------------------------------------------------------------------------
SELECT
  created_at::date                    AS day,
  answer_status,
  round(match_score, 4)               AS best_score,
  matched_metric_key                  AS nearest_metric,
  question
FROM public.bi_query_log
WHERE created_at >= now() - interval '7 days'
  AND source <> 'dashboard'
  AND answer_status IN ('no_match', 'refused')
  AND (match_score IS NULL OR match_score < 0.55)
ORDER BY created_at DESC
LIMIT 100;

-- ---------------------------------------------------------------------------
-- 4) ถามกลับบ่อย (clarify) = คู่ metric ที่ผู้ใช้แยกไม่ออกเอง
--    คู่ VAT (incl/excl) ถามกลับ = **ถูกต้องตาม D1 ห้ามแก้** · คู่อื่นที่ถามกลับบ่อย
--    = ชื่อ/นิยามยังกำกวม → แก้ label_th ให้ต่างกันชัดขึ้น
-- ---------------------------------------------------------------------------
SELECT
  matched_metric_key,
  count(*)                                     AS clarifies,
  round(avg(match_score), 4)                   AS avg_score,
  (array_agg(question ORDER BY created_at DESC))[1:5] AS sample_questions
FROM public.bi_query_log
WHERE created_at >= now() - interval '7 days'
  AND source <> 'dashboard'
  AND answer_status = 'clarify'
GROUP BY matched_metric_key
ORDER BY clarifies DESC;

-- ---------------------------------------------------------------------------
-- 5) metric ที่ verified แล้วแต่ "ไม่มีใครถามถึงเลย" ใน 30 วัน
--    ไม่ใช่ของเสียเสมอไป (บางตัวใช้ตอนปิดงวด) แต่ถ้าหลายรอบยังศูนย์ = นิยามไม่ตรงคำที่คนใช้
--    → เติม synonyms ให้ตรงคำพูดจริง หรือยอมรับว่าเป็น metric สำหรับแดชบอร์ดอย่างเดียว
-- ---------------------------------------------------------------------------
SELECT
  m.module_scope,
  m.key,
  m.label_th,
  m.verified_at::date AS verified_at
FROM public.bi_metrics m
WHERE m.status = 'verified'
  AND NOT EXISTS (
    SELECT 1 FROM public.bi_query_log l
    WHERE l.matched_metric_key = m.key
      AND l.created_at >= now() - interval '30 days'
      AND l.answer_status IN ('answered', 'clarify')
  )
ORDER BY m.module_scope, m.key;

-- ---------------------------------------------------------------------------
-- 6) error ที่ไม่ใช่ความผิดผู้ใช้ — ต้องเป็นศูนย์
--    ไม่เป็นศูนย์ = บั๊ก (แจ้ง /fix-issue) ไม่ใช่เรื่องของ semantic layer
-- ---------------------------------------------------------------------------
SELECT
  created_at::date        AS day,
  matched_metric_key,
  error_message,
  count(*)                AS n
FROM public.bi_query_log
WHERE created_at >= now() - interval '7 days'
  AND answer_status = 'error'
GROUP BY 1, 2, 3
ORDER BY n DESC;
