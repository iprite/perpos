# P2P Group — โมดูลบริษัทโฮลดิ้ง (module `p2p_group`)

> คัมภีร์ฟีเจอร์สำหรับ agent/คนที่จะแตะโมดูลนี้ — **อ่านก่อนแก้ทุกครั้ง**
> contract ต้นทาง: [`.claude/module-factory/specs/p2p_group.md`](../.claude/module-factory/specs/p2p_group.md)
> org เจ้าของ: `p2pholding` (บริษัท พีทูพี โฮลดิ้ง จำกัด) · route `/[orgSlug]/p2p-group` · Phase 1 (2026-07-29)

---

## 1. โมดูลนี้ทำอะไร

บริษัทโฮลดิ้งไม่ได้ดำเนินธุรกิจเอง — งานของมันคือ **ถือหุ้น กำกับ และจัดสรรทุน** ข้ามบริษัทลูก
Phase 1 ครอบคลุม 7 หน้า:

| หน้า | ทำอะไร |
| --- | --- |
| `/p2p-group` | ภาพรวมกลุ่ม — KPI รวม + ผลรายบริษัทของงวด + ผังกลุ่ม (%ถือหุ้น) |
| `/companies` | ทะเบียนบริษัทในเครือ (ทุนจด, เลขนิติบุคคล, กรรมการ, รอบบัญชี) |
| `/financials` | ตัวเลขรายเดือนต่อบริษัท — กรอกเอง + ปุ่ม "ดึงจากระบบบัญชี" |
| `/consolidated` | งบรวมกลุ่ม (รวม → ตัดรายการระหว่างกัน → งบรวม) |
| `/investments` | เงินลงทุน & เงินปันผล + ROI |
| `/intercompany` | ธุรกรรมระหว่างบริษัท · สัญญาเงินกู้ · กระทบยอดสองฝั่ง |
| `/treasury` | บัญชีธนาคารทั้งกลุ่ม + ยอดคงเหลือ + เงินสดรวม |

**ยังไม่ทำ (Phase 2):** กำกับดูแล (มติที่ประชุม/ทะเบียนสัญญา) · ปฏิทิน compliance (ภ.ง.ด.50/51, ยื่นงบ DBD,
ประชุมสามัญ) · KPI/OKR ระดับกลุ่ม · **AI** · **LINE** · NCI/goodwill ตามมาตรฐาน TFRS · แปลงค่าเงินต่างประเทศ

---

## 2. Invariant ที่ห้ามพัง

1. **`org_id` ของทุกตาราง `p2pg_*` = org ของโฮลดิ้งเสมอ** — บริษัทลูกเป็น *แถว* ใน `p2pg_companies`
   ไม่ใช่ org ของตัวเอง (org ของบริษัทลูกอยู่ที่ `org_ref_id` เท่านั้น)
2. **`org_ref_id` ตั้งได้เฉพาะทาง DB/super_admin** — ไม่อยู่ใน `allowed` ของ API เลย
   ⇒ ผู้ใช้โมดูลผูกบริษัทกับ org ใดก็ได้ไม่ได้. **ห้ามเพิ่มเข้า `allowed` เด็ดขาด**: การผูกทำให้ระบบอ่านงบของ
   org นั้นผ่าน service-role ข้าม RLS ได้ = ช่องดูดงบข้ามองค์กรแบบเดียวกับ acc_firm SEC-1
3. **ตัวเลขเงินที่ยังไม่มีข้อมูล = `NULL` ไม่ใช่ `0`** — ถ้าเขียน 0 ลงไป กำไรขั้นต้นจะเท่ากับรายได้ →
   "อัตรากำไร 100%" ยกแถว แล้วผู้บริหารเลิกเชื่อระบบ (เจอจริงตอน QA รอบแรก — แก้ที่ `accounting-sync.ts`)
4. **สูตรทุกตัวอยู่ที่ [`lib/p2p-group/metrics.ts`](../apps/perpos/src/lib/p2p-group/metrics.ts) ที่เดียว** —
   ห้ามหน้าไหนคำนวณเอง (มีเทสคุมที่ `metrics.test.ts`)
