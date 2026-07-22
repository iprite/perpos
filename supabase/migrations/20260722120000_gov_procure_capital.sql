-- gov_procure: กองทุน/นักลงทุน (capital & treasury)
-- โมเดล: นักลงทุนลงขัน → กองกลาง → กระจายทุนไปหัวบริษัท → บริษัทรับงาน/ทำกำไร → ปันผล/คืนเงินต้น
-- เงินลงทุน = เงินกู้ยืม (ไม่มีดอกเบี้ย) · แบ่งกำไรตาม share_pct ของนักลงทุน
-- กำไรต่อบริษัท "ไม่เก็บในตารางนี้" — คำนวณจาก gov_procure_orders (stage paid/closed) ตอนอ่าน
--   เพื่อกันข้อมูล 2 แหล่งไม่ตรงกัน (กฎเดียวกับ duration_days ที่เป็น derived)

-- ── นักลงทุน ───────────────────────────────────────────────────────────────
create table if not exists public.gov_procure_investors (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.organizations(id) on delete cascade,
  -- ผูกบัญชีผู้ใช้ (nullable — สร้างรายชื่อไว้ก่อนได้ ค่อยผูกเมื่อคนนั้นมีบัญชี)
  profile_id  uuid references public.profiles(id) on delete set null,
  name        text not null,
  share_pct   numeric not null default 0 check (share_pct >= 0 and share_pct <= 100),
  is_active   boolean not null default true,
  note        text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists gov_procure_investors_org_idx on public.gov_procure_investors (org_id);
create unique index if not exists gov_procure_investors_profile_uniq
  on public.gov_procure_investors (org_id, profile_id) where profile_id is not null;

-- ── ledger การเคลื่อนไหวเงินทุน ────────────────────────────────────────────
-- flow_type:
--   contribution   นักลงทุน → กองกลาง (ลงขัน)            ต้องมี investor_id
--   allocation     กองกลาง  → บริษัท  (กระจายทุน)         ต้องมี company
--   return_to_pool บริษัท   → กองกลาง (คืนทุนเข้ากองกลาง) ต้องมี company
--   dividend       บริษัท   → นักลงทุน (ปันผลกำไร)        ต้องมี investor_id + company
--   repayment      บริษัท   → นักลงทุน (คืนเงินต้น)       ต้องมี investor_id + company
create table if not exists public.gov_procure_capital_flows (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.organizations(id) on delete cascade,
  created_by  uuid references public.profiles(id) on delete set null,
  flow_type   text not null check (flow_type in
                ('contribution','allocation','return_to_pool','dividend','repayment')),
  amount      numeric not null check (amount > 0),
  flow_date   date not null default current_date,
  investor_id uuid references public.gov_procure_investors(id) on delete restrict,
  company     text check (company is null or company = any (array[
                '89 Global Work','P2P Supply','ALPHA ENGINEERING','MAGISTATS TRADING'
              ]::text[])),
  -- ผูกกับงานรายตัวได้ (optional) → track ทุน/ปันผลระดับ order ตามที่ธุรกิจต้องการ
  order_id    uuid references public.gov_procure_orders(id) on delete set null,
  note        text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  -- บังคับความครบของฟิลด์ตามชนิดรายการ (กันข้อมูลกำพร้าที่ทำยอดเพี้ยน)
  constraint gov_procure_capital_flows_shape_chk check (
    case flow_type
      when 'contribution'   then investor_id is not null
      when 'allocation'     then company is not null
      when 'return_to_pool' then company is not null
      when 'dividend'       then investor_id is not null and company is not null
      when 'repayment'      then investor_id is not null and company is not null
      else false
    end
  )
);

create index if not exists gov_procure_capital_flows_org_idx
  on public.gov_procure_capital_flows (org_id, flow_date desc);
create index if not exists gov_procure_capital_flows_investor_idx
  on public.gov_procure_capital_flows (org_id, investor_id);
create index if not exists gov_procure_capital_flows_company_idx
  on public.gov_procure_capital_flows (org_id, company);

-- ── updated_at trigger (ใช้ฟังก์ชันเดิมของโมดูล) ───────────────────────────
drop trigger if exists trg_gov_procure_investors_updated on public.gov_procure_investors;
create trigger trg_gov_procure_investors_updated
  before update on public.gov_procure_investors
  for each row execute function public.set_updated_at();

drop trigger if exists trg_gov_procure_capital_flows_updated on public.gov_procure_capital_flows;
create trigger trg_gov_procure_capital_flows_updated
  before update on public.gov_procure_capital_flows
  for each row execute function public.set_updated_at();

-- ── RLS (เหมือนตารางอื่นในโมดูล: อ่าน = สมาชิก org · เขียน = org admin + allowlist ที่ API) ──
alter table public.gov_procure_investors     enable row level security;
alter table public.gov_procure_capital_flows enable row level security;

drop policy if exists gov_procure_investors_select on public.gov_procure_investors;
create policy gov_procure_investors_select on public.gov_procure_investors
  for select using (public.is_org_member(org_id, auth.uid()));

drop policy if exists gov_procure_investors_write on public.gov_procure_investors;
create policy gov_procure_investors_write on public.gov_procure_investors
  for all using (public.is_org_admin(org_id, auth.uid()))
  with check (public.is_org_admin(org_id, auth.uid()));

drop policy if exists gov_procure_capital_flows_select on public.gov_procure_capital_flows;
create policy gov_procure_capital_flows_select on public.gov_procure_capital_flows
  for select using (public.is_org_member(org_id, auth.uid()));

drop policy if exists gov_procure_capital_flows_write on public.gov_procure_capital_flows;
create policy gov_procure_capital_flows_write on public.gov_procure_capital_flows
  for all using (public.is_org_admin(org_id, auth.uid()))
  with check (public.is_org_admin(org_id, auth.uid()));
