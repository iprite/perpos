-- TMC Stock — รอบซัก: รับผ้าคืนแบ่งหลายครั้ง (lot) + ยกเลิกปิดรอบ
--
-- ที่มา: ร้านซักทยอยส่งผ้าคืน (ส่งไป 33 → คืน 10 ก่อน ที่เหลือตามมาทีหลัง)
--   แต่ระบบเดิมมีทางเดียวคือ "ปิดรอบ" ซึ่งถือว่าส่วนที่ยังไม่คืน = ขาด แล้วยิง movement 'lost'
--   ตัดผ้าออกจากทรัพย์สินทันที · ปิดแล้วแก้ไม่ได้ทั้ง UI และ RPC → ผ้าที่ยังอยู่ที่ร้านหายจากระบบ
--
-- invariant ที่ยังคงอยู่:
--   * ส่งไป = คืน + เสีย + ขาด (ตอน "ปิดรอบ" เท่านั้น — ระหว่างทางส่วนต่างคือ "ยังอยู่ที่ร้าน")
--   * รับคืนสะสมข้าม lot ต้องไม่เกินที่ส่งไป
--   * movement แก้/ลบไม่ได้ → ยกเลิกปิดรอบ = บันทึกรายการกลับ (ref_movement_id) ไม่ใช่ลบของเดิม

begin;

-- ────────────────────────────────────────────────────────────────
-- 1. lot การรับคืน — 1 รอบซักมีได้หลายใบ
-- ────────────────────────────────────────────────────────────────
create table if not exists public.tmc_laundry_receipts (
  id                 uuid primary key default gen_random_uuid(),
  org_id             uuid not null references public.organizations(id) on delete cascade,
  batch_id           uuid not null references public.tmc_laundry_batches(id) on delete cascade,
  seq                int  not null,                      -- ครั้งที่ 1, 2, 3 … ของรอบนั้น
  received_at        date not null default current_date,
  return_location_id uuid references public.tmc_stock_locations(id),
  qty_returned       numeric not null default 0,
  qty_damaged        numeric not null default 0,
  cost               numeric,
  finance_entry_id   uuid references public.tmc_finance_entries(id) on delete set null,
  note               text,
  created_by         uuid references public.profiles(id) on delete set null,
  created_at         timestamptz not null default now(),
  unique (batch_id, seq)
);

create table if not exists public.tmc_laundry_receipt_lines (
  id           uuid primary key default gen_random_uuid(),
  receipt_id   uuid not null references public.tmc_laundry_receipts(id) on delete cascade,
  batch_line_id uuid not null references public.tmc_laundry_batch_lines(id) on delete cascade,
  item_id      uuid not null references public.tmc_stock_items(id) on delete restrict,
  qty_returned numeric not null default 0 check (qty_returned >= 0),
  qty_damaged  numeric not null default 0 check (qty_damaged >= 0)
);

create index if not exists tmc_laundry_receipts_batch_idx
  on public.tmc_laundry_receipts(batch_id, seq);
create index if not exists tmc_laundry_receipt_lines_receipt_idx
  on public.tmc_laundry_receipt_lines(receipt_id);

alter table public.tmc_laundry_receipts      enable row level security;
alter table public.tmc_laundry_receipt_lines enable row level security;

drop policy if exists tmc_laundry_receipts_select on public.tmc_laundry_receipts;
create policy tmc_laundry_receipts_select on public.tmc_laundry_receipts
  for select using (exists (
    select 1 from organization_members m
    where m.organization_id = tmc_laundry_receipts.org_id and m.user_id = auth.uid()));

drop policy if exists tmc_laundry_receipt_lines_select on public.tmc_laundry_receipt_lines;
create policy tmc_laundry_receipt_lines_select on public.tmc_laundry_receipt_lines
  for select using (exists (
    select 1 from public.tmc_laundry_receipts r
    join organization_members m on m.organization_id = r.org_id
    where r.id = tmc_laundry_receipt_lines.receipt_id and m.user_id = auth.uid()));
-- เขียนผ่าน RPC เท่านั้น (service-role)

-- สถานะใหม่: partial = รับคืนมาบ้างแล้ว แต่ยังมีผ้าค้างอยู่ที่ร้าน
alter table public.tmc_laundry_batches
  drop constraint if exists tmc_laundry_batches_status_check;
