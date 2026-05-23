-- Audit log for TMC admin: tracks all edit/delete on finance entries
create table if not exists tmc_audit_logs (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references organizations(id) on delete cascade,
  table_name  text not null,
  record_id   uuid not null,
  action      text not null check (action in ('update', 'delete')),
  changed_by  uuid references profiles(id),
  changed_at  timestamptz not null default now(),
  old_data    jsonb,
  new_data    jsonb
);

create index tmc_audit_logs_org_idx on tmc_audit_logs(org_id, table_name, changed_at desc);

alter table tmc_audit_logs enable row level security;

create policy "tmc_audit_logs_all"
  on tmc_audit_logs
  using (true)
  with check (true);
