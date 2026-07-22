# คัมภีร์: จัดซื้อครุภัณฑ์ภาครัฐ (gov_procure)

> เอกสารอ้างอิงฉบับเต็มสำหรับ AI agents / devs ที่ทำงานต่อกับโมดูล `gov_procure`
> อัปเดตล่าสุด: 2026-07-14 · production แล้ว (Supabase + Vercel) — **ยกระดับแทน `b2g` เดิม** (cutover เสร็จแล้ว — b2g ปิดแล้ว, cron 2 ตัวตั้งแล้ว)
> contract + Review Log เต็ม (ทุกการตัดสิน/บทเรียนของ run นี้): [`.claude/module-factory/specs/gov_procure.md`](../.claude/module-factory/specs/gov_procure.md)

---

## 1. ภาพรวม

**gov_procure** = โมดูลบริหารงานจัดซื้อครุภัณฑ์/พัสดุให้หน่วยงานภาครัฐ-อปท (เทศบาล/อบต.) แบบ **end-to-end pipeline** สำหรับบริษัทตัวกลาง (89 Global Work, P2P Supply): เสนอราคา → เซ็นสัญญา → สั่งซื้อของ (ใช้ทุนหมุนเวียน) → ส่งมอบ → วางบิล/รับเช็ค → ปิดงาน+จ่ายคอมมิชชั่นทีมขาย

- **ใครใช้ (persona/role):**
  - **owner** ("พี่ดา" คุมเงินทุนหมุนเวียน) — เห็นพอร์ตรวม, เงินค้างรับ, กำไร realized vs pending, อนุมัติจ่าย
  - **manager** (หัวหน้าทีมขาย) — ดูแล pipeline ทั้งเส้น, สร้าง order, เลื่อน stage, กรอกการเงิน
  - **staff** (ทีมหน้างาน/จัดซื้อ) — อัปเดตวัน milestone, แนบสลิป/รูปเช็ค — **แก้ field การเงินไม่ได้** (field-lock บังคับที่ API)
  - **viewer** (ผู้ถือหุ้น/บัญชี) — read-only ทั้งโมดูล
- **คุณค่า:** เปลี่ยนจาก "flat spreadsheet clone" (b2g เดิม) เป็นเครื่องมือ workflow — เห็นว่า "งานไหนติดตรงไหน + เงินก้อนไหนค้างรับ" ในตาเดียว (kanban), เตือน SLA เงินค้างรับก่อนเสียหาย (cashflow), มี AI ช่วยสรุปพอร์ต/จับ margin ผิดปกติ, มี LINE เตือนอัตโนมัติ

---

## 2. สถาปัตยกรรม

```
[เว็บ] /[orgSlug]/gov-procure/* (per-org, specific module)
   ├─ requireGovProcurePage() (SSR guard, RLS) ─┐
   │                                             ▼
   ├─ page.tsx (server) ── SSR initial data ──► _<page>-client.tsx (mutation/poll)
   │                                             │
   └─ client เรียก /api/gov-procure/* (requireGovProcureMember + canWrite + finance field-lock)
                │
                ├─ orders / orders/[id] / orders/[id]/stage (CRUD + state machine)
                ├─ attachments (สลิป/รูปเช็ค → bucket gov-procure)
                ├─ summary (KPI aggregate)
                ├─ settings (SLA/%/LINE toggle ต่อ org)
                ├─ ai/{brief,anomaly} (rule คำนวณ → AI narrate ผ่าน @/lib/ai/client)
                └─ notify/{aging,weekly} (cron → LINE Flex push)
```

