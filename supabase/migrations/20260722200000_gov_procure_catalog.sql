-- ============================================================================
-- gov_procure — แคตตาล็อกสินค้า (catalog) + คลังสินค้า + AI enrich
-- Contract: .claude/feature-factory/specs/gov-procure-catalog.md §5.2/§5.3/§5.9
-- DB design: .claude/feature-factory/specs/gov-procure-catalog.db.md (v3)
--
-- ADDITIVE 100% — ไม่มี ALTER ตารางเดิมของ module แม้แต่จุดเดียว
--   (gov_procure_orders / _attachments / _settings / _investors / _capital_flows
--    / _line_pending  ทั้งหมด "ไม่ถูกแตะ" — อ้างเป็น FK เป้าหมายอย่างเดียว)
--
-- ลำดับสร้าง (บังคับ): normalize_name() → products → catalog_letterheads
--                      → catalogs → catalog_jobs → catalog_items
--   (catalog_items อ้าง **ทั้ง** products และ catalog_jobs)
--
-- convention ที่ยึด: prefix gov_procure_ · คีย์ org_id (ไม่ใช่ organization_id)
--   · trigger updated_at = public.set_updated_at() (ตัวที่ repo ใช้ทั้งก้อน
--     + ไฟล์ล่าสุดของ module 20260722120000_gov_procure_capital.sql)
--   · RLS: select = is_org_member(org_id, auth.uid())
--          write  = is_org_admin(org_id, auth.uid())   ← org isolation เท่านั้น
--     สิทธิ์ระดับ role/field ตัวจริงบังคับที่ API (canWrite / canModuleWrite)
--
-- v1 ไม่มี RPC และไม่มี extension (D5) — fuzzy search (pg_trgm + gin +
--   gov_procure_match_products) เลื่อนไปไฟล์ optional ทีหลัง:
--   <ts>_gov_procure_catalog_search.sql (ยังไม่เขียนในรอบนี้)
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 0) gov_procure_normalize_name() — คีย์เทียบชื่อสินค้าซ้ำ
--    IMMUTABLE เพราะถูกใช้เป็น GENERATED column ของ gov_procure_products.name_key
--    SECURITY INVOKER (default) — pure function ไม่แตะตาราง
--    search_path = public (ห้ามใช้ '' — บทเรียน LESSONS 2026-06-26: trigger/
--    ตารางที่อ้างแบบ unqualified จะ resolve ไม่เจอ)
--
--    ⚠️ แก้ logic ของฟังก์ชันนี้ภายหลัง = ต้อง drop + re-add คอลัมน์ name_key
--       (ค่าที่ stored ไว้ไม่ recompute เอง) → ล็อกกฎ normalize ให้นิ่ง
-- ---------------------------------------------------------------------------
create or replace function public.gov_procure_normalize_name(p_name text)
returns text
language sql
immutable
strict
set search_path = public
as $$
  select
    -- 4) ตัดช่องว่างซ้ำ + trim
    btrim(regexp_replace(
      -- 3) วรรคตอน/สัญลักษณ์ → ช่องว่าง ("No.683-5CF" = "No 683 5CF")
      regexp_replace(
        -- 2) เลขไทย → เลขอารบิก
        translate(
          -- 1) lower + normalize เว้นวรรคทุกชนิด (nbsp/tab/newline)
          lower(regexp_replace(p_name, '[\s ]+', ' ', 'g')),
          '๐๑๒๓๔๕๖๗๘๙', '0123456789'
        ),
        '[][(){}<>.,;:!?/\\|_''"`+*&#@~^%$-]', ' ', 'g'
      ),
      '\s+', ' ', 'g'
    ));
$$;

-- REVOKE ต้องครอบ `public` ด้วย — create function grant EXECUTE ให้ PUBLIC
--   โดย default; revoke แค่ anon/authenticated ไม่ลบ grant ที่ตกทอดจาก PUBLIC
--   (LESSONS 2026-06-26 [rls])
revoke all on function public.gov_procure_normalize_name(text)
  from public, anon, authenticated;
-- service_role คือ writer จริง (route เขียน products ด้วย createAdminClient)
--   ถ้าตกหล่น → insert/upsert products พังตอน production (A-7)
-- authenticated ต้องมีด้วย: SSR อ่าน/เขียนผ่าน RLS client
grant execute on function public.gov_procure_normalize_name(text)
  to authenticated, service_role;
-- ✅ verify หลัง apply (บังคับ):
--   select proname, proacl, prosecdef from pg_proc
--   where proname = 'gov_procure_normalize_name';
--   → proacl ต้องเห็นทั้ง authenticated=X และ service_role=X

