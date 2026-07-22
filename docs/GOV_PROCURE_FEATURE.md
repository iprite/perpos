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

---

## 8. แคตตาล็อกสินค้า AI (`gov_procure_catalog*`) — เอกสารเสนอราคาที่ AI ช่วยเติม

> **สถานะ (2026-07-22): โค้ดเสร็จบน branch `feat/gov-procure-catalog` · migration `20260722200000_gov_procure_catalog.sql` applied prod แล้ว · ยังไม่ push/merge/deploy.**
> contract เต็ม: [`.claude/feature-factory/specs/gov-procure-catalog.md`](../.claude/feature-factory/specs/gov-procure-catalog.md) (§5.9 = คำตัดสินสุดท้าย, override ทุกส่วนก่อนหน้า)

### 8.1 ภาพรวม + คุณค่า

ทุกซองเสนอราคางานราชการต้องแนบ "เอกสารแคตตาล็อกสินค้า" — เดิมทีมทำมือใน Word/Excel (หารูป หาสเปก เขียน bullet เอง) ใช้เวลาหลายวัน/ชุด และคุณภาพไม่สม่ำเสมอ

ฟีเจอร์นี้ให้ผู้ใช้ **paste รายการดิบ (ชื่อ+จำนวน+หน่วย) → AI เติมสเปก/bullet/ราคาอ้างอิงให้ทั้งชุด → คนตรวจ/แก้/ยืนยันทีละรายการ → export PDF 2 รูปแบบ (ตรงเอกสารจริงที่เคยยื่น)** — จากหลายวันเหลือหลักนาที ต่อชุด และมี **provenance ชัด** (AI เดา / คนยืนยัน / จากคลัง) กันข้อมูลมั่วหลุดถึงราชการ

- **ใครใช้:** owner/manager/staff (`canWrite`) เตรียมเอกสาร — staff แก้ราคาได้ด้วย (ต่างจาก order finance-lock, ดู §8.6 ข้อ 1) · viewer อ่าน/ดาวน์โหลดอย่างเดียว
- **คุณค่า:** ตัดงานคีย์ซ้ำ (paste 84 บรรทัดจบ) · AI enrich ~2–4 นาที/84 รายการ + สไตล์สม่ำเสมอทั้งเล่ม · หน้า review กันข้อมูลมั่วก่อนออกซอง · คลังสินค้าองค์กร (reuse ชื่อซ้ำ = ไม่จ่ายค่า AI ซ้ำ) · PDF 2 เทมเพลต + toggle ราคา ตรงรูปแบบเอกสารจริงที่เคยส่งลูกค้า · แนบเข้า order เดิมได้ (หรือเป็นเอกสารอิสระ)

### 8.2 สถาปัตยกรรม (flow วางรายการ → AI → ตรวจ → PDF)

```
[หน้า 1] /[orgSlug]/gov-procure/catalogs (list)
   └─ "+ สร้างชุดใหม่" ──▶ paste รายการดิบ (parse: ชื่อ<tab/2+ช่องว่าง>จำนวน<ช่องว่าง>หน่วย)
                              │
[หน้า 2] catalogs/[id] (ห้องทำงาน — pattern page ของ feature นี้)
   ├─ ตาราง/โหมด "อ่านเนื้อหา" — แก้ inline ทุกฟิลด์ (เนื้อหา+ราคา+รูป+จำนวน/หน่วย)
   ├─ "ให้ AI ช่วยเติม" ──▶ POST /enrich (สร้าง job, cap 300/job, active ≤2/org, งบ 1.5M token/วัน/org)
   │                          └─ client วน POST /enrich/run (chunk 8 รายการ, claim item-level
   │                             FOR UPDATE SKIP LOCKED, maxDuration=60) จนกว่า done/failed ครบ
   ├─ ยืนยันรายตัว / "ยืนยันทั้งหมดที่กรองอยู่" (bulk, server กันข้าม conf<0.6/queued/ไม่เคยเปิดอ่าน)
   ├─ อัปรูป (catalog-images, IDOR guard + signed URL ≤300s)
   ├─ อนุมัติชุด (`approved` — ไม่ต้องยืนยันครบ 100%)
   └─ export PDF (2 เทมเพลต) / แนบเข้า order / บันทึกเข้าคลัง (เฉพาะ human_verified)

[หน้า 3] catalogs/products (คลังสินค้า, ไม่มีเมนู — เข้าจากปุ่มในหน้า 1)
```

