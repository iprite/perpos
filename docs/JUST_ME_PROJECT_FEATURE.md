# Just Me — ระบบบริหารโครงการ full loop (module `just_me`)

> คัมภีร์ฟีเจอร์สำหรับ agent/คนที่จะแตะส่วนโครงการของโมดูลนี้ — **อ่านก่อนแก้ทุกครั้ง**
> contract ต้นทาง: [`.claude/feature-factory/specs/just-me-project-loop.md`](../.claude/feature-factory/specs/just-me-project-loop.md)
> org เจ้าของ: `justme` · route `/[orgSlug]/just-me/*` · migration [`20260730170000_just_me_project_loop.sql`](../supabase/migrations/20260730170000_just_me_project_loop.sql) (apply prod แล้ว 2026-07-30)
> ของเดิมในโมดูลเดียวกันที่ **ไม่ได้** อยู่ในเอกสารนี้: เวลาทำงาน/ค่าเดินทาง (`clock-in-out`, `travel-claims`) และคลังสินค้า (`inventory`) — เอกสารนี้พูดถึงเฉพาะส่วน "โครงการ" ที่ต่อยอดจากคลัง

---

## 1. โมดูลนี้ทำอะไร + ใครใช้

จัสเอ็มอีเป็นผู้รับเหมางานระบบ (ไฟฟ้า/CCTV/เดินท่อ) — เงินหายระหว่างทางเพราะ "ถอดราคาไว้อย่าง ซื้อจริงอีกอย่าง เบิกใช้จริงอีกอย่าง"
ฟีเจอร์นี้ปิดวงจรตั้งแต่สำรวจหน้างานจนวางบิล ให้ตัวเลข **งบ / ใช้จริง / ผูกพัน / กำไรคาดการณ์** อยู่บนหน้าจอเดียว

| persona (module role)                 | ใช้ทำอะไร                                                                                             | เห็นต้นทุน/กำไรไหม                                  |
| ------------------------------------- | ----------------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| **owner** (เจ้าของ)                   | อนุมัติ BOQ · อนุมัติ PR · เลือกผู้ขาย · ออกใบเสนอราคา/ใบแจ้งหนี้ · ตั้งค่า margin/แจ้งเตือนของบริษัท | ✅ ทั้งหมด                                          |
| **manager** (ผู้จัดการโครงการ/ธุรการ) | สร้างโครงการ · ถอด BOQ · ทำ PR · ใส่ใบเสนอราคาผู้ขาย · รับของ · บันทึกความคืบหน้า/ต้นทุนนอกคลัง       | ✅ ทั้งหมด                                          |
| **viewer** (ช่าง/ผู้รับเหมาช่วง)      | ดูโครงการ + ปริมาณงานตาม BOQ + ไฟล์แบบ + งวดงาน                                                       | ❌ **ไม่เห็นเลย** (ด่านอยู่ที่ DB ไม่ใช่แค่ซ่อน UI) |

> role ทั้ง 3 เป็นของเดิมของโมดูล (`lib/modules.ts:132-147`) — **ห้ามปั้น role ใหม่**
> `viewer` มีอยู่จริงเพราะผู้รับเหมาช่วงเข้าระบบได้ (decision ผู้ใช้ Q6) ⇒ ทุกครั้งที่เพิ่มคอลัมน์ต้นทุน ต้องคิดถึง viewer เสมอ

### flow เต็มเส้น (กดไล่ได้จริง)

```
 1. สำรวจ       สร้างโครงการ (status=survey) → อัปรูปหน้างาน/แบบ เข้า bucket private `just_me_files`
 2. ถอด BOQ     revision 1 (draft) → เพิ่มบรรทัดจากราคามาตรฐาน (auto เติมต้นทุน 3 ก้อน + resolve margin)
 3. อนุมัติ BOQ  freeze ฉบับนั้น + เขียน projects.budget_cost (+ contract_amount ถ้ายังว่าง)       → status=boq
 4. เสนอราคา    "ออกใบเสนอราคา" → POST /api/accounting/documents (doc_type=quotation)              → status=quoted
                เก็บ quotation_document_id · ส่งลูกค้าผ่านลิงก์ /d/<token> ของ accounting
 5. ได้งาน      กด "ได้งาน" → status=won → ตั้งงวดงาน (project_billings) ตามสัญญา
 6. ขอซื้อ (PR) เลือกบรรทัด BOQ → PR (pr_items.boq_item_id ผูกกลับ) → submit → owner approve
                ⛔ ยอดสะสมต่อบรรทัด BOQ เกิน = ต้องมีเหตุผลกำกับ (over_budget_reason)
 7. เทียบราคา   ใส่ใบเสนอราคาผู้ขาย 2–3 เจ้า → ตารางเทียบไฮไลต์ต่ำสุด (+ AI สรุปให้) → "เลือกเจ้านี้"  → status=ordered
 8. รับของ      POST .../receive → stock_movements(receive) → trigger คลังคิด avg_cost → received_qty เพิ่ม
                → PR = partially_received / received (คิดจาก DB เท่านั้น)
 9. เบิกใช้     หน้าคลัง แท็บ "เบิกโอน" เลือกโครงการ → movement `issue` + project_id (+boq_item_id)
                = ต้นทุนวัสดุจริงของโครงการ (total_cost มาจาก trigger)
10. เทียบงบ     แท็บ "ใช้จริง" + หน้า `project-reports`: งบ vs ใช้จริง vs ผูกพัน vs %คืบหน้า
                ค่าแรง/ผู้รับเหมาช่วง/ขนส่ง บันทึกที่ `just_me_project_costs`
11. วางบิล      งวดถึงกำหนด → "ออกใบแจ้งหนี้" (invoice/tax_invoice) → invoice_document_id → status=invoiced → paid
12. ปิดงาน      completed → closed (กำไรจริง = สัญญา − ต้นทุนจริง)
```

**ระบบสร้างให้เอง:** `project_code`/`pr_code` (ต่อ org ต่อปี พ.ศ. — `insertWithGeneratedCode` ใน [api/just-me/\_lib.ts:251](../apps/perpos/src/app/api/just-me/_lib.ts)) · ต้นทุนวัสดุจาก `avg_cost` · `unit_price` จากต้นทุน+margin · baseline งบตอน approve BOQ · `received_qty`/สถานะ PR ตอนรับของ · เลขเอกสารภาษี (RPC ของ accounting)
**ยังต้องกดเอง (ตั้งใจ):** อนุมัติ BOQ · อนุมัติ PR · เลือกผู้ขาย · ออกเอกสารภาษี · mark ว่าได้งาน/ปิดงาน

---

## 2. ⛔ Invariant ที่ห้ามพัง

> อ่านหัวข้อนี้ให้จบก่อนแก้โค้ดใด ๆ — ทุกข้อมี "พังแล้วเกิดอะไร" กำกับ เพราะผลลัพธ์คือเงินจริงของเจ้าของกิจการ

### 2.1 ด่านต้นทุนอยู่ที่ DB **และ** ที่ API (สองชั้น ขาดชั้นไหนก็รั่ว)