5. **ทุกยอดรวมต้องแสดงฐานประชากร** ("จาก n/m บริษัท") — ไม่งั้นผู้ใช้เทียบตัวเลขคนละฐานแบบมั่นใจ
6. **รายได้ที่ดึงจากระบบบัญชีต้องใช้ `selectBillingDocuments`/`billingSign`** จาก
   `lib/accounting/sales-journal.ts` — กฎเดียวกับ auto journal ห้ามคิดเอง (ไม่งั้นเลขบนแดชบอร์ดขัดกับงบ)
7. **ตัวเลขอ่อนไหวถูก strip ที่ server** (`canSeeSensitive` + `stripSensitiveFinancial`) — ไม่ใช่ซ่อนที่ UI

---

## 3. สิทธิ์ (role matrix)

module roles: `owner` · `manager` · `viewer`

| | owner | manager | viewer |
| --- | --- | --- | --- |
| ทะเบียนบริษัท · ผังกลุ่ม · รายได้ · จำนวนพนักงาน | ✅ | ✅ | ✅ |
| กำไร/ต้นทุน/สินทรัพย์/ส่วนของผู้ถือหุ้น | ✅ | ✅ | ⛔ |
| เงินลงทุน · ปันผล · เงินกู้ระหว่างกัน · ธนาคาร/เงินสด · งบรวม | ✅ | ✅ | ⛔ |
| เพิ่ม/แก้/ลบ | ✅ | ✅ | ⛔ |
| ผูก `org_ref_id` | ⛔ | ⛔ | ⛔ (super_admin ทาง DB) |

บังคับ **3 ชั้น** — ชั้นล่างสุดสำคัญที่สุด:

1. **DB (ชั้นจริง)** — RLS SELECT ของ 7 ตารางอ่อนไหวต้องผ่าน `p2pg_has_money_access(org_id)`
   (= `module_members.module_role IN ('owner','manager')` หรือ super_admin) · viewer/คนที่ไม่ใช่สมาชิกโมดูล
   ได้ **0 แถว** แม้ยิง PostgREST ตรงด้วย token ตัวเอง
2. **API** — `sensitive: true` ใน `_configs.ts` → 403 · `stripSensitiveFinancial` สำหรับงบรายเดือน
3. **หน้า** — `requireP2pGroupMoneyPage` → `notFound()` สำหรับ 4 หน้าที่เป็นตัวเลขอ่อนไหวล้วน

**viewer อ่านงบรายเดือนได้ผ่าน view `p2pg_financials_basic` เท่านั้น** (มีแค่ `revenue`/`headcount`) —
`listFinancials(..., { basic: true })` · **ห้ามเพิ่มคอลัมน์อ่อนไหวเข้า view นี้เด็ดขาด**

> **กับดักที่เจอตอนแก้ (สำคัญมาก):** policy เดิมชื่อ `<t>_write` เป็น **`FOR ALL`** — และ "ALL" **รวม SELECT**
> ⇒ ต่อให้รัด `_select` แล้ว policy เขียนก็ยังเปิดทางอ่านอยู่ (policy แบบ permissive OR กัน)
> ⇒ ต้องแยกเป็น `_insert`/`_update`/`_delete` **ห้ามใช้ `FOR ALL` กับตารางที่มีการอ่านแบบมีเงื่อนไข**
> จับได้เพราะทดสอบสวมสิทธิ์ viewer จริงหลังแก้ ไม่ใช่เชื่อว่าแก้แล้วต้องหาย

---

## 4. Code map

```
supabase/migrations/20260729090000_p2p_group_holding.sql   8 ตาราง + RLS + seed 4 บริษัท
apps/perpos/src/lib/p2p-group/
  types.ts             enum/interface + canWriteP2pGroup/canSeeSensitive/stripSensitiveFinancial
  metrics.ts           สูตรทั้งหมด (grossProfit/ebit/netMargin/groupTotals/consolidate/loanOutstanding/…)
  metrics.test.ts      เทสกฎตัวเลข 15 เคส
  labels.ts            คำไทยของทุก enum + formatMoney/formatPct/formatThaiDate/formatThaiMonth
  queries.ts           fetch (RLS client) ใช้ร่วม SSR page + API
  accounting-sync.ts   ดึงตัวเลขจาก acc_* ข้าม org (service-role) — เส้นเดียวที่ข้าม org
apps/perpos/src/app/api/p2p-group/
  _lib.ts              guard + CRUD factory (handleList/Create/Update/Delete)
  _configs.ts          CollectionConfig ของทุก resource  ← ห้ามย้ายไป export จาก route.ts
  <resource>/route.ts + <resource>/[id]/route.ts
  financials/sync/route.ts   ดึงจากระบบบัญชี
apps/perpos/src/app/(hydrogen)/[orgSlug]/p2p-group/
  _components/{guard.ts, api.ts, month-filter.tsx, coverage.tsx}
  page.tsx (SSR) · companies · financials · consolidated · investments · intercompany · treasury
  loading.tsx
```

