-- TMC Stock v2 — P1: จุดเก็บของ + ยอดคงเหลือต่อจุดเก็บ + movement แบบ from → to
-- spec: specs/tmc-stock-v2.md §3, §6 (P1)
--
-- invariant ที่ตั้งขึ้นในไฟล์นี้ (ห้ามพังในเฟสถัดไป):
--   1. tmc_stock_balances / tmc_stock_items.current_qty เขียนจาก trigger ของ tmc_stock_movements ทางเดียว
--   2. movement แก้/ลบไม่ได้ — ผิดต้องออกรายการกลับ (ref_movement_id)
--   3. ของ reusable ออกจากระบบได้เฉพาะ retire / lost และต้องมี reason
--
-- ความเข้ากันได้ย้อนหลัง: โค้ดเดิม (API /api/tmc/stock, RPC tmc_purchase_stock) ยัง insert
-- movement_type 'in'/'out'/'adjust' โดยไม่ส่ง location — trigger normalize จะเติม from/to ให้เอง
-- จึงไม่ต้องแก้แอปพร้อมกันในเฟสนี้

begin;

-- ────────────────────────────────────────────────────────────────
-- 1. จุดเก็บของ
-- ────────────────────────────────────────────────────────────────
create table if not exists public.tmc_stock_locations (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.organizations(id) on delete cascade,
  code          text not null,
  name          text not null,
  kind          text not null default 'warehouse'
                  check (kind in ('warehouse','property','laundry','linen_room','soiled','kitchen','store')),
  property_id   uuid references public.tmc_properties(id) on delete set null,
  is_external   boolean not null default false,   -- ร้านซัก: ของอยู่นอกบ้าน แต่ยังเป็นของเรา
  is_default    boolean not null default false,   -- คลังตั้งต้นของ org (รับเข้า/เบิกออกเมื่อไม่ระบุ)
  is_active     boolean not null default true,
  sort_order    integer not null default 0,
  created_at    timestamptz not null default now(),
  unique (org_id, code)
);

create index if not exists tmc_stock_locations_org_idx on public.tmc_stock_locations(org_id, is_active);
create unique index if not exists tmc_stock_locations_one_default
  on public.tmc_stock_locations(org_id) where is_default;

-- ────────────────────────────────────────────────────────────────
-- 2. ยอดคงเหลือต่อ (สินค้า × จุดเก็บ) — derived, trigger เขียนเท่านั้น
-- ────────────────────────────────────────────────────────────────
create table if not exists public.tmc_stock_balances (
  org_id      uuid not null references public.organizations(id) on delete cascade,
  item_id     uuid not null references public.tmc_stock_items(id) on delete cascade,
  location_id uuid not null references public.tmc_stock_locations(id) on delete cascade,
  qty         numeric not null default 0,
  updated_at  timestamptz not null default now(),
  primary key (item_id, location_id)
);

create index if not exists tmc_stock_balances_org_idx      on public.tmc_stock_balances(org_id);
create index if not exists tmc_stock_balances_location_idx on public.tmc_stock_balances(location_id);

-- ────────────────────────────────────────────────────────────────
-- 3. คอลัมน์ใหม่บนตารางเดิม
-- ────────────────────────────────────────────────────────────────
alter table public.tmc_stock_items
  add column if not exists stock_class       text not null default 'consumable',
  add column if not exists item_group        text,
  add column if not exists sku               text,
  add column if not exists pack_size         numeric not null default 1,
  add column if not exists purchase_unit     text,
  add column if not exists reorder_point     numeric,
  add column if not exists avg_cost          numeric,
  add column if not exists consumes_on_issue boolean not null default true,
  add column if not exists track_expiry      boolean not null default false,
  add column if not exists is_chargeable     boolean not null default false,
  add column if not exists sale_price        numeric;

do $$ begin
  alter table public.tmc_stock_items
    add constraint tmc_stock_items_class_chk check (stock_class in ('consumable','reusable'));
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.tmc_stock_items
    add constraint tmc_stock_items_group_chk check (
      item_group is null or item_group in
        ('amenity','fnb','cleaning','maintenance','linen','bedding','equipment')
    );
exception when duplicate_object then null; end $$;

comment on column public.tmc_stock_items.current_qty is
  'cache ของยอดรวมทุกจุดเก็บ — เขียนโดย trigger เท่านั้น · เรื่องผ้าให้ดู tmc_stock_balances รายจุดเก็บ';

alter table public.tmc_stock_movements
  add column if not exists from_location_id uuid references public.tmc_stock_locations(id),
  add column if not exists to_location_id   uuid references public.tmc_stock_locations(id),
  add column if not exists reason           text,
  add column if not exists stay_id          uuid references public.tmc_stays(id) on delete set null,
  add column if not exists expiry_date      date,
  add column if not exists ref_movement_id  uuid references public.tmc_stock_movements(id);

-- ของเดิมล็อกไว้แค่ in/out/adjust — ต้องถอดก่อนเพิ่มชนิดใหม่
alter table public.tmc_stock_movements
  drop constraint if exists tmc_stock_movements_movement_type_check;