- helper `just_me_has_cost_access(p_org)` (SECURITY DEFINER, ใช้ `auth.uid()` ภายใน — **ห้ามเพิ่มพารามิเตอร์ `p_user`**) = owner/manager ของ module `just_me` หรือ super_admin — [migration:29-54](../supabase/migrations/20260730170000_just_me_project_loop.sql)
- ตารางที่ **SELECT ตรงต้องผ่าน cost-access** (10 ตาราง): `just_me_projects` · `just_me_boqs` · `just_me_boq_items` · `just_me_price_book` · `just_me_work_categories` · `just_me_purchase_requests` · `just_me_pr_items` · `just_me_vendor_quotes` · `just_me_vendor_quote_items` · `just_me_project_costs` (+ รัดของเดิม `just_me_item_costs`, `just_me_stock_movements`)
- viewer อ่านผ่าน **5 view เฉพาะฝั่งขาย** (`security_invoker=false, security_barrier=true`, กรอง `is_org_member` เอง, `REVOKE FROM public/anon` + `GRANT SELECT TO authenticated`):
  `just_me_projects_basic` · `just_me_boqs_basic` · `just_me_boq_items_sell` · `just_me_pr_items_basic` · `just_me_stock_movements_basic`
  **ห้ามเพิ่มคอลัมน์ต้นทุนเข้า view เหล่านี้เด็ดขาด** (มี `COMMENT ON VIEW` เตือนไว้ทุกตัว)
- ⚠️ **route ของ just_me ใช้ service-role client (bypass RLS)** ⇒ RLS ไม่ช่วยที่ชั้น API เลย → **ทุก response ต้องผ่าน `stripCost()`/`stripCostList()`** จาก [api/just-me/\_lib.ts:89-154](../apps/perpos/src/app/api/just-me/_lib.ts)
  `COST_FIELDS` (39 คีย์) คือ **แหล่งเดียว** ของนิยาม "คอลัมน์ต้นทุน" — เพิ่มคอลัมน์ต้นทุนที่ไหนก็ตาม **ต้องมาเติมที่นี่** ไม่งั้นเงียบ ๆ หลุดออก API
  มีเทสคุมที่ [`api/just-me/cost-strip.test.ts`](../apps/perpos/src/app/api/just-me/cost-strip.test.ts)
- **พังแล้วเกิดอะไร:** ผู้รับเหมาช่วงที่เป็น `viewer` ยิง PostgREST ตรง (หรืออ่าน JSON ของ API) แล้วเห็นต้นทุน/margin ของเจ้าของ → ต่อรองราคาย้อนกลับได้ทั้งบริษัท

### 2.2 policy ต้องแยก `_select`/`_insert`/`_update`/`_delete` — **ห้าม `FOR ALL`**

permissive policy **OR กัน** ⇒ policy `_write FOR ALL` ที่เงื่อนไขหลวมกว่า จะเปิดช่อง **อ่าน** ย้อนกลับทันที แม้ `_select` จะรัดแล้ว
migration นี้จึง DROP `just_me_item_costs_write` / `just_me_stock_movements_write` เดิม แล้วสร้าง insert/update/delete แยก **โดยคง predicate การเขียนเดิมเป๊ะ** (ADDITIVE — เปลี่ยนแค่ "ใครอ่านได้") — [migration:517-566](../supabase/migrations/20260730170000_just_me_project_loop.sql)

### 2.3 BOQ อนุมัติแล้วแก้ไม่ได้ · 1 โครงการมี approved ได้ใบเดียว

- trigger `just_me_boq_freeze` (BEFORE UPDATE OR DELETE, **ทุกคอลัมน์** ไม่ใช่ `UPDATE OF`) — ฉบับ `approved` มีทางออกเดียวคือ `→ superseded` โดยไม่แตะฟิลด์อื่นเลย · ฉบับ `superseded` แก้ไม่ได้ · **ลบ BOQ ที่เคยอนุมัติไม่ได้** (เก็บเป็นประวัติ)
- trigger `just_me_boq_item_freeze` (BEFORE INSERT/UPDATE/DELETE) — เพิ่ม/แก้/ลบบรรทัดได้เฉพาะตอนแม่เป็น `draft`
- partial unique index `just_me_boqs_one_approved_idx (project_id) WHERE status='approved'`
- แก้ราคาที่ถอดไว้ = **สร้าง revision ใหม่** (`revision_no+1`, draft) แล้วอนุมัติ — `approveBoq()` จะ superseded ฉบับเดิมให้เอง
- **พังแล้วเกิดอะไร:** ใบเสนอราคาที่ส่งลูกค้าไปแล้วอ้าง BOQ ที่ถูกแก้ทีหลัง → งบ/สัญญาไม่ตรงเอกสาร ตรวจย้อนหลังไม่ได้

### 2.4 `budget_cost` / `contract_amount` เขียนจาก `approveBoq()` ทางเดียว

[`lib/just-me/boq.ts:123-201`](../apps/perpos/src/lib/just-me/boq.ts) — ลำดับที่ **ห้ามสลับ**: superseded ฉบับเก่า → approve ฉบับนี้ (freeze `total_cost`/`total_amount` ที่คำนวณ **ฝั่ง server จากบรรทัดจริง** ห้ามให้ UI ส่งยอดมา) → เขียน `budget_cost` + `budget_revised_at` ที่โครงการ
`contract_amount` เขียนให้ **เฉพาะตอนที่ยังเป็น NULL** (ต่อรองราคาแล้วแก้มือได้ ห้ามเขียนทับ)
**พังแล้วเกิดอะไร:** baseline งบเลื่อนตามความจริงใหม่ทุกครั้ง → ตัวเลข "เกินงบ" ไม่มีวันขึ้น เจ้าของไม่รู้ตัวจนปิดงาน

### 2.5 ยอด PR ต่อบรรทัด BOQ ห้ามเกิน (ยกเว้น owner + เหตุผล)

`findBoqOverages()` / `overageMessage()` ([purchasing.ts:166-211](../apps/perpos/src/lib/just-me/purchasing.ts)) นับยอดสะสมของ PR ที่ยังไม่ `cancelled` เทียบปริมาณใน BOQ
**ไม่บล็อกตาย** (หน้างานมีของเสีย/เผื่อจริง) — ผ่านได้เมื่อมี `just_me_purchase_requests.over_budget_reason` · บรรทัดที่ไม่ผูก BOQ (ซื้อเข้าคลังกลาง) ไม่อยู่ในกฎนี้
**พังแล้วเกิดอะไร:** สั่งซื้อเกินที่ถอดไว้เงียบ ๆ → ของค้างคลัง/ต้นทุนบวมโดยไม่มีใครต้องอธิบาย

### 2.6 รับของ + สถานะ PR คิดจาก DB เท่านั้น