do $$ begin
  alter table public.tmc_laundry_batches
    add constraint tmc_laundry_batches_status_chk
    check (status in ('sent','partial','closed'));
exception when duplicate_object then null; end $$;

-- ────────────────────────────────────────────────────────────────
-- 2. รับคืน (บางส่วนหรือทั้งหมด) — p_close = true คือปิดรอบไปเลย
-- ────────────────────────────────────────────────────────────────
create or replace function public.tmc_laundry_receive(
  p_org_id      uuid,
  p_batch_id    uuid,
  p_return_id   uuid,      -- รับคืนเข้าที่ไหน (ปกติ ห้องผ้าสะอาด)
  p_received_at date,
  p_lines       jsonb,     -- [{line_id, returned, damaged}] = จำนวน "ครั้งนี้" ไม่ใช่ยอดสะสม
  p_cost        numeric,   -- ค่าซักของ lot นี้ · null = คิดจากราคาต่อผืน × ที่คืนครั้งนี้
  p_account_id  uuid,      -- null = ไม่บันทึกค่าใช้จ่าย
  p_note        text,
  p_created_by  uuid,
  p_close       boolean default false   -- true = ส่วนที่ยังไม่คืน ถือว่าขาด แล้วปิดรอบ
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
  v_remaining  numeric;
  v_return_loc uuid;
  v_receipt    uuid;
  v_seq        int;
  v_lot_ret    numeric := 0;
  v_lot_dmg    numeric := 0;
  v_lot_cost   numeric := 0;
  v_fin        uuid;
  v_miss       numeric := 0;
  v_sum_ret    numeric;
  v_sum_dmg    numeric;
  v_sum_sent   numeric;
begin
  select * into b from tmc_laundry_batches where id = p_batch_id and org_id = p_org_id
  for update;
  if not found then
    raise exception 'ไม่พบรอบซักที่ระบุ' using errcode = '23503';
  end if;
  if b.status = 'closed' then
    raise exception 'รอบซักนี้ปิดไปแล้ว — ถ้าจะแก้ ให้ยกเลิกปิดรอบก่อน' using errcode = '23514';
  end if;

  v_return_loc := coalesce(p_return_id, b.return_location_id,
                           (select id from tmc_stock_locations
                             where org_id = p_org_id and kind = 'linen_room' limit 1));
  if v_return_loc is null then
    raise exception 'ต้องระบุจุดเก็บที่รับผ้าคืน' using errcode = '23514';
  end if;

  select coalesce(max(seq), 0) + 1 into v_seq
  from tmc_laundry_receipts where batch_id = p_batch_id;

  insert into tmc_laundry_receipts(
    org_id, batch_id, seq, received_at, return_location_id, note, created_by
  ) values (
    p_org_id, p_batch_id, v_seq, coalesce(p_received_at, current_date),
    v_return_loc, nullif(p_note,''), p_created_by
  ) returning id into v_receipt;

  for elem in select * from jsonb_array_elements(coalesce(p_lines, '[]'::jsonb))
  loop
    select * into l from tmc_laundry_batch_lines
     where id = (elem->>'line_id')::uuid and batch_id = p_batch_id
     for update;
    if not found then continue; end if;

    v_ret := greatest(coalesce((elem->>'returned')::numeric, 0), 0);
    v_dmg := greatest(coalesce((elem->>'damaged')::numeric, 0), 0);
    if v_ret = 0 and v_dmg = 0 then continue; end if;

    v_remaining := l.qty_sent - l.qty_returned - l.qty_damaged;
    if v_ret + v_dmg > v_remaining then
      raise exception 'รับคืน + เสีย มากกว่าที่ยังค้างอยู่ที่ร้าน (ค้าง % · คืน % · เสีย %)',
        v_remaining, v_ret, v_dmg using errcode = '23514';
    end if;

    update tmc_laundry_batch_lines
       set qty_returned = qty_returned + v_ret,
           qty_damaged  = qty_damaged  + v_dmg
     where id = l.id;

    insert into tmc_laundry_receipt_lines(
      receipt_id, batch_line_id, item_id, qty_returned, qty_damaged
    ) values (v_receipt, l.id, l.item_id, v_ret, v_dmg);

    -- กลับมา: ร้านซัก → ห้องผ้าสะอาด
    if v_ret > 0 then
      insert into tmc_stock_movements(
        org_id, item_id, movement_type, quantity,
        from_location_id, to_location_id, laundry_batch_id, note, created_by
      ) values (
        p_org_id, l.item_id, 'return_wash', v_ret,
        b.vendor_location_id, v_return_loc,
        p_batch_id, nullif(p_note,''), p_created_by
      );
    end if;

    -- เสีย: ตัดออกจากระบบพร้อมเหตุผล
    if v_dmg > 0 then
      insert into tmc_stock_movements(
        org_id, item_id, movement_type, quantity,
        from_location_id, reason, laundry_batch_id, note, created_by
      ) values (
        p_org_id, l.item_id, 'retire', v_dmg,
        b.vendor_location_id, 'damaged', p_batch_id,
        'ผ้าเสียจากรอบซัก (รับคืนครั้งที่ ' || v_seq || ')', p_created_by
      );
    end if;

    v_lot_ret  := v_lot_ret  + v_ret;
    v_lot_dmg  := v_lot_dmg  + v_dmg;
    v_lot_cost := v_lot_cost + v_ret * coalesce(l.unit_price, 0);
  end loop;

  v_lot_cost := coalesce(p_cost, v_lot_cost);

  -- ค่าซักของ lot นี้ → ค่าใช้จ่ายของ org
  if p_account_id is not null and v_lot_cost > 0 then
    insert into tmc_finance_entries(
      org_id, account_id, entry_date, description, category, expense, note, created_by
    ) values (
      p_org_id, p_account_id, coalesce(p_received_at, current_date),
      'ค่าซักผ้า ' || coalesce(b.vendor_name, '') || ' — คืน ' || v_lot_ret || ' ผืน',
      'ซักผ้า', v_lot_cost, nullif(p_note,''), p_created_by
    ) returning id into v_fin;
  end if;

  update tmc_laundry_receipts
     set qty_returned = v_lot_ret, qty_damaged = v_lot_dmg,
         cost = v_lot_cost, finance_entry_id = v_fin
   where id = v_receipt;

  -- ปิดรอบ: ส่วนที่ยังไม่กลับมา = ขาด (ตัดออกจากทรัพย์สินพร้อมเหตุผล)
  if p_close then
    for l in select * from tmc_laundry_batch_lines where batch_id = p_batch_id
    loop
      v_remaining := l.qty_sent - l.qty_returned - l.qty_damaged;
      if v_remaining > 0 then
        insert into tmc_stock_movements(
          org_id, item_id, movement_type, quantity,
          from_location_id, reason, laundry_batch_id, note, created_by
        ) values (
          p_org_id, l.item_id, 'lost', v_remaining,
          b.vendor_location_id, 'lost', p_batch_id, 'ผ้าขาดจากรอบซัก', p_created_by
        );
        v_miss := v_miss + v_remaining;
      end if;
    end loop;
  end if;

  select coalesce(sum(qty_sent),0), coalesce(sum(qty_returned),0), coalesce(sum(qty_damaged),0)
    into v_sum_sent, v_sum_ret, v_sum_dmg
  from tmc_laundry_batch_lines where batch_id = p_batch_id;

  update tmc_laundry_batches
     set status = case when p_close then 'closed'
                       when v_sum_ret + v_sum_dmg > 0 then 'partial'
                       else 'sent' end,
         returned_at = coalesce(p_received_at, current_date),
         return_location_id = v_return_loc,
         total_returned = v_sum_ret,
         total_damaged  = v_sum_dmg,
         total_missing  = case when p_close then v_miss else 0 end,
         laundry_cost   = (select sum(cost) from tmc_laundry_receipts where batch_id = p_batch_id),
         finance_entry_id = coalesce(v_fin, finance_entry_id)
   where id = p_batch_id;

  return jsonb_build_object(
    'batch_id', p_batch_id, 'receipt_id', v_receipt, 'seq', v_seq,
    'returned', v_lot_ret, 'damaged', v_lot_dmg,
    'missing', v_miss, 'cost', v_lot_cost,
    'remaining', v_sum_sent - v_sum_ret - v_sum_dmg - v_miss,
    'closed', p_close);
end;
$$;

-- ────────────────────────────────────────────────────────────────
-- 3. ปิดรอบ (ของเดิม) — ตอนนี้เป็นทางลัดของ receive(p_close = true)
--    p_lines ยังหมายถึง "ที่รับคืนครั้งนี้" เหมือนกัน
-- ────────────────────────────────────────────────────────────────
create or replace function public.tmc_laundry_close(
  p_org_id      uuid,
  p_batch_id    uuid,
  p_return_id   uuid,
  p_returned_at date,
  p_lines       jsonb,
  p_cost        numeric,
  p_account_id  uuid,
  p_note        text,
  p_created_by  uuid
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  return public.tmc_laundry_receive(
    p_org_id, p_batch_id, p_return_id, p_returned_at,
    p_lines, p_cost, p_account_id, p_note, p_created_by, true);
end;
$$;

-- ────────────────────────────────────────────────────────────────
-- 4. ยกเลิกปิดรอบ — ผ้าที่ถูกตัดเป็น "ขาด" กลับไปอยู่ที่ร้านตามเดิม
--    movement แก้/ลบไม่ได้ → บันทึกรายการกลับที่อ้าง ref_movement_id
--    (ผ้าที่บันทึกว่า "เสีย" ถือเป็นข้อเท็จจริงที่ตรวจแล้ว จึงไม่ถูกดึงกลับ)
-- ────────────────────────────────────────────────────────────────
create or replace function public.tmc_laundry_reopen(
  p_org_id     uuid,
  p_batch_id   uuid,
  p_created_by uuid
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  b         public.tmc_laundry_batches%rowtype;
  mv        public.tmc_stock_movements%rowtype;
  v_back    numeric := 0;
  v_sum_ret numeric;
  v_sum_dmg numeric;
begin
  select * into b from tmc_laundry_batches where id = p_batch_id and org_id = p_org_id
  for update;
  if not found then
    raise exception 'ไม่พบรอบซักที่ระบุ' using errcode = '23503';
  end if;
  if b.status <> 'closed' then
    raise exception 'รอบซักนี้ยังไม่ได้ปิด' using errcode = '23514';
  end if;

  -- ดึงผ้าที่ถูกตัดเป็น "ขาด" กลับเข้าไปอยู่ที่ร้านซัก
  for mv in
    select * from tmc_stock_movements
     where laundry_batch_id = p_batch_id
       and movement_type = 'lost'
       and not exists (
         select 1 from tmc_stock_movements r
          where r.ref_movement_id = tmc_stock_movements.id)
  loop
    insert into tmc_stock_movements(
      org_id, item_id, movement_type, quantity,
      to_location_id, laundry_batch_id, ref_movement_id, note, created_by
    ) values (
      p_org_id, mv.item_id, 'in', mv.quantity,
      b.vendor_location_id, p_batch_id, mv.id,
      'ยกเลิกปิดรอบซัก — ผ้ากลับไปอยู่ที่ร้าน', p_created_by
    );
    v_back := v_back + mv.quantity;
  end loop;

  select coalesce(sum(qty_returned),0), coalesce(sum(qty_damaged),0)
    into v_sum_ret, v_sum_dmg
  from tmc_laundry_batch_lines where batch_id = p_batch_id;

  update tmc_laundry_batches
     set status = case when v_sum_ret + v_sum_dmg > 0 then 'partial' else 'sent' end,
         total_missing = 0,
         returned_at = null
   where id = p_batch_id;

  return jsonb_build_object('batch_id', p_batch_id, 'restored', v_back);
end;
$$;

revoke all on function public.tmc_laundry_receive(uuid, uuid, uuid, date, jsonb, numeric, uuid, text, uuid, boolean)
  from public, anon, authenticated;
revoke all on function public.tmc_laundry_reopen(uuid, uuid, uuid)
  from public, anon, authenticated;
revoke all on function public.tmc_laundry_close(uuid, uuid, uuid, date, jsonb, numeric, uuid, text, uuid)
  from public, anon, authenticated;

commit;