ลงทะเบียนเมนู: `lib/modules.ts` (`MODULE_MENUS.p2p_group` 7 รายการ) + `layouts/hydrogen/menu-items.tsx`
(`buildP2pGroupMenuItems`)

---

## 5. ตาราง (8)

`p2pg_companies` · `p2pg_financials` (UNIQUE company+period) · `p2pg_investments` · `p2pg_dividends` ·
`p2pg_loans` · `p2pg_intercompany` (CHECK from≠to) · `p2pg_bank_accounts` · `p2pg_bank_balances`
(UNIQUE account+date)

ทุกตาราง: RLS เปิด · SELECT = `is_org_member(org_id, auth.uid())` · write policy = `is_org_admin`
(backstop — สิทธิ์เขียนจริงบังคับที่ API ด้วย `canWriteP2pGroup` แล้วเขียนผ่าน service-role ตาม pattern tmc/hrm)

---

## 6. การดึงตัวเลขจากระบบบัญชี (hybrid)

`POST /api/p2p-group/financials/sync` body `{ period: "YYYY-MM-01" }`

- ดึงเฉพาะบริษัทที่มี `org_ref_id`
- **ไม่ทับ** แถวที่ `source='manual'` หรือ `is_locked=true`
- รายได้ = ยอด **ก่อน VAT** (`subtotal`) ของเอกสารที่ผ่าน `selectBillingDocuments` (ตัดฉบับร่าง/ยกเลิก/ใบที่
  convert มาแล้ว · ใบลดหนี้เป็นลบ) · ต้นทุน = `acc_purchase_documents` ที่ `posted`
- คืน `pulled[]` + `skipped[]` พร้อม `reasonLabel` **ครบทุกเหตุผล** (UI แสดงให้ผู้ใช้เห็น)
- ไม่มีเอกสารฝั่งไหน → เขียน `null` ไม่ใช่ 0

> **ข้อเท็จจริง ณ วันสร้าง:** บริษัทในเครือแทบไม่มีข้อมูลบัญชีในระบบ (`acc_documents` 0–3 ใบ, journal 0)
> ⇒ ช่วงแรกตัวเลขเกือบทั้งหมดมาจากการกรอกมือ — อย่าออกแบบ UI โดยสมมติว่ามีข้อมูล auto

---

## 7. กับดักที่แก้แล้ว (อย่าทำซ้ำ)

| อาการ | เหตุ | ทางแก้ |
| --- | --- | --- |
| `tsc` พังที่ `.next/types/app/api/**` อ่านไม่ออก (`Type ... not assignable to never`) | route.ts **export ค่าอื่นนอกจาก handler** (ตอนแรกวาง `*_CONFIG` ไว้ใน route.ts) | ย้ายไป `_configs.ts` · **route.ts export ได้เฉพาะ HTTP handler** |
| `tsc` ผ่านทั้งที่ผิด | ลบ `.next/types` แล้วรัน tsc → ด่านตรวจ route module ไม่ทำงาน | ให้ dev server compile route ก่อน (เปิดหน้า/ยิง API) แล้วค่อย `tsc` |
| กำไรขั้นต้น = รายได้ (อัตรากำไรลวง) | sync เขียน `cogs = 0` เมื่อไม่มีใบซื้อ | ไม่มีเอกสาร → `null` |
| ปุ่มในแถวที่คลิกได้เปิด dialog แก้ไขไปด้วย | `TableRow clickable` + ปุ่มในเซลล์ | `e.stopPropagation()` ที่ปุ่ม |
| ข้อความบอก "คลิกที่แถวเพื่อแก้ไข" แต่คลิกไม่ได้ | ลืมใส่ `clickable/onClick` ในตารางธุรกรรม | ใส่ให้ตรงกับที่ UI สัญญาไว้ |
| **ด่านสิทธิ์ viewer ข้ามได้ทั้งชุด** | RLS เป็น `is_org_member` เฉย ๆ — ด่านทั้งหมดอยู่ชั้นแอป | เพิ่ม `p2pg_has_money_access()` เข้า policy (รอบแรกแก้แล้ว**ยังไม่หาย** เพราะ `<t>_write` เป็น `FOR ALL` = รวม SELECT → ต้องแยก insert/update/delete) |
| อ้าง `company_id`/`bank_account_id` ข้าม org ได้ | FK คอลัมน์เดียว | composite FK `(id, org_id)` + `refs` ตรวจที่ API (ข้อความไทย) · `loan_id` คงเป็น FK เดี่ยว (SET NULL) → พึ่ง `refs` อย่างเดียว |