-- ===========================================================================
-- 1) gov_procure_products — คลังสินค้าของ org (reuse ข้ามชุดเอกสาร)
-- ===========================================================================
create table if not exists public.gov_procure_products (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.organizations(id) on delete cascade,

  name        text not null,                          -- ชื่อ canonical (ที่จะพิมพ์)
  -- GENERATED เพื่อให้ "ทุก writer normalize เหมือนกันเสมอ"
  name_key    text generated always as (public.gov_procure_normalize_name(name)) stored,

  brand_model text,
  spec_line   text,
  size_line   text,
  bullets       jsonb not null default '[]'::jsonb,
  care_notes    jsonb not null default '[]'::jsonb,
  -- ⚠️ ไม่มี `ai_warnings` ในคลัง (C-B1) — เป็นความไม่มั่นใจของ AI รอบนั้น ๆ
  --    ไม่ใช่คุณสมบัติของสินค้า → ห้าม copy ตอน upsert เข้าคลัง
  caution_notes jsonb not null default '[]'::jsonb,
  sub_items     jsonb not null default '[]'::jsonb,
  category      text,
  default_unit  text,
  -- <orgId>/products/<productId>/<uuid>-<safeName> — server-set only (A-B2)
  image_path    text,

  last_unit_price  numeric(15,4),                     -- ราคาที่ "คน" ยืนยันล่าสุด
  price_updated_at timestamptz,
  price_updated_by uuid references public.profiles(id) on delete set null,

  times_used   int not null default 0,                -- event counter (ไม่ใช่ derived)
  last_used_at timestamptz,

  created_by  uuid not null references public.profiles(id),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  constraint gov_procure_products_price_chk
    check (last_unit_price is null or last_unit_price >= 0),
  constraint gov_procure_products_used_chk check (times_used >= 0),
  constraint gov_procure_products_json_shape_chk check (
    jsonb_typeof(bullets)       = 'array' and
    jsonb_typeof(care_notes)    = 'array' and
    jsonb_typeof(caution_notes) = 'array' and
    jsonb_typeof(sub_items)     = 'array'
  )
);

-- 🔒 INVARIANT ที่ DB บังคับไม่ได้ (กฎข้ามตาราง) → API ต้องบังคับ + มี unit test:
--    "บันทึกเข้าคลัง (gov_procure_products) รับเฉพาะ item ที่ source='human_verified'"
--    บังคับที่ POST /api/gov-procure/products (A-2 / C-8)

-- คีย์เสริมรองรับ composite FK (product_id, org_id) ของ catalog_items (G4)
create unique index if not exists gov_procure_products_id_org_uniq
  on public.gov_procure_products (id, org_id);

-- หัวใจการค้นซ้ำ + กันคลังมีของซ้ำ (v1 = exact match เท่านั้น — D5)
create unique index if not exists gov_procure_products_org_namekey_uniq
  on public.gov_procure_products (org_id, name_key);

-- หน้าคลัง: กรองหมวด + เรียงชื่อ (ขึ้นต้นด้วย org_id ตามมาตรฐาน tenant)
create index if not exists gov_procure_products_org_category_idx
  on public.gov_procure_products (org_id, category, name);

