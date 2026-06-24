-- System Issue Tracker — ระบบ tracking ปัญหาของทั้งระบบ (bug / user-error / config-infra / feature-gap)
-- ใช้ร่วมกันระหว่าง "แอป (admin console)" และ "agent (Fix Factory ผ่าน MCP)" — single source of truth
--
-- เลขอ้างอิงแบบ type-prefix: BUG-/OPS-/UX-/FEAT- · นับแยกต่อ prefix (issue_counters + RPC next_issue_ref)
-- ref = immutable (freeze ตอนสร้างตาม type แรก) — field `type` เปลี่ยนได้อิสระแต่ ref คงเดิม (เป็น citation)
-- RLS: enable + deny-all (ไม่มี policy) — super_admin จัดการผ่าน service-role เท่านั้น (แนวเดียวกับ product_documents)

-- ── counter ต่อ prefix (atomic) ──────────────────────────────────────────────
create table if not exists public.issue_counters (
  prefix    text primary key,            -- BUG | OPS | UX | FEAT
  last_seq  int  not null default 0
);

-- RPC: คืนเลขอ้างอิงถัดไปของ prefix แบบ atomic (กัน race เลขชนกัน)
create or replace function public.next_issue_ref(p_prefix text)
returns text
language sql
security definer
set search_path = public
as $$
  insert into public.issue_counters (prefix, last_seq)
  values (p_prefix, 1)
  on conflict (prefix) do update set last_seq = public.issue_counters.last_seq + 1
  returning prefix || '-' || last_seq;
$$;

revoke all on function public.next_issue_ref(text) from public, anon, authenticated;
grant execute on function public.next_issue_ref(text) to service_role;

-- ── issue หลัก ───────────────────────────────────────────────────────────────
create table if not exists public.system_issues (
  id             uuid primary key default gen_random_uuid(),
  ref            text unique not null,                 -- BUG-12 ฯลฯ — immutable
  prefix         text not null check (prefix in ('BUG','OPS','UX','FEAT')),
  -- type เปลี่ยนได้ แม้ ref จะ freeze แล้ว (triage แรก → root-cause อาจเปลี่ยน)
  type           text not null default 'bug'
                   check (type in ('bug','user_error','config_infra','feature_gap')),
  severity       text not null default 'sev2' check (severity in ('sev1','sev2','sev3')),
  status         text not null default 'open'
                   check (status in (
                     'open','triaging','diagnosing','fixing','verifying',
                     'fixed',          -- แก้เสร็จใน branch + verify ผ่าน ยังไม่ขึ้น prod
                     'deployed',       -- ขึ้น prod แล้ว รอยืนยันปิด
                     'closed',         -- ปิดสมบูรณ์ (ยืนยัน live ใช้ได้)
                     'blocked',        -- รอ decision/deploy/external
                     'wontfix','duplicate','handoff_feature'
                   )),
  title          text not null,
  symptom        text,                                 -- คาดหวัง vs จริง
  reproduce      text,                                 -- ขั้นตอน reproduce
  area           text[] not null default '{}',         -- ui|api|lib|db|line|worker|external
  root_cause     text,
  fix_summary    text,
  branch         text,
  files_touched  text[] not null default '{}',
  evidence       jsonb  not null default '{}',         -- ลิงก์/screenshot/log
  case_note_md   text,                                 -- Case Note เต็ม (mirror ของ .claude/fix-factory/cases)
  source         text not null default 'admin'
                   check (source in ('admin','agent','line','signal')),
  reported_by    uuid references public.profiles(id),
  reporter_note  text,                                 -- ผู้รายงานเป็นใคร (เช่น line user, ระบบสัญญาณ)
  parent_issue_id uuid references public.system_issues(id) on delete set null, -- ชี้ต้นทางเมื่อ status=duplicate
  dedup_key      text,                                 -- fingerprint กันสร้างซ้ำ (signal/line)
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  resolved_at    timestamptz
);

create index if not exists idx_system_issues_status   on public.system_issues (status, created_at desc);
create index if not exists idx_system_issues_type      on public.system_issues (type, created_at desc);
create index if not exists idx_system_issues_severity  on public.system_issues (severity, created_at desc);
create index if not exists idx_system_issues_dedup     on public.system_issues (dedup_key) where dedup_key is not null;

-- ── timeline / audit ของแต่ละ issue ─────────────────────────────────────────
create table if not exists public.system_issue_events (
  id           uuid primary key default gen_random_uuid(),
  issue_id     uuid not null references public.system_issues(id) on delete cascade,
  at           timestamptz not null default now(),
  actor        text,                                   -- 'admin:<email>' | 'agent' | 'line' | 'signal'
  action       text not null,                          -- created | status_change | note | reopened | linked_branch ...
  from_status  text,
  to_status    text,
  note         text
);

create index if not exists idx_system_issue_events_issue on public.system_issue_events (issue_id, at desc);

-- updated_at auto-touch
create or replace function public.touch_system_issues_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_system_issues_updated_at on public.system_issues;
create trigger trg_system_issues_updated_at
  before update on public.system_issues
  for each row execute function public.touch_system_issues_updated_at();

-- RLS — enable + deny-all (super_admin ผ่าน service-role เท่านั้น) · agent เขียนผ่าน MCP service-role
alter table public.issue_counters       enable row level security;
alter table public.system_issues        enable row level security;
alter table public.system_issue_events  enable row level security;

-- seed counters ของ 4 prefix (idempotent)
insert into public.issue_counters (prefix, last_seq) values
  ('BUG', 0), ('OPS', 0), ('UX', 0), ('FEAT', 0)
on conflict (prefix) do nothing;