- **org-level specific module**: `forOrgSlugs:["p2p-x-89"]` — เปิดได้เฉพาะ org นี้ (upgrade แทน `b2g`)
- **guard**: หน้า = `requireGovProcurePage()` (mirror pattern hrm, SSR + RLS client) · API = `requireGovProcureMember` (module-auth, canWrite ตาม role)
- **6-stage pipeline (แกนของโมดูล)**: `quotation → contracted → procuring → delivered → paid → closed` — derive จาก milestone date แบบ hybrid (auto-suggest + manual override), `closed` = manual close เท่านั้น (คอมมิชชั่นเป็น step แยก ไม่ใช่เงื่อนไขปิดงาน)
- **field-level finance-lock (Q4)**: staff เขียน order ได้ (canWrite=true) แต่ API ตัดฟิลด์การเงิน (20 field ตัวเลขเงินล้วน) ทิ้งเงียบทั้ง POST/PUT ถ้าผู้เรียกเป็น staff — บังคับที่ server ไม่ใช่แค่ซ่อน UI

---

## 3. Database (Supabase `zftnyipifpaiqzukiyzi`)

### ตาราง

| ตาราง                       | หน้าที่                                                                                                                                                                                                                                                                                                                                  |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `gov_procure_orders`        | entity หลัก — 44 field แบ่งกลุ่ม A–G (พื้นฐาน/การเงิน/ทุนหมุนเวียน/แบ่งรายได้ภายใน89/คอมมิชชั่น/milestone/สถานะ) + `stage` (enum 6 ค่า) + `stage_manual_override` (bool) · **`duration_days` = derived เท่านั้น ไม่ใช่ column** (คำนวณจาก `receipt_date − contract_date` ตอนอ่าน)                                                        |
| `gov_procure_attachments`   | สลิป/รูปเช็ค แยกตาราง (order เดียวมีหลายไฟล์) — `kind` enum (`customer_change_slip`/`petty_cash_slip`/`commission_slip`/`cheque_photo`/`other`), `file_path` → bucket `gov-procure`, `org_id`+`order_id` FK                                                                                                                              |
| `gov_procure_investors`     | นักลงทุน (org_id, `profile_id` nullable, `name`, `share_pct`, is_active) — สัดส่วนใช้คำนวณส่วนแบ่งกำไร (ควรรวม 100%, UI เตือนถ้าไม่ครบ)                                                                                                                                                                                                  |
| `gov_procure_capital_flows` | ledger เงินทุน — `flow_type` 5 ชนิด (`contribution`/`allocation`/`return_to_pool`/`dividend`/`repayment`) + `amount`/`flow_date`/`investor_id`/`company`/`order_id`(optional) · CHECK `..._shape_chk` บังคับฟิลด์ตามชนิด (API mirror ด้วย `SHAPE`)                                                                                       |
| `gov_procure_settings`      | ตั้งค่าต่อ org (1 row/org, PK=`org_id`) — `sla_threshold`(default 30), `pct_customer_change/petty/operate`(default 10/5/10), `line_alert_enabled`/`line_weekly_enabled`/`line_event_paid`/`line_event_delivered`, `line_recipients`, **notify-state**: `last_aging_alert_at`/`last_aging_alert_key`/`last_weekly_sent_at` (กันสแปม cron) |

### RLS

- `SELECT` = `is_org_member(org_id, auth.uid())` — ทุกตารางในกลุ่ม
- `write` = `is_org_admin(org_id, auth.uid())` (ฝั่ง DB) + **field-level allowlist ต่อ role ที่ API layer** (สำคัญกว่า RLS สำหรับ field-lock — RLS คุมแค่ org isolation)
- `gov_procure_attachments.org_id` **ไม่มี composite-FK** ผูกกับ `orders.org_id` (integrity gap ที่รู้ตัว — RLS ยังปลอดภัยเพราะกรองที่ org_id ตัวเอง) → API เช็คเอง (`orderBelongsToOrg`) กัน IDOR ข้าม org ผ่าน attachment

### Migration (3 ไฟล์, applied prod ทั้งหมด)