-- ===========================================================================
-- 2) gov_procure_catalog_letterheads — ค่าตั้งต้นหัวจดหมาย 1 แถว/บริษัท/org
--    (C1: แทน ALTER gov_procure_settings ที่ถูกยกเลิก → ADDITIVE 100%
--     + ไม่มี lost-update race แบบ jsonb ก้อนเดียว)
--    ใช้เป็น "ค่าตั้งต้น" เท่านั้น → copy เป็น catalogs.letterhead_snapshot
--    ตอนสร้างชุด · ตอน export ใช้ snapshot อย่างเดียว
--    สิทธิ์แก้ = canManageSettings (ที่เดียวในฟีเจอร์ — C-B3)
-- ===========================================================================
create table if not exists public.gov_procure_catalog_letterheads (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.organizations(id) on delete cascade,
  company       text not null,                        -- 1 ใน COMPANIES

  company_name  text not null,                        -- ชื่อที่พิมพ์บนหัวจดหมาย
  address_lines jsonb not null default '[]'::jsonb,
  phone         text,
  tax_id        text,
  -- validate regex ^data:image/(png|jpeg|webp);base64,… + ≤500KB ที่ API/builder (A-6)
  logo_data_url text,

  created_by    uuid not null references public.profiles(id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  -- ⚠️ ค่าใน CHECK นี้ duplicate กับ COMPANIES ใน
  --    apps/perpos/src/lib/gov-procure/types.ts:28 (แหล่งความจริงเดียว)
  --    เพิ่ม/แก้บริษัท ต้องแก้ทั้ง 2 ที่พร้อมกัน (C9)
  --    ชุดค่าต้องตรงกับ gov_procure_catalogs_company_chk เป๊ะ
  constraint gov_procure_catalog_letterheads_company_chk
    check (company = any (array[
      '89 Global Work','P2P Supply','ALPHA ENGINEERING','MAGISTATS TRADING'
    ]::text[])),
  constraint gov_procure_catalog_letterheads_json_shape_chk
    check (jsonb_typeof(address_lines) = 'array')
);

-- 1 แถว/บริษัท/org — API อ่านด้วย .eq('org_id',…).eq('company',…) คิวรีเดียว (A-12)
create unique index if not exists gov_procure_catalog_letterheads_org_company_uniq
  on public.gov_procure_catalog_letterheads (org_id, company);

-- ===========================================================================
-- 3) gov_procure_catalogs — 1 ชุดเอกสารแคตตาล็อก (header + state machine)
--    state: draft → enriching → review → approved
--    ⚠️ ไม่มี item_count / verified_count (D1) — KPI คำนวณตอนอ่านด้วย
--       group-by ครั้งเดียว (getCatalogItemStats) ตามกับดัก #9 ของ module แม่
--       ("ค่าที่คำนวณได้ห้ามเก็บซ้ำ" — เหตุผลเดียวกับ duration_days)
-- ===========================================================================
create table if not exists public.gov_procure_catalogs (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.organizations(id) on delete cascade,
  -- Q3(a): เอกสารอิสระ — เริ่มทำแคตตาล็อกได้ก่อนมี order ในระบบ, แนบทีหลัง
  -- on delete set null: ลบงานทิ้ง เอกสารต้องไม่หาย (reuse ข้ามงานได้)
  -- ⚠️ G3 ยังเปิดอยู่: order ของ org อื่นถูกอ้างได้ในระดับ DB (จะปิดต้องเพิ่ม
  --    unique(id, org_id) บน gov_procure_orders = แตะตารางเดิม → ไม่ทำ)
  --    → API ต้องเรียก orderBelongsToOrg(orderId, orgId) ก่อน set order_id เสมอ
  order_id      uuid references public.gov_procure_orders(id) on delete set null,

  title         text not null,
  -- ⚠️ duplicate ของ COMPANIES ใน apps/perpos/src/lib/gov-procure/types.ts:28 (C9)
  company       text,
  template      text not null default 'table',        -- 'table' (A) | 'narrative' (B)
  show_prices   boolean not null default false,       -- Q1(b): default ไม่แสดงราคา
  status        text not null default 'draft',

  -- snapshot หัวจดหมาย ณ เวลาสร้าง/เปลี่ยนบริษัท (invariant แบบ acc_documents)
  -- {company_name, address_lines[], phone, tax_id, logo_data_url}
  -- ตอน export ใช้ snapshot นี้อย่างเดียว (source of truth เดียว — C1/C-6)
  letterhead_snapshot jsonb,
  notes         text,
  last_exported_at    timestamptz,                    -- export = action ไม่ใช่ state

  created_by    uuid not null references public.profiles(id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  constraint gov_procure_catalogs_status_chk
    check (status in ('draft','enriching','review','approved')),
  constraint gov_procure_catalogs_template_chk
    check (template in ('table','narrative')),
  -- ⚠️ duplicate ของ COMPANIES ใน apps/perpos/src/lib/gov-procure/types.ts:28 (C9)
  constraint gov_procure_catalogs_company_chk
    check (company is null or company = any (array[
      '89 Global Work','P2P Supply','ALPHA ENGINEERING','MAGISTATS TRADING'
    ]::text[]))
);

-- คีย์เสริมสำหรับ composite FK ของลูก (บังคับ org_id ของลูก = ของพ่อระดับ DB)
create unique index if not exists gov_procure_catalogs_id_org_uniq
  on public.gov_procure_catalogs (id, org_id);

-- หน้า list: ชุดของ org + filter สถานะ + เรียงใหม่สุด (คลุม org_id เดี่ยวด้วย prefix)
create index if not exists gov_procure_catalogs_org_status_idx
  on public.gov_procure_catalogs (org_id, status, created_at desc);

-- "งานนี้มีแคตตาล็อกอะไรบ้าง" จาก order detail (partial — เอกสารอิสระเป็นส่วนใหญ่)
create index if not exists gov_procure_catalogs_org_order_idx
  on public.gov_procure_catalogs (org_id, order_id) where order_id is not null;

-- ===========================================================================
-- 4) gov_procure_catalog_jobs — header ของ "รอบ enrich" (C2)
--    claim จริงอยู่ที่ระดับ item (items.enrich_state + FOR UPDATE SKIP LOCKED)
--    ตารางนี้เก็บ: progress รวม / cost(token) / correlation_id / กันกดรัว
--    ⚠️ ไม่มี next_seq_no / claimed_by / claimed_at (C2 ตัดออก)
-- ===========================================================================
create table if not exists public.gov_procure_catalog_jobs (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.organizations(id) on delete cascade,
  catalog_id  uuid not null references public.gov_procure_catalogs(id) on delete cascade,

  status      text not null default 'pending',        -- ชุดเดียวกับ ocr_processing_jobs

  -- progress (chunked = client วนเรียก /enrich/run)
  total_items  int not null default 0,
  done_items   int not null default 0,
  failed_items int not null default 0,
  chunk_size   int not null default 8,                -- Q5(a) · ไม่รับจาก body (A-12)
  -- /enrich/run อัปเดตทุกรอบ · เก่ากว่า 10 นาที + ไม่มี item queued/running
  --   → self-heal ปิด job + คืน catalog เป็น review/draft (C-4, ไม่ใช้ cron)
  heartbeat_at timestamptz,

  model         text,
  input_tokens  int not null default 0,
  output_tokens int not null default 0,
  error_message text,

  triggered_by   uuid not null references public.profiles(id),
  -- AGENTS §Audit: worker/route เขียนกลับต้องอ้าง correlation ของ job
  correlation_id uuid not null default gen_random_uuid(),
  started_at     timestamptz,
  finished_at    timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),

  constraint gov_procure_catalog_jobs_status_chk
    check (status in ('pending','processing','completed','failed','cancelled')),
  -- ⚠️ ไม่ทำ CHECK done_items <= total_items — retry เฉพาะที่ล้มเดินคนละจังหวะ
  --    (2 statement) → CHECK จะทำ update ล้มเป็นครั้งคราวโดยไม่ป้องกันอะไรจริง
  constraint gov_procure_catalog_jobs_counts_chk check (
    total_items >= 0 and done_items >= 0 and failed_items >= 0
    and chunk_size between 1 and 50
    and total_items <= 300                            -- C6: cap ต่อ job
  ),
  -- composite FK: job ต้องอยู่ org เดียวกับ catalog (G2 ปิดที่ DB)
  constraint gov_procure_catalog_jobs_catalog_org_fk
    foreign key (catalog_id, org_id)
    references public.gov_procure_catalogs (id, org_id) on delete cascade
);

