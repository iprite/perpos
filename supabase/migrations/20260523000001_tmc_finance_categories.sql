-- Finance categories for TMC (dynamic, user-managed)
create table if not exists tmc_finance_categories (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references organizations(id) on delete cascade,
  name       text not null,
  sort_order integer not null default 0,
  is_active  boolean not null default true,
  created_at timestamptz not null default now(),
  unique(org_id, name)
);

alter table tmc_finance_categories enable row level security;

create policy "tmc_finance_categories_all"
  on tmc_finance_categories
  using (true)
  with check (true);

-- Seed default categories for TMC org
insert into tmc_finance_categories (org_id, name, sort_order) values
  ('1f52618c-09c4-49c5-a929-ea5060f26e7d', 'รายรับ ค่าเช่า',             1),
  ('1f52618c-09c4-49c5-a929-ea5060f26e7d', 'ค่ามัดจำ',                    2),
  ('1f52618c-09c4-49c5-a929-ea5060f26e7d', 'คืนเงินมัดจำ',                3),
  ('1f52618c-09c4-49c5-a929-ea5060f26e7d', 'ค่าอาหาร',                    4),
  ('1f52618c-09c4-49c5-a929-ea5060f26e7d', 'อาหารเช้า',                   5),
  ('1f52618c-09c4-49c5-a929-ea5060f26e7d', 'หมูกระทะ',                    6),
  ('1f52618c-09c4-49c5-a929-ea5060f26e7d', 'บาร์บีคิว',                   7),
  ('1f52618c-09c4-49c5-a929-ea5060f26e7d', 'ค่าแรง(เงินเดือน+จ้างนอก)', 8),
  ('1f52618c-09c4-49c5-a929-ea5060f26e7d', 'ค่าไฟ',                       9),
  ('1f52618c-09c4-49c5-a929-ea5060f26e7d', 'ค่าน้ำ',                     10),
  ('1f52618c-09c4-49c5-a929-ea5060f26e7d', 'ซักผ้า',                     11),
  ('1f52618c-09c4-49c5-a929-ea5060f26e7d', 'ล้างแอร์',                   12),
  ('1f52618c-09c4-49c5-a929-ea5060f26e7d', 'ค่าของใช้ทั่วไป',            13),
  ('1f52618c-09c4-49c5-a929-ea5060f26e7d', 'ค่าโทรศัพท์',                14),
  ('1f52618c-09c4-49c5-a929-ea5060f26e7d', 'ค่าใช้จ่ายอื่นๆ',            15),
  ('1f52618c-09c4-49c5-a929-ea5060f26e7d', 'ค่าส่งของ',                  16),
  ('1f52618c-09c4-49c5-a929-ea5060f26e7d', 'ค่าเสื้อพนักงาน',            17),
  ('1f52618c-09c4-49c5-a929-ea5060f26e7d', 'ค่านวด',                     18),
  ('1f52618c-09c4-49c5-a929-ea5060f26e7d', 'เงินสดย่อย',                 19),
  ('1f52618c-09c4-49c5-a929-ea5060f26e7d', 'แมคโค',                      20),
  ('1f52618c-09c4-49c5-a929-ea5060f26e7d', 'ส่วนกลาง',                   21),
  ('1f52618c-09c4-49c5-a929-ea5060f26e7d', 'บัญชี',                      22),
  ('1f52618c-09c4-49c5-a929-ea5060f26e7d', 'Timber',                     23)
on conflict do nothing;