- **guard เดิมทั้งชุด** — หน้า = `requireGovProcurePage()`, API = `requireGovProcureMember`/`canWrite`/`canDelete`/`canManageSettings` (ไม่มี guard ใหม่)
- **ท่า async = chunked route ในแอป** (ไม่มี Cloud Run worker ใหม่) — claim ระดับ **item** (ไม่ใช่ job) ด้วย `FOR UPDATE SKIP LOCKED` กัน 2 คนกดพร้อมกันชนกัน · job row เป็น **header ของรอบ** (progress/token cost/`correlation_id`/1-active-per-catalog) ไม่ใช่ตัว claim จริง
- **self-heal ไม่ใช้ cron:** job ที่ `heartbeat_at` เก่ากว่า 10 นาทีและไม่มี item ค้าง `queued/running` → ปิดเป็น `completed`/`failed` เองตอน `GET /enrich` หรือโหลดหน้า workspace

### 8.3 Database — 5 ตารางใหม่ (applied prod, additive 100%)

| ตาราง                             | หน้าที่                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `gov_procure_catalogs`            | ชุดแคตตาล็อก 1 ชุด/1 ซอง — `order_id` **nullable** (เอกสารอิสระ), `template` (`table`\|`narrative`), `show_prices` (default false), `status` (state machine §8.4), `letterhead_snapshot` jsonb (snapshot ตอนสร้าง/เปลี่ยนบริษัท — export ใช้ snapshot เท่านั้น ไม่ผูกกับค่าปัจจุบันของ default)                                                                                                                                                                                                                                                                                                       |
| `gov_procure_catalog_items`       | รายการในชุด — `name_raw`(ที่ผู้ใช้ paste)/`name`/`spec_line`/`size_line`/`bullets`/`care_notes`/`caution_notes`(ขึ้น PDF)/`ai_warnings`(**ห้ามขึ้น PDF**)/`sub_items`/`qty`/`unit`/`category`/`image_path`(server-set only)/`unit_price_ref`/`price_min`/`price_max`/`price_basis`/`price_confidence`/`price_history`(jsonb append-only, ≤20 รายการล่าสุด)/`source`(`manual\|ai_draft\|human_verified\|library`)/`confidence`/`ai_note`/`verified_by`/`verified_at`/`viewed_at`/`enrich_state`(`idle\|queued\|running\|done\|failed`)/`enrich_claimed_at`/`enrich_job_id`/`enrich_error`/`product_id` |
| `gov_procure_products`            | คลังสินค้าองค์กร (reuse ครั้งหน้า) — `name_key` (GENERATED จาก `gov_procure_normalize_name()`, **UNIQUE (org_id, name_key)**), `last_unit_price`/`price_updated_at` (เตือนราคาล้าสมัย), `times_used`                                                                                                                                                                                                                                                                                                                                                                                                  |
| `gov_procure_catalog_jobs`        | header ของรอบ enrich — `status`, `total_items/done_items/failed_items`, `model`, `input_tokens/output_tokens` (cost log), `chunk_size` (default 8, ไม่รับจาก body), `heartbeat_at`, `correlation_id`, **partial unique `(catalog_id) where status in ('pending','processing')`** (กันสร้าง job ซ้อน)                                                                                                                                                                                                                                                                                                  |
| `gov_procure_catalog_letterheads` | ค่าตั้งต้นหัวจดหมายต่อบริษัท (**ไม่ใช่คอลัมน์ใน `gov_procure_settings`** — ดู §8.6 ข้อเหตุผล) — `unique (org_id, company)`                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |

- **RLS ทั้ง 5 ตาราง**: `select = is_org_member(org_id, auth.uid())` / `write = is_org_admin(org_id, auth.uid())` — role/field guard จริงอยู่ที่ API เหมือนตารางเดิมของโมดูล
- **22 index**, composite FK `(catalog_id|product_id|enrich_job_id, org_id)` — 2 ตัวหลัง (`product_id`, `enrich_job_id`) เป็น `DEFERRABLE INITIALLY DEFERRED` (ดู §8.6 ข้อ 2)
- function `gov_procure_normalize_name()` — `IMMUTABLE`, ใช้เป็น GENERATED column ของ `products.name_key`, grant `authenticated, service_role`
- **ไม่มี ALTER ตารางเดิมของ module แม้แต่จุดเดียว** (`gov_procure_orders`/`_attachments`/`_settings`/`_investors`/`_capital_flows`/`_line_pending` ไม่ถูกแตะ — เดิมมีแผน `ALTER gov_procure_settings ADD catalog_letterheads` แต่ยกเลิกเพื่อ ADDITIVE 100%) · **ไม่มี RPC ใหม่** (v1 ไม่ทำ fuzzy search — exact match ผ่าน `name_key` เท่านั้น) · **ไม่มี extension ใหม่**

**invariant สำคัญ:**

- `approved` **≠** ยืนยันครบ 100% — อนุมัติทั้งที่ยังมี `ai_draft` ได้ (ผ่าน dialog เตือน + PDF ติดลายน้ำ "ฉบับร่าง")
- **คลัง (`gov_procure_products`) รับเฉพาะรายการ `source='human_verified'`** — บังคับที่ API (`POST /products`) + unit test กันไม่ให้ `ai_draft` ไหลเข้าคลังอัตโนมัติ

### 8.4 State machine + `source` + guard matrix

```
draft ──(paste/import)──▶ draft ──("ให้ AI ช่วยเติม")──▶ enriching ──(job จบ/self-heal)──▶ review ──(อนุมัติทั้งชุด)──▶ approved
                                                                                 ▲                                    │
                                                                                 └──────────── (แก้ต่อ) ──────────────┘
```

- `enriching` ล็อกที่ **ระดับแถว** ไม่ใช่ทั้งหน้า — item ที่ `queued/running` disabled, `done/failed` แก้ได้ทันที (server บังคับจริง: `PATCH items/[itemId]` reject 409 เมื่อ item กำลัง enrich)
- แก้ฟิลด์เนื้อหาใด ๆ → `source` กลับเป็น `manual` + ล้าง `verified_by/at` เสมอ (ไม่ว่าค่าเดิมคืออะไร) · แก้เฉพาะราคา → **ไม่เปลี่ยน** `source`/`verified_*` (set `price_updated_by/at` + append `price_history`)

**`source` 4 ค่า:** `manual`(คนพิมพ์เอง) · `ai_draft`(AI เดา ยังไม่ตรวจ) · `human_verified`(คนกดยืนยันแล้ว) · `library`(ดึงจากคลัง)

**guard matrix ต่อ role (final, ต่างจาก order เดิม 1 จุด):**

| การกระทำ                                                     | owner | manager |          staff          |     viewer     |
| ------------------------------------------------------------ | :---: | :-----: | :---------------------: | :------------: |
| สร้าง/paste/แก้เนื้อหา+รูป+จำนวน/หน่วย                       |   ✓   |    ✓    |            ✓            |       ✗        |
| **แก้ราคา** (`unit_price_ref/price_min/price_max`)           |   ✓   |    ✓    |          **✓**          |       ✗        |
| สั่ง AI enrich (cap 300/job)                                 |   ✓   |    ✓    |            ✓            |       ✗        |
| ยืนยันรายการ/ยืนยันทั้งหมดที่กรอง/อนุมัติชุด                 |   ✓   |    ✓    |            ✓            |       ✗        |
| `show_prices` + export PDF (มี/ไม่มีราคา)                    |   ✓   |    ✓    |            ✓            | อ่าน/ดาวน์โหลด |
| แก้หัวจดหมาย**รายชุด** (snapshot)                            |   ✓   |    ✓    |            ✓            |       ✗        |
| แก้ **ค่าตั้งต้นหัวจดหมายของบริษัท** (`catalog_letterheads`) |   ✓   |    ✓    | ✗ (`canManageSettings`) |       ✗        |
| ลบชุด / ลบสินค้าคลัง / ลบหลายรายการพร้อมกัน                  |   ✓   |    ✓    |     ✗ (`canDelete`)     |       ✗        |

