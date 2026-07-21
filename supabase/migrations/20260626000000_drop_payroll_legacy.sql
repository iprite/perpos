-- ─── Drop payroll legacy (module: payroll → ยุบเข้า hrm) ─────────────────────
-- Migration #2 of 2 ของการยุบ payroll → hrm (ดู 20260625100000_hrm_core.sql = #1)
-- payroll_* prod EMPTY (0 rows ทุกตาราง — สำรวจยืนยันก่อนทำ) → zero data loss
-- ทำ "หลัง" ถอด payroll code (registry/pages/lib/components) + provisioning (switch
-- org_module_settings payroll→hrm, seed module_members + reference data) เสร็จแล้ว
-- hrm_records = stub scaffold เดิม (ไม่เคยใช้) ลบทิ้งด้วย
DROP TABLE IF EXISTS public.payroll_run_line_items CASCADE;
DROP TABLE IF EXISTS public.payroll_run_lines CASCADE;
DROP TABLE IF EXISTS public.payroll_runs CASCADE;
DROP TABLE IF EXISTS public.payroll_account_settings CASCADE;
DROP TABLE IF EXISTS public.payroll_funds CASCADE;
DROP TABLE IF EXISTS public.payroll_pay_items CASCADE;
DROP TABLE IF EXISTS public.payroll_employees CASCADE;
DROP TABLE IF EXISTS public.payroll_departments CASCADE;
DROP TABLE IF EXISTS public.hrm_records CASCADE;