-- 1 catalog มี job ที่ยัง active ได้ครั้งเดียว (กันกด "ให้ AI ช่วยเติม" รัว ๆ)
create unique index if not exists gov_procure_catalog_jobs_active_uniq
  on public.gov_procure_catalog_jobs (catalog_id)
  where status in ('pending','processing');

-- A-9: คีย์เสริมให้ items ทำ composite FK (enrich_job_id, org_id) ได้
create unique index if not exists gov_procure_catalog_jobs_id_org_uniq
  on public.gov_procure_catalog_jobs (id, org_id);

-- ดึง job ล่าสุดของชุด (poll progress)
create index if not exists gov_procure_catalog_jobs_catalog_idx
  on public.gov_procure_catalog_jobs (catalog_id, created_at desc);

-- A-8: นับ active job + งบ token/วัน/org ก่อนสร้าง job ใหม่
create index if not exists gov_procure_catalog_jobs_org_idx
  on public.gov_procure_catalog_jobs (org_id, created_at desc);

-- sweep งานค้างทั้ง org (heartbeat เก่า) — partial เล็กมาก
create index if not exists gov_procure_catalog_jobs_org_active_idx
  on public.gov_procure_catalog_jobs (org_id, status)
  where status in ('pending','processing');

-- ===========================================================================
-- 5) gov_procure_catalog_items — 1 รายการในชุด (+ provenance รายแถว)
--    ชื่อฟิลด์ตรงกับ field mapping §5.3 ของ contract 1:1
-- ===========================================================================
create table if not exists public.gov_procure_catalog_items (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.organizations(id) on delete cascade,
  catalog_id  uuid not null references public.gov_procure_catalogs(id) on delete cascade,

  seq_no      int  not null,                          -- ลำดับที่พิมพ์ลงเอกสาร
  name_raw    text not null,                          -- สิ่งที่ผู้ใช้ paste มา (เก็บถาวร)
  name        text not null,                          -- ชื่อที่จะพิมพ์ (แก้ได้)

  -- ── เนื้อหาที่ AI เติม ──────────────────────────────────────────────────
  brand_model text,                                   -- AI: brand + model_code (join ช่องว่าง)
  spec_line   text,                                   -- บรรทัด 1: สเปกรุ่นเต็ม
  size_line   text,                                   -- บรรทัด 2: ขนาด/บรรจุ (AI: size_packing[] join \n)
  bullets       jsonb not null default '[]'::jsonb,   -- "รายละเอียดสินค้า" (5–12 ข้อ)
  care_notes    jsonb not null default '[]'::jsonb,   -- "วิธีการดูแลรักษา" (เทมเพลต B)
  -- ⚠️ C-B1 — สองตัวนี้คนละความหมาย ห้ามสลับ:
  --    caution_notes = "ข้อควรระวัง" ของ *สินค้า*   → ✅ ขึ้น PDF (เทมเพลต B เท่านั้น)
  --    ai_warnings   = สิ่งที่ *AI ไม่มั่นใจ*       → ❌ ห้ามเข้า catalog-html.ts เด็ดขาด
  caution_notes jsonb not null default '[]'::jsonb,
  ai_warnings   jsonb not null default '[]'::jsonb,
  sub_items     jsonb not null default '[]'::jsonb,   -- [{name,qty,unit}] ชุดสังฆทาน ฯลฯ
  category      text,

  qty         numeric(14,2),
  unit        text,
  -- bucket 'gov-procure' → <orgId>/catalogs/<catalogId>/<uuid>-<safeName>
  -- server-set only (A-B2) — client ห้ามส่ง path เข้ามาทุกกรณี
  image_path  text,

  -- ── ราคา (Q1(b): ทุกคนที่ canWrite แก้ได้ — ไม่มี field-lock ที่ DB) ─────
  unit_price_ref   numeric(15,4),
  price_min        numeric(15,4),
  price_max        numeric(15,4),
  -- (ชื่อสุดท้าย D3/C-B2 — `price_source` ตกไปทั้งฟีเจอร์)
  -- คนกรอกเอง = 'ผู้ใช้กรอก' · ดึงจากคลัง = 'คลังสินค้า' (ทั้งคู่ price_confidence = null)
  price_basis      text,
  price_confidence numeric(3,2),
  -- Q1(b) ข้อ 5: ชดเชยด่านสิทธิ์ที่ถอดออก — ต้องรู้ว่าใครแก้ราคาล่าสุด
  price_updated_by uuid references public.profiles(id) on delete set null,
  price_updated_at timestamptz,
  -- A-11: ประวัติราคา append-only (แทน audit trigger)
  --   [{at, by, by_name, from:{ref,min,max}, to:{ref,min,max}, basis}] เก็บ 20 ล่าสุด
  --   ⚠️ ต้องเขียนใน UPDATE เดียวกับการแก้ราคา: price_history = (price_history || $1::jsonb)
  --      → atomic ระดับแถว ไม่มี lost-append (ห้าม read-modify-write 2 statement)
  --   server-set only — ห้ามรับจาก body
  price_history    jsonb not null default '[]'::jsonb,

  -- ── provenance (แกนของฟีเจอร์) ─────────────────────────────────────────
  source      text not null default 'manual',
  confidence  numeric(3,2),                           -- AI: content_confidence (เนื้อหา)
  ai_note     text,
  verified_by uuid references public.profiles(id) on delete set null,
  verified_at timestamptz,
  -- B-B1: กัน bulk-verify ประทับ 'human_verified' ให้ของที่ไม่มีใครเปิดอ่าน
  --   server-set ตอน GET items/[itemId] หรือ PATCH action:"mark-viewed"
  viewed_at   timestamptz,

  -- ── enrich (C2: claim ระดับ item ด้วย FOR UPDATE SKIP LOCKED) ──────────
  enrich_state      text not null default 'idle',
  enrich_claimed_at timestamptz,                      -- sweep: 'running' เกิน 3 นาที → คืน
  enrich_job_id     uuid references public.gov_procure_catalog_jobs(id) on delete set null,
  enrich_error      text,                             -- เหตุผลรายตัว (ปุ่ม "ลองใหม่เฉพาะที่ล้มเหลว")

  -- ผูกคลัง: ลบสินค้าในคลัง item ต้องไม่หาย → set null
  product_id  uuid references public.gov_procure_products(id) on delete set null,

  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  constraint gov_procure_catalog_items_source_chk
    check (source in ('manual','ai_draft','human_verified','library')),
  constraint gov_procure_catalog_items_enrich_state_chk
    check (enrich_state in ('idle','queued','running','done','failed')),
  constraint gov_procure_catalog_items_seq_chk check (seq_no > 0),
  constraint gov_procure_catalog_items_qty_chk check (qty is null or qty >= 0),
  constraint gov_procure_catalog_items_price_chk check (
    (unit_price_ref is null or unit_price_ref >= 0)
    and (price_min is null or price_min >= 0)
    and (price_max is null or price_max >= 0)
    and (price_min is null or price_max is null or price_min <= price_max)
  ),
  constraint gov_procure_catalog_items_conf_chk check (
    (confidence       is null or (confidence       >= 0 and confidence       <= 1)) and
    (price_confidence is null or (price_confidence >= 0 and price_confidence <= 1))
  ),
  -- jsonb ต้องเป็น array เสมอ (กัน AI/route ยัด object/string แล้ว renderer พังตอน export)
  -- หมายเหตุ: CHECK คุมได้แค่ "เป็น array" → API ต้อง validate element เอง (G7)
  constraint gov_procure_catalog_items_json_shape_chk check (
    jsonb_typeof(bullets)       = 'array' and
    jsonb_typeof(care_notes)    = 'array' and
    jsonb_typeof(caution_notes) = 'array' and
    jsonb_typeof(ai_warnings)   = 'array' and
    jsonb_typeof(sub_items)     = 'array' and
    jsonb_typeof(price_history) = 'array'
  ),
  -- ยืนยันแล้วต้องมีเวลากำกับเสมอ (กัน badge "ยืนยันแล้ว" ที่ไม่มีใครรับผิดชอบ)
  --
  -- ⚠️ ห้ามเขียนเป็น `(verified_by is null) = (verified_at is null)` (แบบสมมาตร)
  --    เพราะ verified_by เป็น FK แบบ ON DELETE SET NULL → ลบ profile แล้ว RI trigger
  --    จะ set verified_by = NULL ทิ้งไว้กับ verified_at ที่ยังมีค่า → ละเมิด CHECK ทันที
  --    → /api/admin/users/delete ล้มทั้งระบบ และลบ user คนนั้นไม่ได้อีกเลย
  --    (ทีมงานลาออก = ลบบัญชีไม่ได้). ทิศเดียวจึงพอ: มีคน ⇒ ต้องมีเวลา
  --    แถวที่เหลือ verified_at อยู่โดย verified_by = null = "ยืนยันแล้วโดยผู้ใช้ที่ถูกลบ" ซึ่งถูกต้อง
  constraint gov_procure_catalog_items_verified_chk check (
    verified_by is null or verified_at is not null
  ),

  -- composite FK: ล็อกระดับ DB ว่า org_id ของ item = org_id ของ catalog (G1)
  -- (แก้ integrity gap ที่ gov_procure_attachments ยอมรับไว้ — GOV_PROCURE_FEATURE §3)
  constraint gov_procure_catalog_items_catalog_org_fk
    foreign key (catalog_id, org_id)
    references public.gov_procure_catalogs (id, org_id) on delete cascade,

  -- G4 ปิดที่ DB: ผูกสินค้าในคลังข้าม org ไม่ได้
  -- MATCH SIMPLE (default) → ข้ามการตรวจเมื่อ product_id IS NULL = พฤติกรรมที่ต้องการ
  --
  -- ⚠️ แก้จากร่าง .db.md: composite FK นี้ **ห้ามใช้ ON DELETE SET NULL**
  --    เพราะ SET NULL บน FK หลายคอลัมน์จะ null **ทุกคอลัมน์ที่อ้าง** รวม org_id
  --    ซึ่งเป็น NOT NULL → ลบสินค้าในคลังจะพังทันที
  --    (PG15+ มี `on delete set null (product_id)` แต่ผูกกับเวอร์ชัน)
  --    ท่าที่ใช้: composite = NO ACTION (default, ตรวจท้าย statement)
  --              + FK เดี่ยว product_id ด้านบน = ON DELETE SET NULL
  --    → ลบ product: FK เดี่ยว set product_id = null ก่อน แล้ว NO ACTION
  --      ตรวจท้าย statement เห็น NULL (MATCH SIMPLE) → ผ่าน  ✔ พฤติกรรมเดิมครบ
  --
  --    `deferrable initially deferred` = ทำให้ลำดับนี้ **แน่นอน** ไม่ใช่บังเอิญ:
  --    ถ้าไม่ deferred, PG ยิง AFTER-ROW trigger ของ FK ทั้งสองตัวเรียงตามชื่อ
  --    `RI_ConstraintTrigger_a_<oid>` (เทียบแบบสตริง) — ปกติ FK เดี่ยว (สร้างก่อน)
  --    มี oid น้อยกว่าจึงยิง SET NULL ก่อน แต่ถ้า oid คร่อมหลัก (999999 → 1000000)
  --    ลำดับจะกลับ → NO ACTION ยิงก่อน → ลบสินค้าในคลังพังถาวร
  --    deferred = ตรวจตอน commit (หลัง SET NULL เสมอ) และไม่ลดการกันข้าม org
  constraint gov_procure_catalog_items_product_org_fk
    foreign key (product_id, org_id)
    references public.gov_procure_products (id, org_id)
    deferrable initially deferred,

  -- G4b (A-9): job ที่อ้างต้องเป็นของ org เดียวกัน — เหตุผลเดียวกับข้างบน
  --   (FK เดี่ยว enrich_job_id = ON DELETE SET NULL · composite = NO ACTION + deferred)
  constraint gov_procure_catalog_items_job_org_fk
    foreign key (enrich_job_id, org_id)
    references public.gov_procure_catalog_jobs (id, org_id)
    deferrable initially deferred
);