> **ข้อแตกต่างจาก order เดิมของโมดูล:** ราคาแคตตาล็อก **ไม่ใช่** `FINANCE_FIELDS` — เป็น decision ที่ผู้ใช้เคาะเอง (Q1 ตัวเลือก b: ทุกคนที่ `canWrite` รวม staff แก้ราคาได้ เพื่อความคล่องตัว) ชดเชยด้วย `price_history` append-only (20 รายการล่าสุด) + ป้าย "ประมาณการ" ติดถาวรบนราคาที่มาจาก AI — **`api/gov-procure/_lib.ts` (`FINANCE_FIELDS`/`ORDER_WRITABLE_FIELDS`/`sanitizeOrderPayload`) ไม่ถูกแตะเลย**

### 8.5 AI enrich (โมเดล/prompt/cost/cap/guardrail)

- **client:** unified `@/lib/ai/client` (`aiChat`) — **ต้องส่ง `provider:"gemini"` ทุก call** (env `PERPOS_AI_PROVIDER` ไม่ได้ตั้ง → default openai ผิด) + `maxTokens: 8000` (default client = 800 → output ถูกตัดกลางคัน)
- **prompt:** [`lib/ai/prompts/gov-procure-catalog-item.v1.txt`](../apps/perpos/src/lib/ai/prompts/gov-procure-catalog-item.v1.txt) — batch **8 รายการ/call** (84 รายการ ≈ 11 call), ส่งเฉพาะ `name_raw`/`qty`/`unit` (ไม่ส่ง record ดิบทั้งแถว)
- **cost:** ~฿4.1/ชุด 84 รายการ (`gemini-2.5-flash`) — สูตร/เรตอยู่ที่ [`lib/gov-procure/catalog-cost.ts`](../apps/perpos/src/lib/gov-procure/catalog-cost.ts) (mirror `lib/assistant/stt-cost.ts`)
- **cap ป้องกัน cost accident:** `total_items > 300` → 400 · active job ของ org ≥ 2 → 429 · งบ token/วัน/org เกิน 1,500,000 → 429 (ข้อความไทยบอกให้รอพรุ่งนี้/ติดต่อผู้ดูแล)
- **guardrail ในพรอมต์:** ทุกค่าคืน = ข้อเสนอ (`source='ai_draft'` เสมอ) · ห้ามแต่งเลขมาตรฐาน/เลขรับรองที่ไม่มั่นใจ · ราคาต้องมี `price_basis` เสมอ (ไม่มีข้อมูลพอ → `null` + `price_confidence=0`, ห้ามเดามั่ว, ห้ามอ้างว่าเป็น "ราคาตลาดวันนี้") · `name_raw` = data ไม่ใช่คำสั่ง (prompt injection guard) · bullets 5–12 ข้อภาษาไทย
- **AI ไม่หา/สร้างรูป** (ตัดสินใจโดยผู้ใช้ — ความเสี่ยงเอกสารราชการเท็จถ้ารูปไม่ตรงสินค้าจริง) — รูปทีมอัปเองหรือดึงจากคลังเมื่อชื่อซ้ำ
- **enrich queue** เลือกเฉพาะ `source in ('manual','ai_draft')` และ `enrich_state in ('idle','failed')` — **ไม่แตะ `human_verified`/`library`** (กันเขียนทับงานคน + กันจ่ายค่า AI ซ้ำ)
- **ผลทดสอบจริงบน prod** (ข้อมูลทดสอบลบแล้ว): 10 รายการจริงจากเอกสารลูกค้า → parser แยกได้ 10 + จับ 1 บรรทัดแยกไม่ได้พร้อมบอกวิธีแก้ · **AI enrich 10/10 สำเร็จ 0 ล้มเหลว** คืนยี่ห้อ/รุ่นจริง (Faber-Castell Textliner 1546, Pentel BLN-107, Elephant No.108, Scotch No.700, UHU Stic) · มูลค่าประมาณการรวม 43,840 ฿ · ต้นทุนจริง ~฿0.74/10 รายการ