| ไฟล์                                           | หน้าที่                                                                                                                                                                                   |
| ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `20260710120000_gov_procure_schema.sql`        | สร้าง 3 ตาราง + RLS + trigger `updated_at` + index (org_id, org_id+stage, org_id+company, qt_reference) — ตรง contract 100%, ไม่มี `duration_days` column (N1)                            |
| `20260710120100_gov_procure_data_migrate.sql`  | `INSERT...SELECT` จาก `b2g_orders` (21 แถว, org `p2p-x-89` เดียว) พร้อม `CASE` derive `stage` แบบ hybrid จาก `job_status`/milestone dates เดิม — **ไม่ DROP `b2g_orders`** (rollback ได้) |
| `20260710130000_gov_procure_notify_state.sql`  | เพิ่มคอลัมน์ notify-state ใน `gov_procure_settings` (anti-spam ของ cron aging/weekly)                                                                                                     |
| `20260722090000_gov_procure_add_companies.sql` | ขยาย `gov_procure_orders_company_chk` เป็น 4 บริษัท (เพิ่ม `ALPHA ENGINEERING`, `MAGISTATS TRADING`)                                                                                      |
| `20260722120000_gov_procure_capital.sql`       | **กองทุน/นักลงทุน** — `gov_procure_investors` + `gov_procure_capital_flows` (ledger 5 ชนิด) + RLS + shape CHECK                                                                           |
| `20260722160000_gov_procure_line_pending.sql`  | `gov_procure_line_pending` — คำสั่งจากกลุ่มที่รอกดยืนยัน (เงิน) · TTL 15 นาที · RLS deny-all                                                                                              |
| `20260722140000_gov_procure_line_group.sql`    | ผูก LINE group ทีมงาน/นักลงทุน — `line_group_id`/`line_group_name`/`line_group_bound_at`/`line_group_bound_by` ใน `gov_procure_settings` + unique index (1 กลุ่ม = 1 org)                 |

---

## 4. Code Map

### API (`apps/perpos/src/app/api/gov-procure/`)

| ไฟล์                                              | หน้าที่                                                                                                                                                                                                                                                                                          |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `_lib.ts`                                         | `requireGovProcureMember` (module-auth wrapper) + `sanitizeOrderPayload` (finance field-lock allowlist ต่อ role, ใช้ทั้ง POST/PUT)                                                                                                                                                               |
| `orders/route.ts`                                 | GET list (order by seq_no) / POST สร้าง (canWrite)                                                                                                                                                                                                                                               |
| `orders/[id]/route.ts`                            | PUT แก้ / DELETE ลบ (canWrite)                                                                                                                                                                                                                                                                   |
| `orders/[id]/stage/route.ts`                      | PATCH เลื่อน stage + set วันหมุด — endpoint แยกจาก order ปกติเพื่อ audit ชัด + trigger T3 LINE hook (try/catch เงียบ ไม่ block PATCH) · **`stage`/`stage_manual_override` ไม่อยู่ใน `ORDER_WRITABLE_FIELDS`** ของ POST/PUT ธรรมดา (ตั้งใจ เข้มกว่า spec literal — ต้องผ่าน endpoint นี้เท่านั้น) |
| `attachments/route.ts`                            | GET/POST/DELETE สลิป/รูปเช็ค — `orderBelongsToOrg` guard (กัน IDOR) + MIME allowlist (image JPEG/PNG/WebP/HEIC + PDF) + cap 10MB                                                                                                                                                                 |
| `summary/route.ts`                                | GET KPI aggregate (pipeline value, receivable, profit realized/pending, split 89-P2P) — คำนวณฝั่ง server                                                                                                                                                                                         |
| `settings/route.ts`                               | GET (member) / PUT (owner/manager เท่านั้น) — SLA/%/LINE toggle                                                                                                                                                                                                                                  |
| `capital/route.ts`, `capital/[id]/route.ts`       | GET ledger+นักลงทุน+ยอดคำนวณ (member ทุก role) / POST บันทึก / DELETE ลบ (owner/manager) — guard cross-org ทั้ง `investor_id` และ `order_id`                                                                                                                                                     |
| `investors/route.ts`                              | GET (member) / POST-PUT จัดการนักลงทุน (owner/manager)                                                                                                                                                                                                                                           |
| `ai/brief/route.ts`                               | Executive Brief (AI-1)                                                                                                                                                                                                                                                                           |
| `ai/anomaly/route.ts`                             | Anomaly/Margin Guard (AI-2)                                                                                                                                                                                                                                                                      |
| `notify/aging/route.ts`, `notify/weekly/route.ts` | cron endpoint (CronAuthGuard) → LINE push                                                                                                                                                                                                                                                        |