**ข้อยกเว้นที่ตั้งใจ (advisor จะเตือน — อย่าไล่ "แก้"):**
`p2pg_financials_basic` ขึ้น `security_definer_view` = จำเป็น (ต้องข้าม RLS ฐานถึงจะให้ viewer เห็นรายได้)
ปลอดภัยเพราะไม่มีคอลัมน์อ่อนไหว + กรอง `is_org_member` เอง + `security_barrier` + GRANT แค่ SELECT ·
`p2pg_has_money_access` เรียกผ่าน `/rest/v1/rpc` ได้ = จำเป็น (policy รันด้วยสิทธิ์ผู้เรียก) และคืนแค่ boolean
ของตัวผู้เรียกเอง (ไม่รับ `p_user`)

---

## 8. Provisioning / go-live

- migration `20260729090000_p2p_group_holding.sql` — **apply prod แล้ว** (2026-07-29)
- `org_module_settings`: `p2p_group` เปิดให้ `p2pholding` (`allowed_roles` = org-level
  `owner/admin/team_lead/team_member` — **ไม่ใช่ module role**)
- `module_members`: seed owner ของ p2pholding แล้ว (ไม่ seed = 403 ทุก API แม้ module เปิด)
- seed: 4 บริษัท (โฮลดิ้ง + 3 ในเครือ) พร้อม `org_ref_id` ผูกกับ org จริง — idempotent
- **ไม่มี** env/secret/bucket/cron/worker เพิ่ม
- **rollback**: `update org_module_settings set is_enabled=false where organization_id=<p2pholding> and module_key='p2p_group'`
  (ปิดการเข้าถึงทันที ไม่ลบข้อมูล)

## 9. สถานะการทดสอบ (2026-07-29)

`tsc` 0 · `pnpm lint` clean · `vitest` 1,081 ผ่าน (รวม 15 เคสใหม่ของ metrics) ·
QA บนเบราว์เซอร์ครบ 7 หน้า: sync ดึงจริงได้ (p2psupply 3,360 ฿ = 4,200 − 840 ใบลดหนี้ ตรงกฎสมุดรายวัน ·
ฉบับร่างไม่ถูกนับ) · manual override ไม่ถูกทับ · งบรวม 1,253,360 − 50,000 = 1,203,360 · ยอดกู้คงค้าง
2,000,000 − 500,000 = 1,500,000 · ROI 10.8% · ไม่มี scroll แนวนอนที่ 375px · **ทดสอบ PATCH ยัด
`org_ref_id`/`org_id` เข้ามา → ถูกเมิน ค่าเดิมไม่เปลี่ยน** · ข้อมูลทดสอบลบออกจาก prod แล้ว

**ยังไม่ได้ทดสอบสด:** เส้น `viewer` (org นี้มีผู้ใช้คนเดียวและเป็น super_admin ซึ่ง bypass เป็น owner เสมอ)
— การ strip ตัวเลขอ่อนไหวยืนยันจากโค้ดพาธ + guard เท่านั้น. ก่อนให้ viewer จริงเข้าใช้ ควรทดสอบด้วยบัญชีจริงหนึ่งรอบ