`receivePurchaseRequest()` ([purchasing.ts:723](../apps/perpos/src/lib/just-me/purchasing.ts)) = **ฟังก์ชันเดียวของทั้งระบบ** ลำดับห้ามสลับ:
ตรวจสถานะ+ยอดคงเหลือ → insert `stock_movements` type `receive` (`unit_cost` = ราคาที่เลือก ?? ราคาประเมิน · **ห้ามเขียน `total_cost`**) → บวก `stock_balances` → บวก `received_qty` → **อ่านบรรทัดจาก DB ใหม่** แล้ว `receiveStatus()` ตัดสินสถานะ (ห้ามให้ UI ส่งมา)
ข้อจำกัดที่ตั้งใจ: วัสดุที่ `has_serial` ต้องรับที่หน้าคลัง (ที่นั่นมีช่องกรอก Serial ครบ) · รับเกินที่สั่ง = บล็อกพร้อมบอกยอดคงเหลือ
trigger `just_me_pr_item_freeze` ยอมให้แก้ได้เฉพาะ `received_qty` / `selected_unit_cost` หลัง PR ผ่าน approved — ฟิลด์อื่นล็อก

### 2.7 เลขเอกสารขาย/รายได้เป็นของ accounting เท่านั้น

- ใบเสนอราคา/ใบแจ้งหนี้สร้างผ่าน **`POST /api/accounting/documents`** เสมอ ([accounting-bridge.ts:383](../apps/perpos/src/lib/just-me/accounting-bridge.ts)) — just_me เก็บแค่ `quotation_document_id` / `invoice_document_id`
- ลูกค้าต้องมีแถวใน `acc_contacts` ก่อนออกเอกสาร (snapshot ม.86/4) — `ensureAccContact()` หา/สร้างให้ idempotent จากชื่อลูกค้าโครงการ
- ออกซ้ำไม่ได้: มี document id แล้ว → 409 พร้อมบอกเลขเดิม (ต้องยกเลิกที่ระบบบัญชีก่อน)
- `journal_warning` / `tax_identity_missing` ที่ accounting ตอบกลับ **ต้องโชว์ตรง ๆ ห้ามกลืน**
- **พังแล้วเกิดอะไร:** เลขเอกสารซ้ำ/ข้ามเลข = ผิดกฎสรรพากร และยอดขายไม่เข้างบ

### 2.8 งวดที่วางบิลแล้วล็อกยอด

trigger `just_me_billing_amount_lock` — `status IN ('invoiced','paid')` แล้วแก้ `amount` หรือ `retention_amount` ไม่ได้ (ต้องออกใบลด/เพิ่มหนี้ที่ระบบบัญชี)
API เพิ่มด่าน: ยอดรวมงวดที่ยังไม่ `cancelled` ต้องไม่เกิน `contract_amount` (`billingPlanTotals()`)

### 2.9 ห้ามแตะกลไกต้นทุนของคลังเดิม

- **ห้าม `CREATE OR REPLACE`** trigger function `just_me_movement_cost_prepare` / `just_me_movement_cost_commit` และห้ามแตะ CHECK `movement_type` (4 ค่า: receive|transfer|issue|return) — การผูกโครงการทำผ่าน **คอลัมน์ใหม่ 3 ตัว** (`project_id`, `boq_item_id`, `purchase_request_id`, ทั้งหมด nullable + FK เดี่ยว + `ON DELETE SET NULL`) เท่านั้น
- `unit_cost`/`total_cost` คำนวณโดย trigger — โค้ดใหม่เขียน `unit_cost` ได้เฉพาะตอน `receive` (เป็น input ของ trigger) **ห้ามเขียน `total_cost` เอง และห้ามคิด `avg_cost` ใหม่ที่ชั้นแอป**
- invariant ที่ยังต้องจริงเสมอ: `just_me_item_costs.qty_on_hand` = Σ `just_me_stock_balances.quantity` ของวัสดุนั้น
- **พังแล้วเกิดอะไร:** `avg_cost` ทั้ง org เพี้ยน — ไม่มี ledger ย้อนกลับ กู้ไม่ได้

### 2.10 สูตรเงินทุกตัวอยู่ `lib/just-me/project-metrics.ts` ที่เดียว

หน้า/route/รายงาน **ห้ามคำนวณเงินเอง** — import จากไฟล์นี้เท่านั้น (มีเทสคุม 40 เคสใน [`project-metrics.test.ts`](../apps/perpos/src/lib/just-me/project-metrics.test.ts))
กฎกันตัวเลขหลอกที่ผูกมากับสูตร:

1. **ไม่มีข้อมูล = `NULL` ไม่ใช่ `0`** — `contract_amount`/`budget_cost`/`progress_pct`/`forecast_*` เป็น null ได้ และ UI ต้องแสดง "—"
2. `progress_pct` = null เมื่อยังไม่มีบันทึกความคืบหน้าเลย — **ห้ามแสดง 0%** (คนละความหมายกับ "ยังไม่ได้เริ่ม")
3. ตัวเลขประมาณการติดป้าย `≈` แยกจากตัวเลขจริง
4. KPI ข้ามโครงการตัด `cancelled`/`lost` ออกเสมอ (`isCountedProject()`)
5. ต้นทุนจริงกับต้นทุนผูกพัน **นับแยกกัน** — เอามารวมกันก่อนรับของ = นับซ้ำตอนเบิกใช้
6. การ์ดตัวเลขต้องบอก "นับจากกี่รายการ" คู่กัน (`actual_counted`, `counts`)

---

## 3. สูตรเงิน (นิยามที่ผูกพัน)

| ตัวเลข                                    | นิยาม (ฟังก์ชัน)                                                                                                                                                          | ไม่มีข้อมูล                           |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------- |
| `contract_amount`                         | มูลค่าสัญญา — freeze ตอน approve BOQ (= Σ `boq_items.amount`) แก้มือได้ถ้าต่อรอง                                                                                          | `NULL`                                |
| `budget_cost`                             | Σ `boq_items.cost_amount` ของ BOQ ที่ approved (baseline)                                                                                                                 | `NULL`                                |
| `actual_cost`                             | `actualCost()` = Σ `stock_movements.total_cost` ที่ `movement_type='issue'` + Σ `project_costs.amount` (receive/transfer/return **ไม่นับ**)                               | `0` + `actual_counted`                |
| `committed_cost`                          | `committedCost()` = Σ (qty − received_qty) × (selected ?? estimated) ของ PR สถานะ `approved`/`ordered`/`partially_received`                                               | `0`                                   |
| `progress_pct`                            | `progressPct()` — ถ่วงน้ำหนักด้วย `amount` ของบรรทัด, เอาบันทึกล่าสุดต่อบรรทัด, `done_qty/qty` (หรือ `percent/100`)                                                       | `NULL`                                |
| `forecast_cost`                           | `actual + committed + budget × (1 − progress)` · ยังไม่รู้ progress → ตีว่ายังไม่ได้ทำ (เต็มงบ)                                                                           | `NULL` ถ้าไม่มี budget                |
| `forecast_profit` / `forecast_margin_pct` | `contract − forecast_cost` · `/contract`                                                                                                                                  | `NULL`                                |
| `actual_profit`                           | `contract − actual_cost` — **เฉพาะ `completed`/`closed`**                                                                                                                 | `NULL`                                |
| `cost_variance` / `over_budget`           | `actual + committed − budget` · บวก = เกินงบ (แดง)                                                                                                                        | `NULL`                                |
| `billed_amount` / `unbilled_amount`       | Σ งวด `invoiced`+`paid` · `contract − billed`                                                                                                                             | —                                     |
| margin 4 ชั้น                             | `resolveMargin()` — **เฉพาะเจาะจงกว่าชนะ**: บรรทัด BOQ → price book → หมวดงาน → โครงการ → บริษัท · margin ที่ตั้งมือบนบรรทัดบันทึก `margin_source='item'`                 | default 20% (`just_me_settings`)      |
| ราคาขาย                                   | `unitPrice()` = (วัสดุ+ค่าแรง+overhead) × (1 + margin/100) · `boqLineTotals()` คิด `amount`/`cost_amount`                                                                 | ต้นทุนวัสดุ null → ราคาขาย null       |
| เตือนราคาซื้อขยับ                         | `costDrift()` — เทียบ `avg_cost` ปัจจุบันกับ `baseline_material_cost` ที่กด "รับทราบ" ไว้ เกิน `cost_alert_pct` (รายการ → บริษัท) = เตือน · **rule-based ล้วน ไม่ใช้ AI** | ไม่เคยตั้ง baseline → `null` ไม่เตือน |