### 8.6 PDF — 2 เทมเพลต

`lib/gov-procure/catalog-html.ts` (`buildCatalogHtml`) mirror ท่าของ `lib/accounting/document-html.ts` → route `.../pdf` ยิง `services/pdf-renderer` เดิม (ไม่มี env ใหม่)

| เทมเพลต              | ตรงเอกสารจริง                                                           | หัวจดหมาย                             | ราคา                                        |
| -------------------- | ----------------------------------------------------------------------- | ------------------------------------- | ------------------------------------------- |
| `table` (A, default) | ตาราง 6 คอลัมน์ (ลำดับ/ชื่อสินค้า/คำอธิบายสินค้า/จำนวน/หน่วย/รูปสินค้า) | ไม่มี                                 | `prices=1` เพิ่ม 2 คอลัมน์ ราคา/หน่วย + รวม |
| `narrative` (B)      | หัวข้อเลข + ย่อหน้า/รายการย่อย + วิธีการดูแลรักษา + ข้อควรระวัง         | มีทุกหน้า (จาก `letterhead_snapshot`) | `prices=1` เพิ่มบรรทัด "ราคา … บาท/หน่วย"   |

- ไม่มี ORIGINAL/COPY (ไม่ใช่เอกสารภาษี ม.86/4) · ไม่มีเลขหน้า (v1)
- รูปที่ยังไม่มี → กล่อง placeholder เส้นประ "รอรูปสินค้า"
- **ผลทดสอบจริง:** PDF เทมเพลตตาราง ออกได้จริง 60KB — 6 คอลัมน์ตรงต้นฉบับ, หัวตารางซ้ำทุกหน้า, กล่อง "รอรูปสินค้า", **ลายน้ำ "ฉบับร่าง — ยังมี 10 รายการที่ยังไม่ผ่านการตรวจสอบ" ท้ายทุกหน้า** (หายเองเมื่อยืนยันครบ, ไม่บล็อกดาวน์โหลด)
- `esc()` ครอบทั้ง text และ attribute context (`img src/alt/title`) · `letterhead_snapshot.logo_data_url` validate regex + cap ≤500KB ก่อนพิมพ์โลโก้

### 8.7 Code map

**API** (`apps/perpos/src/app/api/gov-procure/`):

| ไฟล์                                                                   | หน้าที่                                                                                                                                     |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `_catalog-lib.ts`                                                      | allowlist ของ catalog (`CATALOG_ITEM_WRITABLE_FIELDS`) + helper เฉพาะ feature — **ไม่แตะ `_lib.ts` เดิม**                                   |
| `catalogs/route.ts`, `catalogs/[id]/route.ts`                          | GET/POST list, GET/PUT/DELETE รายชุด (`PUT` รวม `show_prices`+`status='approved'` = `canWrite`)                                             |
| `catalogs/[id]/items/route.ts`, `.../items/[itemId]/route.ts`          | GET/POST (bulk paste-parse) / PATCH-DELETE รายรายการ                                                                                        |
| `.../items/[itemId]/verify/route.ts`, `.../items/verify-bulk/route.ts` | ยืนยันรายตัว / bulk (รับ filter descriptor ไม่ใช่ id ดิบ — resolve เองที่ server, กัน conf<0.6/queued/ไม่เคยเปิดอ่านเมื่อ `skipRisky=true`) |
| `catalogs/[id]/enrich/route.ts`, `.../enrich/run/route.ts`             | สร้าง/ดูสถานะ/ยกเลิก job · ประมวลผล 1 chunk (8 รายการ) ต่อ call                                                                             |
| `catalogs/[id]/pdf/route.ts`                                           | export PDF (`template=`, `prices=`)                                                                                                         |
| `catalog-images/route.ts`                                              | อัปโหลด/อ่านรูป (bucket `gov-procure` เดิม, prefix `catalogs/`/`products/` ใหม่)                                                            |
| `catalog-letterheads/route.ts`                                         | GET (member) / PUT (`canManageSettings`) ค่าตั้งต้นหัวจดหมายต่อบริษัท                                                                       |
| `products/route.ts`, `products/[id]/route.ts`                          | คลังสินค้า — GET/POST (upsert จาก item ที่ยืนยันแล้ว) / PATCH-DELETE                                                                        |

