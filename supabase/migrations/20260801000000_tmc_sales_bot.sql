-- ═══════════════════════════════════════════════════════════════════════════
-- TMC Sales Bot (@tmcvilla) — บอทแอดมินขายห้องพักบน LINE OA ของ TMC
--
-- โครงสร้าง
--   1. tmc_kb_articles   — คลังความรู้ที่แอดมินจัดการเองผ่าน UI (1 บทความ = 1 หัวข้อ)
--   2. tmc_kb_chunks     — chunk + embedding vector(768) ของบทความ (RAG retrieval)
--   3. tmc_bot_settings  — ตั้งค่าบอทต่อ org (เปิด/ปิด, ข้อความ, เกณฑ์, ใครรับแจ้งเตือน)
--   4. tmc_chat_contacts — ลูกค้า LINE ที่คุยกับ @tmcvilla (โหมด bot/human)
--   5. tmc_chat_messages — ประวัติข้อความทุกฝั่ง
--   6. tmc_chat_escalations — เคสที่ต้องให้แอดมินตัวจริงเข้า (2 ทริกเกอร์)
--
-- หมายเหตุความปลอดภัย
--   • tmc_kb_chunks = RLS deny-all (service role เท่านั้น) เหมือน kb_chunks ของ Flow RAG
--   • ตารางที่เหลืออ่าน/เขียนผ่าน RLS ด้วยสมาชิก organization_members (ท่าเดียวกับ tmc เดิม)
--   • RPC match_tmc_kb_chunks บังคับ p_org_id เสมอ → ห้ามค้นข้าม org
-- ═══════════════════════════════════════════════════════════════════════════

CREATE EXTENSION IF NOT EXISTS vector;