---

## 4. DB schema

### 4.1 ตารางใหม่ 15 ตาราง (ทั้งหมด prefix `just_me_`)

ทุกตาราง: `id uuid PK` (ยกเว้น `just_me_settings` ที่ PK = `org_id`) · `org_id NOT NULL → organizations` · `created_by → profiles ON DELETE SET NULL` · `created_at` · RLS เปิด + policy แยก 4 ตัว

| ตาราง                        | คืออะไร                    | จุดที่ต้องรู้                                                                                                                                                                                       |
| ---------------------------- | -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `just_me_settings`           | ค่าตั้งต้นบริษัท 1 แถว/org | `default_margin_pct` (20) · `cost_alert_pct` (10) · `pr_approval_required`                                                                                                                          |
| `just_me_work_categories`    | หมวดงาน + margin ชั้นหมวด  | `UNIQUE (org_id, code)`                                                                                                                                                                             |
| `just_me_projects`           | โครงการ                    | `UNIQUE (org_id, project_code)` · status 9 ค่า · `contract_amount`/`budget_cost` **NULL = ยังไม่มีข้อมูล ห้าม 0** · `retention_pct` 0–100 · `acc_contact_id`/`quotation_document_id` → accounting   |
| `just_me_project_files`      | ไฟล์สำรวจ/แบบ/สัญญา        | `file_kind` 4 ค่า · `storage_path` ใน bucket private `just_me_files`                                                                                                                                |
| `just_me_price_book`         | ราคามาตรฐาน                | `material_cost_mode` `auto`(อ่าน `avg_cost` สด)/`manual` · `labor_unit_cost` + `overhead_unit_cost` · `baseline_material_cost`+`baseline_at` (ฐานเตือนราคาขยับ)                                     |
| `just_me_boqs`               | BOQ 1 revision             | `UNIQUE (project_id, revision_no)` · partial unique index 1 approved/โครงการ · `total_cost`/`total_amount` = snapshot ตอน approve · CHECK ทิศเดียว `approved_by IS NULL OR approved_at IS NOT NULL` |
| `just_me_boq_items`          | บรรทัด BOQ                 | ต้นทุน 3 ก้อนเป็น **snapshot ณ ตอนถอด** (ไม่ join สด) · `margin_pct`+`margin_source` · `unit_price`/`amount`/`cost_amount`                                                                          |
| `just_me_vendors`            | ผู้ขาย                     | ไม่มีคอลัมน์ต้นทุน (viewer อ่านได้)                                                                                                                                                                 |
| `just_me_purchase_requests`  | ใบขอซื้อ                   | `UNIQUE (org_id, pr_code)` · status 7 ค่า · `project_id` NULL = ซื้อเข้าคลังกลาง · `over_budget_reason`                                                                                             |
| `just_me_pr_items`           | บรรทัด PR                  | `boq_item_id` ผูกกลับ BOQ · `estimated/selected_unit_cost` · `received_qty`                                                                                                                         |
| `just_me_vendor_quotes`      | ใบเสนอราคาผู้ขายต่อ PR     | `UNIQUE (pr_id, vendor_id)` · partial unique index `(pr_id) WHERE status='selected'`                                                                                                                |
| `just_me_vendor_quote_items` | ราคารายบรรทัดของแต่ละเจ้า  | `UNIQUE (quote_id, pr_item_id)`                                                                                                                                                                     |
| `just_me_project_costs`      | ต้นทุนที่ไม่ผ่านคลัง       | `cost_kind` labor/subcontract/transport/other · `amount > 0`                                                                                                                                        |
| `just_me_project_billings`   | งวดงาน                     | `UNIQUE (project_id, seq)` · `percent_of_contract` nullable (รองรับทั้งแบบ %สัญญา และตามงานจริง) · `retention_amount` · `invoice_document_id`                                                       |
| `just_me_project_progress`   | ความคืบหน้า                | CHECK `done_qty IS NOT NULL OR percent IS NOT NULL` (ห้ามบันทึกแถวว่างแล้วให้ UI ตีเป็น 0%)                                                                                                         |

**ALTER ตารางเดิม (ADDITIVE ล้วน):** `just_me_stock_movements` + `project_id` / `boq_item_id` / `purchase_request_id` (nullable, FK **เดี่ยว** + `ON DELETE SET NULL` — ลบโครงการแล้วประวัติคลังต้องอยู่ครบ) + 3 index

**FK แบบ composite** `(project_id, org_id) → just_me_projects(id, org_id) ON DELETE CASCADE` ใช้กับตารางลูกของโครงการ (กันอ้างข้าม org ที่ระดับ DB)
FK ที่ต้อง `SET NULL` เป็น **คอลัมน์เดียว** โดยตั้งใจ (composite + SET NULL จะ null `org_id` ที่ NOT NULL) ⇒ **ด่านกันอ้างข้าม org ของ FK กลุ่มนี้อยู่ที่ API** = `assertOrgRefs()` ([\_lib.ts:180](../apps/perpos/src/app/api/just-me/_lib.ts)) — ลืมเรียก = ผูกข้ามองค์กรได้

### 4.2 RLS / view / trigger (สรุปตำแหน่งใน migration)

