-- แยก "รองกันเปื้อนที่นอน" ตามขนาดเตียง (5 ฟุต / 6 ฟุต) + เพิ่ม "ผ้าเช็ดโต๊ะ" 2 ผืน ทุกหลัง
-- จำนวนรองกันเปื้อนยึดตามผ้าปูที่นอนของห้องนั้น (ห้องไหนปู 6 ฟุต 1 ผืน ก็รอง 6 ฟุต 1 ผืน)
-- เตียงเสริม 3 ฟุต ยังใช้ "รองกันเปื้อนที่นอน" ตัวเดิม (ยังไม่มีขนาด 3.5 ฟุต)
-- ยอดคงเหลือของตัวเดิม (18 ผืน) ไม่ได้ถูกแบ่งอัตโนมัติ — ต้องตั้งยอดของสองตัวใหม่เอง

begin;

do $$
declare v_org uuid; v_linen uuid; r record;
begin
  select id into v_org from public.organizations where slug='tmc';
  select id into v_linen from public.tmc_stock_locations where org_id=v_org and code='LINEN';

  for r in select * from (values
    ('รองกันเปื้อนที่นอน 5 ฟุต', 'ผืน', 'bedding'),
    ('รองกันเปื้อนที่นอน 6 ฟุต', 'ผืน', 'bedding'),
    ('ผ้าเช็ดโต๊ะ',              'ผืน', 'linen')
  ) as x(name, unit, grp)
  loop
    insert into public.tmc_stock_items
      (org_id, name, unit, category, stock_class, item_group, consumes_on_issue, default_location_id)
    select v_org, r.name, r.unit, 'ผ้า', 'reusable', r.grp, false, v_linen
    where not exists (select 1 from public.tmc_stock_items i where i.org_id=v_org and i.name=r.name);
  end loop;
end $$;

do $$
declare
  v_org uuid; p record; v_sheet text; v_qty numeric; v_new uuid; v_old uuid; v_ord int;
begin
  select id into v_org from public.organizations where slug='tmc';
  select id into v_old from public.tmc_stock_items where org_id=v_org and name='รองกันเปื้อนที่นอน';

  for p in
    select pr.id preset_id,
           (select i.name from public.tmc_stock_preset_lines l
             join public.tmc_stock_items i on i.id=l.item_id
            where l.preset_id=pr.id and i.name like 'ผ้าปูที่นอน %' limit 1) sheet_name,
           (select l.qty from public.tmc_stock_preset_lines l
             join public.tmc_stock_items i on i.id=l.item_id
            where l.preset_id=pr.id and i.name like 'ผ้าปูที่นอน %' limit 1) sheet_qty,
           (select l.sort_order from public.tmc_stock_preset_lines l
            where l.preset_id=pr.id and l.item_id=v_old limit 1) prot_ord
    from public.tmc_stock_presets pr
    where pr.org_id=v_org
      and exists (select 1 from public.tmc_stock_preset_lines l
                  where l.preset_id=pr.id and l.item_id=v_old)
  loop
    v_sheet := p.sheet_name; v_qty := p.sheet_qty; v_ord := coalesce(p.prot_ord, 2);
    if v_sheet is null then continue; end if;

    select id into v_new from public.tmc_stock_items
     where org_id=v_org
       and name = case when v_sheet like '%6 ฟุต%' then 'รองกันเปื้อนที่นอน 6 ฟุต'
                       when v_sheet like '%5 ฟุต%' then 'รองกันเปื้อนที่นอน 5 ฟุต'
                       else null end;
    if v_new is null then continue; end if;

    delete from public.tmc_stock_preset_lines where preset_id=p.preset_id and item_id=v_old;
    insert into public.tmc_stock_preset_lines(preset_id, item_id, qty, qty_basis, sort_order)
    values (p.preset_id, v_new, v_qty, 'fixed', v_ord)
    on conflict do nothing;
  end loop;
end $$;

insert into public.tmc_stock_preset_lines(preset_id, item_id, qty, qty_basis, sort_order)
select pr.id, i.id, 2, 'fixed', 20
from public.tmc_stock_presets pr
join public.organizations o on o.id=pr.org_id and o.slug='tmc'
join public.tmc_stock_items i on i.org_id=pr.org_id and i.name='ผ้าเช็ดโต๊ะ'
where pr.room_name='โต๊ะกินข้าว'
on conflict do nothing;

commit;
