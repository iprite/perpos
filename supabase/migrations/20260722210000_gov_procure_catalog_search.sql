-- ============================================================================
-- gov_procure — ค้นชื่อสินค้าในคลังแบบใกล้เคียง (fuzzy / pg_trgm)
--
-- ต่อจาก 20260722200000_gov_procure_catalog.sql (ไฟล์ที่ 3 ในแผน §5.3 ของ
-- specs/gov-procure-catalog.db.md — "optional, เปิดทีหลังถ้า exact ไม่พอ")
--   → งานจริงพิสูจน์แล้วว่าไม่พอ: ชื่อจาก TOR แทบไม่ตรงกับชื่อในคลังเป๊ะ
--     ("ปากกาเจล 0.5 น้ำเงิน" ไม่ match "ปากกาหมึกเจล สีน้ำเงิน ขนาด 0.5 มม.")
--
-- ADDITIVE 100% — **ไม่มี ALTER ตารางเดิมแม้แต่จุดเดียว**
--   เพิ่มเฉพาะ: extension (schema `extensions`) + gin index + function ใหม่ 1 ตัว
--   ของเดิม (name_key GENERATED + unique(org_id, name_key) = exact match) ไม่ถูกแตะ
--
-- ⚠️ กฎความปลอดภัยของฟีเจอร์ (บังคับที่ชั้น API — DB บังคับให้ไม่ได้):
--     exact match  → auto-apply ได้ (source='library')
--     fuzzy match  → **เป็นได้แค่ "ข้อเสนอแนะ" ให้คนเลือกเท่านั้น**
--     ห้าม route ใดเอาผลของฟังก์ชันนี้ไปเขียนทับ item / ตั้ง source='library' อัตโนมัติ
--     (จับคู่ผิด = สเปก/ราคาของสินค้าคนละตัวไหลเข้าเอกสารที่ยื่นราชการ
--      โดยมีป้าย "จากคลัง" ที่ดูเหมือนคนยืนยันแล้ว — อันตรายกว่าปล่อยให้ AI เติมใหม่)
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1) extension — ติดตั้งใน schema `extensions` ตามมาตรฐาน Supabase
--    (กัน advisor เตือน extension_in_public · repo นี้อ้าง extension แบบ
--     qualified อยู่แล้ว เช่น `extensions.digest()` ใน audit_logs_v2)
--
--    ทำไม pg_trgm ใช้กับไทยได้: trigram ตัดที่ระดับ "อักขระ" ไม่ใช่ "คำ"
--      → ไม่ต้องมี word segmentation ของไทย
--    ทำไมไม่ใช้ to_tsvector: Postgres ไม่มี text search config ของไทย
--      (ไทยไม่เว้นวรรคระหว่างคำ → ทั้งวลีกลายเป็น token เดียว)
-- ---------------------------------------------------------------------------
create extension if not exists pg_trgm with schema extensions;

-- ---------------------------------------------------------------------------
-- 2) gin trigram index บน gov_procure_products.name_key
--    ใช้กับ operator `%` (similarity) ของ pg_trgm
--
--    ทำไมไม่ทำ composite (org_id, name_key): gin ไม่รับคอลัมน์ btree ธรรมดา
--      ถ้าไม่ลง `btree_gin` เพิ่ม — คลังต่อ org ระดับหลักร้อยแถว planner
--      กรอง org_id ด้วย index เดิม (gov_procure_products_org_category_idx /
--      org_namekey_uniq) แล้วค่อยกรอง trigram ได้เร็วพออยู่แล้ว
--      → ไม่แลก extension เพิ่มอีกตัวกับกำไรที่วัดไม่ได้
--    opclass ต้องอ้างแบบ qualified (`extensions.gin_trgm_ops`) เพราะ extension
--      ไม่ได้อยู่ใน public
-- ---------------------------------------------------------------------------
create index if not exists gov_procure_products_name_key_trgm_idx
  on public.gov_procure_products
  using gin (name_key extensions.gin_trgm_ops);

