-- ผู้ช่วยโฟล์ (Flow RAG bot) — vector knowledge base สำหรับตอบคำถาม Flow/Suite/PERPOS ใน LINE
--   1. extension vector (pgvector) — เปิดใช้ vector type + hnsw
--   2. kb_chunks — เก็บ chunk ของ knowledge base + embedding 768 มิติ (text-embedding-004)
--   3. RPC match_kb_chunks — retrieval top-k ตาม cosine similarity (service role เท่านั้น)
--   4. RPC upsert_kb_chunk — insert chunk + cast float8[]::vector ให้ ingestion script
--   5. flow_chat_usage + RPC incr_flow_chat_usage — rate limit ต่อ line_user_id/วัน (กัน abuse)

-- 1. pgvector
CREATE EXTENSION IF NOT EXISTS vector;

-- 2. kb_chunks
CREATE TABLE IF NOT EXISTS public.kb_chunks (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source      text NOT NULL,                 -- flow | suite | pricing | privacy | about
  title       text NOT NULL,                 -- ชื่อเอกสาร/หัวข้อหลัก
  heading     text,                          -- หัวข้อย่อย (## ใน .md)
  content     text NOT NULL,                 -- เนื้อ chunk
  embedding   vector(768) NOT NULL,          -- Gemini text-embedding-004 (RETRIEVAL_DOCUMENT)
  token_count int,
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_kb_chunks_source ON public.kb_chunks (source);
CREATE INDEX IF NOT EXISTS idx_kb_chunks_embedding
  ON public.kb_chunks USING hnsw (embedding vector_cosine_ops);

ALTER TABLE public.kb_chunks ENABLE ROW LEVEL SECURITY;
-- ไม่มี policy เปิด → เข้าถึงผ่าน service role เท่านั้น (RAG ฝั่ง server)

-- 3. match_kb_chunks — retrieval
CREATE OR REPLACE FUNCTION public.match_kb_chunks(
  query_embedding vector(768),
  match_count     int DEFAULT 5,
  min_similarity  float DEFAULT 0.0
)
RETURNS TABLE (
  id         uuid,
  source     text,
  title      text,
  heading    text,
  content    text,
  similarity float
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    c.id, c.source, c.title, c.heading, c.content,
    1 - (c.embedding <=> query_embedding) AS similarity
  FROM public.kb_chunks c
  WHERE 1 - (c.embedding <=> query_embedding) >= min_similarity
  ORDER BY c.embedding <=> query_embedding
  LIMIT GREATEST(match_count, 1);
$$;

-- 4. upsert_kb_chunk — ingestion (รับ float8[] แล้ว cast เป็น vector)
CREATE OR REPLACE FUNCTION public.upsert_kb_chunk(
  p_source      text,
  p_title       text,
  p_heading     text,
  p_content     text,
  p_embedding   float8[],
  p_token_count int
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid;
BEGIN
  INSERT INTO public.kb_chunks (source, title, heading, content, embedding, token_count, updated_at)
  VALUES (p_source, p_title, p_heading, p_content, p_embedding::vector(768), p_token_count, now())
  RETURNING id INTO v_id;
  RETURN v_id;
END; $$;

-- 5. flow_chat_usage — rate limit ต่อคน/วัน
CREATE TABLE IF NOT EXISTS public.flow_chat_usage (
  line_user_id text NOT NULL,
  day          date NOT NULL DEFAULT CURRENT_DATE,
  count        int  NOT NULL DEFAULT 0,
  updated_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (line_user_id, day)
);
ALTER TABLE public.flow_chat_usage ENABLE ROW LEVEL SECURITY;
-- ไม่มี policy เปิด → service role เท่านั้น

-- incr_flow_chat_usage — atomic เพิ่ม +1 แล้วบอกว่ายังอยู่ในโควต้าไหม (true = อนุญาตให้ตอบ)
CREATE OR REPLACE FUNCTION public.incr_flow_chat_usage(
  p_line_user_id text,
  p_daily_limit  int DEFAULT 30
)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_count int;
BEGIN
  INSERT INTO public.flow_chat_usage (line_user_id, day, count)
  VALUES (p_line_user_id, CURRENT_DATE, 1)
  ON CONFLICT (line_user_id, day)
  DO UPDATE SET count = public.flow_chat_usage.count + 1, updated_at = now()
  RETURNING count INTO v_count;
  RETURN v_count <= p_daily_limit;
END; $$;

-- 6. lock down RPC (service role เท่านั้น — revoke จาก PUBLIC + anon + authenticated)
REVOKE ALL ON FUNCTION public.match_kb_chunks(vector, int, float)            FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.upsert_kb_chunk(text, text, text, text, float8[], int) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.incr_flow_chat_usage(text, int)               FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.match_kb_chunks(vector, int, float)            TO service_role;
GRANT EXECUTE ON FUNCTION public.upsert_kb_chunk(text, text, text, text, float8[], int) TO service_role;
GRANT EXECUTE ON FUNCTION public.incr_flow_chat_usage(text, int)               TO service_role;