### lib (`apps/perpos/src/lib/gov-procure/`)

| ไฟล์               | หน้าที่                                                                                                                    |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------- |
| `types.ts`         | shared types (`GovProcureOrder`, enum stage, `ModuleRole` ฯลฯ) — reuse SSR page + API + client                             |
| `stage.ts`         | `deriveStage`/`validateTransition` (state machine hybrid, §4 ของ spec)                                                     |
| `orders.ts`        | `listOrders`/`getOrder` (fetch logic, reuse SSR+API)                                                                       |
| `attachments.ts`   | จัดการไฟล์แนบ (storage bucket `gov-procure`)                                                                               |
| `summary.ts`       | `computeSummary` + aging (SLA overdue)                                                                                     |
| `settings.ts`      | อ่าน/เขียน `gov_procure_settings`                                                                                          |
| `ai.ts`            | เรียก `@/lib/ai/client` (`aiChat`) สำหรับ AI-1/AI-2                                                                        |
| `anomaly.ts`       | rule detect (4 เกณฑ์) ก่อนส่งให้ AI narrate                                                                                |
| `line-group.ts`    | LINE group ทีมงาน/นักลงทุน — `bindGroup`/`unbindGroup`/`handleGovGroupCommand` + `groupTargetForOrg` (ปลายทาง push)        |
| `line-commands.ts` | คำสั่งบันทึกข้อมูลจากกลุ่ม — `/ลงขัน` `/สถานะ` `/งานใหม่` + `confirmPending` (postback `gpok:<id>`)                        |
| `capital.ts`       | กองทุน/นักลงทุน — fetch (`listInvestors`/`listCapitalFlows`) + `computeCapital` (pure) คืนยอดต่อบริษัท/ต่อนักลงทุน/กองกลาง |
| `line-cards.ts`    | Flex builders (T1–T4)                                                                                                      |
| `notify.ts`        | cron logic (anti-spam ผ่าน notify-state ใน settings)                                                                       |

### AI prompts (`apps/perpos/src/lib/ai/prompts/`)

- `gov-procure-brief.v1.txt` — Executive Brief
- `gov-procure-anomaly.v1.txt` — Anomaly/Margin Guard

### Pages (`apps/perpos/src/app/(hydrogen)/[orgSlug]/gov-procure/`)

| route                  | ไฟล์                                                                                               | หน้าที่                                                                           |
| ---------------------- | -------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| `` (dashboard)         | `page.tsx` + `_dashboard-client.tsx`                                                               | KPI (StatCard) → การ์ดเงินค้างรับ/overdue เด่น → pipeline summary → ปุ่ม AI brief |
| `pipeline`             | `pipeline/page.tsx` + `_pipeline-client.tsx`                                                       | kanban 6 lane, ปุ่ม/drag เลื่อน stage                                             |
| `orders`               | `orders/page.tsx` + `_orders-client.tsx`                                                           | ตาราง + filter + footer sum                                                       |
| `orders/[id]` (dialog) | `_components/detail-dialog.tsx`, `order-dialog.tsx`, `stage-move-dialog.tsx`, `ai-summary-box.tsx` | 4-tab detail, CRUD, เลื่อน stage, AI anomaly explain                              |
| `receivables`          | `receivables/page.tsx` + `_receivables-client.tsx`                                                 | aging list (empty = good-news tone)                                               |
| `reports`              | `reports/page.tsx` + `_reports-client.tsx`                                                         | กำไร realized/pending, split, export CSV                                          |
| `capital`              | `capital/page.tsx` + `_capital-client.tsx`                                                         | กองทุน — KPI กองกลาง, เงินอยู่ที่บริษัทไหน, ledger + บันทึกรายการ                 |
| `investors`            | `investors/page.tsx` + `_investors-client.tsx`                                                     | dashboard นักลงทุน — การ์ดรายคน, เปรียบเทียบ, ไทม์ไลน์เงินเข้า-ออก                |
| `settings`             | `settings/page.tsx` + `_settings-client.tsx` + `flex-preview.tsx`                                  | SLA/%/LINE toggle + preview Flex                                                  |
| shared                 | `_components/{guard,api,gov-provider,constants,format,money,badges,index}.ts(x)`                   | page guard, fetch wrapper, context provider, format helper                        |

