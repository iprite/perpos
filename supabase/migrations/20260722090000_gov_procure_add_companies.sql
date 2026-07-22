-- gov_procure: รองรับบริษัทรับงานเพิ่มอีก 2 ราย (ALPHA ENGINEERING, MAGISTATS TRADING)
-- เดิม CHECK อนุญาตแค่ '89 Global Work' / 'P2P Supply'

alter table public.gov_procure_orders
  drop constraint if exists gov_procure_orders_company_chk;

alter table public.gov_procure_orders
  add constraint gov_procure_orders_company_chk
  check (
    company is null
    or company = any (array[
      '89 Global Work',
      'P2P Supply',
      'ALPHA ENGINEERING',
      'MAGISTATS TRADING'
    ]::text[])
  );
