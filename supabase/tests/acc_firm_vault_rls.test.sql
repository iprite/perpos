-- ═══════════════════════════════════════════════════════════════════════════
-- Tenant-isolation + invariant test ของ Client Document Vault
-- spec: docs/specs/jtacc-document-vault.md §9 (Acceptance Criteria Phase 1)
--
-- รันได้ทั้ง psql และ Supabase SQL editor — ทุกอย่างอยู่ใน transaction เดียว
-- และจบด้วย ROLLBACK จึงไม่ทิ้งข้อมูลไว้ในฐาน (รันซ้ำได้เรื่อย ๆ)
--
--   psql "$DATABASE_URL" -f supabase/tests/acc_firm_vault_rls.test.sql
--
-- ผ่าน = ไม่มี exception และแถวสุดท้ายขึ้น 'ALL TESTS PASSED'
-- ═══════════════════════════════════════════════════════════════════════════
BEGIN;

DO $test$
DECLARE
  org_a   uuid := gen_random_uuid();
  org_b   uuid := gen_random_uuid();
  usr_a   uuid := gen_random_uuid();   -- accountant ของ firm A
  usr_v   uuid := gen_random_uuid();   -- viewer ของ firm A
  usr_b   uuid := gen_random_uuid();   -- accountant ของ firm B
  cli_a   uuid;
  cli_b   uuid;
  per_a   uuid;
  cat_src uuid;   -- SRC-01 · retention 7 ปี
  cat_reg uuid;   -- REG-01 · เก็บถาวร
  doc_a   uuid;
  v_cnt   int;
  v_date  date;
  v_ok    boolean;
