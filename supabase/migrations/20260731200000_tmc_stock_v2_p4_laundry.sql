-- TMC Stock v2 — P4: รอบซัก (หัวใจของ "ใช้ซ้ำ")
-- spec: specs/tmc-stock-v2.md §3.5, §6 (P4)
--
-- ผ้าที่ส่งซักยังเป็นทรัพย์สินเรา แค่ไปอยู่นอกบ้าน → ต้องจับคู่ "ส่งไป vs กลับมา" ได้
-- invariant: ปิดรอบได้เมื่อ ส่งไป = กลับมา + เสีย + ขาด (ส่วนต่างต้องถูกอธิบาย ไม่ใช่หายเงียบ)
-- การตัดสต๊อกยังเป็นหน้าที่ trigger เดิม (P1/P2) — RPC แค่แตกรอบเป็น movement ในทรานแซกชันเดียว

begin;

-- ────────────────────────────────────────────────────────────────
-- 1. ราคาค่าซักต่อผืน
-- ────────────────────────────────────────────────────────────────
create table if not exists public.tmc_laundry_prices (
  org_id          uuid not null references public.organizations(id) on delete cascade,
  item_id         uuid not null references public.tmc_stock_items(id) on delete cascade,
  price_per_piece numeric not null check (price_per_piece >= 0),
  updated_at      timestamptz not null default now(),
  primary key (org_id, item_id)
);

alter table public.tmc_laundry_prices enable row level security;

drop policy if exists tmc_laundry_prices_select on public.tmc_laundry_prices;
create policy tmc_laundry_prices_select on public.tmc_laundry_prices
  for select using (exists (
    select 1 from organization_members m
    where m.organization_id = tmc_laundry_prices.org_id and m.user_id = auth.uid()));

drop policy if exists tmc_laundry_prices_write on public.tmc_laundry_prices;
create policy tmc_laundry_prices_write on public.tmc_laundry_prices
  for all using (exists (
    select 1 from organization_members m
    where m.organization_id = tmc_laundry_prices.org_id and m.user_id = auth.uid()
      and m.role = any (array['owner','admin','management','team_lead'])));

-- ────────────────────────────────────────────────────────────────
-- 2. รอบซัก
-- ────────────────────────────────────────────────────────────────
create table if not exists public.tmc_laundry_batches (
  id                 uuid primary key default gen_random_uuid(),
  org_id             uuid not null references public.organizations(id) on delete cascade,
  vendor_location_id uuid not null references public.tmc_stock_locations(id),
  vendor_name        text,
  ref_no             text,
  source_location_id uuid references public.tmc_stock_locations(id),  -- เก็บผ้าเปื้อนมาจากไหน
  return_location_id uuid references public.tmc_stock_locations(id),  -- รับคืนเข้าที่ไหน
  sent_at            date not null default current_date,
  returned_at        date,
  status             text not null default 'sent' check (status in ('sent','closed')),
  total_sent         numeric not null default 0,
  total_returned     numeric not null default 0,
  total_damaged      numeric not null default 0,
  total_missing      numeric not null default 0,
  laundry_cost       numeric,
  finance_entry_id   uuid references public.tmc_finance_entries(id) on delete set null,
  note               text,
  created_by         uuid references public.profiles(id) on delete set null,
  created_at         timestamptz not null default now()
);

create index if not exists tmc_laundry_batches_org_idx
  on public.tmc_laundry_batches(org_id, status, sent_at desc);

create table if not exists public.tmc_laundry_batch_lines (
  id           uuid primary key default gen_random_uuid(),
  batch_id     uuid not null references public.tmc_laundry_batches(id) on delete cascade,
  item_id      uuid not null references public.tmc_stock_items(id) on delete restrict,
  qty_sent     numeric not null check (qty_sent > 0),
  qty_returned numeric not null default 0 check (qty_returned >= 0),
  qty_damaged  numeric not null default 0 check (qty_damaged >= 0),
  unit_price   numeric,
  unique (batch_id, item_id)
);

