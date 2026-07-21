# HRM — โมดูลบริหารทรัพยากรบุคคล (HR ครบวงจร)

> โมดูล **HR สำหรับธุรกิจจิ๋ว/SME ≤10 คน** — ยุบ `payroll` เดิมเข้ามารวม + เพิ่ม การลา / เวลาทำงาน /
> เอกสาร / แฟ้มพนักงาน 360°. per-org (specific module), RLS, มาตรฐาน module-auth.
> Spec/contract เต็ม + Review Log: `.claude/module-factory/specs/hrm.md`

## ภาพรวม

`hrm` แทนที่ `payroll` ทั้งหมด (payroll ถูกปลดทิ้ง — ตาราง prod ว่างเปล่า ไม่มีข้อมูลให้ migrate).
เมนู 6 รายการ: **ภาพรวม · พนักงาน(+แฟ้ม360°) · เงินเดือน · การลา · เวลาทำงาน · ตั้งค่า(5 แท็บ)**.

- **Roles** (`module_members.module_role`): `owner` (เจ้าของ/ผู้ดูแล — อนุมัติจ่ายเงินเดือน), `hr` (ฝ่ายบุคคล — จัดการ/อนุมัติลา), `viewer` (ดูอย่างเดียว). owner+hr = canWrite.
- **สิทธิ์อนุมัติ/จ่ายเงินเดือน** (run → approved/paid) = **owner เท่านั้น** (`canApprovePayroll`).

## โครงสร้างโค้ด (code map)

| ชั้น              | ที่อยู่                                                                                                                                                                    |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| DB                | 10 ตาราง `hrm_*` (migration `20260625100000_hrm_core.sql`) + drop payroll (`20260626000000_drop_payroll_legacy.sql`)                                                       |
| ลงทะเบียน         | `lib/modules.ts` (`ALL_MODULES` hrm + `MODULE_MENUS.hrm`) · payroll ถูกลบ                                                                                                  |
| API               | `app/api/hrm/_lib.ts` (`requireHrmMember`/`canWriteHrm`/`canApprovePayroll`/`employeeInOrg`) + routes: employees·payroll·leave·time·settings·documents·dashboard (+`[id]`) |
| fetch logic (SSR) | `lib/hrm/*.ts` (employees/payroll/leave/time/settings/documents/dashboard + `payroll-calc.ts` + `types.ts`)                                                                |
| หน้า (per-org)    | `app/(hydrogen)/[orgSlug]/hrm/*` (server component + `requireHrmPage` guard + RLS → client view → API)                                                                     |
| menu              | `layouts/hydrogen/menu-items.tsx` (`buildHrmMenuItems`)                                                                                                                    |
| redirect          | `[orgSlug]/payroll/*` → `/hrm` (legacy URL ยังเข้าได้)                                                                                                                     |

### ตาราง `hrm_*` (org_id + RLS: SELECT=`is_org_member`, write=`is_org_admin`)

`hrm_employees` (360°) · `hrm_pay_items` · `hrm_funds` · `hrm_account_settings` · `hrm_payroll_runs` ·
`hrm_payslips` (denormalized, earnings_json/deductions_json) · `hrm_leave_types` · `hrm_leave_requests` ·
`hrm_attendance` (unique org+emp+date) · `hrm_documents`.

### การคำนวณเงินเดือน (`lib/hrm/payroll-calc.ts`, TS ล้วน ไม่มี RPC)

SSO = `min(base,เพดาน 15,000)×rate` (max 750, เฉพาะมี ssn) · PVD = `base×rate` · WHT (ภ.ง.ด.1) =
อัตราก้าวหน้าฐานสะสม 7,500/27,500/65,000 ÷12 · `computePayslip` → gross−deductions=net · employer_cost = earnings+sso_employer+pvd_employer.

## สถาปัตยกรรม (per-org, RLS — CONTEXT §5)

- หน้า = **server component** → `requireHrmPage(slug)` (resolve slug→org + `getModuleRoleForCurrentUser` + **RLS client**, super_admin→owner) → ดึง initial ผ่าน `lib/hrm/*` → ส่ง props ให้ client view. **ไม่ใช้ admin service-role กับ per-org data**.
- mutation = client view → `fetch('/api/hrm/*', Bearer token)` → route `requireHrmMember` + `canWriteHrm` + `setAuditContext` + service-role write → `router.refresh()`.
- access guard (sidebar) = `HydrogenLayout` redirect ถ้า module ไม่ enabled สำหรับ org.

## Provisioning runbook (go-live ที่ทำไปแล้ว — prod `zftnyipifpaiqzukiyzi`)

1. **migration #1** `hrm_core` (10 ตาราง + RLS) — applied.
2. **switch** `org_module_settings` `payroll`→`hrm` (4 org: jtacc/justme/p2psolutions/p2psupply). หมายเหตุ: justme `is_enabled=false` (payroll เดิมปิดอยู่ — คงสถานะเดิม) → 3 org ใช้ได้.
3. **seed `module_members`** (hrm ใช้ module_members ต่างจาก payroll เดิมที่ใช้ org-membership): org owner→hrm `owner`, admin→hrm `hr`.
4. **seed reference data** ต่อ org (idempotent): leave_types (ป่วย30/กิจ3/พักร้อน6/ไม่รับค่าจ้าง) · funds (ปกส.5/5 เพดาน15k, สำรองฯ3/3) · pay_items ระบบ (BASE/OT/SSO/WHT/PVD) · account_settings.
5. **migration #2** `drop_payroll_legacy` — DROP payroll\_\* (8) + hrm_records (ว่างเปล่า, zero data loss).

**เปิด hrm ให้ org เพิ่ม:** super_admin → `/admin` Modules เปิด hrm (no `forOrgSlugs`) + seed module_members + reference data (ตามข้อ 3-4).

## Rollback plan

- ปิดเร็ว (ไม่ลบข้อมูล): `org_module_settings.is_enabled=false` สำหรับ hrm ของ org นั้น.
- คืน payroll: payroll code ถูกลบ (commit revert) + ตาราง payroll\_\* ว่างเปล่าตอนลบ → คืนได้จาก migration #1 ของ payroll เดิมถ้าจำเป็น (ไม่มีข้อมูลหาย).

## ยังไม่ทำ (follow-up — out of scope รอบ Core)

- **AI จริง** (สรุปต้นทุน/ตรวจรอบ/ร่างหนังสือรับรอง) — prototype มี mock, production ถอดออก.
- **LINE** (แจ้งสลิป/เตือนวันสำคัญ/ยื่นลา) — แท็บตั้งค่า LINE = placeholder "เร็ว ๆ นี้".
- **PDF สลิป + storage bucket** · **cron เตือนวันสำคัญ** · **ผูก accounting** (journal entry).
- composite FK `(org_id, employee_id)` (ตอนนี้กันที่ API `employeeInOrg`) · unique `(org_id, employee_code)`.

## กับดักที่เจอ (แก้แล้ว)

- **payroll schema จริงต่าง spec**: tenant col = `organization_id` (hrm ใช้ `org_id`), normalized run_lines, มี accounting links → hrm สร้าง fresh ไม่ reuse.
- **hrm ใช้ `module_members`** (payroll ใช้ org-membership) → ต้อง seed members ตอน provisioning ไม่งั้นเข้าไม่ได้.
- **`.next/types` stale** หลังลบ prototype → `rm -rf .next/types/.../prototypes/hrm` หรือ rebuild.
