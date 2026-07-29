-- acc_firm: เชื่อมกลุ่ม LINE ของลูกค้าเข้ากับทะเบียนลูกค้า (1 กลุ่ม = 1 ลูกค้า)
--
-- flow: ทีมงานกดสร้าง "รหัสเชื่อมกลุ่ม" ในหน้าลูกค้า → เอาไปพิมพ์ในกลุ่ม LINE ที่แอด
--       Perpos OA ไว้แล้ว → webhook ผูก group_id เข้ากับลูกค้ารายนั้น
-- กติกา: กลุ่มที่ยังไม่ผูก บอทเงียบเสมอ (ตอบเฉพาะรหัสที่ถูกต้อง) — กันบอทพูดในกลุ่มคนอื่น
--        รหัสใช้ได้ครั้งเดียว + หมดอายุ (นับเป็น secret) · ลูกค้ารายหนึ่งมีได้กลุ่มเดียว

create table if not exists public.acc_firm_client_line_groups (
  id                uuid primary key default gen_random_uuid(),
  firm_org_id       uuid not null references public.organizations(id) on delete cascade,
  service_client_id uuid not null unique
                      references public.acc_firm_service_clients(id) on delete cascade,

  -- ── การผูกกลุ่ม ──
  status            text not null default 'pending'
                      check (status in ('pending', 'linked')),
  line_group_id     text unique,
  bound_at          timestamptz,
  bound_by          uuid references public.profiles(id) on delete set null,
  bound_line_user_id text,

  -- ── รหัสเชื่อมกลุ่ม (secret ใช้ครั้งเดียว) ──
  pair_code         text unique,
  pair_code_expires_at timestamptz,
  pair_code_by      uuid references public.profiles(id) on delete set null,

  -- ── ตั้งค่าการส่งอัปเดต (ต่อลูกค้า) ──
  notify_doc_received boolean not null default true,  -- ได้รับเอกสารเข้าคลังแล้ว
  notify_tax_due      boolean not null default true,  -- ใกล้ครบกำหนดยื่นภาษี
  notify_tax_filed    boolean not null default true,  -- ยื่นภาษีให้แล้ว
  notify_billing      boolean not null default true,  -- แจ้งค่าบริการ
  notify_announce     boolean not null default true,  -- ประกาศ/ข้อความจากทีมงาน

  created_at        timestamptz not null default now(),
  created_by        uuid references public.profiles(id) on delete set null,
  updated_at        timestamptz not null default now()
);

create index if not exists acc_firm_client_line_groups_firm_idx
  on public.acc_firm_client_line_groups (firm_org_id);

comment on table public.acc_firm_client_line_groups is
  'กลุ่ม LINE ของลูกค้าสำนักงานบัญชี — 1 ลูกค้า 1 กลุ่ม · ผูกด้วยรหัสที่ทีมงานสร้างแล้วพิมพ์ในกลุ่ม';
comment on column public.acc_firm_client_line_groups.pair_code is
  'รหัสเชื่อมกลุ่ม — ใช้ได้ครั้งเดียว, ล้างทิ้งทันทีที่ผูกสำเร็จ/ยกเลิก';

-- ── log การส่ง (audit + กันส่งซ้ำ) ─────────────────────────────────────────────
create table if not exists public.acc_firm_client_line_messages (
  id           uuid primary key default gen_random_uuid(),
  firm_org_id  uuid not null references public.organizations(id) on delete cascade,
  service_client_id uuid not null
                 references public.acc_firm_service_clients(id) on delete cascade,
  line_group_id text not null,
  event        text not null,          -- doc_received | tax_due | tax_filed | billing | announce
  summary      text not null,          -- ข้อความย่อที่ส่ง (ไว้ตรวจย้อนหลัง)
  dedup_key    text,                   -- กันส่งซ้ำงานอัตโนมัติ (เช่น tax_due ของงวดเดียวกัน)
  sent_by      uuid references public.profiles(id) on delete set null,
  ok           boolean not null default true,
  error        text,
  created_at   timestamptz not null default now()
);

create index if not exists acc_firm_client_line_messages_client_idx
  on public.acc_firm_client_line_messages (service_client_id, created_at desc);

-- dedup: งานอัตโนมัติชิ้นเดียวกันส่งได้ครั้งเดียวตลอดกาล
create unique index if not exists acc_firm_client_line_messages_dedup_uniq
  on public.acc_firm_client_line_messages (service_client_id, dedup_key)
  where dedup_key is not null;

-- ── updated_at trigger ────────────────────────────────────────────────────────
create or replace function public.set_acc_firm_client_line_groups_updated_at()
returns trigger
language plpgsql
set search_path to 'public'
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_acc_firm_client_line_groups_updated_at
  on public.acc_firm_client_line_groups;
create trigger trg_acc_firm_client_line_groups_updated_at
  before update on public.acc_firm_client_line_groups
  for each row
  execute function public.set_acc_firm_client_line_groups_updated_at();

-- ── RLS ───────────────────────────────────────────────────────────────────────
-- ใช้ helper เดียวกับคลังเอกสาร: acc_firm_member = สมาชิกโมดูลของ firm นั้น (หรือ admin/super_admin)
-- acc_firm_writer = สมาชิกที่ไม่ใช่ viewer — ตรงกับด่านใน API (viewer แก้/ส่งไม่ได้)
alter table public.acc_firm_client_line_groups enable row level security;
alter table public.acc_firm_client_line_messages enable row level security;

create policy "acc_firm_client_line_groups_select"
  on public.acc_firm_client_line_groups for select
  using (public.acc_firm_member(firm_org_id));

create policy "acc_firm_client_line_groups_write"
  on public.acc_firm_client_line_groups for all
  using (public.acc_firm_writer(firm_org_id))
  with check (public.acc_firm_writer(firm_org_id));

create policy "acc_firm_client_line_messages_select"
  on public.acc_firm_client_line_messages for select
  using (public.acc_firm_member(firm_org_id));

-- log เขียนผ่าน service-role เท่านั้น (append-only จากฝั่งเซิร์ฟเวอร์)
revoke insert, update, delete on public.acc_firm_client_line_messages from authenticated;