-- โหลดรายการในชุดตามลำดับ = query หลักของหน้า workspace
-- (ไม่ทำ unique (catalog_id, seq_no) — การจัดลำดับใหม่จะชน unique กลางคัน;
--  ให้ API normalize ลำดับใน statement เดียวและปล่อยให้ seq ซ้ำชั่วคราวได้)
create index if not exists gov_procure_catalog_items_catalog_seq_idx
  on public.gov_procure_catalog_items (catalog_id, seq_no);

-- KPI "ยังไม่ยืนยัน N รายการ" + filter หน้า list ข้ามชุด (getCatalogItemStats)
create index if not exists gov_procure_catalog_items_org_source_idx
  on public.gov_procure_catalog_items (org_id, source);

-- คิว enrich (FOR UPDATE SKIP LOCKED) + แผง progress + sweep 'running' ค้าง
create index if not exists gov_procure_catalog_items_catalog_state_idx
  on public.gov_procure_catalog_items (catalog_id, enrich_state);

-- "สินค้าตัวนี้ถูกใช้ในชุดไหนบ้าง" + กัน seq-scan ตอน ON DELETE SET NULL
create index if not exists gov_procure_catalog_items_product_idx
  on public.gov_procure_catalog_items (product_id) where product_id is not null;

-- รองรับ ON DELETE SET NULL ของ composite FK job
create index if not exists gov_procure_catalog_items_job_idx
  on public.gov_procure_catalog_items (enrich_job_id) where enrich_job_id is not null;

