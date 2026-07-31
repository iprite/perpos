-- ═══════════════════════════════════════════════════════════════════════════
-- Tenant-isolation + ด่านต้นทุน + invariant ของ just_me project loop
-- spec: .claude/feature-factory/specs/just-me-project-loop.md §4.6 / §4.3 / §4.5
-- migration ที่เทส: supabase/migrations/20260730170000_just_me_project_loop.sql
--
-- รันได้ทั้ง psql และ Supabase SQL editor — อยู่ใน transaction เดียว จบด้วย ROLLBACK
-- (ต้องรันด้วย role ที่เป็นเจ้าของตาราง เช่น postgres — มี ALTER TABLE ใน negative control)
--
--   psql "$DATABASE_URL" -f supabase/tests/just_me_project_loop_rls.test.sql
--
-- ผ่าน = ไม่มี exception และแถวสุดท้ายขึ้น 'ALL TESTS PASSED'
-- ═══════════════════════════════════════════════════════════════════════════
BEGIN;

DO $test$
DECLARE
  org_a   uuid := gen_random_uuid();
  org_b   uuid := gen_random_uuid();
  usr_m   uuid := gen_random_uuid();   -- manager ของ just_me ใน org A (เห็นต้นทุน)
  usr_v   uuid := gen_random_uuid();   -- viewer ของ just_me ใน org A (ห้ามเห็นต้นทุน)
  usr_b   uuid := gen_random_uuid();   -- manager ของ org B (ห้ามเห็นอะไรของ A)
  prj_a   uuid;
  prj_b   uuid;
  boq_a   uuid;
  bqi_a   uuid;
  pb_a    uuid;
  pr_a    uuid;
  pri_a   uuid;
  itm_a   uuid;
  bil_a   uuid;
  v_cnt   int;
  v_num   numeric;