-- ─── 1. คลังความรู้ ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.tmc_kb_articles (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  category    text NOT NULL DEFAULT 'ทั่วไป',
  title       text NOT NULL,
  content     text NOT NULL,
  keywords    text[] NOT NULL DEFAULT '{}',
  is_active   boolean NOT NULL DEFAULT true,
  sort_order  int NOT NULL DEFAULT 0,
  embedded_at timestamptz,                    -- NULL/เก่ากว่า updated_at = ยังไม่ได้ฝัง
  created_by  uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  updated_by  uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS tmc_kb_articles_org_idx ON public.tmc_kb_articles (org_id, is_active);

-- ─── 2. chunk + embedding ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.tmc_kb_chunks (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  article_id  uuid NOT NULL REFERENCES public.tmc_kb_articles(id) ON DELETE CASCADE,
  chunk_index int NOT NULL DEFAULT 0,
  title       text NOT NULL,
  category    text,
  content     text NOT NULL,
  embedding   vector(768) NOT NULL,
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS tmc_kb_chunks_article_idx ON public.tmc_kb_chunks (article_id);
CREATE INDEX IF NOT EXISTS tmc_kb_chunks_org_idx ON public.tmc_kb_chunks (org_id);
CREATE INDEX IF NOT EXISTS tmc_kb_chunks_embedding_idx
  ON public.tmc_kb_chunks USING hnsw (embedding vector_cosine_ops);

-- ─── 3. ตั้งค่าบอทต่อ org ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.tmc_bot_settings (
  org_id             uuid PRIMARY KEY REFERENCES public.organizations(id) ON DELETE CASCADE,
  is_enabled         boolean NOT NULL DEFAULT true,
  bot_name           text NOT NULL DEFAULT 'ผู้ดูแลลูกค้า Thammachat Villa',
  greeting_text      text NOT NULL DEFAULT 'สวัสดีค่ะ ยินดีต้อนรับสู่ Thammachat Villa ค่ะ 🌿
พูลวิลล่าส่วนตัวให้เช่าเหมาหลัง พร้อมอาหารเช้าสำหรับผู้เข้าพักทุกท่าน
สอบถามราคา จำนวนผู้เข้าพัก ห้องนอน หรือการพาสัตว์เลี้ยงมาด้วย พิมพ์เข้ามาได้เลยนะคะ ยินดีดูแลค่ะ',
  fallback_text      text NOT NULL DEFAULT 'ขออภัยด้วยนะคะ เรื่องนี้ขออนุญาตให้ผู้ดูแลของเราตอบให้ละเอียดกว่านี้ค่ะ 🙏
รบกวนรอสักครู่ เดี๋ยวเจ้าหน้าที่เข้ามาดูแลในแชทนี้โดยเร็วที่สุดค่ะ',
  handoff_text       text NOT NULL DEFAULT 'รับทราบค่ะ กำลังเรียนเชิญเจ้าหน้าที่เข้ามาดูแลให้นะคะ 🙏
รบกวนรอสักครู่ เดี๋ยวมีผู้ดูแลเข้ามาคุยกับคุณลูกค้าในแชทนี้ค่ะ',
  min_similarity     numeric NOT NULL DEFAULT 0.60,
  human_mode_minutes int NOT NULL DEFAULT 120,     -- เข้าโหมดคนจริงแล้วบอทเงียบกี่นาที
  daily_message_cap  int NOT NULL DEFAULT 60,      -- กันสแปมต่อลูกค้า 1 คน/วัน
  notify_group_id    text,                         -- กลุ่ม LINE ของทีมแอดมิน (ผูกด้วยรหัส TMC-XXXXXX)
  oa_bot_user_id     text,                         -- userId ของ @tmcvilla (cache ไว้ทำลิงก์ chat.line.biz)
  updated_at         timestamptz NOT NULL DEFAULT now()
);

-- ─── 4. ลูกค้าที่คุยกับ OA ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.tmc_chat_contacts (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id            uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  line_user_id      text NOT NULL,
  display_name      text,
  picture_url       text,
  mode              text NOT NULL DEFAULT 'bot' CHECK (mode IN ('bot','human')),
  human_until       timestamptz,
  is_blocked        boolean NOT NULL DEFAULT false,  -- ลูกค้าบล็อก/unfollow OA
  note              text,
  message_count     int NOT NULL DEFAULT 0,
  escalation_count  int NOT NULL DEFAULT 0,
  day_key           date,
  day_count         int NOT NULL DEFAULT 0,
  last_message_at   timestamptz,
  last_message_text text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, line_user_id)
);
CREATE INDEX IF NOT EXISTS tmc_chat_contacts_org_last_idx
  ON public.tmc_chat_contacts (org_id, last_message_at DESC);

-- ─── 5. ข้อความ ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.tmc_chat_messages (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  contact_id      uuid NOT NULL REFERENCES public.tmc_chat_contacts(id) ON DELETE CASCADE,
  role            text NOT NULL CHECK (role IN ('customer','bot','admin','system')),
  text            text NOT NULL,
  similarity      numeric,          -- คะแนน retrieval ตอนบอทตอบ (null = ไม่ใช่คำตอบบอท)
  is_escalation   boolean NOT NULL DEFAULT false,
  line_message_id text,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS tmc_chat_messages_contact_idx
  ON public.tmc_chat_messages (contact_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS tmc_chat_messages_line_msg_uidx
  ON public.tmc_chat_messages (org_id, line_message_id) WHERE line_message_id IS NOT NULL;

-- ─── 6. เคสรอแอดมิน ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.tmc_chat_escalations (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id       uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  contact_id   uuid NOT NULL REFERENCES public.tmc_chat_contacts(id) ON DELETE CASCADE,
  message_id   uuid REFERENCES public.tmc_chat_messages(id) ON DELETE SET NULL,
  reason       text NOT NULL CHECK (reason IN ('no_answer','request_human')),
  question     text NOT NULL,
  best_similarity numeric,
  status       text NOT NULL DEFAULT 'open' CHECK (status IN ('open','handled','closed')),
  notified_at  timestamptz,
  handled_by   uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  handled_at   timestamptz,
  note         text,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS tmc_chat_escalations_org_status_idx
  ON public.tmc_chat_escalations (org_id, status, created_at DESC);

-- ═══ RLS ═════════════════════════════════════════════════════════════════════
ALTER TABLE public.tmc_kb_articles     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tmc_kb_chunks       ENABLE ROW LEVEL SECURITY;  -- deny-all (service role)
ALTER TABLE public.tmc_bot_settings    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tmc_chat_contacts   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tmc_chat_messages   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tmc_chat_escalations ENABLE ROW LEVEL SECURITY;

-- อ่านได้: สมาชิกของ org · เขียนได้: owner/admin/management/team_lead (ท่าเดียวกับ tmc เดิม)
DO $$
DECLARE
  t text;
  member_check text := 'EXISTS (SELECT 1 FROM public.organization_members m
                                WHERE m.organization_id = org_id AND m.user_id = auth.uid())';
  writer_check text := 'EXISTS (SELECT 1 FROM public.organization_members m
                                WHERE m.organization_id = org_id AND m.user_id = auth.uid()
                                  AND m.role IN (''owner'',''admin'',''management'',''team_lead''))';
BEGIN
  FOREACH t IN ARRAY ARRAY['tmc_kb_articles','tmc_bot_settings','tmc_chat_contacts',
                           'tmc_chat_messages','tmc_chat_escalations']
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_select', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_insert', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_update', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_delete', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT USING (%s)', t || '_select', t, member_check);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR INSERT WITH CHECK (%s)', t || '_insert', t, writer_check);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR UPDATE USING (%s)', t || '_update', t, writer_check);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR DELETE USING (%s)', t || '_delete', t, writer_check);
  END LOOP;