-- ---------------------------------------------------------------------------
-- 3) RPC gov_procure_match_products — ทำไมต้องมี
--    PostgREST เรียก `similarity()` / operator `%` ตรง ๆ ไม่ได้
--    (rest filter รองรับแค่ eq/like/ilike/fts …) → ต้องมี function ห่อ
--
--    รับ p_names เป็น **array** เพื่อให้ตอน paste 84 บรรทัดยิงคิวรีเดียว
--    (ท่าเดียวกับ findProductsByNames ของ exact match)
--
--    🔐 SECURITY INVOKER (default — ไม่ระบุ definer):
--       RLS ของ gov_procure_products บังคับกับผู้เรียกเอง
--       ⇒ ผู้ใช้ที่ถือ JWT ส่ง p_org_id ของ org อื่นก็ไม่เห็นข้อมูล (policy กรอง)
--       ⇒ ปลอดภัยกว่า SECURITY DEFINER ที่รับ p_org_id จาก client
--          (บทเรียน improve/tmc-stock B1: DEFINER + tenant param = cross-tenant)
--       route ที่เรียกด้วย service role bypass RLS ตามปกติ → ด่านจริงคือ
--       requireGovProcureMember(orgId) ที่ API เหมือนทุก route ของ module
--
--    search_path = public, extensions (ไม่ใช้ '' — บทเรียน 2026-06-26:
--      '' ทำให้ resolve ตาราง/ฟังก์ชันแบบ unqualified ไม่เจอ)
--
--    ⚠️ ทุก reference ในบอดี้ **ต้อง qualified** (p.name / i.name_key)
--       เพราะชื่อคอลัมน์ใน RETURNS TABLE (name/brand_model/…) เป็น OUT parameter
--       ไปด้วย → identifier เปล่า ๆ จะกำกวม
-- ---------------------------------------------------------------------------
create or replace function public.gov_procure_match_products(
  p_org_id    uuid,
  p_names     text[],
  p_threshold real default 0.3,
  p_limit     int  default 5
)
returns table (
  input_name      text,
  product_id      uuid,
  name            text,
  brand_model     text,
  image_path      text,
  last_unit_price numeric,
  score           real
)
language sql
stable
set search_path = public, extensions
as $$
  with inputs as (
    select distinct
      n.raw                                          as input_name,
      public.gov_procure_normalize_name(n.raw)       as name_key
    from unnest(coalesce(p_names, array[]::text[])) as n(raw)
    where public.gov_procure_normalize_name(n.raw) <> ''
  )
  select
    i.input_name,
    m.id,
    m.name,
    m.brand_model,
    m.image_path,
    m.last_unit_price,
    m.score
  from inputs i
  cross join lateral (
    select
      p.id,
      p.name,
      p.brand_model,
      p.image_path,
      p.last_unit_price,
      similarity(p.name_key, i.name_key) as score
    from public.gov_procure_products p
    where p.org_id = p_org_id
      -- `%` ใช้ gin index ได้ (เกณฑ์ = GUC pg_trgm.similarity_threshold, default 0.3)
      and p.name_key % i.name_key
      -- กรองซ้ำด้วยค่าที่ผู้เรียกขอ — มีพื้น 0.3 เพราะ `%` กรองที่ 0.3 ไปแล้ว
      -- (ขอต่ำกว่า 0.3 จะไม่ได้ผลเพิ่ม จึง clamp ให้ตรงกับความจริงแทนที่จะโกหก)
      and similarity(p.name_key, i.name_key) >= greatest(coalesce(p_threshold, 0.3), 0.3)
    order by
      similarity(p.name_key, i.name_key) desc,
      p.times_used desc,
      p.name
    limit least(greatest(coalesce(p_limit, 5), 1), 20)
  ) m;
$$;

-- REVOKE ต้องครอบ `public` ด้วย — create function grant EXECUTE ให้ PUBLIC
--   โดย default; revoke แค่ anon/authenticated ไม่ลบ grant ที่ตกทอดจาก PUBLIC
--   (LESSONS 2026-06-26 [rls])
revoke all on function public.gov_procure_match_products(uuid, text[], real, int)
  from public, anon, authenticated;

-- authenticated: ปลอดภัยเพราะเป็น INVOKER + RLS ของ products
-- service_role: route (createAdminClient) เป็นผู้เรียกจริงในเส้นทางปัจจุบัน
grant execute on function public.gov_procure_match_products(uuid, text[], real, int)
  to authenticated, service_role;

-- ===========================================================================
-- 4) หลัง apply — verify (บังคับ)
-- ===========================================================================
--   1) extension อยู่ schema ที่ถูก:
--      select e.extname, n.nspname from pg_extension e
--      join pg_namespace n on n.oid = e.extnamespace where e.extname = 'pg_trgm';
--      → ต้องได้ nspname = 'extensions'
--
--   2) ACL + security mode (ต้องไม่ใช่ definer, ต้องไม่มี =X/ ของ PUBLIC):
--      select proname, prosecdef, proacl from pg_proc
--      where proname = 'gov_procure_match_products';
--      → prosecdef = false · proacl เห็นเฉพาะ authenticated=X และ service_role=X
--
--   3) index มีจริง:
--      select indexname, indexdef from pg_indexes
--      where tablename = 'gov_procure_products' and indexname like '%trgm%';
--
--   4) เกณฑ์ threshold กับข้อมูลจริง (ยืนยันค่าที่โค้ดใช้ = 0.30):
--      select similarity(
--        public.gov_procure_normalize_name('ปากกาเจล 0.5 น้ำเงิน'),
--        public.gov_procure_normalize_name('ปากกาหมึกเจล สีน้ำเงิน ขนาด 0.5 มม.')
--      ) as should_be_above_0_30,
--      similarity(
--        public.gov_procure_normalize_name('ปากกาเจล 0.5 น้ำเงิน'),
--        public.gov_procure_normalize_name('ปากกาไวท์บอร์ด สีดำ')
--      ) as should_be_below_0_30;
--      (ค่าที่คาดจาก unit test ฝั่ง TS: ~0.44 และ ~0.22 — ถ้าผลจริงต่างจากนี้มาก
--       ให้ปรับ FUZZY_MIN_SCORE ใน lib/gov-procure/catalog-products.ts ตามของจริง)
--
--   5) smoke test ในฐานะ member ของ org p2p-x-89 จริง (ไม่ใช่ super_admin bypass):
--      select * from public.gov_procure_match_products(
--        '<orgId>'::uuid, array['ปากกาเจล 0.5 น้ำเงิน'], 0.3, 5);
--
--   6) get_advisors (security + performance)

-- ===========================================================================
-- 5) ROLLBACK PLAN (คัดลอกไปรันได้ตรง ๆ)
-- ===========================================================================
-- drop function if exists public.gov_procure_match_products(uuid, text[], real, int);
-- drop index if exists public.gov_procure_products_name_key_trgm_idx;
-- -- ⚠️ **ไม่ drop extension pg_trgm** — เป็นของกลางของฐาน อาจมีคนอื่นใช้
--
-- ผลของการ rollback: suggestProductsByNames() จะจับ error แล้วคืน Map ว่าง
--   → หน้า "ค้นจากคลัง" ไม่มีข้อเสนอแนะ (feature degrade) แต่ exact match /
--     auto-apply / ทุกอย่างที่เหลือทำงานเหมือนเดิม 100%