**lib** (`apps/perpos/src/lib/gov-procure/`): `catalog.ts` (types+query+`getCatalogItemStats`/`getCatalogListStats`) · `catalog-parse.ts` (paste/CSV→rows, pure) · `catalog-cost.ts` (เรตโมเดล+cap) · `catalog-products.ts` (`normalizeName`+match/upsert) · `catalog-html.ts` (PDF 2 เทมเพลต) · `catalog-ai.ts` (เรียก AI + fallback) · `catalog-product-list.ts` · prompt `lib/ai/prompts/gov-procure-catalog-item.v1.txt`

**หน้า** (`apps/perpos/src/app/(hydrogen)/[orgSlug]/gov-procure/catalogs/`):

| route                       | ไฟล์                                                                                                                                                                                                                                                            | หน้าที่                                                                       |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| `catalogs` (list)           | `page.tsx` + `_catalogs-client.tsx`                                                                                                                                                                                                                             | StatCard สรุป + filter + "+ สร้างชุดใหม่"                                     |
| `catalogs/[id]` (ห้องทำงาน) | `[id]/page.tsx` + `[id]/_catalog-workspace-client.tsx`                                                                                                                                                                                                          | pattern page ของ feature — ตาราง/โหมดอ่านเนื้อหา, progress AI, ยืนยัน, export |
| `catalogs/products` (คลัง)  | `products/page.tsx` + `products/_products-client.tsx`                                                                                                                                                                                                           | ค้น/แก้/ลบสินค้าในคลัง (ไม่มีเมนู — เข้าจากปุ่มในหน้า list)                   |
| shared                      | `_components/{badges,format,image-api,download}.ts(x)`, dialogs (`create-catalog-dialog`, `catalog-settings-dialog`, `save-to-library-dialog`, `ai-enrich-panel`, `export-dialog`, `item-dialog`, `paste-items-dialog`, `product-dialog`, `verify-bulk-dialog`) | badge/format/signed-image fetch + ทุก dialog ของ workflow                     |
|                             | `loading.tsx`                                                                                                                                                                                                                                                   | skeleton                                                                      |

**modules.ts entry + menu:** `MODULE_MENUS.gov_procure` แทรก `{ key:"catalogs", label:"แคตตาล็อกสินค้า" }` (`lib/modules.ts:335`, หลัง `orders` ก่อน `receivables`) + `buildGovProcureMenuItems` แทรก 1 รายการ icon `BookImage` (`layouts/hydrogen/menu-items.tsx:618-620`) — **insert 2 บรรทัดเท่านั้น ไม่แตะโครงเดิม**

### 8.8 กับดักที่แก้แล้ว