### modules.ts entry + menu

- `apps/perpos/src/lib/modules.ts` — `ALL_MODULES` เพิ่ม `gov_procure` (`specific:true`, `forOrgSlugs:["p2p-x-89"]`, roles `owner/manager/staff/viewer` — canWrite = owner/manager/staff) + `MODULE_MENUS.gov_procure` (8 เมนู: dashboard/pipeline/orders/receivables/reports/**capital/investors**/settings)
- `apps/perpos/src/layouts/hydrogen/menu-items.tsx` — `buildGovProcureMenuItems` + context picker `gov-procure`

---

## 5. การเปิดใช้ (provisioning ที่ทำแล้วใน prod)

| รายการ                       | สถานะ                                                                                                                                                                                                                                                                                               |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| migration 3 ไฟล์             | ✅ applied prod (schema + data-migrate + notify-state)                                                                                                                                                                                                                                              |
| storage bucket `gov-procure` | ✅ สร้างแล้ว (private, **ไม่มี storage policy** — access ผ่าน API ที่เช็ค membership เท่านั้น ตาม security review)                                                                                                                                                                                  |
| `org_module_settings`        | ✅ เปิด `gov_procure` ให้ org `p2p-x-89` — **`is_enabled=true`, `allowed_roles=['owner','admin','team_lead','team_member']`** ⚠️ **นี่คือ org-level role ไม่ใช่ module role** (ดู §6 กับดักข้อ 1)                                                                                                   |
| `module_members`             | ✅ migrate จาก `b2g`: สมาชิก 1 คน `module_role='admin'`(drift ใน b2g เดิม) → **`'manager'`** (ตาม decision B0) — production เพิ่มสมาชิกใหม่ (staff role) ต้อง seed มือ                                                                                                                              |
| RPC grants                   | ไม่มี RPC ใหม่ในโมดูลนี้                                                                                                                                                                                                                                                                            |
| env/secrets                  | **ไม่มีใหม่** — ใช้ Supabase/LINE/GEMINI/CRON_SECRET ที่มีอยู่แล้ว                                                                                                                                                                                                                                  |
| cron 2 ตัว                   | ✅ ตั้งแล้ว (Cloud Scheduler, `asia-southeast1`) — `gov-procure-notify-aging` (`0 9 * * *` Asia/Bangkok → `POST /api/gov-procure/notify/aging`) + `gov-procure-notify-weekly` (`0 8 * * 1` Asia/Bangkok → `POST /api/gov-procure/notify/weekly`) ใช้ `CRON_SECRET` เดียวกับ `perpos-task-scheduler` |

### Rollback

`org_module_settings.is_enabled=false` สำหรับ `gov_procure` ที่ org `p2p-x-89` (ปิดเร็ว ไม่ลบข้อมูล) · `b2g_orders` ยังไม่ถูก DROP — เปิด b2g กลับมาใช้ได้ทันทีถ้าจำเป็น

### สถานะ b2g cutover

✅ **cutover เสร็จแล้ว (2026-07-14)** — `b2g` ถูกปิด (`is_enabled=false`) ที่ org `p2p-x-89`, เหลือ `gov_procure` เปิดตัวเดียว · ข้อมูลตรวจก่อนปิดแล้วว่า migrate ครบ (21 orders เท่ากันทั้งสองตาราง) · `b2g_orders` ยังไม่ DROP (เก็บไว้ rollback) — ถ้าต้อง rollback: เปิด `b2g` กลับ (`is_enabled=true`) ได้ทันที

