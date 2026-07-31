-- ค้นคลังความรู้แบบผสม: vector + คำสำคัญ (keywords[])
--
-- ทำไม: ภาษาไทยไม่มีช่องว่างระหว่างคำ embedding จึงพลาดคำเฉพาะบ่อย
-- เช่น "มีคาราโอเกะไหม" เคยได้บทความ "ยกเลิก/เลื่อนวันเข้าพัก" เป็นอันดับ 1 (sim 0.611)
-- ทั้งที่คำว่า "คาราโอเกะ" อยู่ในบทความห้องพักตรง ๆ
--
-- วิธีแก้: ถ้าคำใน keywords[] ของบทความไหน "ปรากฏในคำถามลูกค้า" ให้ดึงบทความนั้นมาด้วยเสมอ
-- (similarity = 1.0 เพื่อให้ผ่านด่านและถูกจัดอันดับต้น ๆ) แล้ว union กับผลจาก vector
-- ผลพลอยได้: ยิ่งแอดมินใส่ "คำที่ลูกค้ามักถาม" ดี บอทยิ่งตอบแม่น
CREATE OR REPLACE FUNCTION public.match_tmc_kb_hybrid(
  p_org_id        uuid,
  query_embedding vector(768),
  p_question      text,
  match_count     int   DEFAULT 6,
  min_similarity  float DEFAULT 0.0
)
RETURNS TABLE (
  id         uuid,
  article_id uuid,
  title      text,
  category   text,
  content    text,
  similarity float,
  updated_at timestamptz,
  matched_by text
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH kw AS (
    SELECT c.id, c.article_id, c.title, c.category, c.content,
           1.0::float AS similarity, a.updated_at, 'keyword'::text AS matched_by
    FROM public.tmc_kb_chunks c
    JOIN public.tmc_kb_articles a ON a.id = c.article_id
    WHERE c.org_id = p_org_id
      AND a.is_active
      AND EXISTS (
        SELECT 1 FROM unnest(a.keywords) k
        WHERE length(btrim(k)) >= 3 AND p_question ILIKE '%' || btrim(k) || '%'
      )
  ),
  vec AS (
    SELECT c.id, c.article_id, c.title, c.category, c.content,
           1 - (c.embedding <=> query_embedding) AS similarity, a.updated_at,
           'vector'::text AS matched_by
    FROM public.tmc_kb_chunks c
    JOIN public.tmc_kb_articles a ON a.id = c.article_id
    WHERE c.org_id = p_org_id
      AND a.is_active
      AND 1 - (c.embedding <=> query_embedding) >= min_similarity
      AND c.id NOT IN (SELECT kw.id FROM kw)
    ORDER BY c.embedding <=> query_embedding
    LIMIT GREATEST(match_count, 1)
  )
  SELECT * FROM kw
  UNION ALL
  SELECT * FROM vec
  ORDER BY similarity DESC
  LIMIT GREATEST(match_count, 1) + 4;
$$;

REVOKE ALL ON FUNCTION public.match_tmc_kb_hybrid(uuid, vector, text, int, float) FROM anon, authenticated;