END $$;

-- ═══ RPC ═════════════════════════════════════════════════════════════════════

-- retrieval — บังคับ org scope เสมอ
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
  similarity float
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT c.id, c.article_id, c.title, c.category, c.content,
         1 - (c.embedding <=> query_embedding) AS similarity
  FROM public.tmc_kb_chunks c
  JOIN public.tmc_kb_articles a ON a.id = c.article_id
  WHERE c.org_id = p_org_id
    AND a.is_active
    AND 1 - (c.embedding <=> query_embedding) >= min_similarity
  ORDER BY c.embedding <=> query_embedding
  LIMIT GREATEST(match_count, 1);
$$;

-- ingestion — ลบ chunk เดิมของบทความแล้วใส่ชุดใหม่ (idempotent ต่อการกด "อัปเดตความรู้")
CREATE OR REPLACE FUNCTION public.replace_tmc_kb_chunks(
  p_article_id uuid,
  p_chunks     jsonb        -- [{ chunk_index, content, embedding: float8[] }]
)
RETURNS int
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  a public.tmc_kb_articles%ROWTYPE;
  n int := 0;
BEGIN
  SELECT * INTO a FROM public.tmc_kb_articles WHERE id = p_article_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'article not found'; END IF;

  DELETE FROM public.tmc_kb_chunks WHERE article_id = p_article_id;

  INSERT INTO public.tmc_kb_chunks (org_id, article_id, chunk_index, title, category, content, embedding)
  SELECT a.org_id, a.id,
         (c->>'chunk_index')::int,
         a.title, a.category,
         c->>'content',
         (SELECT array_agg(v::float8) FROM jsonb_array_elements_text(c->'embedding') v)::vector(768)
  FROM jsonb_array_elements(p_chunks) c;

  GET DIAGNOSTICS n = ROW_COUNT;
  UPDATE public.tmc_kb_articles SET embedded_at = now() WHERE id = p_article_id;
  RETURN n;
END $$;

REVOKE ALL ON FUNCTION public.match_tmc_kb_chunks(uuid, vector, int, float) FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.replace_tmc_kb_chunks(uuid, jsonb) FROM anon, authenticated;

-- ═══ ข้อมูลตั้งต้น: คลังความรู้จากบทสนทนาขายจริงของ TMC ═══════════════════════
-- (ยังไม่มี embedding → ต้องกด "อัปเดตความรู้" ในหน้า ผู้ช่วยขาย 1 ครั้ง)
DO $$
DECLARE
  v_org uuid;