---

## 6. กับดักที่แก้แล้ว / ข้อควรระวัง

1. **`org_module_settings.allowed_roles` = org-level role ไม่ใช่ module-level role** — เจอตอน QA (B6): seed ครั้งแรกใส่ module role (`owner/manager/staff/viewer`) แต่ `HydrogenLayout` gate + `getEnabledModulesForOrg` เทียบกับ **org-level role** (`owner/admin/team_lead/team_member`) → โมดูลถูกกรองทิ้งจากเมนู แม้ super_admin ก็เข้าไม่ได้ (redirect ไป b2g ก่อนถึง page guard เสีย). **แก้แล้ว**: ตั้ง `allowed_roles=['owner','admin','team_lead','team_member']` (ตรงกับ b2g และทุก sibling module) ✓ verify แล้ว. **สร้างโมดูล specific ใหม่ตัวถัดไป ต้องใช้ค่านี้เสมอ ห้ามเอา module role มาใส่**
2. **`gov_procure_attachments.org_id` ไม่มี composite-FK** ผูกกับ `gov_procure_orders.org_id` (แก้ไม่ทันตอน migration — integrity gap ที่รู้ตัว) → **API ต้องเช็คเอง** ด้วย `orderBelongsToOrg` ก่อน insert/query attachment เสมอ กัน IDOR ข้าม org ผ่านไฟล์แนบ
3. **finance-lock = 20 field ตัวเลขเงินล้วน** — `*_slip` (text status), transfer/payment dates **ไม่รวมอยู่ในชุด lock** (สลิปเป็น checklist ที่ staff กรอกได้, วันที่เป็นการบันทึกเหตุการณ์ไม่ใช่จำนวนเงิน). ชุด field ต้องตรงกันทั้ง 2 ฝั่ง: `FINANCE_FIELDS` ใน API (`_lib.ts`) กับ finance-lens ใน UI (`_components`) — ถ้าไม่ตรง UI จะโชว์ field ที่ API ตัดเงียบ (data ไม่บันทึกแต่ UI เข้าใจผิดว่าสำเร็จ)
4. **`duration_days` = derived เท่านั้น ไม่ stored** — คำนวณจาก `receipt_date − contract_date` ตอนอ่าน/แสดง เท่านั้น ห้ามเพิ่มเป็น column หรือ migrate ค่าจาก `b2g_orders.duration_days` (ของ b2g เดิมเป็น stored column แต่ contract ตัดสินใจเปลี่ยนเป็น derived เพื่อกันข้อมูล 2 แหล่งไม่ตรงกัน)
5. **`stage`/`stage_manual_override` เขียนได้ทาง `PATCH .../stage` เท่านั้น** — ไม่อยู่ใน `ORDER_WRITABLE_FIELDS` ของ POST/PUT ทั่วไป (เข้มกว่า spec literal โดยตั้งใจ) เพื่อให้ทุกการเปลี่ยน stage ผ่าน audit + T3 LINE hook ที่จุดเดียว
6. **`closed` = manual close เท่านั้น** — `deriveStage` ต้องไม่ treat `commission_payment_date` เป็นเงื่อนไข closed (คอมมิชชั่นเป็น step แยกตาม Q5 LOCKED) ต่อให้จ่ายคอมแล้ว stage ยังเป็น `paid` จนกว่าผู้ใช้กด "ปิดงาน" เอง
7. **รายชื่อบริษัทรับงาน = แหล่งเดียวที่ [`lib/gov-procure/types.ts`](../apps/perpos/src/lib/gov-procure/types.ts)** — `COMPANIES` (const array) + `COMPANY_DOT_CLASS` · เพิ่ม/ลดบริษัทต้องแก้ **2 ที่คู่กันเสมอ**: const นี้ + CHECK constraint `gov_procure_orders_company_chk` (migration ใหม่) — ถ้าแก้ข้างเดียว insert จะ 23514 หรือ dropdown จะโชว์ค่าที่ DB ไม่รับ · ห้าม hardcode `"89 Global Work"`/`"P2P Supply"` ใน UI/รายงาน/LINE card อีก (2026-07-22 ถอดออกหมดแล้ว → split/legend/filter iterate จาก `COMPANIES`)
8. **`module_members.module_role` ต้องเป็น 1 ใน 4 module role** (`owner/manager/staff/viewer`) — ค่าที่ drift มาจาก b2g เช่น `'admin'` **ไม่ throw** แต่ `canWriteGovProcure()`/`canEditFinanceGovProcure()` คืน false เงียบ ๆ → ผู้ใช้กลายเป็น read-only โดยไม่มี error (เจอ 2026-07-22 กับสมาชิกคนที่ 2 ที่ตกค้าง `'admin'` → แก้เป็น `'manager'` แล้ว) · **seed สมาชิกใหม่ต้องตรวจค่านี้เสมอ**
9. **กำไรของบริษัทเป็น derived เสมอ ห้ามเก็บใน ledger** — `computeCapital` คิดกำไรต่อบริษัทจาก `gov_procure_orders` (stage `paid`/`closed` = สุก, อื่น ๆ = pending) โดยใช้ `net_profit_89 ?? gross_profit` · ledger เก็บเฉพาะ **กระแสเงินสด** (ลงขัน/กระจาย/คืนทุน/ปันผล/คืนเงินต้น) — ถ้าเพิ่ม flow_type `profit_in` เมื่อไร กำไรจะมี 2 แหล่งขัดกันทันที (กับดักเดียวกับ `duration_days`)
10. **`poolBalance` ไม่หัก dividend/repayment** — เงินสองก้อนนี้จ่ายออกจาก**บริษัท** ไม่ผ่านกองกลาง (`poolBalance = ลงขันรวม − ทุนที่บริษัทถืออยู่สุทธิ`) · ถ้าไปหักซ้ำจะได้ยอดกองกลางติดลบผิด ๆ
11. **`SHAPE` ต้องตรง 3 ที่**: CHECK `gov_procure_capital_flows_shape_chk` (DB) · `SHAPE` ใน [api/gov-procure/capital/route.ts](../apps/perpos/src/app/api/gov-procure/capital/route.ts) · `SHAPE` ใน `_capital-client.tsx` — ไม่ตรงกัน = ฟอร์มส่งไปแล้ว DB ปฏิเสธ 23514
12. **LINE group: 1 org = 1 กลุ่ม (unique index)** — ผูกผ่านคำสั่ง `/ผูกกลุ่ม` ในกลุ่มเท่านั้น (คนสั่งต้องเป็น owner/manager ของโมดูล หรือ super_admin) · **กลุ่มที่ยังไม่ผูก บอทต้องเงียบสนิท** (webhook ตอบเฉพาะ `/ผูกกลุ่ม`) กันบอทพูดในกลุ่มที่ไม่เกี่ยว · ข้อความจากกลุ่ม **ไม่เข้า auto-provision** (ไม่สร้าง account ให้สมาชิกกลุ่มอัตโนมัติ) — branch อยู่ก่อนด่าน provision ใน [webhook](../apps/perpos/src/app/api/line/webhook/route.ts)
13. **push เข้ากลุ่มต้องแยกจาก multicast** — LINE multicast รับเฉพาะ `userId` ส่ง `groupId` ไม่ได้ → ใช้ `pushToGovTargets()` ([notify.ts](../apps/perpos/src/lib/gov-procure/notify.ts)) ที่ push กลุ่มแยก 1 ครั้ง + multicast รายบุคคล 1 ครั้ง · cron ใช้ค่า return (สำเร็จอย่างน้อย 1 ปลายทาง) ตัดสินว่าจะ mark notify-state ไหม — เดิม `if (!to.length) skip` ทำให้ org ที่มีแต่กลุ่ม (ไม่มีคนผูก LINE) ไม่เคยได้รับแจ้งเตือน
14. **คำสั่งเรื่องเงินจากกลุ่ม LINE ต้อง 2-step เสมอ** — `/ลงขัน` และ `/งานใหม่` เขียนลง `gov_procure_line_pending` ก่อน แล้วบันทึกจริงตอนกด postback `gpok:<id>` เท่านั้น · เช็คสิทธิ์ **2 ครั้ง** (ตอนพิมพ์ + ตอนกด — คนกดอาจไม่ใช่คนพิมพ์) · กันกดซ้ำด้วย `update … .is("consumed_at", null)` แบบ atomic แล้ว rollback `consumed_at` กลับเป็น null ถ้า insert จริงล้มเหลว · เงิน = owner/manager · stage/เปิดงาน = owner/manager/staff
15. **`/สถานะ` เขียนตรงผ่าน admin client ไม่ผ่าน `PATCH /orders/[id]/stage`** — ตั้งใจ เพื่อไม่ให้ยิง T3 กลับเข้ากลุ่มเดิมซ้ำกับข้อความตอบรับ (echo) · แลกกับการที่คำสั่งนี้ไม่ push แจ้งผู้รับรายบุคคล — ถ้าต้องการให้แจ้งด้วย ให้เรียก `pushToGovTargets` ตรงในคำสั่ง อย่าเปลี่ยนไปเรียก endpoint (จะได้ echo)
16. **module key ใหม่ ไม่ rename `b2g`** — สร้าง key `gov_procure` แยกต่างหาก (เลี่ยง FK-rename risk ใน `module_members`/`org_module_settings`) แล้ว migrate สมาชิกข้ามมาเอง