-- ===========================================================================
-- 6) Trigger updated_at (5/5 ตาราง) — ใช้ฟังก์ชันกลางของ repo, ไม่สร้างใหม่
-- ===========================================================================
drop trigger if exists trg_gov_procure_products_updated
  on public.gov_procure_products;
create trigger trg_gov_procure_products_updated
  before update on public.gov_procure_products
  for each row execute function public.set_updated_at();

drop trigger if exists trg_gov_procure_catalog_letterheads_updated
  on public.gov_procure_catalog_letterheads;
create trigger trg_gov_procure_catalog_letterheads_updated
  before update on public.gov_procure_catalog_letterheads
  for each row execute function public.set_updated_at();

drop trigger if exists trg_gov_procure_catalogs_updated
  on public.gov_procure_catalogs;
create trigger trg_gov_procure_catalogs_updated
  before update on public.gov_procure_catalogs
  for each row execute function public.set_updated_at();

drop trigger if exists trg_gov_procure_catalog_jobs_updated
  on public.gov_procure_catalog_jobs;
create trigger trg_gov_procure_catalog_jobs_updated
  before update on public.gov_procure_catalog_jobs
  for each row execute function public.set_updated_at();

drop trigger if exists trg_gov_procure_catalog_items_updated
  on public.gov_procure_catalog_items;