| ของ                                                  | บรรทัด  | หมายเหตุ                                                                                                                                                                                                          |
| ---------------------------------------------------- | ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `just_me_has_cost_access(uuid)`                      | 29–54   | REVOKE public/anon + GRANT authenticated                                                                                                                                                                          |
| RLS ตารางใหม่ (DO loop)                              | 472–515 | อ่าน: กลุ่มต้นทุน 10 ตาราง = member **AND** cost-access · กลุ่มทั่วไป 5 ตาราง = member · เขียนทุกตาราง = member AND cost-access                                                                                   |
| รัด `just_me_item_costs` / `just_me_stock_movements` | 517–566 | DROP `_write` (FOR ALL) → insert/update/delete แยก, predicate เขียนเดิมคงเดิม                                                                                                                                     |
| 5 view ฝั่งขาย                                       | 568–645 | `security_definer view` = **ข้อยกเว้นที่ตั้งใจ** (Supabase advisor จะเตือน) — เหตุผลอยู่ใน `COMMENT ON VIEW`                                                                                                      |
| trigger freeze/lock                                  | 647–819 | `just_me_boq_freeze` · `_boq_item_freeze` · `_pr_item_freeze` · `_billing_amount_lock` — ทุกตัวปล่อยผ่านเมื่อ "แถวแม่ไม่มีแล้ว" (cascade) ไม่งั้นลบ org ทั้งก้อนไม่ได้                                            |
| `just_me_touch_updated_at`                           | 821–846 | projects / price_book / settings                                                                                                                                                                                  |
| bucket `just_me_files` + policy                      | 848–909 | private · path `{org_id}/{project_id}/{uuid}.{ext}` · helper `just_me_org_path(text, boolean)` cast uuid แบบ safe (segment ที่ไม่ใช่ uuid ต้อง "ไม่ผ่าน" ไม่ใช่ระเบิด 22P02) · อ่าน = member, เขียน = cost-access |

---

## 5. Code map

### 5.1 lib (`apps/perpos/src/lib/just-me/`)

| ไฟล์                          | หน้าที่                                                                                                                                                                                                                   |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `types.ts`                    | type ของทุกตาราง + enum union + `ACTIVE_PROJECT_STATUSES`                                                                                                                                                                 |
| `labels.ts`                   | label ไทย + tone ของทุก enum (**ค่าที่ลง DB เป็นอังกฤษเสมอ**)                                                                                                                                                             |
| `project-metrics.ts`          | ⛔ **สูตรเงินทั้งหมด** — `resolveMargin`/`unitPrice`/`boqLineTotals`/`boqTotals`/`actualCost`/`committedCost`/`progressPct`/`summarizeProject`/`billingPlanTotals`/`costDrift`/`compareVendorQuotes`/`summarizePortfolio` |
| `projects.ts`                 | fetch layer โครงการ (`listProjects`/`getProject`/`listProjectUsage`/…) + `loadProjectSummaries` (รายงานข้ามโครงการ) + `loadProjectMetrics`                                                                                |
| `boq.ts`                      | `listBoqs`/`getApprovedBoq`/`approveBoq`/`buildBoqItemRow`/`prepareBoqItemRows`                                                                                                                                           |
| `price-book.ts`               | `getSettings`(มี default ในตัว)/`listWorkCategories`/`listPriceBook`+`computePriceBookRow`/`loadAvgCosts`/`listInventoryItemOptions`                                                                                      |
| `purchasing.ts`               | PR/ผู้ขาย/เทียบราคา/รับของ — `applyPrItems`/`findBoqOverages`/`selectVendorForPr`/`saveVendorQuote`/`receivePurchaseRequest`/`receiveStatus`/`countVendorWins`                                                            |
| `accounting-bridge.ts`        | `buildQuotationPayload`(groupBy item/category)/`buildInvoicePayload`/`loadAccountingReadiness`/`ensureAccContact`/`postAccountingDocument`/`loadDocumentNumbers`                                                          |
| `files.ts`                    | bucket `just_me_files` · `buildStoragePath`/`createUploadUrl`/`createDownloadUrl` (**signed URL 60 วิ**) · เพดาน 50 MB                                                                                                    |
| `ai.ts`                       | `summarizeVendorQuotes` / `summarizeProjectHealth` + fallback rule-based                                                                                                                                                  |
| `notify.ts` · `line-cards.ts` | LINE แจ้งเตือน 3 เหตุการณ์ + Flex card (header CHARCOAL)                                                                                                                                                                  |
| เทส                           | `project-metrics.test.ts` (40) · `purchasing.test.ts` (14) · `accounting-bridge.test.ts` (13) · `boq.test.ts` (5) · `vendor-compare.test.ts` (4) · `api/just-me/cost-strip.test.ts` (5) = **81 เคส**                      |

### 5.2 API (`apps/perpos/src/app/api/just-me/`)

ทุกเส้น: `?orgId=` → `guard(req, {write?, cost?, owner?})` ([\_lib.ts:58](../apps/perpos/src/app/api/just-me/_lib.ts)) → `auditMutation()` ก่อนเขียน → `stripCost*()` ก่อนตอบ
`route.ts` **export ได้เฉพาะ handler** — ของใช้ร่วมอยู่ `_lib.ts`

| path                                       | method                | ด่าน                       | หน้าที่                                                                                                                     |
| ------------------------------------------ | --------------------- | -------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `/projects`                                | GET/POST              | member / write             | list+filter (`toPaged`) / สร้างโครงการ (`project_code` auto)                                                                |
| `/projects/[id]`                           | GET/PATCH/DELETE      | member / write / **owner** | รายละเอียด / แก้ / ยกเลิก (soft = `cancelled`)                                                                              |
| `/projects/[id]/files`                     | GET/POST/DELETE       | member / write             | เมทาดาทา + `action:"upload-url"` (อัปตรงเข้า bucket)                                                                        |
| `/projects/[id]/files/[fileId]/url`        | GET                   | member                     | signed URL 60 วิ                                                                                                            |
| `/projects/[id]/boq`                       | GET/POST              | member / write+cost        | list revision / สร้าง revision (คัดลอกฉบับเดิมได้)                                                                          |
| `/boq/[boqId]`                             | GET/PATCH             | member / write+cost        | แก้หัว · `action:"approve"`                                                                                                 |
| `/boq/[boqId]/items`                       | GET/POST/PATCH/DELETE | member / write+cost        | บรรทัด BOQ (bulk) — trigger บล็อกถ้าไม่ใช่ draft                                                                            |
| `/boq/[boqId]/quotation`                   | POST                  | write+cost                 | ออกใบเสนอราคาที่ accounting (`groupBy` default `category`)                                                                  |
| `/price-book`                              | GET/POST/PATCH/DELETE | cost (+write)              | ราคามาตรฐาน · `action:"ack-baseline"` = รับทราบราคาใหม่                                                                     |
| `/work-categories`                         | GET/POST/PATCH        | cost (+write)              | หมวดงาน + margin                                                                                                            |
| `/settings`                                | GET/PUT               | cost / **owner**           | ค่า default บริษัท                                                                                                          |
| `/purchase-requests`                       | GET/POST              | cost (+write)              | list / สร้าง PR (จาก BOQ ได้)                                                                                               |
| `/purchase-requests/[id]`                  | GET/PATCH             | cost (+write)              | แก้ · `submit`/`approve`/`cancel`/`select-vendor`                                                                           |
| `/purchase-requests/[id]/quotes`           | GET/POST/PATCH        | cost (+write)              | ใบเสนอราคาผู้ขาย + บรรทัด                                                                                                   |
| `/purchase-requests/[id]/receive`          | POST                  | write+cost                 | รับของเข้าคลัง (ฟังก์ชันเดียว)                                                                                              |
| `/vendors`                                 | GET/POST/PATCH        | member / write             | ทะเบียนผู้ขาย                                                                                                               |
| `/projects/[id]/costs`                     | GET/POST/DELETE       | cost (+write)              | ต้นทุนนอกคลัง (+ เช็คข้ามเส้นงบ → LINE)                                                                                     |
| `/projects/[id]/progress`                  | GET/POST              | member / write             | ความคืบหน้า                                                                                                                 |
| `/projects/[id]/billings`                  | GET/POST/PATCH        | member / write             | งวดงาน · `invoice`/`mark-paid`/`cancel`                                                                                     |
| `/projects/[id]/metrics`                   | GET                   | member                     | ตัวเลขสรุป — viewer ถูก strip (รวม `has_budget` → null)                                                                     |
| `/ai/quote-summary` · `/ai/project-health` | POST                  | cost                       | ความเห็น AI (ดู §7)                                                                                                         |
| `/inventory` (เดิม)                        | GET/POST              | member                     | เพิ่ม `project_id`/`boq_item_id` ตอนเบิก-รับ + **strip ต้นทุนให้ viewer** (`costs`/`costMonthly` = `[]`, `canSeeCost` flag) |

