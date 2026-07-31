-- TMC Stock v2 — P3: ใบเบิก + RPC เบิกทั้งชุด (preset) แบบ atomic
-- spec: specs/tmc-stock-v2.md §4.5, §6 (P3)
--
-- เบิก 1 ครั้ง = หลายบรรทัด → ต้องเป็น "ใบ" ที่ตรวจย้อน/ยกเลิกเป็นชุดได้
-- กติกาการตัดสต๊อกทั้งหมดยังอยู่ที่ trigger ของ P1/P2 (จาก→ไป, ผ้าห้ามหลุด, ห้ามติดลบ)
-- RPC นี้แค่ "แตกชุดเป็นหลาย movement ในทรานแซกชันเดียว" + เก็บ snapshot ของชุด ณ เวลานั้น

begin;

-- ────────────────────────────────────────────────────────────────
-- 1. ใบเบิก
-- ────────────────────────────────────────────────────────────────
create table if not exists public.tmc_stock_issues (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references public.organizations(id) on delete cascade,
  preset_id       uuid references public.tmc_stock_presets(id) on delete set null,
  preset_snapshot jsonb,                       -- ชุด ณ เวลาที่เบิก (แก้ชุดทีหลังไม่กระทบประวัติ)
  property_code   text,
  room_name       text,
  to_location_id  uuid references public.tmc_stock_locations(id),
  stay_id         uuid references public.tmc_stays(id) on delete set null,
  guests          integer,
  nights          integer,
  status          text not null default 'posted' check (status in ('posted','voided')),
  note            text,
  line_count      integer not null default 0,
  total_qty       numeric not null default 0,
  voided_at       timestamptz,
  voided_by       uuid references public.profiles(id) on delete set null,
  created_by      uuid references public.profiles(id) on delete set null,
  created_at      timestamptz not null default now()
);

create index if not exists tmc_stock_issues_org_idx on public.tmc_stock_issues(org_id, created_at desc);
create index if not exists tmc_stock_issues_stay_idx on public.tmc_stock_issues(stay_id) where stay_id is not null;

alter table public.tmc_stock_movements
  add column if not exists issue_id uuid references public.tmc_stock_issues(id) on delete set null;

create index if not exists tmc_stock_movements_issue_idx
  on public.tmc_stock_movements(issue_id) where issue_id is not null;

alter table public.tmc_stock_issues enable row level security;

drop policy if exists tmc_stock_issues_select on public.tmc_stock_issues;
create policy tmc_stock_issues_select on public.tmc_stock_issues
  for select using (exists (
    select 1 from organization_members m
    where m.organization_id = tmc_stock_issues.org_id and m.user_id = auth.uid()));
-- เขียนผ่าน RPC เท่านั้น (service-role) — ไม่มี policy insert/update/delete

