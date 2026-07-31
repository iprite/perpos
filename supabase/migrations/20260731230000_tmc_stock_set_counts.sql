-- ตั้งยอดตั้งต้น / ปรับยอดตามที่นับได้ — กรอกทีเดียวหลายรายการต่อจุดเก็บ
-- spec: specs/tmc-stock-v2.md §6 (P1 opening / P6 นับสต๊อก)
--
-- ใช้ movement 'adjust' ที่ระบุจุดเก็บชัด = ตั้งค่าสัมบูรณ์ ณ จุดนั้น (ไม่ใช่บวกเพิ่ม)
-- ยอดยังมาจาก movement ทางเดียวเสมอ — ไม่มีที่ไหนเขียน balance ตรง ๆ

begin;

-- ตั้งยอดเป็น 0 ต้องทำได้ ("นับแล้วไม่มีของเลย") — movement ชนิดอื่นยังต้อง > 0
alter table public.tmc_stock_movements drop constraint if exists tmc_stock_movements_qty_chk;
alter table public.tmc_stock_movements
  add constraint tmc_stock_movements_qty_chk
  check (quantity > 0 or (movement_type = 'adjust' and quantity = 0));

create or replace function public.tmc_stock_set_counts(
  p_org_id      uuid,
  p_location_id uuid,
  p_lines       jsonb,   -- [{item_id, qty}]
  p_reason      text,    -- 'opening' (ยอดยกมา) | 'count' (นับสต๊อก)
  p_note        text,
  p_created_by  uuid
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  elem     jsonb;
  v_item   uuid;
  v_qty    numeric;
  v_before numeric;
  v_count  int := 0;
  v_skip   int := 0;
begin
  if p_lines is null or jsonb_array_length(p_lines) = 0 then
    raise exception 'ไม่มีรายการให้ตั้งยอด' using errcode = '23514';
  end if;
  if not exists (select 1 from tmc_stock_locations
                  where id = p_location_id and org_id = p_org_id) then
    raise exception 'ไม่พบจุดเก็บที่ระบุ' using errcode = '23503';
  end if;

  for elem in select * from jsonb_array_elements(p_lines)
  loop
    v_item := (elem->>'item_id')::uuid;
    v_qty  := (elem->>'qty')::numeric;
    if v_qty is null or v_qty < 0 then continue; end if;

    select coalesce(qty, 0) into v_before
    from tmc_stock_balances where item_id = v_item and location_id = p_location_id;

    -- ยอดเท่าเดิม = ไม่ต้องบันทึกอะไร (กันประวัติรก)
    if coalesce(v_before, 0) = v_qty then
      v_skip := v_skip + 1;
      continue;
    end if;

    insert into tmc_stock_movements(
      org_id, item_id, movement_type, quantity,
      to_location_id, reason, note, created_by
    ) values (
      p_org_id, v_item, 'adjust', v_qty,
      p_location_id, coalesce(nullif(p_reason,''), 'count'),
      nullif(p_note,''), p_created_by
    );
    v_count := v_count + 1;
  end loop;

  return jsonb_build_object('updated', v_count, 'unchanged', v_skip);
end;
$$;

revoke all on function public.tmc_stock_set_counts(uuid, uuid, jsonb, text, text, uuid)
  from public, anon, authenticated;

commit;
