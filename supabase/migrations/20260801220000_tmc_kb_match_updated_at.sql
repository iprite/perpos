-- ผู้ช่วยขาย TMC — ให้ผลค้นหาคลังความรู้ติด "อัปเดตเมื่อไร" มาด้วย
--
-- ทำไม: เมื่อความรู้ใหม่เข้ามาแล้วขัดกับของเดิม กติกาคือ **ยึดของใหม่เสมอ**
-- แต่ retrieval คืนมาหลาย chunk พร้อมกัน โมเดลจึงต้องรู้ว่าอันไหนใหม่กว่าถึงจะเลือกถูก
DROP FUNCTION IF EXISTS public.match_tmc_kb_chunks(uuid, vector, int, float);

CREATE OR REPLACE FUNCTION public.match_tmc_kb_chunks(
  p_org_id        uuid,
  query_embedding vector(768),
  match_count     int   DEFAULT 5,
  min_similarity  float DEFAULT 0.0
)
RETURNS TABLE (
  id         uuid,
  article_id uuid,
  title      text,
  category   text,
  content    text,
  similarity float,
  updated_at timestamptz
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT c.id, c.article_id, c.title, c.category, c.content,
         1 - (c.embedding <=> query_embedding) AS similarity,
         a.updated_at
  FROM public.tmc_kb_chunks c
  JOIN public.tmc_kb_articles a ON a.id = c.article_id
  WHERE c.org_id = p_org_id
    AND a.is_active
    AND 1 - (c.embedding <=> query_embedding) >= min_similarity
  ORDER BY c.embedding <=> query_embedding
  LIMIT GREATEST(match_count, 1);
$$;

REVOKE ALL ON FUNCTION public.match_tmc_kb_chunks(uuid, vector, int, float) FROM anon, authenticated;