do $$ begin
  alter table public.tmc_stock_movements
    add constraint tmc_stock_movements_type_chk check (movement_type in (
      'in','out','adjust',                                  -- legacy (โค้ดเดิมยังใช้)
      'receive','issue','transfer','send_wash','return_wash',
      'consume','retire','lost','sale'
    ));
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.tmc_stock_movements
    add constraint tmc_stock_movements_qty_chk check (quantity > 0);
exception when duplicate_object then null; end $$;

create index if not exists tmc_stock_movements_from_idx on public.tmc_stock_movements(from_location_id);
create index if not exists tmc_stock_movements_to_idx   on public.tmc_stock_movements(to_location_id);
create index if not exists tmc_stock_movements_item_idx on public.tmc_stock_movements(org_id, item_id, created_at desc);
create index if not exists tmc_stock_movements_stay_idx on public.tmc_stock_movements(stay_id) where stay_id is not null;

-- ────────────────────────────────────────────────────────────────
-- 4. trigger A (BEFORE) — เติม from/to ให้ครบ + กันของ reusable หลุดออกนอกระบบเงียบ ๆ
-- ────────────────────────────────────────────────────────────────
create or replace function public.tmc_stock_normalize_movement()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_default_loc  uuid;
  v_prop_loc     uuid;
  v_class        text;
  v_consumes     boolean;
begin
  select id into v_default_loc
  from tmc_stock_locations
  where org_id = NEW.org_id and is_default
  limit 1;

  select stock_class, consumes_on_issue into v_class, v_consumes
  from tmc_stock_items where id = NEW.item_id;

  -- จุดเก็บของหลัง (ถ้าอ้าง property มา)
  if NEW.property_id is not null or nullif(NEW.property_code,'') is not null then
    select l.id into v_prop_loc
    from tmc_stock_locations l
    where l.org_id = NEW.org_id
      and l.kind = 'property'
      and (l.property_id = NEW.property_id or l.code = NEW.property_code)
    limit 1;
  end if;

  -- เติมช่องว่างตามชนิดรายการ (โค้ดเดิมส่งมาแค่ in/out/adjust ไม่มี location)
  if NEW.movement_type in ('in','receive') then
    NEW.to_location_id := coalesce(NEW.to_location_id, v_default_loc);

  elsif NEW.movement_type in ('out','issue','consume') then
    NEW.from_location_id := coalesce(NEW.from_location_id, v_default_loc);
    if NEW.to_location_id is null then
      -- consumable ที่ "เบิก = ใช้เลย" ไม่ต้องไปนับค้างในห้อง
      if v_class = 'consumable' and coalesce(v_consumes, true) then
        NEW.to_location_id := null;
        NEW.reason := coalesce(NEW.reason, 'consumed');
      else
        NEW.to_location_id := v_prop_loc;   -- reusable: ย้ายเข้าห้อง
      end if;
    end if;

  elsif NEW.movement_type = 'adjust' then
    -- ปรับยอดแบบระบุค่าสัมบูรณ์ ณ จุดเก็บนั้น (ใช้ตอนปิดใบตรวจนับใน P6 ด้วย)
    NEW.to_location_id := coalesce(NEW.to_location_id, v_prop_loc, v_default_loc);
    NEW.reason := coalesce(NEW.reason, 'correction');

  elsif NEW.movement_type in ('retire','lost') then
    NEW.from_location_id := coalesce(NEW.from_location_id, v_prop_loc, v_default_loc);
    NEW.to_location_id := null;
  end if;

  -- ของใช้ซ้ำหายจากระบบได้เฉพาะ retire/lost และต้องบอกเหตุผล (invariant 3)
  if v_class = 'reusable'
     and NEW.to_location_id is null
     and NEW.movement_type not in ('retire','lost') then
    raise exception 'ของใช้ซ้ำต้องระบุปลายทาง — ถ้าจะตัดออกจากระบบให้ใช้ retire หรือ lost'
      using errcode = '23514';
  end if;

  if NEW.movement_type in ('retire','lost') and nullif(NEW.reason,'') is null then
    raise exception 'ตัดของออกจากระบบต้องระบุเหตุผล (reason)' using errcode = '23514';
  end if;

  if NEW.from_location_id is null and NEW.to_location_id is null
     and NEW.movement_type <> 'adjust' then
    raise exception 'movement ต้องมีต้นทางหรือปลายทางอย่างน้อยหนึ่งฝั่ง' using errcode = '23514';
  end if;

  return NEW;
end;
$$;