alter table public.tmc_laundry_batches      enable row level security;
alter table public.tmc_laundry_batch_lines  enable row level security;

drop policy if exists tmc_laundry_batches_select on public.tmc_laundry_batches;
create policy tmc_laundry_batches_select on public.tmc_laundry_batches
  for select using (exists (
    select 1 from organization_members m
    where m.organization_id = tmc_laundry_batches.org_id and m.user_id = auth.uid()));

drop policy if exists tmc_laundry_batch_lines_select on public.tmc_laundry_batch_lines;
create policy tmc_laundry_batch_lines_select on public.tmc_laundry_batch_lines
  for select using (exists (
    select 1 from public.tmc_laundry_batches b
    join organization_members m on m.organization_id = b.org_id
    where b.id = tmc_laundry_batch_lines.batch_id and m.user_id = auth.uid()));
-- เขียนผ่าน RPC เท่านั้น (service-role)

alter table public.tmc_stock_movements
  add column if not exists laundry_batch_id uuid references public.tmc_laundry_batches(id) on delete set null;

create index if not exists tmc_stock_movements_laundry_idx
  on public.tmc_stock_movements(laundry_batch_id) where laundry_batch_id is not null;

-- ────────────────────────────────────────────────────────────────
-- 3. ส่งซัก — ผ้าย้ายออกไปอยู่ที่ร้าน (ยังเป็นของเรา)
-- ────────────────────────────────────────────────────────────────
create or replace function public.tmc_laundry_send(
  p_org_id      uuid,
  p_vendor_id   uuid,
  p_source_id   uuid,
  p_sent_at     date,
  p_ref_no      text,
  p_lines       jsonb,     -- [{item_id, qty}]
  p_note        text,
  p_created_by  uuid
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_batch uuid;
  elem    jsonb;
  v_item  uuid;
  v_qty   numeric;
  v_from  uuid;
  v_total numeric := 0;
  v_count int := 0;
  v_vendor_name text;
begin
  if p_lines is null or jsonb_array_length(p_lines) = 0 then
    raise exception 'ต้องมีรายการผ้าอย่างน้อยหนึ่งบรรทัด' using errcode = '23514';
  end if;

  select name into v_vendor_name from tmc_stock_locations
   where id = p_vendor_id and org_id = p_org_id and kind = 'laundry';
  if v_vendor_name is null then
    raise exception 'จุดเก็บปลายทางต้องเป็นร้านซัก' using errcode = '23514';
  end if;

  insert into tmc_laundry_batches(
    org_id, vendor_location_id, vendor_name, ref_no,
    source_location_id, sent_at, note, created_by
  ) values (
    p_org_id, p_vendor_id, v_vendor_name, nullif(p_ref_no,''),
    p_source_id, coalesce(p_sent_at, current_date), nullif(p_note,''), p_created_by
  ) returning id into v_batch;

  for elem in select * from jsonb_array_elements(p_lines)
  loop
    v_item := (elem->>'item_id')::uuid;
    v_qty  := (elem->>'qty')::numeric;
    if v_qty is null or v_qty <= 0 then continue; end if;

    -- ผ้าเปื้อนอยู่ที่ไหน: บรรทัดระบุเอง > ต้นทางของรอบ > บ้านของของชิ้นนั้น
    v_from := coalesce((elem->>'from_location_id')::uuid, p_source_id,
                       (select default_location_id from tmc_stock_items
                         where id = v_item and org_id = p_org_id));

    insert into tmc_laundry_batch_lines(batch_id, item_id, qty_sent, unit_price)
    values (v_batch, v_item, v_qty,
            (select price_per_piece from tmc_laundry_prices
              where org_id = p_org_id and item_id = v_item))
    on conflict (batch_id, item_id)
      do update set qty_sent = tmc_laundry_batch_lines.qty_sent + excluded.qty_sent;

    insert into tmc_stock_movements(
      org_id, item_id, movement_type, quantity,
      from_location_id, to_location_id, laundry_batch_id, note, created_by
    ) values (
      p_org_id, v_item, 'send_wash', v_qty,
      v_from, p_vendor_id, v_batch, nullif(p_note,''), p_created_by
    );

    v_total := v_total + v_qty;
    v_count := v_count + 1;
  end loop;

  update tmc_laundry_batches set total_sent = v_total where id = v_batch;
  return jsonb_build_object('batch_id', v_batch, 'line_count', v_count, 'total_sent', v_total);
end;
$$;

-- ────────────────────────────────────────────────────────────────
-- 4. รับคืน + ปิดรอบ — ส่วนต่างต้องถูกอธิบายเสมอ
-- ────────────────────────────────────────────────────────────────
create or replace function public.tmc_laundry_close(
  p_org_id      uuid,
  p_batch_id    uuid,
  p_return_id   uuid,      -- รับคืนเข้าที่ไหน (ปกติ ห้องผ้าสะอาด)
  p_returned_at date,
  p_lines       jsonb,     -- [{line_id, returned, damaged}]
  p_cost        numeric,   -- null = คิดจากราคาต่อผืน × จำนวนที่กลับมา
  p_account_id  uuid,      -- null = ไม่บันทึกค่าใช้จ่าย
  p_note        text,
  p_created_by  uuid
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  b            public.tmc_laundry_batches%rowtype;
  elem         jsonb;
  l            public.tmc_laundry_batch_lines%rowtype;
  v_ret        numeric;
  v_dmg        numeric;
  v_missing    numeric;
  v_return_loc uuid;
  v_sum_ret    numeric := 0;
  v_sum_dmg    numeric := 0;
  v_sum_miss   numeric := 0;
  v_cost       numeric := 0;
  v_fin        uuid;
begin
  select * into b from tmc_laundry_batches where id = p_batch_id and org_id = p_org_id;
  if not found then
    raise exception 'ไม่พบรอบซักที่ระบุ' using errcode = '23503';
  end if;
  if b.status = 'closed' then
    raise exception 'รอบซักนี้ปิดไปแล้ว' using errcode = '23514';
  end if;

  v_return_loc := coalesce(p_return_id, b.return_location_id,
                           (select id from tmc_stock_locations
                             where org_id = p_org_id and kind = 'linen_room' limit 1));
  if v_return_loc is null then
    raise exception 'ต้องระบุจุดเก็บที่รับผ้าคืน' using errcode = '23514';
  end if;

  for elem in select * from jsonb_array_elements(coalesce(p_lines, '[]'::jsonb))
  loop
    select * into l from tmc_laundry_batch_lines
     where id = (elem->>'line_id')::uuid and batch_id = p_batch_id;
    if not found then continue; end if;

    v_ret := greatest(coalesce((elem->>'returned')::numeric, 0), 0);
    v_dmg := greatest(coalesce((elem->>'damaged')::numeric, 0), 0);

    if v_ret + v_dmg > l.qty_sent then
      raise exception 'รับคืน + เสีย มากกว่าที่ส่งไป (ส่ง % · คืน % · เสีย %)',
        l.qty_sent, v_ret, v_dmg using errcode = '23514';
    end if;
    v_missing := l.qty_sent - v_ret - v_dmg;

    update tmc_laundry_batch_lines
       set qty_returned = v_ret, qty_damaged = v_dmg
     where id = l.id;

    -- กลับมา: ร้านซัก → ห้องผ้าสะอาด
    if v_ret > 0 then
      insert into tmc_stock_movements(
        org_id, item_id, movement_type, quantity,
        from_location_id, to_location_id, laundry_batch_id, note, created_by
      ) values (
        p_org_id, l.item_id, 'return_wash', v_ret,
        b.vendor_location_id, v_return_loc, p_batch_id, nullif(p_note,''), p_created_by
      );
    end if;

    -- เสีย / ขาด: ตัดออกจากระบบพร้อมเหตุผล (invariant §3)
    if v_dmg > 0 then
      insert into tmc_stock_movements(
        org_id, item_id, movement_type, quantity,
        from_location_id, reason, laundry_batch_id, note, created_by
      ) values (
        p_org_id, l.item_id, 'retire', v_dmg,
        b.vendor_location_id, 'damaged', p_batch_id, 'ผ้าเสียจากรอบซัก', p_created_by
      );
    end if;
    if v_missing > 0 then
      insert into tmc_stock_movements(
        org_id, item_id, movement_type, quantity,
        from_location_id, reason, laundry_batch_id, note, created_by
      ) values (
        p_org_id, l.item_id, 'lost', v_missing,
        b.vendor_location_id, 'lost', p_batch_id, 'ผ้าขาดจากรอบซัก', p_created_by
      );
    end if;

    v_sum_ret  := v_sum_ret  + v_ret;
    v_sum_dmg  := v_sum_dmg  + v_dmg;
    v_sum_miss := v_sum_miss + v_missing;
    v_cost     := v_cost + v_ret * coalesce(l.unit_price, 0);
  end loop;

  v_cost := coalesce(p_cost, v_cost);

  -- ค่าซัก → ค่าใช้จ่ายของ org (ผูกใบกับรายการเงินไว้ตรวจย้อน)
  if p_account_id is not null and v_cost > 0 then
    insert into tmc_finance_entries(
      org_id, account_id, entry_date, description, category, expense, note, created_by
    ) values (
      p_org_id, p_account_id, coalesce(p_returned_at, current_date),
      'ค่าซักผ้า ' || coalesce(b.vendor_name, '') || ' — คืน ' || v_sum_ret || ' ผืน',
      'ซักผ้า', v_cost, nullif(p_note,''), p_created_by
    ) returning id into v_fin;
  end if;

  update tmc_laundry_batches
     set status = 'closed',
         returned_at = coalesce(p_returned_at, current_date),
         return_location_id = v_return_loc,
         total_returned = v_sum_ret,
         total_damaged  = v_sum_dmg,
         total_missing  = v_sum_miss,
         laundry_cost   = v_cost,
         finance_entry_id = v_fin
   where id = p_batch_id;

  return jsonb_build_object(
    'batch_id', p_batch_id, 'returned', v_sum_ret,
    'damaged', v_sum_dmg, 'missing', v_sum_miss, 'cost', v_cost);
end;
$$;

revoke all on function public.tmc_laundry_send(uuid, uuid, uuid, date, text, jsonb, text, uuid)
  from public, anon, authenticated;
revoke all on function public.tmc_laundry_close(uuid, uuid, uuid, date, jsonb, numeric, uuid, text, uuid)
  from public, anon, authenticated;

-- ────────────────────────────────────────────────────────────────
-- 5. ราคาตั้งต้นจากไฟล์ Excel (แถว "รับคืนผ้าซัก") — แก้ได้ในหน้าตั้งค่า
-- ────────────────────────────────────────────────────────────────
with org as (select id from public.organizations where slug = 'tmc'),
p(name, price) as (values
  ('ผ้าปูที่นอน 6 ฟุต (สูง 14")', 18),
  ('ปลอกผ้านวม King',            35),
  ('ปลอกผ้านวม Single',          30),
  ('ปลอกหมอนหนุน',                5),
  ('ผ้าเช็ดตัว 30*60"',          10),
  ('ผ้าเช็ดตัวสระ',              17),
  ('ผ้าเช็ดผม 15*30"',            5),
  ('ผ้าเช็ดมือ',                  5),
  ('ผ้าเช็ดเท้า Welcome',        10),
  ('ผ้าเย็น',                     5),
  ('ผ้าคลุมโต๊ะ',                50),
  ('ผ้านวม 6 ฟุต',               70)
)
insert into public.tmc_laundry_prices(org_id, item_id, price_per_piece)
select org.id, i.id, p.price
from p join org on true
join public.tmc_stock_items i on i.org_id = org.id and i.name = p.name
on conflict (org_id, item_id) do nothing;

commit;
