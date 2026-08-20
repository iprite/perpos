-- ผู้ช่วยโฟล์ (Flow RAG) — hybrid search: vector + คำสำคัญ แล้วรวมอันดับด้วย RRF
--
-- ทำไม: embedding พลาด "คำเฉพาะ" เป็นประจำ (ชื่อฟีเจอร์/ตัวเลข/ตัวย่อ เช่น PDPA, MoM, ภ.พ.30)
--       เพราะมันวัดความใกล้เชิงความหมาย ไม่ได้วัดว่า "มีคำนี้อยู่จริงไหม"
--       ฝั่ง TMC แก้ด้วยคอลัมน์ keywords ที่คนกรอก — kb_chunks ไม่มีคอลัมน์นั้น
--       จึงหาคำสำคัญจากตัวคำถามเองด้วย 2 ทาง (ดูด้านล่าง)
--
-- ⚠️ ข้อที่ห้ามพัง
--  1. **`min_similarity` ยังเป็นด่าน off-topic ของสายเวกเตอร์** — สายคำสำคัญมีด่านของตัวเอง
--     (`lex_min_similarity` หรือต้องเจอคำที่ "เลือกได้จริง") ห้ามปล่อยให้สายใดสายหนึ่งไม่มีด่าน
--     ไม่งั้นคำถามนอกเรื่องจะได้ context ติดมือกลับไปเสมอ แล้วบอทจะเดาตอบ
--  2. **คำที่โผล่เกือบทุก chunk ไม่นับเป็นคำสำคัญ** (`flow`, `perpos`) — ไม่ช่วยแยกแยะ
--     มีแต่จะท่วมผลลัพธ์ (df guard ที่ 40% ของจำนวน chunk)
--  3. word_similarity ของ pg_trgm ทำงานระดับ "ตัวอักษร 3 ตัว" จึงใช้กับภาษาไทยที่ไม่มีช่องว่างได้
--     — ห้ามเปลี่ยนไปใช้ to_tsvector/tsquery เพราะ Postgres ไม่มีตัวตัดคำไทย (ทั้งประโยคจะกลายเป็น token เดียว)

-- ⚠️ Supabase ติดตั้ง pg_trgm ไว้ที่ schema `extensions` (ไม่ใช่ public เหมือน pgvector)
-- ⇒ ฟังก์ชันที่ SET search_path = public เฉย ๆ จะหา word_similarity ไม่เจอ (42883)
CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA extensions;

-- ⚠️ ไม่มี GIN trgm index โดยตั้งใจ — `word_similarity()` เรียกเป็น "ฟังก์ชัน" ใช้ index ไม่ได้
-- (ที่ใช้ index ได้คือ operator `<%` ซึ่งอ่านเกณฑ์จาก GUC `word_similarity_threshold` ส่งพารามิเตอร์ไม่ได้)
-- วัดจริงบนคลัง 40 chunk: seq scan ~5 ms ⇒ index ที่สร้างไว้จะไม่ถูกใช้ กลายเป็นภาระตอน ingest เปล่า ๆ
-- คลังโตหลักพัน chunk เมื่อไร ค่อยเปลี่ยนไปใช้ `<%` + ตั้ง GUC แล้วค่อยสร้าง index
DROP INDEX IF EXISTS public.idx_kb_chunks_content_trgm;
DROP INDEX IF EXISTS public.idx_kb_chunks_title_trgm;