create trigger trg_gov_procure_catalog_items_updated
  before update on public.gov_procure_catalog_items
  for each row execute function public.set_updated_at();

-- audit trigger fn_audit_log_changes() — ไม่ใส่ (D4/A-11 ตัดสินแล้ว)
--   module gov_procure ไม่มีตารางไหนใช้ audit trigger (แม้ orders ที่เป็นข้อมูล
--   การเงินจริง) + enrich 84 แถว/ชุดจะทำ audit row บวม
--   → trail ราคาใช้ price_history jsonb append-only แทน (§2.2 ของ .db.md)

-- ===========================================================================
-- 7) RLS — ครบ 5/5 ตาราง (pattern เดียวกับตารางเดิมของ module 100%)
--    select = สมาชิก org · write = org admin
--    RLS = org isolation เท่านั้น; การเขียนจริงเดินผ่าน API route
--    (createAdminClient + requireGovProcureMember + canWrite) — policy นี้เป็น
--    backstop สำหรับ path ที่วิ่งผ่าน RLS client (SSR page อ่านอย่างเดียว)
--    ⚠️ ห้ามทำ column-level RLS สำหรับฟิลด์ราคา (Q1b) — ด่านคือ audit + UI badge
-- ===========================================================================
alter table public.gov_procure_products            enable row level security;
alter table public.gov_procure_catalog_letterheads enable row level security;
alter table public.gov_procure_catalogs            enable row level security;
alter table public.gov_procure_catalog_jobs        enable row level security;
alter table public.gov_procure_catalog_items       enable row level security;

drop policy if exists gov_procure_products_select on public.gov_procure_products;
create policy gov_procure_products_select on public.gov_procure_products
  for select using (public.is_org_member(org_id, auth.uid()));