> **ไม่มี** `/api/just-me/reports/projects` — หน้า `project-reports` เป็น server component ที่เรียก `loadProjectSummaries()` ตรง (ต่างจากที่ contract §6 ร่างไว้)

### 5.3 หน้า (`apps/perpos/src/app/(hydrogen)/[orgSlug]/just-me/`)

guard ทุกหน้า = `requireJustMePage(orgSlug)` ([\_components/guard.ts](<../apps/perpos/src/app/(hydrogen)/[orgSlug]/just-me/_components/guard.ts>)) = member + **RLS client** (ห้าม service-role กับข้อมูล per-org) · ไม่ใช่สมาชิก → `notFound()`

| หน้า                     | ท่า render                                                                         | viewer                                                                                            |
| ------------------------ | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `projects`               | server + searchParams (status/q/page ใน URL)                                       | อ่านผ่าน `just_me_projects_basic` · ไม่มีคอลัมน์ต้นทุน/กำไร                                       |
| `projects/[id]`          | hybrid (SSR initial → client) — 6 แท็บ: ภาพรวม/แบบ-ไฟล์/BOQ/จัดซื้อ/งวดงาน/ใช้จริง | ซ่อนแท็บ "จัดซื้อ" · BOQ อ่านผ่าน `just_me_boq_items_sell` · props ไม่มีค่าต้นทุนติดไป            |
| `price-book`             | server → client (CRUD หนัก + คำนวณสด)                                              | **เข้าไม่ได้** (หน้าโชว์กุญแจ)                                                                    |
| `purchase-requests`      | server + searchParams                                                              | **เข้าไม่ได้**                                                                                    |
| `purchase-requests/[id]` | hybrid — บรรทัด/เทียบราคา/รับของ                                                   | **เข้าไม่ได้**                                                                                    |
| `vendors`                | server + searchParams                                                              | อ่านได้ · แต่ "จำนวนครั้งที่ชนะราคา" ไม่ดึงให้ (อ่านจาก PR ที่ viewer ไม่มีสิทธิ์) — ไม่ใช่แสดง 0 |
| `project-reports`        | server, display ล้วน                                                               | **เข้าไม่ได้**                                                                                    |

**เมนู:** `MODULE_MENUS.just_me` เพิ่ม 5 คีย์ (`projects`/`price_book`/`purchase_requests`/`vendors`/`project_reports` — [lib/modules.ts:333-345](../apps/perpos/src/lib/modules.ts)) · ลิงก์อยู่ที่ `buildJustMeMenuItems` ([menu-items.tsx:487](../apps/perpos/src/layouts/hydrogen/menu-items.tsx))
⚠️ **เมนูซ่อนตาม org-level role (`owner|admin`) ไม่ใช่ module role** — เมนู "โครงการ" เห็นทุกคน · ราคามาตรฐาน/PR/รายงาน เห็นเฉพาะ owner|admin ของ org · **การซ่อนเมนูไม่ใช่ด่านสิทธิ์** ด่านจริงคือ RLS + `guard()` + หน้าที่เช็ค `canSeeCost` เอง

---

## 6. สิทธิ์ — ใครเห็นอะไร (สรุปให้จำ)

| ของ                                                 | owner | manager                                      | viewer                               |
| --------------------------------------------------- | ----- | -------------------------------------------- | ------------------------------------ |
| โครงการ (ชื่อ/สถานะ/สัญญา/งวดงาน/ไฟล์/ความคืบหน้า)  | ✅    | ✅                                           | ✅ (ผ่าน `_basic`)                   |
| งบต้นทุน `budget_cost`, margin, `budget_revised_at` | ✅    | ✅                                           | ❌ (แม้ธง `has_budget` ก็ไม่ให้)     |
| BOQ — ปริมาณ + ราคาขาย                              | ✅    | ✅                                           | ✅ (`_sell`)                         |
| BOQ — ต้นทุน 3 ก้อน / `cost_amount` / margin        | ✅    | ✅                                           | ❌                                   |
| ราคามาตรฐาน / PR / เทียบราคา / รายงานโครงการ        | ✅    | ✅                                           | ❌ (403 + ไม่มีเมนู)                 |
| ประวัติคลัง                                         | ✅    | ✅                                           | ✅ แต่ไม่มี `unit_cost`/`total_cost` |
| อนุมัติ PR                                          | ✅    | ⚠️ เฉพาะเมื่อ `pr_approval_required = false` | ❌                                   |
| ลบ/ยกเลิกโครงการ · แก้ `just_me_settings`           | ✅    | ❌                                           | ❌                                   |

---

## 7. AI + LINE

### 7.1 AI ([lib/just-me/ai.ts](../apps/perpos/src/lib/just-me/ai.ts)) — กฎเหล็ก 4 ข้อ

1. เรียกผ่าน **`aiChat` เท่านั้น** พร้อม `provider:"gemini"` + `model:"gemini-2.5-flash"` + `jsonMode` + `temperature:0` + `maxTokens` ครบทุก call — **ห้าม fetch Gemini ตรง** (ของเดิม `inventory/ocr` ยังยิงตรงอยู่ — ห้ามลอก)
2. **ห้ามให้ AI คำนวณตัวเลข** — ตัวเลขคิดเสร็จจาก `project-metrics.ts` แล้วส่งไปให้ AI "เรียบเรียง" เท่านั้น
3. ผลลัพธ์เป็น "ความเห็น AI" — คนตัดสิน (ห้าม auto-select ผู้ขาย, ห้ามเขียนอะไรลง DB จาก `ai.ts`)
4. AI ล่ม/ตอบผิดรูป → คืน **fallback rule-based** (`fallback: true`) ไม่ throw