BEGIN
  -- ── fixtures (service-role context) ───────────────────────────────────────
  INSERT INTO auth.users (id) VALUES (usr_a), (usr_v), (usr_b);
  INSERT INTO profiles (id, email, role, is_active) VALUES
    (usr_a, 'vault-test-a@example.invalid', 'user', true),
    (usr_v, 'vault-test-v@example.invalid', 'user', true),
    (usr_b, 'vault-test-b@example.invalid', 'user', true)
  ON CONFLICT (id) DO UPDATE SET role = 'user', is_active = true;

  INSERT INTO organizations (id, name, slug, created_by) VALUES
    (org_a, 'Vault Test Firm A', 'vault-test-a-' || substr(org_a::text, 1, 8), usr_a),
    (org_b, 'Vault Test Firm B', 'vault-test-b-' || substr(org_b::text, 1, 8), usr_b);

  INSERT INTO module_members (org_id, module_key, user_id, module_role, is_active) VALUES
    (org_a, 'acc_firm', usr_a, 'accountant', true),
    (org_a, 'acc_firm', usr_v, 'viewer',     true),
    (org_b, 'acc_firm', usr_b, 'accountant', true);

  INSERT INTO acc_firm_service_clients (firm_org_id, client_code, company_name)
    VALUES (org_a, 'VT-A01', 'ลูกค้าของ A') RETURNING id INTO cli_a;
  INSERT INTO acc_firm_service_clients (firm_org_id, client_code, company_name)
    VALUES (org_b, 'VT-B01', 'ลูกค้าของ B') RETURNING id INTO cli_b;

  INSERT INTO acc_firm_vault_periods (firm_org_id, client_id, kind, period_start, period_end, fiscal_year)
    VALUES (org_a, cli_a, 'month', DATE '2026-01-01', DATE '2026-01-31', 2026)
    RETURNING id INTO per_a;

  SELECT id INTO cat_src FROM acc_firm_vault_categories WHERE code = 'SRC-01';
  SELECT id INTO cat_reg FROM acc_firm_vault_categories WHERE code = 'REG-01';

  -- ── T5: retention_until คำนวณเอง — ค่าที่ payload ส่งมาต้องถูกเขียนทับ ─────
  INSERT INTO acc_firm_vault_documents
    (firm_org_id, client_id, period_id, category_id, title, storage_path, sha256, retention_until)
  VALUES
    (org_a, cli_a, per_a, cat_src, 'ใบกำกับภาษีขาย ม.ค.',
     org_a || '/' || cli_a || '/2026/SRC-01/a.pdf', 'sha-a-001', DATE '2020-01-01')
  RETURNING id, retention_until INTO doc_a, v_date;

  IF v_date <> DATE '2033-01-31' THEN
    RAISE EXCEPTION 'T5 FAILED: retention_until = % (คาด 2033-01-31 = period_end + 7 ปี)', v_date;
  END IF;

  -- ── T6: category เก็บถาวร (retention_years = 0) → 9999-12-31 ──────────────
  INSERT INTO acc_firm_vault_documents
    (firm_org_id, client_id, category_id, title, storage_path, sha256)
  VALUES (org_a, cli_a, cat_reg, 'หนังสือรับรอง',
          org_a || '/' || cli_a || '/2026/REG-01/b.pdf', 'sha-a-002')
  RETURNING retention_until INTO v_date;

  IF v_date <> DATE '9999-12-31' THEN
    RAISE EXCEPTION 'T6 FAILED: เอกสารเก็บถาวรได้ retention_until = %', v_date;
  END IF;

  -- ── T7: sha256 ซ้ำในลูกค้าเดียวกัน → ต้องถูกปฏิเสธ ────────────────────────
  BEGIN
    INSERT INTO acc_firm_vault_documents
      (firm_org_id, client_id, category_id, title, storage_path, sha256)
    VALUES (org_a, cli_a, cat_src, 'ไฟล์เดิมซ้ำ',
            org_a || '/' || cli_a || '/2026/SRC-01/dup.pdf', 'sha-a-001');
    RAISE EXCEPTION 'T7 FAILED: อัปโหลด sha256 ซ้ำได้ (ต้องถูกกัน)';
  EXCEPTION WHEN unique_violation THEN
    NULL;  -- ผ่าน
  END;

  -- เอกสารของ firm B ไว้พิสูจน์ว่า A มองไม่เห็น
  INSERT INTO acc_firm_vault_documents
    (firm_org_id, client_id, category_id, title, storage_path, sha256)
  VALUES (org_b, cli_b, cat_src, 'เอกสารลับของ B',
          org_b || '/' || cli_b || '/2026/SRC-01/secret.pdf', 'sha-b-001');

  -- ═════════════════════════════════════════════════════════════════════════
  -- ตั้งแต่นี้ไป = สวมบทผู้ใช้จริง (role authenticated + JWT sub) → RLS บังคับ
  -- ═════════════════════════════════════════════════════════════════════════
  EXECUTE format('SET LOCAL request.jwt.claims = %L', json_build_object('sub', usr_a, 'role', 'authenticated')::text);
  SET LOCAL ROLE authenticated;

  -- ── T1: firm A เห็นเฉพาะเอกสารของตัวเอง ──────────────────────────────────
  SELECT count(*) INTO v_cnt FROM acc_firm_vault_documents;
  IF v_cnt <> 2 THEN
    RAISE EXCEPTION 'T1 FAILED: user A เห็นเอกสาร % แถว (คาด 2 = ของตัวเองเท่านั้น)', v_cnt;
  END IF;

  SELECT count(*) INTO v_cnt FROM acc_firm_vault_documents WHERE firm_org_id = org_b;
  IF v_cnt <> 0 THEN
    RAISE EXCEPTION 'T1 FAILED: DATA LEAK — user A เห็นเอกสารของ firm B % แถว', v_cnt;
  END IF;

  SELECT count(*) INTO v_cnt FROM acc_firm_service_clients WHERE firm_org_id = org_b;
  IF v_cnt <> 0 THEN
    RAISE EXCEPTION 'T1 FAILED: DATA LEAK — user A เห็นทะเบียนลูกค้าของ firm B';
  END IF;

  -- ── T2: firm A เขียนข้าม tenant ไม่ได้ ───────────────────────────────────
  BEGIN
    INSERT INTO acc_firm_vault_documents
      (firm_org_id, client_id, category_id, title, storage_path, sha256)
    VALUES (org_b, cli_b, cat_src, 'แทรกข้าม tenant',
            org_b || '/' || cli_b || '/2026/SRC-01/evil.pdf', 'sha-evil-001');
    RAISE EXCEPTION 'T2 FAILED: user A เขียนเอกสารให้ firm B ได้';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;  -- ผ่าน (RLS WITH CHECK ปฏิเสธ)
  END;

  -- ── T2b: ลบเอกสารของ firm B ไม่ได้ (RLS ทำให้ไม่มีแถวให้ลบ) ──────────────
  DELETE FROM acc_firm_vault_documents WHERE firm_org_id = org_b;
  GET DIAGNOSTICS v_cnt = ROW_COUNT;
  IF v_cnt <> 0 THEN
    RAISE EXCEPTION 'T2b FAILED: user A ลบเอกสารของ firm B ได้ % แถว', v_cnt;
  END IF;

  -- ── T8: access log เป็น append-only แม้แต่กับคนที่เขียน log ได้ ───────────
  INSERT INTO acc_firm_vault_access_log (firm_org_id, document_id, user_id, action)
  VALUES (org_a, doc_a, usr_a, 'download');

  BEGIN
    UPDATE acc_firm_vault_access_log SET action = 'view' WHERE firm_org_id = org_a;
    RAISE EXCEPTION 'T8 FAILED: แก้ไข access log ได้ (ต้อง append-only)';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;  -- ผ่าน
  END;

  BEGIN
    DELETE FROM acc_firm_vault_access_log WHERE firm_org_id = org_a;
    RAISE EXCEPTION 'T8 FAILED: ลบ access log ได้ (ต้อง append-only)';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;  -- ผ่าน
  END;

  -- ── T3/T4: viewer อ่านได้ แต่เขียนไม่ได้ ─────────────────────────────────
  RESET ROLE;
  EXECUTE format('SET LOCAL request.jwt.claims = %L', json_build_object('sub', usr_v, 'role', 'authenticated')::text);
  SET LOCAL ROLE authenticated;

  SELECT count(*) INTO v_cnt FROM acc_firm_vault_documents;
  IF v_cnt <> 2 THEN
    RAISE EXCEPTION 'T4 FAILED: viewer ของ firm A อ่านเอกสารได้ % แถว (คาด 2)', v_cnt;
  END IF;

  BEGIN
    INSERT INTO acc_firm_vault_documents
      (firm_org_id, client_id, category_id, title, storage_path, sha256)
    VALUES (org_a, cli_a, cat_src, 'viewer แอบเขียน',
            org_a || '/' || cli_a || '/2026/SRC-01/v.pdf', 'sha-a-003');
    RAISE EXCEPTION 'T3 FAILED: viewer เขียนเอกสารได้';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;  -- ผ่าน
  END;

  -- ── T9: user ของ firm B มองไม่เห็นอะไรของ firm A เลย (ทิศตรงข้าม) ────────
  RESET ROLE;
  EXECUTE format('SET LOCAL request.jwt.claims = %L', json_build_object('sub', usr_b, 'role', 'authenticated')::text);
  SET LOCAL ROLE authenticated;

  SELECT count(*) INTO v_cnt FROM acc_firm_vault_documents WHERE firm_org_id = org_a;
  IF v_cnt <> 0 THEN
    RAISE EXCEPTION 'T9 FAILED: DATA LEAK — user B เห็นเอกสารของ firm A % แถว', v_cnt;
  END IF;

  SELECT count(*) INTO v_cnt FROM acc_firm_vault_periods WHERE firm_org_id = org_a;
  IF v_cnt <> 0 THEN
    RAISE EXCEPTION 'T9 FAILED: DATA LEAK — user B เห็นงวดของ firm A';
  END IF;

  RESET ROLE;

  -- ── T10: storage path helper ต้องไม่ระเบิดเมื่อ path ไม่ใช่ uuid ─────────
  SELECT public.acc_firm_member_path('not-a-uuid', false) INTO v_ok;
  IF v_ok IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'T10 FAILED: acc_firm_member_path คืน % สำหรับ path ที่ไม่ใช่ uuid', v_ok;
  END IF;

  -- ═══════════════════════════════════════════════════════════════════════
  -- G1–G3: guard ที่เพิ่มหลัง review (migration 20260729170000)
  -- ═══════════════════════════════════════════════════════════════════════
  EXECUTE format('SET LOCAL request.jwt.claims = %L', json_build_object('sub', usr_a, 'role', 'authenticated')::text);
  SET LOCAL ROLE authenticated;

  -- G1: แก้ retention_until ตรง ๆ (ไม่แตะ category/period/client) ต้องถูกเขียนทับ
  UPDATE acc_firm_vault_documents SET retention_until = DATE '2020-01-01' WHERE id = doc_a;
  SELECT retention_until INTO v_date FROM acc_firm_vault_documents WHERE id = doc_a;
  IF v_date = DATE '2020-01-01' THEN
    RAISE EXCEPTION 'G1 FAILED: client เขียน retention_until ได้';
  END IF;

  -- G2a: เอกสารที่บันทึกแล้ว (active) ลบทิ้งไม่ได้ — ต้องเดินผ่าน pending_purge
  BEGIN
    DELETE FROM acc_firm_vault_documents WHERE id = doc_a;
    RAISE EXCEPTION 'G2a FAILED: ลบเอกสาร active ได้';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;

  -- G2b: draft ที่อัปโหลดผิดยังลบได้
  INSERT INTO acc_firm_vault_documents
    (firm_org_id, client_id, category_id, title, storage_path, sha256, status)
  VALUES (org_a, cli_a, cat_src, 'ไฟล์อัปผิด',
          org_a || '/' || cli_a || '/2026/SRC-01/draft.pdf', 'sha-a-draft', 'draft');
  DELETE FROM acc_firm_vault_documents WHERE sha256 = 'sha-a-draft';
  GET DIAGNOSTICS v_cnt = ROW_COUNT;
  IF v_cnt <> 1 THEN RAISE EXCEPTION 'G2b FAILED: ลบเอกสาร draft ไม่ได้'; END IF;

  -- G2c: legal hold แล้วลบไม่ได้แม้เป็น draft
  INSERT INTO acc_firm_vault_documents
    (firm_org_id, client_id, category_id, title, storage_path, sha256, status, legal_hold)
  VALUES (org_a, cli_a, cat_src, 'เอกสารถูกอายัด',
          org_a || '/' || cli_a || '/2026/SRC-01/held.pdf', 'sha-a-held', 'draft', true);
  BEGIN
    DELETE FROM acc_firm_vault_documents WHERE sha256 = 'sha-a-held';
    RAISE EXCEPTION 'G2c FAILED: ลบเอกสารที่ติด legal hold ได้';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;

  -- G3: accountant ปลด legal hold ไม่ได้ (สิทธิ์ของ owner เท่านั้น)
  BEGIN
    UPDATE acc_firm_vault_documents SET legal_hold = false WHERE sha256 = 'sha-a-held';
    RAISE EXCEPTION 'G3 FAILED: accountant ปลด legal hold ได้';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;

  RESET ROLE;

  RAISE NOTICE 'ALL TESTS PASSED';
END;
$test$;

SELECT 'ALL TESTS PASSED' AS result;

ROLLBACK;