CREATE OR REPLACE FUNCTION public.match_kb_hybrid(
  query_embedding    vector(768),
  p_question         text,
  match_count        int   DEFAULT 20,
  min_similarity     float DEFAULT 0.6,
  -- คะแนน trigram ขั้นต่ำของสายคำสำคัญ · สอบเทียบกับคลังจริง (2026-08-20):
  -- คำถามในเรื่อง 0.40–1.00 · นอกเรื่อง ("ราคาทองวันนี้") 0.19 → 0.45 แยกได้ชัด
  lex_min_similarity float DEFAULT 0.45
)
RETURNS TABLE (
  id         uuid,
  source     text,
  title      text,
  heading    text,
  content    text,
  similarity float,
  matched_by text
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, extensions AS $$
  WITH q AS (
    SELECT lower(coalesce(p_question, '')) AS txt,
           GREATEST(match_count, 1) AS n,
           (SELECT count(*) FROM public.kb_chunks) AS total
  ),
  -- คำละติน/ตัวเลขในคำถาม (pdpa, mom, pdf, 99, gemini-embedding-001)
  tok AS (
    SELECT DISTINCT t
    FROM q, regexp_matches(q.txt, '[a-z0-9][a-z0-9._-]{2,}', 'g') AS m(arr), unnest(m.arr) AS t
  ),
  -- ทิ้งคำที่โผล่เกิน 40% ของคลัง — ไม่ช่วยแยกแยะ (ข้อ 2 ด้านบน)
  -- ⚠️ ต้องนับบน "ข้อความชุดเดียวกับที่ hits นับ" (content+title+heading) ไม่งั้นคำที่อยู่แต่ในหัวข้อ
  --    จะรอด df guard แล้วไปเจอทุก chunk ตอนนับ hits
  -- ⚠️ ใช้ strpos ไม่ใช่ LIKE — `_` ในคำ (gemini_1) เป็น wildcard ของ LIKE จะ match ผิดตัว
  tok_sel AS (
    SELECT tok.t
    FROM tok, q
    WHERE (SELECT count(*) FROM public.kb_chunks c
            WHERE strpos(lower(c.content || ' ' || c.title || ' ' || coalesce(c.heading, '')), tok.t) > 0)
          <= GREATEST(1, q.total * 4 / 10)
  ),
  vec AS (
    SELECT v.id, v.sim, row_number() OVER (ORDER BY v.sim DESC) AS rnk
    FROM (
      SELECT c.id, 1 - (c.embedding <=> query_embedding) AS sim
      FROM public.kb_chunks c
      WHERE 1 - (c.embedding <=> query_embedding) >= min_similarity
      ORDER BY c.embedding <=> query_embedding
      LIMIT (SELECT n FROM q)
    ) v
  ),
  lex AS (
    SELECT x.id, x.sim, row_number() OVER (ORDER BY x.hits DESC, x.sim DESC) AS rnk
    FROM (
      SELECT c.id,
             GREATEST(
               extensions.word_similarity((SELECT txt FROM q), c.content),
               extensions.word_similarity((SELECT txt FROM q), coalesce(c.heading, '') || ' ' || c.title)
             ) AS sim,
             (SELECT count(*) FROM tok_sel s
               WHERE strpos(lower(c.content || ' ' || c.title || ' ' || coalesce(c.heading, '')),
                            s.t) > 0) AS hits
      FROM public.kb_chunks c
    ) x
    WHERE x.hits > 0 OR x.sim >= lex_min_similarity
    ORDER BY x.hits DESC, x.sim DESC
    -- ครึ่งเดียวของโควตา — กันสายคำสำคัญที่หลักฐานอ่อน (เจอคำเดียว) ท่วมจนเบียดสายเวกเตอร์ตกขอบ
    LIMIT (SELECT GREATEST(n / 2, 4) FROM q)
  )
  -- ⚠️ `similarity` ของแถว keyword เป็นคะแนน trigram **คนละสเกลกับ cosine** — ดู `matched_by` ก่อนเสมอ
  --    ห้ามเอาไปตั้งด่าน "ตอบได้/ตอบไม่ได้" ฝั่งแอปโดยไม่แยกสาย
  SELECT c.id, c.source, c.title, c.heading, c.content,
         COALESCE(v.sim, l.sim) AS similarity,
         CASE
           WHEN v.id IS NOT NULL AND l.id IS NOT NULL THEN 'both'
           WHEN v.id IS NOT NULL THEN 'vector'
           ELSE 'keyword'
         END AS matched_by
  FROM public.kb_chunks c
  JOIN (SELECT id FROM vec UNION SELECT id FROM lex) k ON k.id = c.id
  LEFT JOIN vec v ON v.id = c.id
  LEFT JOIN lex l ON l.id = c.id
  -- Reciprocal Rank Fusion (k=60 ตามค่ามาตรฐาน) — รวม 2 อันดับที่คะแนนคนละสเกลกันไม่ได้
  ORDER BY COALESCE(1.0 / (60 + v.rnk), 0) + COALESCE(1.0 / (60 + l.rnk), 0) DESC
  LIMIT (SELECT n FROM q);
$$;

REVOKE ALL ON FUNCTION public.match_kb_hybrid(vector, text, int, float, float)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.match_kb_hybrid(vector, text, int, float, float) TO service_role;