---

## 7. วิธี verify / test

```bash
cd apps/perpos && pnpm exec tsc --noEmit     # = 0 errors
pnpm lint                                     # clean
```

- **DB (production)**: Supabase MCP `list_tables`/`execute_sql` ยืนยัน 3 ตาราง + RLS + `org_module_settings` (`allowed_roles` ต้องเป็น org-level ตาม §6 ข้อ 1) + `module_members` seed ครบ
- **Smoke test**: เปิด `/<orgSlug=p2p-x-89>/gov-procure` ในฐานะ user org จริง (ไม่ใช่ super_admin bypass) — ตรวจ 7 หน้า:
  - dashboard: KPI ตรงยอด (pipeline value, เงินค้างรับ, overdue count) + ปุ่ม AI brief (fallback:true ถ้าไม่มี GEMINI key ก็ต้องไม่ error)
  - pipeline: 6 lane ครบ, เลื่อน stage แล้วการ์ดย้าย lane + sum อัปเดตสด
  - orders: filter/search + footer sum ตาม filter
  - detail dialog: 4 tab, staff เปิด tab การเงินต้องเห็น banner read-only + field disabled (20 field ตรง `FINANCE_FIELDS`)
  - receivables: เรียงตาม aging, overdue = icon+ข้อความ (ไม่ใช่พื้นแดงล้วน), empty state = tone บวก (ไม่มีเงินค้างรับเกินกำหนด = ข่าวดี)
  - reports: export CSV, split 89/P2P ด้วย SegmentedControl
  - settings: PUT จริง (owner/manager เท่านั้น), Flex preview mock ไม่ยิงจริง
- **cron manual trigger** (หลังตั้ง Cloud Scheduler):
  ```bash
  curl -X POST https://app.perpos.ai/api/gov-procure/notify/aging \
    -H "Authorization: Bearer $CRON_SECRET"
  curl -X POST https://app.perpos.ai/api/gov-procure/notify/weekly \
    -H "Authorization: Bearer $CRON_SECRET"
  ```
- **get_advisors(security)** — รันหลังแก้ RLS/migration ใด ๆ เพื่อยืนยันไม่มีคำเตือนใหม่
- **graphify update** หลังเพิ่ม/ย้ายโมดูล: `.venv/bin/python3 -m graphify update .`