-- ────────────────────────────────────────────────────────────────
-- 2. RPC เบิกทั้งชุด — atomic ทั้งใบ (ครึ่งใบไม่ได้)
--    p_lines = บรรทัดสุดท้ายหลังผู้ใช้แก้แล้ว [{item_id, qty}]
--    ถ้าไม่ส่งมา = ใช้บรรทัดของ preset คูณตัวคูณให้เอง
-- ────────────────────────────────────────────────────────────────
create or replace function public.tmc_stock_issue_preset(
  p_org_id        uuid,
  p_preset_id     uuid,
  p_property_code text,
  p_to_location_id uuid,
  p_stay_id       uuid,
  p_guests        integer,
  p_nights        integer,
  p_lines         jsonb,
  p_note          text,
  p_created_by    uuid
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_preset    public.tmc_stock_presets%rowtype;
  v_issue_id  uuid;
  v_snapshot  jsonb;
  v_lines     jsonb;
  elem        jsonb;
  v_item      uuid;
  v_qty       numeric;
  v_count     int := 0;
  v_total     numeric := 0;
begin
  if p_preset_id is not null then
    select * into v_preset from tmc_stock_presets
     where id = p_preset_id and org_id = p_org_id;
    if not found then
      raise exception 'ไม่พบชุดเบิกของที่ระบุ' using errcode = '23503';
    end if;
  end if;

  -- snapshot ของชุด ณ เวลาที่เบิก
  select jsonb_build_object(
           'preset', to_jsonb(v_preset),
           'lines', coalesce(jsonb_agg(to_jsonb(l) order by l.sort_order), '[]'::jsonb))
    into v_snapshot
  from tmc_stock_preset_lines l where l.preset_id = p_preset_id;

  -- ถ้าไม่ส่งบรรทัดมา = คิดจาก preset + ตัวคูณ (ข้ามบรรทัด optional)
  if p_lines is null or jsonb_array_length(p_lines) = 0 then
    select coalesce(jsonb_agg(jsonb_build_object(
             'item_id', l.item_id,
             'qty', l.qty * case l.qty_basis
                              when 'per_guest' then greatest(coalesce(p_guests, 1), 1)
                              when 'per_night' then greatest(coalesce(p_nights, 1), 1)
                              else 1 end)), '[]'::jsonb)
      into v_lines
    from tmc_stock_preset_lines l
    where l.preset_id = p_preset_id and not l.is_optional;
  else
    v_lines := p_lines;
  end if;

  if jsonb_array_length(v_lines) = 0 then
    raise exception 'ไม่มีรายการให้เบิก' using errcode = '23514';
  end if;

  insert into tmc_stock_issues(
    org_id, preset_id, preset_snapshot, property_code, room_name,
    to_location_id, stay_id, guests, nights, note, created_by
  ) values (
    p_org_id, p_preset_id, v_snapshot,
    coalesce(nullif(p_property_code,''), v_preset.property_code), v_preset.room_name,
    p_to_location_id, p_stay_id, p_guests, p_nights, nullif(p_note,''), p_created_by
  ) returning id into v_issue_id;

  for elem in select * from jsonb_array_elements(v_lines)
  loop
    v_item := (elem->>'item_id')::uuid;
    v_qty  := (elem->>'qty')::numeric;
    if v_qty is null or v_qty <= 0 then
      continue;   -- บรรทัดที่ผู้ใช้ปรับเป็น 0 = ไม่เบิก
    end if;

    -- ปลายทาง/ต้นทางที่เหลือให้ trigger ของ P1 เติมตามชนิดของ
    -- (ของใช้แล้วหมดไป → ตัดจบ · ของใช้ซ้ำ → ย้ายเข้าห้องตาม property_code)
    insert into tmc_stock_movements(
      org_id, item_id, movement_type, quantity,
      from_location_id, to_location_id, property_code,
      stay_id, issue_id, note, created_by
    ) values (
      p_org_id, v_item, 'issue', v_qty,
      v_preset.source_location_id, p_to_location_id,
      coalesce(nullif(p_property_code,''), v_preset.property_code),
      p_stay_id, v_issue_id, nullif(p_note,''), p_created_by
    );

    v_count := v_count + 1;
    v_total := v_total + v_qty;
  end loop;

  update tmc_stock_issues
     set line_count = v_count, total_qty = v_total
   where id = v_issue_id;

  return jsonb_build_object('issue_id', v_issue_id, 'line_count', v_count, 'total_qty', v_total);
end;
$$;

-- ────────────────────────────────────────────────────────────────
-- 3. RPC ยกเลิกใบเบิก — ออกรายการกลับทั้งชุด (ห้ามลบ movement)
-- ────────────────────────────────────────────────────────────────
create or replace function public.tmc_stock_void_issue(
  p_org_id     uuid,
  p_issue_id   uuid,
  p_reason     text,
  p_created_by uuid
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  m       record;
  v_status text;
  v_count int := 0;
begin
  select status into v_status from tmc_stock_issues
   where id = p_issue_id and org_id = p_org_id;
  if not found then
    raise exception 'ไม่พบใบเบิกที่ระบุ' using errcode = '23503';
  end if;
  if v_status = 'voided' then
    raise exception 'ใบเบิกนี้ถูกยกเลิกไปแล้ว' using errcode = '23514';
  end if;

  for m in
    select * from tmc_stock_movements
     where issue_id = p_issue_id and org_id = p_org_id
       and ref_movement_id is null
  loop
    -- สลับต้นทาง/ปลายทาง: ของที่ถูกใช้ไป (to = null) กลับเข้าที่เดิม
    insert into tmc_stock_movements(
      org_id, item_id, movement_type, quantity,
      from_location_id, to_location_id, reason, stay_id, issue_id,
      ref_movement_id, note, created_by
    ) values (
      m.org_id, m.item_id,
      case when m.to_location_id is null then 'receive' else 'transfer' end,
      m.quantity,
      m.to_location_id, m.from_location_id, 'correction', m.stay_id, p_issue_id,
      m.id, coalesce(nullif(p_reason,''), 'ยกเลิกใบเบิก'), p_created_by
    );
    v_count := v_count + 1;
  end loop;

  update tmc_stock_issues
     set status = 'voided', voided_at = now(), voided_by = p_created_by
   where id = p_issue_id;

  return jsonb_build_object('issue_id', p_issue_id, 'reversed', v_count);
end;
$$;

revoke all on function public.tmc_stock_issue_preset(uuid, uuid, text, uuid, uuid, integer, integer, jsonb, text, uuid)
  from public, anon, authenticated;
revoke all on function public.tmc_stock_void_issue(uuid, uuid, text, uuid)
  from public, anon, authenticated;

commit;