1. **CHECK แบบสมมาตร `(verified_by is null) = (verified_at is null)` + FK `on delete set null` = ลบ user ไม่ได้ทั้งระบบ** — ลบ user ที่เคย verify ไว้ → RI trigger set null ทั้งคู่ตามลำดับต่างกัน แล้วละเมิด CHECK กลางคัน (`/api/admin/users/delete` ล้ม) → แก้เป็นทิศทางเดียว `verified_by is null or verified_at is not null`
2. **composite FK หลายคอลัมน์ห้ามใช้ `ON DELETE SET NULL`** (จะ set `org_id` เป็น null ทั้งที่เป็น NOT NULL) → composite FK ใช้ `NO ACTION` + FK เดี่ยวใช้ `SET NULL` + **`DEFERRABLE INITIALLY DEFERRED`** ให้ลำดับ trigger แน่นอน ไม่ผูกกับลำดับ OID โดยบังเอิญ
3. **คอมเมนต์ SQL ที่มี `verified_*/` ปิดบล็อกคอมเมนต์กลางคัน** (`*/` ใน path) → migration พังแบบไม่ชัดสาเหตุ — ระวังเวลาเขียนคอมเมนต์อธิบายชื่อฟิลด์ที่มี `/`
4. **`PageShell.actions` เป็น `flex-shrink-0`** — ใส่ปุ่มเกิน 2 ตัวบีบหัวข้อจนตัวอักษรตกบรรทัดละตัว → ปุ่มเยอะ (หน้าห้องทำงาน) ต้องทำแถบเครื่องมือของตัวเองแยกจาก `PageShell.actions`
5. **AI คืน bullet พร้อมขีดนำหน้ามาเอง** (`"- ..."`) → เทมเพลตใส่ `"- "` ซ้ำเป็น `"- -"` ในเอกสารที่ยื่นราชการ → normalize ตัดเครื่องหมายนำหน้าทั้ง `bullets` และ `size_line` ก่อนเรนเดอร์
6. **`PERPOS_AI_PROVIDER` ไม่ได้ตั้งใน env → default = openai** และ `maxTokens` default ของ client = 800 → **ทุก call ของ catalog ต้องส่ง `provider:"gemini"`, `model`, `maxTokens:8000`** ชัดเจน ไม่งั้นยิงผิด provider หรือ output ถูกตัดกลางคัน (บั๊กเงียบ ไม่ throw)
7. **สวิตช์ "ข้ามรายการเสี่ยง" ฝั่ง UI ไม่ตรงกับที่ server ทำจริง** — UI บอกว่าข้ามรายการที่ไม่มีรูป/ราคา แต่ server bulk-verify ไม่ได้กันเงื่อนไขเดียวกัน → ผู้ใช้กดโดยเชื่อว่าปลอดภัย แล้วรายการที่ยังไม่ครบถูกประทับ `human_verified` → sync เงื่อนไข UI↔server ให้ตรงกันเป๊ะ (conf<0.6 / enrich_state queued-running / ไม่เคยเปิดอ่าน) + แสดง "ข้ามไว้ n" นับครบทุกเหตุผล ไม่ใช่แค่เหตุผลเดียว

### 8.9 ของที่ยังไม่ทำ (follow-up)

- ยังไม่ seed `gov_procure_catalog_letterheads` (เทมเพลต B ต้องมีหัวจดหมายก่อนใช้งานจริง — ปัจจุบัน 0 แถว ทั้งที่ API รองรับแล้ว)
- ยังไม่มี UI แก้หัวจดหมายรายชุด (route `catalog-letterheads` มีแล้ว แต่หน้าจอยังไม่ทำ)
- ตารางคลังสินค้ายังไม่โชว์ thumbnail (ต้องมี batch signed URL ของรูป product)
- พรีวิว A4 ในกล่องส่งออก (export dialog) ยังไม่มี
- fuzzy search ชื่อสินค้า (`pg_trgm` + RPC) เลื่อนเป็น v2 — v1 เป็น exact match ผ่าน `name_key` เท่านั้น
- **ยังไม่ push/merge branch `feat/gov-procure-catalog` · ยังไม่ deploy**

### 8.10 วิธี verify / test

```bash
cd apps/perpos && pnpm exec tsc --noEmit     # = 0 errors
pnpm lint                                     # ไม่มี error ใหม่
pnpm exec vitest run                          # 116 test ผ่าน (parse/AI/HTML escape/cost)
```

- **DB (production, applied):** Supabase MCP `list_tables` ยืนยัน 5 ตาราง + RLS 5/5 + 22 index + composite FK (2 ตัว `DEFERRABLE`) + `get_advisors(security)` ไม่มีคำเตือนใหม่
- **Smoke test end-to-end (ทำจริงบน prod แล้ว, ลบข้อมูลทดสอบแล้ว):** วาง 10 รายการจริง → parse → AI enrich 10/10 สำเร็จ → ตรวจ/ยืนยัน → export PDF เทมเพลตตาราง (60KB, ลายน้ำฉบับร่างถูก) — ดูรายละเอียดเต็มที่ §8.5/§8.6
- **graphify update** หลัง merge: `.venv/bin/python3 -m graphify update .`