| จุด                                    | endpoint                              | prompt                                         | maxTokens |
| -------------------------------------- | ------------------------------------- | ---------------------------------------------- | --------- |
| สรุปเทียบราคาผู้ขาย                    | `POST /api/just-me/ai/quote-summary`  | `lib/ai/prompts/just-me-quote-summary.v1.txt`  | 500       |
| สรุปสุขภาพโครงการ (งบ/กำไร/ความเสี่ยง) | `POST /api/just-me/ai/project-health` | `lib/ai/prompts/just-me-project-health.v1.txt` | 600       |

UI แสดงผ่าน `_components/ai-opinion.tsx` (ติดป้าย "ความเห็น AI" + บอกเมื่อเป็น fallback) · log token ทุก call (`[just-me:ai-*]`)

### 7.2 LINE ([notify.ts](../apps/perpos/src/lib/just-me/notify.ts) + [line-cards.ts](../apps/perpos/src/lib/just-me/line-cards.ts))

ยิงตอน mutation เท่านั้น (ไม่มี cron) · **best-effort** ส่งไม่ได้ห้ามทำให้ mutation ล้ม · ผู้รับ query จาก `module_members` ของ org นั้นตรง ๆ (ไม่พึ่ง `line_active_org_id`) และ **มีเฉพาะ owner/manager** — viewer ไม่มีวันได้รับการ์ดที่มีตัวเลขต้นทุน

| เหตุการณ์                      | ฟังก์ชัน                  | ผู้รับ                                                    | ยิงจาก                                                                       |
| ------------------------------ | ------------------------- | --------------------------------------------------------- | ---------------------------------------------------------------------------- |
| PR ส่งขออนุมัติ                | `notifyPrSubmitted`       | owner (ถ้า `pr_approval_required=false` ส่ง manager ด้วย) | `PATCH /purchase-requests/[id]` action `submit`                              |
| ต้นทุนข้ามเส้นงบ               | `notifyOverBudgetCrossed` | owner + manager                                           | อนุมัติ PR · บันทึกต้นทุนนอกคลัง · **เบิกของที่หน้าคลัง** (`inventory` POST) |
| งวดงานพร้อมวางบิล / วางบิลแล้ว | `notifyBillingEvent`      | owner + manager                                           | `PATCH /projects/[id]/billings`                                              |

> **dedup ของ "เกินงบ" ใช้การเทียบ before/after ภายในคำสั่งเดียว** (`before.over_budget === false && after.over_budget === true`) — **ไม่มีคอลัมน์ dedup ใน DB** ⇒ ถ้าโครงการแกว่งข้ามเส้นไป-กลับ จะแจ้งซ้ำได้ และผู้เรียกใหม่ทุกคนต้องส่ง summary ก่อน/หลังมาเอง (ลืม = ไม่แจ้งเลย)

---

## 8. กับดักที่แก้แล้วในรอบนี้ (อย่าทำซ้ำ)

| #   | อาการ                                                                                                                                                                              | สาเหตุ                                            | ที่แก้                                                                                                                               |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | **ช่องต้นทุนรั่วระดับโครงการ/BOQ** — contract §4.6 ลืมรัด `just_me_projects` (`budget_cost`/`margin_pct`) และ `just_me_boqs.total_cost` ⇒ viewer ยิง PostgREST ตรงเห็นงบทั้งบริษัท | สเปกไล่รายชื่อตาราง "อ่อนไหว" ด้วยมือแล้วตกสองตัว | ย้ายสองตารางเข้ากลุ่ม cost-access + เพิ่ม view `just_me_projects_basic` / `just_me_boqs_basic` (รวมเป็น **5 view**)                  |
| 2   | policy `_write` เดิมเป็น **`FOR ALL`** — รัด `_select` อย่างเดียวไม่พอ เพราะ permissive policy OR กัน                                                                              | ท่าเดิมของโมดูล                                   | DROP `_write` ของ `just_me_item_costs`/`just_me_stock_movements` → แยก insert/update/delete โดยคง predicate เขียนเดิม                |
| 3   | **API คลังเดิม bypass RLS** (service-role) ⇒ รัด RLS แล้วก็ยังหลุดทาง API                                                                                                          | route pattern เดิมของ just_me                     | `stripCostList()` + `costs`/`costMonthly` = `[]` เมื่อ viewer ใน `api/just-me/inventory/route.ts:111-125` + เทส `cost-strip.test.ts` |
| 4   | ราคามาตรฐานโหมด `auto` **ไม่มีช่องผูกวัสดุในคลัง** ⇒ `avg_cost` ไม่มีวันมา ราคาขายเป็น null ตลอด                                                                                   | UI รอบแรกลืมฟิลด์ `item_id`                       | `listInventoryItemOptions()` + ช่องเลือกวัสดุในหน้า `price-book`                                                                     |
| 5   | trigger freeze ของ `pr_items` ล็อกแน่นเกินจน **รับของ/เลือกผู้ขายไม่ได้**                                                                                                          | freeze ทุกคอลัมน์หลัง approved                    | ยอมให้แก้เฉพาะ `received_qty` / `selected_unit_cost` (migration:775-789)                                                             |
| 6   | ลบ org/โครงการไม่ได้เพราะ trigger freeze บล็อก cascade                                                                                                                             | trigger ไม่รู้ว่าแม่ถูกลบอยู่                     | ทุก trigger ปล่อยผ่านเมื่อ "แถวแม่ไม่มีแล้ว"                                                                                         |
| 7   | storage policy ระเบิด `22P02` เมื่อ path segment แรกไม่ใช่ uuid                                                                                                                    | cast `::uuid` ตรง ๆ ใน policy                     | `just_me_org_path()` cast แบบ safe → คืน `false` แทน error                                                                           |
| 8   | หัก retention ด้วย "บรรทัดติดลบ" ไม่ได้                                                                                                                                            | accounting clamp บรรทัดติดลบเป็น 0                | ใช้ช่องส่วนลดของบรรทัด (`retention_mode:"discount"`) หรือเขียนหมายเหตุ (default)                                                     |

**LESSONS ที่ยังต้องถือต่อ:** ห้าม `FOR ALL` · composite FK ห้าม `ON DELETE SET NULL` · CHECK คู่ FK ต้องเป็นทิศเดียว (`approved_by IS NULL OR approved_at IS NOT NULL`) · `route.ts` export ได้เฉพาะ handler · ไม่มีข้อมูล = `NULL` ไม่ใช่ 0

---

## 9. Provisioning / go-live