BEGIN
  FOR v_org IN
    SELECT organization_id FROM public.org_module_settings
    WHERE module_key = 'tmc' AND is_enabled
  LOOP
    INSERT INTO public.tmc_bot_settings (org_id) VALUES (v_org) ON CONFLICT DO NOTHING;

    -- ใส่เฉพาะ org ที่ยังไม่มีคลังความรู้เลย (กันเขียนทับของที่แอดมินแก้แล้ว)
    IF NOT EXISTS (SELECT 1 FROM public.tmc_kb_articles WHERE org_id = v_org) THEN
      INSERT INTO public.tmc_kb_articles (org_id, category, title, content, keywords, sort_order) VALUES
      (v_org, 'บ้านพัก', 'บ้านพักที่เปิดให้เช่า มีกี่หลัง อะไรบ้าง',
'TMC มีบ้านพักให้เช่าเหมาหลังทั้งหมด 3 หลัง แบ่งเป็น 2 แบบ

1) ธรรมชาติแกรนด์ (TMC 7) — 5 ห้องนอน เริ่มต้น 10 ท่าน เสริมได้สูงสุด 18 ท่าน
2) ธรรมชาติวิลล่า — 4 ห้องนอน เริ่มต้น 8 ท่าน เสริมได้สูงสุด 14 ท่าน
3) ธรรมชาติวิลล่า Pet Friendly — 4 ห้องนอน เริ่มต้น 8 ท่าน เสริมได้สูงสุด 14 ท่าน (พาสุนัขเข้าพักได้)

