-- Product Documents — เก็บเอกสาร/คู่มือผู้ใช้ (HTML self-contained) ที่ Documentation Factory ผลิต
-- + ประวัติเวอร์ชัน (revert ได้) + แก้เล็กน้อยด้วย Gemini + export PDF ผ่าน pdf-renderer
--
-- คอนเซ็ปต์เดียวกับ presentation_decks (migration 20260623150000) — เก็บ HTML inline, RLS deny-all
-- (super_admin จัดการผ่าน admin console ด้วย service-role)

create table if not exists public.product_documents (
  id          uuid primary key default gen_random_uuid(),
  slug        text unique not null,                 -- ตรงกับ specs/<doc>.md ของ docs factory
  title       text not null,
  description text,
  audience    text,                                 -- กลุ่มผู้ใช้เป้าหมาย
  doc_type    text not null default 'manual'
                check (doc_type in ('manual', 'guide', 'faq', 'release_notes', 'spec', 'other')),
  html        text not null default '',             -- HTML self-contained (พิมพ์/export PDF ได้)
  status      text not null default 'draft' check (status in ('draft', 'published')),
  version     int  not null default 1,
  created_by  uuid references public.profiles(id),
  updated_by  uuid references public.profiles(id),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table if not exists public.product_document_versions (
  id          uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.product_documents(id) on delete cascade,
  version     int  not null,
  html        text not null,
  note        text,
  source      text not null default 'manual' check (source in ('manual', 'factory', 'ai_edit', 'revert')),
  created_by  uuid references public.profiles(id),
  created_at  timestamptz not null default now(),
  unique (document_id, version)
);

create index if not exists idx_product_document_versions_doc on public.product_document_versions (document_id, version desc);

-- updated_at auto-touch (reuse แนวเดียวกับ presentation_decks)
create or replace function public.touch_product_documents_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_product_documents_updated_at on public.product_documents;
create trigger trg_product_documents_updated_at
  before update on public.product_documents
  for each row execute function public.touch_product_documents_updated_at();

-- RLS — เปิดแต่ไม่มี policy (deny-all สำหรับ anon/authenticated) · service role bypass
alter table public.product_documents enable row level security;
alter table public.product_document_versions enable row level security;
