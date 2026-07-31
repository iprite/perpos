-- TMC Stock v2 — ตาราง "ชุดของประจำห้อง" (preset)
-- spec: specs/tmc-stock-v2.md §4.5
--
-- ไฟล์นี้ทำ "ชั้นข้อมูล" ของ P3 เท่านั้น — ยังไม่มี RPC เบิก (tmc_stock_issue_preset)
-- และยังไม่มี tmc_stock_issues / tmc_stock_movements.issue_id (รอ P2 เสร็จก่อน)
-- เจตนา: เก็บ "หนึ่งห้องใช้อะไรบ้างกี่ผืน" ให้เป็นข้อมูลในระบบก่อน เพราะเป็นอินพุตของ
-- พยากรณ์ผ้า (P5) และ CPOR (P6) อยู่แล้ว — ไม่ต้องรอหน้าจอ
--
-- ต่างจาก spec §4.5 หนึ่งจุด: เพิ่ม room_name
--   spec วาง preset ไว้ที่ระดับ "หลัง" (property_code) แต่ของจริงที่ลูกค้าให้มาเป็น "รายห้อง"
--   (Standard 1 / Pavilion / Master / Grand Family + พื้นที่ส่วนกลางของหลังนั้น)
--   จึงต้องมีมิติห้อง ไม่งั้นชุดของทั้งหลังยุบเป็นก้อนเดียวและแก้รายห้องไม่ได้

begin;

-- ────────────────────────────────────────────────────────────────
-- 1. ชุด (หัว)
-- ────────────────────────────────────────────────────────────────
create table if not exists public.tmc_stock_presets (
  id                 uuid primary key default gen_random_uuid(),
  org_id             uuid not null references public.organizations(id) on delete cascade,
  name               text not null,
  preset_kind        text not null default 'checkout'
                       check (preset_kind in ('checkout','daily','welcome','custom')),
  property_code      text,          -- null = ใช้ได้ทุกหลัง · ระบุ = ชุดเฉพาะหลังนั้น
  room_name          text,          -- null = ทั้งหลัง/พื้นที่รวม · ระบุ = ชุดของห้องนั้น
  source_location_id uuid references public.tmc_stock_locations(id) on delete set null,
  note               text,
  is_active          boolean not null default true,
  sort_order         integer not null default 0,
  created_by         uuid references public.profiles(id) on delete set null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

-- ชุดของ (หลัง, ห้อง, ชนิด) ต้องไม่ซ้ำ — กันคีย์ซ้อนตอน seed/คัดลอกไปหลังอื่น
create unique index if not exists tmc_stock_presets_scope_uniq
  on public.tmc_stock_presets (
    org_id, preset_kind,
    coalesce(property_code, ''),
    coalesce(room_name, '')
  );

create index if not exists tmc_stock_presets_org_idx
  on public.tmc_stock_presets(org_id, is_active, sort_order);

-- ────────────────────────────────────────────────────────────────
-- 2. บรรทัดในชุด
-- ────────────────────────────────────────────────────────────────
create table if not exists public.tmc_stock_preset_lines (
  id          uuid primary key default gen_random_uuid(),
  preset_id   uuid not null references public.tmc_stock_presets(id) on delete cascade,
  item_id     uuid not null references public.tmc_stock_items(id) on delete restrict,
  qty         numeric not null check (qty > 0),
  qty_basis   text not null default 'fixed'
                check (qty_basis in ('fixed','per_guest','per_night','per_bed')),
  is_optional boolean not null default false,
  note        text,
  sort_order  integer not null default 0,
  unique (preset_id, item_id)
);

create index if not exists tmc_stock_preset_lines_item_idx
  on public.tmc_stock_preset_lines(item_id);

-- ────────────────────────────────────────────────────────────────
-- 3. updated_at
-- ────────────────────────────────────────────────────────────────
create or replace function public.tmc_stock_presets_touch()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists tmc_stock_presets_touch_trg on public.tmc_stock_presets;
create trigger tmc_stock_presets_touch_trg
  before update on public.tmc_stock_presets
  for each row execute function public.tmc_stock_presets_touch();

-- ────────────────────────────────────────────────────────────────
-- 4. RLS — ตามแบบเดียวกับ tmc_stock_locations (P1)
-- ────────────────────────────────────────────────────────────────
alter table public.tmc_stock_presets      enable row level security;
alter table public.tmc_stock_preset_lines enable row level security;

drop policy if exists tmc_stock_presets_select on public.tmc_stock_presets;
create policy tmc_stock_presets_select on public.tmc_stock_presets
  for select using (exists (
    select 1 from organization_members m
    where m.organization_id = tmc_stock_presets.org_id and m.user_id = auth.uid()));

drop policy if exists tmc_stock_presets_write on public.tmc_stock_presets;
create policy tmc_stock_presets_write on public.tmc_stock_presets
  for all using (exists (
    select 1 from organization_members m
    where m.organization_id = tmc_stock_presets.org_id and m.user_id = auth.uid()
      and m.role = any (array['owner','admin','management','team_lead'])));

drop policy if exists tmc_stock_preset_lines_select on public.tmc_stock_preset_lines;
create policy tmc_stock_preset_lines_select on public.tmc_stock_preset_lines
  for select using (exists (
    select 1 from public.tmc_stock_presets p
    join organization_members m on m.organization_id = p.org_id
    where p.id = tmc_stock_preset_lines.preset_id and m.user_id = auth.uid()));

drop policy if exists tmc_stock_preset_lines_write on public.tmc_stock_preset_lines;
create policy tmc_stock_preset_lines_write on public.tmc_stock_preset_lines
  for all using (exists (
    select 1 from public.tmc_stock_presets p
    join organization_members m on m.organization_id = p.org_id
    where p.id = tmc_stock_preset_lines.preset_id and m.user_id = auth.uid()
      and m.role = any (array['owner','admin','management','team_lead'])));

comment on table public.tmc_stock_presets is
  'ชุดของประจำห้อง — ค่าตั้งต้นตอนเบิก ไม่ใช่กฎเหล็ก (แก้จำนวนก่อนยืนยันได้เสมอ) · spec §4.5';
comment on column public.tmc_stock_presets.room_name is
  'ห้องในหลังนั้น (Standard 1 / Pavilion / Master / …) · null = พื้นที่รวมของทั้งหลัง';

commit;