-- ────────────────────────────────────────────────────────────────
-- 5. trigger B (AFTER) — เขียนยอดคงเหลือ (ที่เดียวในระบบที่แตะ balances/current_qty)
-- ────────────────────────────────────────────────────────────────
create or replace function public.tmc_stock_apply_movement()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if NEW.movement_type = 'adjust' then
    insert into tmc_stock_balances(org_id, item_id, location_id, qty, updated_at)
    values (NEW.org_id, NEW.item_id, NEW.to_location_id, NEW.quantity, now())
    on conflict (item_id, location_id)
      do update set qty = excluded.qty, updated_at = now();
  else
    if NEW.from_location_id is not null then
      insert into tmc_stock_balances(org_id, item_id, location_id, qty, updated_at)
      values (NEW.org_id, NEW.item_id, NEW.from_location_id, -NEW.quantity, now())
      on conflict (item_id, location_id)
        do update set qty = tmc_stock_balances.qty - NEW.quantity, updated_at = now();
    end if;
    if NEW.to_location_id is not null then
      insert into tmc_stock_balances(org_id, item_id, location_id, qty, updated_at)
      values (NEW.org_id, NEW.item_id, NEW.to_location_id, NEW.quantity, now())
      on conflict (item_id, location_id)
        do update set qty = tmc_stock_balances.qty + NEW.quantity, updated_at = now();
    end if;
  end if;

  -- cache ยอดรวมทุกจุดเก็บ (หน้าจอเดิมยังอ่านช่องนี้อยู่)
  update tmc_stock_items i
     set current_qty = coalesce(
       (select sum(b.qty) from tmc_stock_balances b where b.item_id = NEW.item_id), 0)
   where i.id = NEW.item_id;

  return NEW;
end;
$$;

-- ────────────────────────────────────────────────────────────────
-- 6. trigger C — movement แก้/ลบไม่ได้ (invariant 2)
-- ────────────────────────────────────────────────────────────────
create or replace function public.tmc_stock_movement_immutable()
returns trigger
language plpgsql
as $$
begin
  raise exception 'รายการเคลื่อนไหวสต๊อกแก้/ลบไม่ได้ — ให้บันทึกรายการกลับ (ref_movement_id) แทน'
    using errcode = '42501';
end;
$$;

drop trigger if exists tmc_stock_movement_qty       on public.tmc_stock_movements;
drop trigger if exists tmc_stock_movement_normalize on public.tmc_stock_movements;
drop trigger if exists tmc_stock_movement_apply     on public.tmc_stock_movements;
drop trigger if exists tmc_stock_movement_lock      on public.tmc_stock_movements;

create trigger tmc_stock_movement_normalize
  before insert on public.tmc_stock_movements
  for each row execute function public.tmc_stock_normalize_movement();

create trigger tmc_stock_movement_apply
  after insert on public.tmc_stock_movements
  for each row execute function public.tmc_stock_apply_movement();

create trigger tmc_stock_movement_lock
  before update or delete on public.tmc_stock_movements
  for each row execute function public.tmc_stock_movement_immutable();

drop function if exists public.tmc_update_stock_qty();

-- ────────────────────────────────────────────────────────────────
-- 7. RLS
-- ────────────────────────────────────────────────────────────────
alter table public.tmc_stock_locations enable row level security;
alter table public.tmc_stock_balances  enable row level security;

drop policy if exists tmc_stock_locations_select on public.tmc_stock_locations;
create policy tmc_stock_locations_select on public.tmc_stock_locations
  for select using (exists (
    select 1 from organization_members m
    where m.organization_id = tmc_stock_locations.org_id and m.user_id = auth.uid()));

drop policy if exists tmc_stock_locations_write on public.tmc_stock_locations;
create policy tmc_stock_locations_write on public.tmc_stock_locations
  for all using (exists (
    select 1 from organization_members m
    where m.organization_id = tmc_stock_locations.org_id and m.user_id = auth.uid()
      and m.role = any (array['owner','admin','management','team_lead'])));

-- balances: อ่านได้อย่างเดียว — ไม่มี policy เขียน (trigger เป็น SECURITY DEFINER)
drop policy if exists tmc_stock_balances_select on public.tmc_stock_balances;
create policy tmc_stock_balances_select on public.tmc_stock_balances
  for select using (exists (
    select 1 from organization_members m
    where m.organization_id = tmc_stock_balances.org_id and m.user_id = auth.uid()));

-- ────────────────────────────────────────────────────────────────
-- 8. seed จุดเก็บ — ทุก org ที่ใช้ tmc อยู่แล้ว (idempotent)
-- ────────────────────────────────────────────────────────────────
with orgs as (
  select distinct org_id from public.tmc_properties
  union
  select distinct org_id from public.tmc_stock_items
)
insert into public.tmc_stock_locations (org_id, code, name, kind, is_external, is_default, sort_order)
select o.org_id, v.code, v.name, v.kind, v.is_external, v.is_default, v.sort_order
from orgs o
cross join (values
  ('WH',      'คลังกลาง',        'warehouse',  false, true,  0),
  ('LINEN',   'ห้องผ้าสะอาด',    'linen_room', false, false, 10),
  ('SOILED',  'ผ้าเปื้อนรอส่ง',  'soiled',     false, false, 20),
  ('LAUNDRY', 'ร้านซัก',         'laundry',    true,  false, 30)
) as v(code, name, kind, is_external, is_default, sort_order)
on conflict (org_id, code) do nothing;

-- จุดเก็บของแต่ละหลัง
insert into public.tmc_stock_locations (org_id, code, name, kind, property_id, sort_order)
select p.org_id, p.code, coalesce(p.name, p.code), 'property', p.id, 100 + p.sort_order
from public.tmc_properties p
on conflict (org_id, code) do nothing;

commit;