BEGIN
  -- ══ fixtures (service-role / superuser context — RLS ไม่บังคับ) ═══════════
  INSERT INTO auth.users (id) VALUES (usr_m), (usr_v), (usr_b);
  INSERT INTO profiles (id, email, role, is_active) VALUES
    (usr_m, 'jm-test-m@example.invalid', 'user', true),
    (usr_v, 'jm-test-v@example.invalid', 'user', true),
    (usr_b, 'jm-test-b@example.invalid', 'user', true)
  ON CONFLICT (id) DO UPDATE SET role = 'user', is_active = true;

  INSERT INTO organizations (id, name, slug, created_by) VALUES
    (org_a, 'JustMe Test A', 'jm-test-a-' || substr(org_a::text, 1, 8), usr_m),
    (org_b, 'JustMe Test B', 'jm-test-b-' || substr(org_b::text, 1, 8), usr_b);

  INSERT INTO organization_members (organization_id, user_id, role) VALUES
    (org_a, usr_m, 'admin'),
    (org_a, usr_v, 'member'),
    (org_b, usr_b, 'admin');

  INSERT INTO module_members (org_id, module_key, user_id, module_role, is_active) VALUES
    (org_a, 'just_me', usr_m, 'manager', true),
    (org_a, 'just_me', usr_v, 'viewer',  true),
    (org_b, 'just_me', usr_b, 'manager', true);

  INSERT INTO just_me_projects (org_id, project_code, name, status, contract_amount, created_by)
    VALUES (org_a, 'JM-TEST-001', 'โครงการทดสอบ A', 'won', 1000000, usr_m)
    RETURNING id INTO prj_a;
  INSERT INTO just_me_projects (org_id, project_code, name, created_by)
    VALUES (org_b, 'JM-TEST-001', 'โครงการทดสอบ B', usr_b)
    RETURNING id INTO prj_b;

  INSERT INTO just_me_price_book (org_id, name, unit, labor_unit_cost, overhead_unit_cost, created_by)
    VALUES (org_a, 'ติดตั้งกล้อง CCTV', 'จุด', 500, 100, usr_m)
    RETURNING id INTO pb_a;

  INSERT INTO just_me_boqs (org_id, project_id, revision_no, status, title, created_by)
    VALUES (org_a, prj_a, 1, 'draft', 'BOQ rev.1', usr_m)
    RETURNING id INTO boq_a;

  INSERT INTO just_me_boq_items
    (org_id, boq_id, name, unit, qty, material_unit_cost, labor_unit_cost, overhead_unit_cost,
     margin_pct, margin_source, unit_price, amount, cost_amount, created_by)
  VALUES
    (org_a, boq_a, 'กล้อง CCTV 4MP', 'ตัว', 10, 2000, 500, 100, 20, 'company', 3120, 31200, 26000, usr_m)
  RETURNING id INTO bqi_a;

  INSERT INTO just_me_purchase_requests (org_id, pr_code, project_id, status, created_by)
    VALUES (org_a, 'PR-TEST-001', prj_a, 'draft', usr_m)
    RETURNING id INTO pr_a;

  INSERT INTO just_me_pr_items (org_id, pr_id, boq_item_id, name, unit, qty, estimated_unit_cost, created_by)
    VALUES (org_a, pr_a, bqi_a, 'กล้อง CCTV 4MP', 'ตัว', 10, 1900, usr_m)
    RETURNING id INTO pri_a;

  INSERT INTO just_me_inventory_items (org_id, name, code, unit)
    VALUES (org_a, 'กล้อง CCTV 4MP', 'JM-TEST-CAM', 'ตัว')
    RETURNING id INTO itm_a;

  -- รับของเข้าคลัง → trigger เดิมสร้าง/อัปเดต just_me_item_costs (avg_cost) ให้เอง
  INSERT INTO just_me_stock_movements
    (org_id, item_id, movement_type, quantity, unit_cost, created_by)
  VALUES (org_a, itm_a, 'receive', 10, 1800, usr_m);

  -- เบิกใช้เข้าโครงการ → trigger เดิมเติม unit_cost/total_cost ให้เอง (ห้ามเขียนเอง)
  INSERT INTO just_me_stock_movements
    (org_id, item_id, movement_type, quantity, project_id, boq_item_id, created_by)
  VALUES (org_a, itm_a, 'issue', 2, prj_a, bqi_a, usr_m);

  -- invariant ของคลังเดิมต้องไม่พังเพราะคอลัมน์ใหม่: avg_cost มาจาก trigger ไม่ใช่จากแอป
  SELECT avg_cost INTO v_num FROM just_me_item_costs WHERE item_id = itm_a;
  IF v_num IS DISTINCT FROM 1800 THEN
    RAISE EXCEPTION 'FIXTURE FAILED: avg_cost = % (คาด 1800 จาก trigger เดิม)', v_num;
  END IF;

  INSERT INTO just_me_project_billings (org_id, project_id, seq, title, amount, status, created_by)
    VALUES (org_a, prj_a, 1, 'งวดที่ 1', 300000, 'planned', usr_m)
    RETURNING id INTO bil_a;

  INSERT INTO just_me_project_costs (org_id, project_id, cost_kind, cost_date, description, amount, created_by)
    VALUES (org_a, prj_a, 'labor', CURRENT_DATE, 'ค่าแรงทีมติดตั้ง', 15000, usr_m);

  -- ══ T0: view ต้องไม่มีคอลัมน์ต้นทุนติดมาตั้งแต่โครงสร้าง ═════════════════
  SELECT count(*) INTO v_cnt FROM information_schema.columns
   WHERE table_schema = 'public'
     AND table_name = 'just_me_stock_movements_basic'
     AND column_name IN ('unit_cost', 'total_cost');
  IF v_cnt <> 0 THEN
    RAISE EXCEPTION 'T0 FAILED: just_me_stock_movements_basic มีคอลัมน์ต้นทุน % คอลัมน์', v_cnt;
  END IF;

  SELECT count(*) INTO v_cnt FROM information_schema.columns
   WHERE table_schema = 'public'
     AND table_name = 'just_me_boq_items_sell'
     AND column_name IN ('material_unit_cost','labor_unit_cost','overhead_unit_cost',
                         'cost_amount','margin_pct','margin_source');
  IF v_cnt <> 0 THEN
    RAISE EXCEPTION 'T0 FAILED: just_me_boq_items_sell มีคอลัมน์ต้นทุน/margin % คอลัมน์', v_cnt;
  END IF;

  SELECT count(*) INTO v_cnt FROM information_schema.columns
   WHERE table_schema = 'public'
     AND table_name = 'just_me_pr_items_basic'
     AND column_name IN ('estimated_unit_cost','selected_unit_cost');
  IF v_cnt <> 0 THEN
    RAISE EXCEPTION 'T0 FAILED: just_me_pr_items_basic มีคอลัมน์ต้นทุน % คอลัมน์', v_cnt;
  END IF;

  SELECT count(*) INTO v_cnt FROM information_schema.columns
   WHERE table_schema = 'public'
     AND table_name = 'just_me_projects_basic'
     AND column_name IN ('budget_cost','margin_pct','budget_revised_at');
  IF v_cnt <> 0 THEN
    RAISE EXCEPTION 'T0 FAILED: just_me_projects_basic มีคอลัมน์ต้นทุน/กำไร % คอลัมน์', v_cnt;
  END IF;

  -- contract_amount (ราคาขาย) ต้อง "มี" ใน view — ไม่งั้น viewer ใช้งานหน้าโครงการไม่ได้
  SELECT count(*) INTO v_cnt FROM information_schema.columns
   WHERE table_schema = 'public'
     AND table_name = 'just_me_projects_basic'
     AND column_name = 'contract_amount';
  IF v_cnt <> 1 THEN
    RAISE EXCEPTION 'T0 FAILED: just_me_projects_basic ไม่มีคอลัมน์ contract_amount';
  END IF;

  SELECT count(*) INTO v_cnt FROM information_schema.columns
   WHERE table_schema = 'public'
     AND table_name = 'just_me_boqs_basic'
     AND column_name = 'total_cost';
  IF v_cnt <> 0 THEN
    RAISE EXCEPTION 'T0 FAILED: just_me_boqs_basic มีคอลัมน์ total_cost';
  END IF;

  SELECT count(*) INTO v_cnt FROM information_schema.columns
   WHERE table_schema = 'public'
     AND table_name = 'just_me_boqs_basic'
     AND column_name = 'total_amount';
  IF v_cnt <> 1 THEN
    RAISE EXCEPTION 'T0 FAILED: just_me_boqs_basic ไม่มีคอลัมน์ total_amount (ยอดขาย)';
  END IF;

  -- ══ T1: manager (owner/manager ของ module) เห็นต้นทุนได้ ══════════════════
  EXECUTE format('SET LOCAL request.jwt.claims = %L',
                 json_build_object('sub', usr_m, 'role', 'authenticated')::text);
  SET LOCAL ROLE authenticated;

  SELECT count(*) INTO v_cnt FROM just_me_boq_items;
  IF v_cnt <> 1 THEN RAISE EXCEPTION 'T1 FAILED: manager เห็นบรรทัด BOQ % แถว (คาด 1)', v_cnt; END IF;

  SELECT count(*) INTO v_cnt FROM just_me_price_book;
  IF v_cnt <> 1 THEN RAISE EXCEPTION 'T1 FAILED: manager เห็น price book % แถว (คาด 1)', v_cnt; END IF;

  SELECT count(*) INTO v_cnt FROM just_me_stock_movements;
  IF v_cnt <> 2 THEN RAISE EXCEPTION 'T1 FAILED: manager เห็น movement % แถว (คาด 2)', v_cnt; END IF;

  SELECT count(*) INTO v_cnt FROM just_me_item_costs;
  IF v_cnt <> 1 THEN RAISE EXCEPTION 'T1 FAILED: manager เห็นฐานต้นทุนวัสดุ % แถว (คาด 1)', v_cnt; END IF;

  SELECT count(*) INTO v_cnt FROM just_me_project_costs;
  IF v_cnt <> 1 THEN RAISE EXCEPTION 'T1 FAILED: manager เห็นต้นทุนนอกคลัง % แถว (คาด 1)', v_cnt; END IF;

  -- manager ต้องอ่านตารางตรงได้ครบทุกคอลัมน์ (รวมฝั่งต้นทุนของโครงการ/BOQ)
  SELECT count(*) INTO v_cnt FROM just_me_projects WHERE contract_amount = 1000000;
  IF v_cnt <> 1 THEN RAISE EXCEPTION 'T1 FAILED: manager อ่าน just_me_projects ตรงไม่ได้ (% แถว)', v_cnt; END IF;

  UPDATE just_me_projects SET budget_cost = 26000 WHERE id = prj_a;
  SELECT budget_cost INTO v_num FROM just_me_projects WHERE id = prj_a;
  IF v_num IS DISTINCT FROM 26000 THEN
    RAISE EXCEPTION 'T1 FAILED: manager อ่าน/เขียน budget_cost ไม่ได้ (%)', v_num;
  END IF;

  SELECT count(*) INTO v_cnt FROM just_me_boqs;
  IF v_cnt <> 1 THEN RAISE EXCEPTION 'T1 FAILED: manager เห็น BOQ % แถว (คาด 1)', v_cnt; END IF;

  -- ══ T2: FK ข้าม org ถูกบล็อก (composite FK) ══════════════════════════════
  BEGIN
    INSERT INTO just_me_boqs (org_id, project_id, revision_no, status, created_by)
      VALUES (org_a, prj_b, 9, 'draft', usr_m);
    RAISE EXCEPTION 'T2 FAILED: สร้าง BOQ ใน org A ที่อ้างโครงการของ org B ได้';
  EXCEPTION WHEN foreign_key_violation THEN
    NULL;  -- ผ่าน
  END;

  BEGIN
    INSERT INTO just_me_project_billings (org_id, project_id, seq, amount, created_by)
      VALUES (org_a, prj_b, 9, 1000, usr_m);
    RAISE EXCEPTION 'T2 FAILED: สร้างงวดงานใน org A ที่อ้างโครงการของ org B ได้';
  EXCEPTION WHEN foreign_key_violation THEN
    NULL;  -- ผ่าน
  END;

  -- ══ T3: BOQ ที่ approved แก้/ลบไม่ได้ ════════════════════════════════════
  UPDATE just_me_boqs
     SET status = 'approved', approved_by = usr_m, approved_at = now(),
         total_cost = 26000, total_amount = 31200
   WHERE id = boq_a;

  BEGIN
    UPDATE just_me_boqs SET title = 'แอบแก้หลังอนุมัติ' WHERE id = boq_a;
    RAISE EXCEPTION 'T3 FAILED: แก้หัว BOQ ที่อนุมัติแล้วได้';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;

  BEGIN
    UPDATE just_me_boqs SET total_amount = 999999 WHERE id = boq_a;
    RAISE EXCEPTION 'T3 FAILED: แก้ยอด BOQ ที่อนุมัติแล้วได้';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;

  BEGIN
    UPDATE just_me_boq_items SET qty = 99 WHERE id = bqi_a;
    RAISE EXCEPTION 'T3 FAILED: แก้บรรทัด BOQ ที่อนุมัติแล้วได้';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;

  BEGIN
    DELETE FROM just_me_boq_items WHERE id = bqi_a;
    RAISE EXCEPTION 'T3 FAILED: ลบบรรทัด BOQ ที่อนุมัติแล้วได้';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;

  BEGIN
    DELETE FROM just_me_boqs WHERE id = boq_a;
    RAISE EXCEPTION 'T3 FAILED: ลบ BOQ ที่อนุมัติแล้วได้';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;

  -- ทางออกเดียวที่อนุญาต: ถูกแทนที่ด้วย revision ใหม่
  UPDATE just_me_boqs SET status = 'superseded' WHERE id = boq_a;
  SELECT count(*) INTO v_cnt FROM just_me_boqs WHERE id = boq_a AND status = 'superseded';
  IF v_cnt <> 1 THEN RAISE EXCEPTION 'T3 FAILED: ขยับ approved → superseded ไม่ได้'; END IF;

  -- ══ T4: PR ที่ approved ขึ้นไป แก้บรรทัดไม่ได้ (ยกเว้นยอดรับของ/ราคาที่เลือก) ══
  UPDATE just_me_purchase_requests
     SET status = 'approved', approved_by = usr_m, approved_at = now() WHERE id = pr_a;

  BEGIN
    UPDATE just_me_pr_items SET qty = 99 WHERE id = pri_a;
    RAISE EXCEPTION 'T4 FAILED: แก้ปริมาณบรรทัด PR ที่อนุมัติแล้วได้';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;

  BEGIN
    DELETE FROM just_me_pr_items WHERE id = pri_a;
    RAISE EXCEPTION 'T4 FAILED: ลบบรรทัด PR ที่อนุมัติแล้วได้';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;

  UPDATE just_me_pr_items SET received_qty = 4, selected_unit_cost = 1850 WHERE id = pri_a;
  SELECT received_qty INTO v_num FROM just_me_pr_items WHERE id = pri_a;
  IF v_num <> 4 THEN RAISE EXCEPTION 'T4 FAILED: รับของแล้วอัป received_qty ไม่ได้ (%)' , v_num; END IF;

  -- ══ T5: งวดที่วางบิลแล้ว ห้ามแก้ยอด ══════════════════════════════════════
  UPDATE just_me_project_billings
     SET status = 'invoiced', invoiced_at = now() WHERE id = bil_a;

  BEGIN
    UPDATE just_me_project_billings SET amount = 400000 WHERE id = bil_a;
    RAISE EXCEPTION 'T5 FAILED: แก้ยอดงวดที่วางบิลแล้วได้';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;

  -- แก้ฟิลด์ที่ไม่ใช่ยอดยังได้ (mark paid)
  UPDATE just_me_project_billings SET status = 'paid', paid_at = now() WHERE id = bil_a;

  RESET ROLE;
  RAISE NOTICE 'PART 1 (manager + invariant) PASSED';