drop policy if exists gov_procure_products_write on public.gov_procure_products;
create policy gov_procure_products_write on public.gov_procure_products
  for all using (public.is_org_admin(org_id, auth.uid()))
  with check (public.is_org_admin(org_id, auth.uid()));

drop policy if exists gov_procure_catalog_letterheads_select
  on public.gov_procure_catalog_letterheads;
create policy gov_procure_catalog_letterheads_select
  on public.gov_procure_catalog_letterheads
  for select using (public.is_org_member(org_id, auth.uid()));

drop policy if exists gov_procure_catalog_letterheads_write
  on public.gov_procure_catalog_letterheads;
create policy gov_procure_catalog_letterheads_write
  on public.gov_procure_catalog_letterheads
  for all using (public.is_org_admin(org_id, auth.uid()))
  with check (public.is_org_admin(org_id, auth.uid()));

drop policy if exists gov_procure_catalogs_select on public.gov_procure_catalogs;
create policy gov_procure_catalogs_select on public.gov_procure_catalogs
  for select using (public.is_org_member(org_id, auth.uid()));

drop policy if exists gov_procure_catalogs_write on public.gov_procure_catalogs;
create policy gov_procure_catalogs_write on public.gov_procure_catalogs
  for all using (public.is_org_admin(org_id, auth.uid()))
  with check (public.is_org_admin(org_id, auth.uid()));

-- jobs = member-readable (ไม่ใช่ deny-all §3.4): หน้า progress เป็น per-org UI
--   ถ้า deny-all → SSR/poll ต้องอ่านผ่าน admin service-role = ผิดกฎ CONTEXT §8
--   ข้อมูลใน job มีแค่ progress/model/token/error (ไม่มี key/PII)
drop policy if exists gov_procure_catalog_jobs_select on public.gov_procure_catalog_jobs;
create policy gov_procure_catalog_jobs_select on public.gov_procure_catalog_jobs
  for select using (public.is_org_member(org_id, auth.uid()));

drop policy if exists gov_procure_catalog_jobs_write on public.gov_procure_catalog_jobs;
create policy gov_procure_catalog_jobs_write on public.gov_procure_catalog_jobs
  for all using (public.is_org_admin(org_id, auth.uid()))
  with check (public.is_org_admin(org_id, auth.uid()));

drop policy if exists gov_procure_catalog_items_select on public.gov_procure_catalog_items;
create policy gov_procure_catalog_items_select on public.gov_procure_catalog_items
  for select using (public.is_org_member(org_id, auth.uid()));

drop policy if exists gov_procure_catalog_items_write on public.gov_procure_catalog_items;
create policy gov_procure_catalog_items_write on public.gov_procure_catalog_items
  for all using (public.is_org_admin(org_id, auth.uid()))
  with check (public.is_org_admin(org_id, auth.uid()));

-- ===========================================================================
-- 8) หลัง apply — verify (บังคับ)
-- ===========================================================================
--   1) FK: select conname, pg_get_constraintdef(oid) from pg_constraint
--          where conrelid = 'public.gov_procure_catalog_items'::regclass
--            and contype = 'f';
--      (ห้ามใช้ information_schema three-way join — พลาด FK ได้ · LESSONS 2026-06-26)
--      ต้องเห็นครบ: catalog_id / (catalog_id,org_id) / (product_id,org_id)
--                   / (enrich_job_id,org_id) / org_id / product_id / enrich_job_id
--                   / verified_by / price_updated_by
--   2) ACL: select proname, proacl, prosecdef from pg_proc
--           where proname = 'gov_procure_normalize_name';
--   3) RLS: select relname, relrowsecurity from pg_class
--           where relname like 'gov_procure_catalog%' or relname = 'gov_procure_products';
--   4) get_advisors (security + performance)
--   5) smoke test ในฐานะ member ของ org p2p-x-89 จริง (ไม่ใช่ super_admin bypass)

-- ===========================================================================
-- 9) ROLLBACK PLAN (ย้อนลำดับ — คัดลอกไปรันได้ตรง ๆ)
-- ===========================================================================
-- drop table if exists public.gov_procure_catalog_items;
-- drop table if exists public.gov_procure_catalog_jobs;
-- drop table if exists public.gov_procure_catalogs;
-- drop table if exists public.gov_procure_catalog_letterheads;
-- drop table if exists public.gov_procure_products;
-- drop function if exists public.gov_procure_normalize_name(text);
--
-- (index/policy/trigger ถูก drop ตามตารางอัตโนมัติ · ไม่มี ALTER ตารางเดิม
--  จึงไม่ต้อง undo อะไรกับ module เดิมเลย — กลับสภาพเดิม 100%)
-- ⚠️ ไฟล์ใน storage ไม่ถูกลบตาม → ต้องล้าง prefix ของ bucket 'gov-procure' เอง:
--    <orgId>/catalogs/…  และ  <orgId>/products/…