ทุกหลังราคารวมอาหารเช้าแล้ว
บ้าน 4 ห้องนอนทั้งสองหลังมีห้องนอนและสิ่งอำนวยความสะดวกเหมือนกันทุกอย่าง ต่างกันแค่หลัง Pet Friendly รับสุนัขได้',
       ARRAY['บ้านกี่หลัง','มีบ้านอะไรบ้าง','ธรรมชาติแกรนด์','ธรรมชาติวิลล่า','TMC7'], 10),

      (v_org, 'ราคา', 'ราคาบ้าน 5 ห้องนอน (ธรรมชาติแกรนด์ / TMC 7)',
'ธรรมชาติแกรนด์ (TMC 7) — 5 ห้องนอน ราคาเหมาหลัง สำหรับ 10 ท่าน รวมอาหารเช้า

• วันธรรมดา (อาทิตย์–พฤหัสบดี): 25,900 บาท/คืน
• วันศุกร์–เสาร์ และวันหยุดนักขัตฤกษ์: 29,900 บาท/คืน

เตียงเสริม ท่านละ 1,000 บาท/คืน
เข้าพักได้สูงสุด 18 ท่าน (เสริมได้อีก 8 ท่านจากราคาเริ่มต้น 10 ท่าน)

ราคานี้เป็นเรทช่วงเดือนมีนาคม–ตุลาคม
ช่วง High Season (พฤศจิกายน–กุมภาพันธ์) บวกเพิ่ม 10,000 บาท/คืน ทั้งวันธรรมดาและศุกร์–เสาร์',
       ARRAY['ราคา','5 ห้องนอน','ธรรมชาติแกรนด์','TMC7','เท่าไหร่'], 20),

      (v_org, 'ราคา', 'ราคาบ้าน 4 ห้องนอน (ธรรมชาติวิลล่า / Pet Friendly)',
'ธรรมชาติวิลล่า และ ธรรมชาติวิลล่า Pet Friendly — 4 ห้องนอน ราคาเหมาหลัง สำหรับ 8 ท่าน รวมอาหารเช้า

• วันธรรมดา (อาทิตย์–พฤหัสบดี): 19,900 บาท/คืน
• วันศุกร์–เสาร์ และวันหยุดนักขัตฤกษ์: 24,900 บาท/คืน

เตียงเสริม ท่านละ 1,000 บาท/คืน
เข้าพักได้สูงสุด 14 ท่าน (เสริมได้อีก 6 ท่านจากราคาเริ่มต้น 8 ท่าน)

ราคานี้เป็นเรทช่วงเดือนมีนาคม–ตุลาคม
ช่วง High Season (พฤศจิกายน–กุมภาพันธ์) บวกเพิ่ม 10,000 บาท/คืน',
       ARRAY['ราคา','4 ห้องนอน','ธรรมชาติวิลล่า','เท่าไหร่'], 30),

      (v_org, 'ราคา', 'High Season ราคาเพิ่มเท่าไหร่ ช่วงไหน',
'ช่วง High Season คือเดือนพฤศจิกายน ถึง เดือนกุมภาพันธ์
ทุกหลังบวกเพิ่ม 10,000 บาทต่อคืน ทั้งวันธรรมดาและวันศุกร์–เสาร์

ช่วงเดือนมีนาคม ถึง ตุลาคม ใช้ราคาปกติ',
       ARRAY['high season','หน้าไฮ','ราคาช่วงปีใหม่','แพงขึ้น'], 40),

      (v_org, 'ส่วนลด', 'พัก 2 คืนขึ้นไป มีส่วนลดไหม',
'พัก 2 คืนขึ้นไป ลดราคาคืนที่ 2 ให้ 20%

เงื่อนไข
• ลดเฉพาะค่าห้องพัก ไม่รวมค่าเตียงเสริม (ค่าเตียงเสริมคิดเต็มทุกคืน)
• ส่วนลดคิดจากคืนที่ 2 ที่เข้าพักจริง',
       ARRAY['ส่วนลด','ลดราคา','2 คืน','โปรโมชั่น','พักหลายคืน'], 50),

      (v_org, 'สัตว์เลี้ยง', 'พาสุนัขเข้าพักได้ไหม คิดเงินยังไง',
'พาสุนัขเข้าพักได้เฉพาะหลัง "ธรรมชาติวิลล่า Pet Friendly" เท่านั้น
บ้านหลังอื่นไม่รับสัตว์เลี้ยง

ค่าบริการสุนัข (ต่อตัว ต่อคืน)
• น้ำหนักไม่เกิน 10 กิโลกรัม: 1,500 บาท
• น้ำหนักเกิน 10 แต่ไม่เกิน 15 กิโลกรัม: 2,000 บาท

ทางบ้านพักมีของใช้สำหรับสุนัขเตรียมไว้ให้',
       ARRAY['หมา','สุนัข','สัตว์เลี้ยง','pet friendly','เอาหมาไปได้ไหม'], 60),

      (v_org, 'ห้องนอน', 'ห้องนอนของบ้าน 5 ห้องนอน (ธรรมชาติแกรนด์ / TMC 7)',
'ธรรมชาติแกรนด์ (TMC 7) — 5 ห้องนอน เริ่มต้น 10 ท่าน

ชั้น 1
• ห้องสแตนดาร์ด 1 — เตียง 6 ฟุต 1 เตียง นอน 2 ท่าน · เสริมเตียงเลื่อนขนาด 3 ฟุต ได้
• ห้องริมสระ — โซฟาเบดขนาด 5 ฟุต ปกติปู 1 เตียง นอน 2 ท่าน · ปูทั้ง 2 เตียงได้ นอนสูงสุด 4 ท่าน

ชั้น 2
• ห้องมาสเตอร์ — เตียง 6 ฟุต นอน 2 ท่าน + โซฟาเบด 5 ฟุต เสริมได้อีก 2 ท่าน (สูงสุด 4 ท่าน)
• ห้องสแตนดาร์ด 2 — เตียง 6 ฟุต นอน 2 ท่าน · เสริมเตียงเลื่อนขนาด 3 ฟุต ได้
• ห้องแกรนด์แฟมิลี่รูม — เตียง 2 ชั้นขนาด 5 ฟุต นอน 4 ท่าน + โซฟาเบด 5 ฟุต เสริมอีก 2 ท่าน (สูงสุด 6 ท่าน)

ถ้านับเตียงทั้งหมดจริง ๆ จะเสริมได้ถึง 20 ท่าน แต่ทางบ้านพักจำกัดไว้ที่ 18 ท่าน เพื่อไม่ให้แออัดเกินไป',
       ARRAY['ห้องนอน','เตียง','นอนกี่คน','โซฟาเบด','แกรนด์แฟมิลี่รูม'], 70),

      (v_org, 'ห้องนอน', 'ห้องนอนของบ้าน 4 ห้องนอน (ธรรมชาติวิลล่า / Pet Friendly)',
'ธรรมชาติวิลล่า และ ธรรมชาติวิลล่า Pet Friendly — 4 ห้องนอน เริ่มต้น 8 ท่าน (ห้องนอนเหมือนกันทั้งสองหลัง)

• ห้องสแตนดาร์ด 1 — เตียง 6 ฟุต นอน 2 ท่าน · เสริมเตียงเลื่อน 3 ฟุต ได้อีก 1 ท่าน
• ห้องมาสเตอร์ — เตียง 6 ฟุต นอน 2 ท่าน · เสริมจากโซฟาเบด 5 ฟุต ได้อีก 2 ท่าน
• ห้องสแตนดาร์ด 2 — เตียง 6 ฟุต นอน 2 ท่าน · เสริมเตียงเลื่อน 3 ฟุต ได้อีก 1 ท่าน
• ห้องแกรนด์แฟมิลี่รูม — เตียง 2 ชั้นขนาด 5 ฟุต นอน 4 ท่าน · เสริมจากโซฟาเบด 5 ฟุต ได้อีก 2 ท่าน

เข้าพักได้สูงสุด 14 ท่าน',
       ARRAY['ห้องนอน','4 ห้องนอน','เตียงเสริม','นอนกี่คน'], 80),

      (v_org, 'เตียงเสริม', 'เตียงเสริมคิดยังไง เสริมได้กี่คน',
'ค่าเตียงเสริม ท่านละ 1,000 บาท ต่อคืน ทุกหลัง

• บ้าน 5 ห้องนอน (ธรรมชาติแกรนด์) เริ่มต้น 10 ท่าน เสริมได้อีกไม่เกิน 8 ท่าน รวมสูงสุด 18 ท่าน
• บ้าน 4 ห้องนอน (ธรรมชาติวิลล่า / Pet Friendly) เริ่มต้น 8 ท่าน เสริมได้อีกไม่เกิน 6 ท่าน รวมสูงสุด 14 ท่าน

หมายเหตุ: ส่วนลดคืนที่ 2 (20%) ไม่รวมค่าเตียงเสริม — ค่าเตียงเสริมคิดเต็มทุกคืน',
       ARRAY['เตียงเสริม','เสริมเตียง','เพิ่มคน','คนละพัน'], 90),

      (v_org, 'การจอง', 'จ่ายเงินยังไง ต้องมัดจำเท่าไหร่',
'เงื่อนไขการชำระเงิน (จองล่วงหน้ามากกว่า 7 วัน)
• ตอนจอง: ชำระ 50% ของยอดจองทั้งหมด
• ก่อนวันเข้าพัก 7 วัน: ชำระอีก 50% ที่เหลือให้ครบ

เงินประกันความเสียหาย
• วันเช็คอิน เก็บเงินประกันความเสียหาย 10,000 บาท
• คืนให้ภายใน 24 ชั่วโมงหลังเช็คเอาท์ ถ้าไม่มีความเสียหายเกิดขึ้น',
       ARRAY['จ่ายเงิน','มัดจำ','โอน','ชำระเงิน','เงินประกัน','ค่าประกันความเสียหาย','จ่ายยังไง'], 100),

      (v_org, 'การจอง', 'ยกเลิกหรือเลื่อนวันเข้าพักได้ไหม',
'นโยบายการยกเลิก / เลื่อนวันเข้าพัก
• เลื่อนวันเข้าพักได้อย่างน้อย 1 ครั้ง โดยต้องแจ้งล่วงหน้าไม่น้อยกว่า 14 วัน
• ไม่มีการคืนเงินในทุกกรณี (ยกเลิกแล้วไม่คืนเงิน ให้เลื่อนวันแทน)',
       ARRAY['ยกเลิก','เลื่อน','คืนเงิน','refund','เปลี่ยนวัน'], 110);
    END IF;
  END LOOP;
END $$;
