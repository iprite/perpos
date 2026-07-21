-- Presentation Desk — เก็บ deck/สื่อนำเสนอ HTML ที่ Presentation Factory ผลิต
-- + ประวัติเวอร์ชัน (revert ได้) + รองรับแก้ทั้ง deck ผ่าน Gemini ออนไลน์
--
-- เข้าถึงเฉพาะ super_admin ผ่าน admin console (service-role bypass RLS).
-- RLS เปิดแต่ไม่มี policy เปิดให้ anon/authenticated → deny by default (เหมือน scoped AI worker)

create table if not exists public.presentation_decks (
  id          uuid primary key default gen_random_uuid(),
  slug        text unique not null,                 -- เช่น nursing_home_exec (ตรงกับ specs/<deck>.md)
  title       text not null,
  description text,
  audience    text,                                 -- กลุ่มเป้าหมาย (จาก brief)
  format      text not null default 'deck' check (format in ('deck', 'one_pager')),
  html        text not null default '',             -- HTML ปัจจุบัน (self-contained)
  status      text not null default 'draft' check (status in ('draft', 'published')),
  version     int  not null default 1,              -- เลขเวอร์ชันล่าสุด
  created_by  uuid references public.profiles(id),
  updated_by  uuid references public.profiles(id),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table if not exists public.presentation_deck_versions (
  id          uuid primary key default gen_random_uuid(),
  deck_id     uuid not null references public.presentation_decks(id) on delete cascade,
  version     int  not null,
  html        text not null,
  note        text,                                 -- "เวอร์ชันแรก" / prompt ที่ใช้แก้ / "revert จาก v2"
  source      text not null default 'manual' check (source in ('manual', 'factory', 'ai_edit', 'revert')),
  created_by  uuid references public.profiles(id),
  created_at  timestamptz not null default now(),
  unique (deck_id, version)
);

create index if not exists idx_presentation_deck_versions_deck on public.presentation_deck_versions (deck_id, version desc);

-- updated_at auto-touch
create or replace function public.touch_presentation_decks_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_presentation_decks_updated_at on public.presentation_decks;
create trigger trg_presentation_decks_updated_at
  before update on public.presentation_decks
  for each row execute function public.touch_presentation_decks_updated_at();

-- RLS — เปิดแต่ไม่มี policy (deny-all สำหรับ anon/authenticated) · service role bypass
alter table public.presentation_decks enable row level security;
alter table public.presentation_deck_versions enable row level security;