| รายการ                                              | สถานะ                                                                                                                                                             |
| --------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| migration `20260730170000_just_me_project_loop.sql` | **apply prod แล้ว** (2026-07-30)                                                                                                                                  |
| `module_members` ของ `just_me` (org `justme`)       | ตรวจ/seed แล้ว — เคยเจอ OPS-1 "เปิด module แต่ไม่ seed สมาชิก → 403 ทุก API"                                                                                      |
| module `accounting` ให้ org `justme`                | เปิดแล้ว (`org_module_settings` + `module_members`) + จด VAT 7% · seed ผังบัญชี 36 บัญชี + งวดบัญชี 24 งวด                                                        |
| seed ข้อมูลตั้งต้น                                  | `just_me_settings` 1 แถว (margin 20% / alert 10% / บังคับ owner อนุมัติ PR) + `just_me_work_categories` 5 หมวด (ระบบไฟฟ้า, CCTV, เดินท่อ/ราง, ตู้ควบคุม, งานอื่น) |
| storage bucket `just_me_files`                      | private + policy 4 ตัว (สร้างใน migration)                                                                                                                        |
| env/secret ใหม่                                     | ไม่มี (`GEMINI_API_KEY` มีอยู่แล้ว)                                                                                                                               |
| cron                                                | ไม่มี — LINE ยิงตอน mutation ทั้งหมด                                                                                                                              |
| **rollback**                                        | ถอด 5 คีย์ออกจาก `MODULE_MENUS.just_me` = ซ่อนฟีเจอร์ทันที (ไม่ลบตาราง/ข้อมูล) · policy ที่รัดของเดิมย้อนได้ด้วย migration ใหม่                                   |

> ⚠️ seed (settings/หมวดงาน/ผังบัญชี/งวด) ทำบน prod โดยตรง **ไม่ได้อยู่ในไฟล์ migration** — ถ้าเปิดโมดูลนี้ให้ org อื่นในอนาคต ต้อง seed เองใหม่ทั้งชุด (`getSettings()` มี default ในโค้ดให้ แต่หมวดงานไม่มี)

---

## 10. สถานะ + สิ่งที่ยังไม่ได้ทำ (อย่าเข้าใจผิดว่ามีแล้ว)

- **เงินประกันผลงาน (retention) default = "หมายเหตุ" ไม่ลดยอดในเอกสาร** — `retention_mode:"discount"` ต้องส่งมาเอง (การหักก่อน/หลัง VAT เป็นการตัดสินทางภาษี จึงไม่ตัดสินแทนผู้ใช้) และไม่มีระบบติดตาม "เงินประกันที่ต้องคืน"
- **`acc_org_settings` ของ `justme` ยังไม่มีเลขประจำตัวผู้เสียภาษี/ที่อยู่** — `loadAccountingReadiness()` จะคืน `missing[]` → UI เตือน แต่ **ไม่บล็อก** ใบเสนอราคา · ถ้าออก `tax_invoice` จริง accounting จะปฏิเสธจนกว่าจะกรอกครบ
- **`just_me_stock_movements` ยัง UPDATE/DELETE ย้อนหลังได้** (ไม่มี trigger ห้าม) — ทำแล้ว `avg_cost` เพี้ยนเงียบ ๆ เพราะ trigger ต้นทุนเป็น `AFTER INSERT` เท่านั้น · ปิดช่องนี้ต้องทำ migration แยกหลังตรวจว่าโค้ดเดิมไม่ได้ UPDATE
- **dedup แจ้งเตือนเกินงบใช้เทียบ before/after ในคำสั่งเดียว ไม่ใช่คอลัมน์ใน DB** (ดู §7.2)
- **ยังไม่มีหน้าเทียบ BOQ ข้าม revision** — เห็นได้ทีละฉบับเท่านั้น
- **AI ถอด BOQ จากแบบ/รูปสำรวจยังไม่ได้ทำ** (contract §6.1 วางไว้ แต่ไม่มี route `boq/[boqId]/ai-extract` และไม่มีการจับคู่ชื่อวัสดุด้วย AI) — AI ที่มีจริงคือ 2 จุดใน §7.1
- **LINE เตือน "ราคาซื้อวัสดุขยับเกิน %" ยังไม่ได้ส่ง** — คำนวณแล้ว (`costDrift`) แต่แสดงบนหน้า `price-book` อย่างเดียว
- **ค่าแรงจริงต่อโครงการยังกรอกมือ** ที่ `just_me_project_costs` — ยังไม่ต่อกับ clock-in-out (ระบบเวลายังไม่มีมิติโครงการ) = Phase 2
- **หน้า dashboard เดิมของ just_me ยังไม่มีการ์ด "โครงการที่ทำอยู่"** (contract §5 เสนอไว้ แต่ไม่ได้แตะ)
- **การเบิกวัสดุยังทำที่หน้าคลังเท่านั้น** (แท็บ "เบิกโอน" + ช่องโครงการ) — ไม่มีปุ่มเบิกในหน้าโครงการ

---

## 11. วิธี verify / test

```bash
cd apps/perpos && pnpm exec tsc --noEmit && pnpm exec vitest run && pnpm lint
```

ผลล่าสุด (2026-07-30): `tsc` 0 error · vitest **1,178 เคสผ่าน** (เฉพาะ just-me 81 เคส/6 ไฟล์) · lint clean

**สิ่งที่เทสอัตโนมัติคุมให้แล้ว:** สูตรเงินทุกตัว + กฎ null (`project-metrics.test.ts`) · overage/รับของ/สถานะ PR (`purchasing.test.ts`) · payload ที่ส่งเข้า accounting (`accounting-bridge.test.ts`) · ยอด BOQ ตอน approve (`boq.test.ts`) · ตารางเทียบราคา (`vendor-compare.test.ts`) · **การ strip ต้นทุนของ viewer** (`cost-strip.test.ts`)

**สิ่งที่ต้องทดสอบด้วยมือ (เทสไม่ครอบ):**

1. **สวมสิทธิ์ viewer จริง** (ไม่ใช่ super_admin) แล้ว:
   - ยิง PostgREST ตรงที่ `just_me_projects` / `just_me_boq_items` / `just_me_item_costs` / `just_me_stock_movements` → ต้องได้ **0 แถว**
   - เปิด `/[org]/just-me/price-book`, `/purchase-requests`, `/project-reports` → ต้องไม่หลุด (แม้พิมพ์ URL ตรง)
   - เปิด `/projects/[id]` → ไม่มีแท็บ "จัดซื้อ" และ JSON ของหน้า/`/metrics` ต้องไม่มีคีย์ใน `COST_FIELDS`
2. **หน้าคลังเดิมทั้ง 7 แท็บ** ยังทำงานครบทั้ง owner/manager/viewer (การรัด policy ไม่ทำของเดิมพัง)
3. invariant คลัง: `just_me_item_costs.qty_on_hand` = Σ `just_me_stock_balances.quantity` ก่อน/หลังรับของ-เบิกของ
4. flow §1 กดไล่จนจบ 1 รอบ (สำรวจ → วางบิล) ในฐานะ **member จริง** ไม่ใช่ super_admin
5. `get_advisors` — จะเตือน `security_definer_view` กับ 5 view = **ข้อยกเว้นที่ตั้งใจ** (มี `COMMENT ON VIEW` อธิบายไว้)

---

## Changelog

| วันที่     | การเปลี่ยนแปลง                                                                                                             |
| ---------- | -------------------------------------------------------------------------------------------------------------------------- |
| 2026-07-30 | ส่งมอบครั้งแรก (B1–B8) — 15 ตาราง + 5 view + ด่านต้นทุนระดับ DB, 7 หน้า, ~22 API, สะพานไปบัญชี, AI 2 จุด, LINE 3 แจ้งเตือน |
