-- B1: atomic purchase RPC — finance + stock movements in one transaction
-- search_path = public ต้องตั้งไว้เพราะ trigger tmc_update_stock_qty อ้างตารางแบบ unqualified

create or replace function public.tmc_purchase_stock(
  p_org_id       uuid,
  p_account_id   uuid,
  p_date         date,
  p_category     text,
  p_property_code text,
  p_note         text,
  p_created_by   uuid,
  p_items        jsonb   -- array of {name, unit, qty, unitCost}
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item_id    uuid;
  v_property_id uuid := null;
  v_total      numeric := 0;
  v_count      int     := 0;
  v_desc_parts text[]  := '{}';
  elem         jsonb;
  v_name       text;
  v_unit       text;
  v_qty        numeric;
  v_unit_cost  numeric;
begin
  -- 1. resolve property id (optional)
  if p_property_code is not null and p_property_code <> '' then
    select id into v_property_id
    from public.tmc_properties
    where org_id = p_org_id and code = p_property_code;
  end if;

  -- 2. loop items
  for elem in select * from jsonb_array_elements(p_items)
  loop
    v_name      := trim(elem->>'name');
    v_unit      := coalesce(nullif(trim(elem->>'unit'), ''), 'ชิ้น');
    v_qty       := (elem->>'qty')::numeric;
    v_unit_cost := (elem->>'unitCost')::numeric;

    -- resolve or create stock item (tmc_stock_items ไม่มีคอลัมน์ created_by)
    select id into v_item_id
    from public.tmc_stock_items
    where org_id = p_org_id and name = v_name;

    if not found then
      insert into public.tmc_stock_items(org_id, name, unit, min_quantity)
      values (p_org_id, v_name, v_unit, 0)
      returning id into v_item_id;
    end if;

    -- insert movement (trigger tmc_update_stock_qty จะบวก current_qty อัตโนมัติ)
    insert into public.tmc_stock_movements(
      org_id, item_id, movement_type, quantity, unit_cost,
      property_id, property_code, note, created_by
    ) values (
      p_org_id, v_item_id, 'in', v_qty, v_unit_cost,
      v_property_id, nullif(p_property_code, ''), p_note, p_created_by
    );

    v_total := v_total + v_qty * v_unit_cost;
    v_count := v_count + 1;
    v_desc_parts := array_append(v_desc_parts, v_name || ' ×' || v_qty::text);
  end loop;

  -- 3. insert single finance entry (รวม 1 แถว)
  insert into public.tmc_finance_entries(
    org_id, account_id, entry_date, description, category,
    property_code, property_id, expense, note, created_by
  ) values (
    p_org_id, p_account_id, p_date,
    array_to_string(v_desc_parts, ', '),
    coalesce(nullif(p_category, ''), 'แมคโค'),
    nullif(p_property_code, ''), v_property_id,
    v_total, p_note, p_created_by
  );

  return jsonb_build_object('total', v_total, 'item_count', v_count);
end;
$$;

-- service-role only: revoke from anon + authenticated (ไม่ใช่แค่ PUBLIC)
revoke all on function public.tmc_purchase_stock(uuid, uuid, date, text, text, text, uuid, jsonb)
  from anon, authenticated;
