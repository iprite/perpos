-- Money idempotency verification (Phase 2b)
-- ============================================================================
-- ตรวจ "จุดตายเงิน" ของ token ledger — รันได้ซ้ำโดย "ไม่แตะข้อมูลจริง"
-- เพราะห่อด้วย BEGIN ... ROLLBACK ทั้งก้อน (mutation ทุกอย่างถูกยกเลิกตอนจบ)
--
-- วิธีรัน:
--   • Supabase SQL Editor → วางทั้งไฟล์ → Run  (ผลลัพธ์เป็นตาราง PASS/FAIL)
--   • หรือผ่าน MCP execute_sql / psql
--
-- ครอบ:
--   T1  apply_token_payment  idempotent ด้วย stripe_payment_intent_id
--       (Stripe ยิง webhook ซ้ำ event เดิม → ห้าม credit เด้ง 2 เท่า)
--   T2  token_reserve        idempotent ด้วย job_id
--       (worker/scheduler ยิงซ้ำ → ห้ามหักโทเคนซ้ำ)
--   T3  token_reserve        ไม่ทำ balance ติดลบ (over-reserve → reject)
--
-- หมายเหตุ: ยังไม่ wire เข้า CI อัตโนมัติ (pgTAP+supabase CLI ต้องใช้ Docker
--   ซึ่ง dev ปัจจุบันไม่มี) — ไฟล์นี้เป็น manual verification ที่ reproducible
-- ============================================================================
begin;

-- seed FK ที่จำเป็น (rollback ทิ้งหมด): subject = profile แรกที่มี token_account
create temp table _r(name text, pass boolean, detail text);

do $$
declare
  pid uuid;
  v_rate numeric; charge bigint;
  bal0 bigint; bal1 bigint; bal2 bigint; bal3 bigint;
  r1 jsonb; r2 jsonb; res1 jsonb; res2 jsonb; res3 jsonb;
  job1 uuid := gen_random_uuid(); job2 uuid := gen_random_uuid();
  pay_cnt int; deb_cnt int;
begin
  select profile_id into pid from public.token_accounts order by created_at limit 1;
  if pid is null then
    insert into _r values ('SETUP no token_account found', false, 'ไม่มี profile ที่มี token_account');
    return;
  end if;

  insert into public.stripe_events(id, type, payload)
    values ('evt_test_1','test.token','{}'::jsonb), ('evt_test_2','test.token','{}'::jsonb);
  insert into public.assistant_jobs(id, profile_id, file_name, mime_type, source, kind, status) values
    (job1, pid, 't1.mp3','audio/mpeg','web','stt','processing'),
    (job2, pid, 't2.mp3','audio/mpeg','web','stt','processing');

  select tokens_per_unit into v_rate from public.token_rates where service='stt';
  charge := ceil(60 * v_rate)::bigint;
  select coalesce(balance_tokens,0) into bal0 from public.token_accounts where profile_id=pid;

  -- T1: apply_token_payment idempotent (stripe_payment_intent_id)
  r1 := public.apply_token_payment(pid,'TEST',1000,100,'THB','pi_TEST_idem','evt_test_1');
  r2 := public.apply_token_payment(pid,'TEST',1000,100,'THB','pi_TEST_idem','evt_test_2');
  select coalesce(balance_tokens,0) into bal1 from public.token_accounts where profile_id=pid;
  select count(*) into pay_cnt from public.token_payments
    where stripe_payment_intent_id='pi_TEST_idem' and status='succeeded';
  insert into _r values
   ('T1.1 first credit not duplicate', (r1->>'duplicate')::boolean is false, r1::text),
   ('T1.2 second call = duplicate',    (r2->>'duplicate')::boolean is true,  r2::text),
   ('T1.3 payment row inserted once',  pay_cnt=1, 'count='||pay_cnt),
   ('T1.4 balance credited once',      bal1 = bal0+1000, format('bal0=%s bal1=%s',bal0,bal1));

  -- T2: token_reserve idempotent (job_id)
  res1 := public.token_reserve(pid, job1, 'stt', 60, 'test');
  res2 := public.token_reserve(pid, job1, 'stt', 60, 'test');
  select coalesce(balance_tokens,0) into bal2 from public.token_accounts where profile_id=pid;
  select count(*) into deb_cnt from public.token_ledger where job_id=job1 and kind='debit';
  insert into _r values
   ('T2.1 reserve#1 ok',              (res1->>'ok')::boolean is true, res1::text),
   ('T2.2 reserve#2 = duplicate',     (res2->>'duplicate')::boolean is true, res2::text),
   ('T2.3 debit ledger once per job', deb_cnt=1, 'debits='||deb_cnt),
   ('T2.4 charged once only',         bal2 = bal1 - charge, format('bal1=%s bal2=%s charge=%s',bal1,bal2,charge));

  -- T3: over-reserve ต้องไม่ทำ balance ติดลบ
  begin
    res3 := public.token_reserve(pid, job2, 'stt', 1000000000, 'test');
    select coalesce(balance_tokens,0) into bal3 from public.token_accounts where profile_id=pid;
    insert into _r values
     ('T3.1 over-reserve rejected',    (res3->>'ok')::boolean is false, res3::text),
     ('T3.2 balance unchanged & >=0',  bal3=bal2 and bal3>=0, format('bal2=%s bal3=%s',bal2,bal3));
  exception when others then
    insert into _r values ('T3 over-reserve rejected (raised)', true, SQLERRM);
  end;
end $$;

select name, case when pass then 'PASS' else 'FAIL' end as result, detail from _r order by name;

rollback;
