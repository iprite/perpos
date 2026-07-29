-- acc_firm: ทะเบียนลูกค้า — เพิ่มข้อมูลที่สำนักงานบัญชีใช้จริง (additive ทั้งหมด)
--
-- 4 ชุด: ข้อมูลติดต่อ · ภาษี/ประกันสังคม · ผู้ทำบัญชี-ผู้สอบบัญชี · รอบงานเอกสาร
-- ทุกคอลัมน์ nullable/มี default → แถวเดิมไม่กระทบ
-- **ห้ามเก็บรหัสผ่าน e-Filing/สปส. ในตารางนี้เด็ดขาด** — เก็บแค่ "ยื่นทางไหน" เท่านั้น

alter table public.acc_firm_service_clients
  -- ── ข้อมูลติดต่อ ──
  add column if not exists contact_name    text,
  add column if not exists contact_phone   text,
  add column if not exists contact_email   text,
  add column if not exists address         text,

  -- ── ภาษี / ประกันสังคม ──
  -- สาขาตามใบกำกับภาษี ม.86/4: '00000' = สำนักงานใหญ่ · '00001'+ = สาขาที่ 1…
  add column if not exists branch_code     text not null default '00000',
  add column if not exists vat_registered_date date,
  add column if not exists sso_registered  boolean not null default false,
  add column if not exists sso_employer_no text,
  add column if not exists efiling_enabled boolean not null default false,

  -- ── ผู้ทำบัญชี (CPD) / ผู้สอบบัญชี (CPA/TA) ──
  add column if not exists accountant_name    text,
  add column if not exists accountant_license text,
  add column if not exists auditor_name       text,
  add column if not exists auditor_license    text,

  -- ── รอบงานเอกสาร ──
  -- วันที่ลูกค้าส่งเอกสารประจำเดือน (1–31) — ใช้ตั้งรอบทวงเอกสารเข้ากลุ่ม LINE ต่อไป
  add column if not exists doc_due_day     smallint,
  add column if not exists doc_channel     text;

alter table public.acc_firm_service_clients
  drop constraint if exists acc_firm_service_clients_doc_due_day_chk;
alter table public.acc_firm_service_clients
  add constraint acc_firm_service_clients_doc_due_day_chk
  check (doc_due_day is null or (doc_due_day between 1 and 31));

alter table public.acc_firm_service_clients
  drop constraint if exists acc_firm_service_clients_doc_channel_chk;
alter table public.acc_firm_service_clients
  add constraint acc_firm_service_clients_doc_channel_chk
  check (doc_channel is null or doc_channel in ('line', 'pickup', 'post', 'onsite', 'other'));

comment on column public.acc_firm_service_clients.branch_code is
  'รหัสสาขาตาม ม.86/4 — 00000 = สำนักงานใหญ่';
comment on column public.acc_firm_service_clients.efiling_enabled is
  'ยื่นแบบผ่าน e-Filing ของกรมสรรพากร (เก็บแค่ว่ายื่นทางไหน — ห้ามเก็บรหัสผ่าน)';
comment on column public.acc_firm_service_clients.accountant_license is
  'เลขทะเบียนผู้ทำบัญชี (CPD) — พ.ร.บ.การบัญชี บังคับให้มีผู้ทำบัญชีและแจ้ง DBD';
comment on column public.acc_firm_service_clients.doc_due_day is
  'วันที่ลูกค้าส่งเอกสารประจำเดือน (1–31)';