END;
$test$;

-- ═══════════════════════════════════════════════════════════════════════════
-- PART 2 — ด่านต้นทุน (viewer / org อื่น) + negative control
-- อยู่ transaction เดียวกัน จึงหยิบ fixture เดิมกลับมาด้วย project_code/email
-- ═══════════════════════════════════════════════════════════════════════════
DO $test2$
DECLARE
  org_a  uuid;
  org_b  uuid;
  usr_v  uuid;
  usr_b  uuid;
  prj_a  uuid;
  v_cnt  int;
BEGIN
  SELECT id INTO usr_v FROM profiles WHERE email = 'jm-test-v@example.invalid';
  SELECT id INTO usr_b FROM profiles WHERE email = 'jm-test-b@example.invalid';
  SELECT id, org_id INTO prj_a, org_a FROM just_me_projects WHERE project_code = 'JM-TEST-001'
    AND name = 'โครงการทดสอบ A';
  SELECT org_id INTO org_b FROM just_me_projects WHERE name = 'โครงการทดสอบ B';

  -- ══ V1: viewer ยิงตรงต้องไม่เห็น "ตารางต้นทุน" เลยสักแถว ═════════════════
  EXECUTE format('SET LOCAL request.jwt.claims = %L',
                 json_build_object('sub', usr_v, 'role', 'authenticated')::text);
  SET LOCAL ROLE authenticated;

  SELECT count(*) INTO v_cnt FROM just_me_boq_items;
  IF v_cnt <> 0 THEN RAISE EXCEPTION 'V1 FAILED: DATA LEAK — viewer เห็นบรรทัด BOQ (ต้นทุน/margin) % แถว', v_cnt; END IF;

  SELECT count(*) INTO v_cnt FROM just_me_price_book;
  IF v_cnt <> 0 THEN RAISE EXCEPTION 'V1 FAILED: DATA LEAK — viewer เห็น price book % แถว', v_cnt; END IF;

  SELECT count(*) INTO v_cnt FROM just_me_pr_items;
  IF v_cnt <> 0 THEN RAISE EXCEPTION 'V1 FAILED: DATA LEAK — viewer เห็นบรรทัด PR % แถว', v_cnt; END IF;

  SELECT count(*) INTO v_cnt FROM just_me_purchase_requests;
  IF v_cnt <> 0 THEN RAISE EXCEPTION 'V1 FAILED: DATA LEAK — viewer เห็นใบขอซื้อ % แถว', v_cnt; END IF;

  SELECT count(*) INTO v_cnt FROM just_me_project_costs;
  IF v_cnt <> 0 THEN RAISE EXCEPTION 'V1 FAILED: DATA LEAK — viewer เห็นต้นทุนนอกคลัง % แถว', v_cnt; END IF;

  SELECT count(*) INTO v_cnt FROM just_me_work_categories;
  IF v_cnt <> 0 THEN RAISE EXCEPTION 'V1 FAILED: DATA LEAK — viewer เห็นหมวดงาน (margin) % แถว', v_cnt; END IF;

  -- ตารางที่มีต้นทุนปนอยู่บางคอลัมน์ → ยิงตรงต้องไม่เห็นเลย (ต้องอ่านผ่าน view `_basic`)
  SELECT count(*) INTO v_cnt FROM just_me_projects;
  IF v_cnt <> 0 THEN RAISE EXCEPTION 'V1 FAILED: DATA LEAK — viewer อ่าน just_me_projects ตรงได้ % แถว (budget_cost/margin_pct หลุด)', v_cnt; END IF;

  SELECT count(*) INTO v_cnt FROM just_me_boqs;
  IF v_cnt <> 0 THEN RAISE EXCEPTION 'V1 FAILED: DATA LEAK — viewer อ่าน just_me_boqs ตรงได้ % แถว (total_cost หลุด)', v_cnt; END IF;

  -- ของเดิมที่เพิ่งรัด: ประวัติคลัง (unit_cost/total_cost) + ฐานต้นทุนวัสดุ
  SELECT count(*) INTO v_cnt FROM just_me_stock_movements;
  IF v_cnt <> 0 THEN RAISE EXCEPTION 'V1 FAILED: DATA LEAK — viewer เห็น stock_movements (unit_cost) % แถว', v_cnt; END IF;

  SELECT count(*) INTO v_cnt FROM just_me_item_costs;
  IF v_cnt <> 0 THEN RAISE EXCEPTION 'V1 FAILED: DATA LEAK — viewer เห็น just_me_item_costs (avg_cost) % แถว', v_cnt; END IF;

  -- ══ V2: viewer ยังทำงานได้ผ่าน view ที่ไม่มีต้นทุน ═══════════════════════
  SELECT count(*) INTO v_cnt FROM just_me_boq_items_sell;
  IF v_cnt <> 1 THEN RAISE EXCEPTION 'V2 FAILED: viewer เห็น boq_items_sell % แถว (คาด 1)', v_cnt; END IF;

  SELECT count(*) INTO v_cnt FROM just_me_stock_movements_basic;
  IF v_cnt <> 2 THEN RAISE EXCEPTION 'V2 FAILED: viewer เห็น stock_movements_basic % แถว (คาด 2)', v_cnt; END IF;

  SELECT count(*) INTO v_cnt FROM just_me_pr_items_basic;
  IF v_cnt <> 1 THEN RAISE EXCEPTION 'V2 FAILED: viewer เห็น pr_items_basic % แถว (คาด 1)', v_cnt; END IF;

  SELECT count(*) INTO v_cnt FROM just_me_projects_basic;
  IF v_cnt <> 1 THEN RAISE EXCEPTION 'V2 FAILED: viewer เห็น projects_basic % แถว (คาด 1)', v_cnt; END IF;

  SELECT count(*) INTO v_cnt FROM just_me_boqs_basic;
  IF v_cnt <> 1 THEN RAISE EXCEPTION 'V2 FAILED: viewer เห็น boqs_basic % แถว (คาด 1)', v_cnt; END IF;

  -- view ต้องให้ค่าราคาขายที่ใช้งานได้จริง (ไม่ใช่ null ยกแถว)
  SELECT count(*) INTO v_cnt FROM just_me_projects_basic WHERE contract_amount = 1000000;
  IF v_cnt <> 1 THEN RAISE EXCEPTION 'V2 FAILED: projects_basic ไม่คืนมูลค่าสัญญาให้ viewer'; END IF;

  -- ══ V3: viewer อ่านงวดงาน/ไฟล์ได้ แต่เขียนไม่ได้ ═════════════════════════
  SELECT count(*) INTO v_cnt FROM just_me_project_billings;
  IF v_cnt <> 1 THEN RAISE EXCEPTION 'V3 FAILED: viewer เห็นงวดงาน % แถว (คาด 1)', v_cnt; END IF;

  BEGIN
    INSERT INTO just_me_projects (org_id, project_code, name, created_by)
      VALUES (org_a, 'JM-TEST-VIEWER', 'viewer แอบสร้าง', usr_v);
    RAISE EXCEPTION 'V3 FAILED: viewer สร้างโครงการได้';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;

  BEGIN
    UPDATE just_me_projects SET name = 'viewer แอบแก้' WHERE id = prj_a;
    IF FOUND THEN RAISE EXCEPTION 'V3 FAILED: viewer แก้ชื่อโครงการได้'; END IF;
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;

  -- ══ V4: manager ของอีก org เห็น 0 แถวทุกตาราง ═══════════════════════════
  RESET ROLE;
  EXECUTE format('SET LOCAL request.jwt.claims = %L',
                 json_build_object('sub', usr_b, 'role', 'authenticated')::text);
  SET LOCAL ROLE authenticated;

  SELECT count(*) INTO v_cnt FROM just_me_projects WHERE org_id = org_a;
  IF v_cnt <> 0 THEN RAISE EXCEPTION 'V4 FAILED: DATA LEAK — org B เห็นโครงการของ org A % แถว', v_cnt; END IF;

  SELECT count(*) INTO v_cnt FROM just_me_boq_items WHERE org_id = org_a;
  IF v_cnt <> 0 THEN RAISE EXCEPTION 'V4 FAILED: DATA LEAK — org B เห็นบรรทัด BOQ ของ org A % แถว', v_cnt; END IF;

  SELECT count(*) INTO v_cnt FROM just_me_boq_items_sell WHERE org_id = org_a;
  IF v_cnt <> 0 THEN RAISE EXCEPTION 'V4 FAILED: DATA LEAK — view รั่วข้าม org % แถว', v_cnt; END IF;

  SELECT count(*) INTO v_cnt FROM just_me_projects_basic WHERE org_id = org_a;
  IF v_cnt <> 0 THEN RAISE EXCEPTION 'V4 FAILED: DATA LEAK — projects_basic รั่วข้าม org % แถว', v_cnt; END IF;

  SELECT count(*) INTO v_cnt FROM just_me_boqs_basic WHERE org_id = org_a;
  IF v_cnt <> 0 THEN RAISE EXCEPTION 'V4 FAILED: DATA LEAK — boqs_basic รั่วข้าม org % แถว', v_cnt; END IF;

  SELECT count(*) INTO v_cnt FROM just_me_project_billings WHERE org_id = org_a;
  IF v_cnt <> 0 THEN RAISE EXCEPTION 'V4 FAILED: DATA LEAK — org B เห็นงวดงานของ org A % แถว', v_cnt; END IF;

  BEGIN
    INSERT INTO just_me_project_costs (org_id, project_id, cost_kind, cost_date, amount, created_by)
      VALUES (org_a, prj_a, 'other', CURRENT_DATE, 1, usr_b);
    RAISE EXCEPTION 'V4 FAILED: org B เขียนต้นทุนเข้าโครงการของ org A ได้';
  EXCEPTION WHEN insufficient_privilege OR foreign_key_violation THEN
    NULL;
  END;

  RESET ROLE;

  -- ══ NEG: negative control — ปิด RLS แล้วเทสต้อง "แดง" จริง ═══════════════
  --     พิสูจน์ว่า count = 0 ข้างบนมาจาก RLS ไม่ใช่เพราะไม่มีแถว/ไม่มี GRANT
  ALTER TABLE just_me_boq_items DISABLE ROW LEVEL SECURITY;
  ALTER TABLE just_me_projects  DISABLE ROW LEVEL SECURITY;

  EXECUTE format('SET LOCAL request.jwt.claims = %L',
                 json_build_object('sub', usr_v, 'role', 'authenticated')::text);
  SET LOCAL ROLE authenticated;

  SELECT count(*) INTO v_cnt FROM just_me_boq_items;
  IF v_cnt = 0 THEN
    RAISE EXCEPTION 'NEG FAILED: ปิด RLS แล้ว viewer ยังเห็น 0 แถว — แปลว่าเทส V1 เขียวหลอก (ไม่มีแถว/ไม่มี GRANT) ไม่ได้พิสูจน์ RLS';
  END IF;

  SELECT count(*) INTO v_cnt FROM just_me_projects;
  IF v_cnt = 0 THEN
    RAISE EXCEPTION 'NEG FAILED: ปิด RLS ของ just_me_projects แล้ว viewer ยังเห็น 0 แถว — เทส V1 ไม่ได้พิสูจน์ RLS';
  END IF;

  RESET ROLE;
  ALTER TABLE just_me_boq_items ENABLE ROW LEVEL SECURITY;
  ALTER TABLE just_me_projects  ENABLE ROW LEVEL SECURITY;

  -- เปิดกลับแล้วต้องมองไม่เห็นอีกครั้ง
  EXECUTE format('SET LOCAL request.jwt.claims = %L',
                 json_build_object('sub', usr_v, 'role', 'authenticated')::text);
  SET LOCAL ROLE authenticated;

  SELECT count(*) INTO v_cnt FROM just_me_boq_items;
  IF v_cnt <> 0 THEN
    RAISE EXCEPTION 'NEG FAILED: เปิด RLS กลับแล้ว viewer ยังเห็นบรรทัด BOQ % แถว', v_cnt;
  END IF;

  SELECT count(*) INTO v_cnt FROM just_me_projects;
  IF v_cnt <> 0 THEN
    RAISE EXCEPTION 'NEG FAILED: เปิด RLS กลับแล้ว viewer ยังเห็นโครงการ % แถว', v_cnt;
  END IF;

  RESET ROLE;
  RAISE NOTICE 'PART 2 (cost gate + tenant isolation + negative control) PASSED';
END;
$test2$;

SELECT 'ALL TESTS PASSED' AS result;

ROLLBACK;
