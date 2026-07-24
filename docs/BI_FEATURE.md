# คัมภีร์: ผู้ช่วยวิเคราะห์ธุรกิจ (BI Chat, module key `bi`)

> เอกสารนี้เขียนสำหรับ **AI agent + dev ที่จะมาแตะโค้ดต่อ** ไม่ใช่คู่มือผู้ใช้ปลายทาง
> ที่มา: [`.claude/module-factory/specs/bi.md`](../.claude/module-factory/specs/bi.md) (contract เต็ม §1–§11 + Review Log) — เอกสารนี้สรุปสิ่งที่ **build จริง** บน prod (org `p2p-x-89`)
> สถานะ ณ วันที่เขียน (2026-07-24): **Phase 1 เสร็จ, apply prod แล้ว, verified 14 / draft 15 metric** — LINE (Phase 2), Dashboard เต็มรูป (Phase 3), Free-form SQL (Phase 5) **ยังไม่ทำ**

---

## 1. ภาพรวม + จุดยืน

**ผู้ช่วยวิเคราะห์ธุรกิจ** (label ใน UI, key ภายใน `bi`) คือฟีเจอร์แชทถามคำถามธุรกิจเป็นภาษาไทยแล้วได้คำตอบ + กราฟ interactive จากข้อมูลจริงของ org ตัวเอง — เริ่มที่ข้อมูลจัดซื้อครุภัณฑ์ (`gov_procure`) ของ org `p2p-x-89`

**ใครใช้:** สมาชิก org ที่มีสิทธิ์ module `bi` — role `owner` (เห็นตัวเลขอ่อนไหวทั้งหมด) / `analyst` (เห็นตัวเลขทั่วไป+กำไร) / `viewer` (ถามได้แต่เห็นเฉพาะ pipeline/เงินค้างรับ/สถานะ ไม่มีสิทธิ์เขียน) — ดู D4 ใน §11 ของ spec

**คุณค่า:** ผู้บริหาร/เจ้าของงานพิมพ์คำถามแทนเปิดหน้ารายงานหลายจอ ได้เลขที่ตรงกับ KPI บนหน้าจอเดิมเป๊ะ พร้อมกราฟที่เลือกชนิดให้อัตโนมัติและนิยามกำกับทุกคำตอบ

### 1.1 ทำไมความแม่นมาจาก semantic layer ไม่ใช่จาก LLM

หัวใจของ module นี้คือ **`bi_metrics`** (semantic layer / data dictionary) — ตารางที่เก็บ "นิยามที่คนเซ็นรับแล้ว" ของทุกตัวชี้วัด พร้อม SQL ที่ verify แล้วต่อหนึ่งนิยาม LLM (Gemini) ทำหน้าที่แค่ 3 อย่าง:

1. **จับ intent + เติม parameter** (ช่วงเวลา/มิติ/filter) จากคำถามภาษาคน
2. **เรียบเรียงคำตอบ** เป็น bullet ภาษาไทยผู้บริหาร (ห้ามคำนวณเลขเอง — มีด่าน `verifyBulletNumbers()` ตรวจว่าทุกตัวเลขที่ LLM พูดมีอยู่ใน result set จริง ไม่ผ่าน = ทิ้งคำตอบ LLM ใช้ bullet ที่ระบบประกอบเองแทน)
3. **เจน chart spec** (เลือกชนิดกราฟ deterministic ตามรูปทรงข้อมูลก่อน แล้วให้ `chart_hint` ของ metric override)

LLM **ไม่เจน SQL เอง ไม่มีทางเข้าถึง connection string** — สิ่งที่ LLM ส่งกลับมาคือ enum key (`metric_key` + `dimension`/`filter` ที่เลือกจาก allowlist ของ metric นั้น) แล้ว `runMetric()` เป็นคนประกอบ query จริงผ่าน RPC `run_bi_metric` (SECURITY DEFINER)

### 1.2 ทำไมความเสี่ยงคลาสสิกของ text-to-SQL SaaS ไม่ apply กับเรา

| ความเสี่ยงคลาสสิกของ BI Chat SaaS               | สถานะของเรา                                                                                                                                                                                   |
| ----------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Prompt injection หลอกให้ตัด `WHERE org_id`      | **เป็นไปไม่ได้โดยโครงสร้าง** — LLM ไม่เจน SQL เลย, `org_id` bind จาก session ฝั่งเซิร์ฟเวอร์เสมอ (พิสูจน์แล้วบน prod: ยิงข้อความ `x' OR 1=1 --` เป็นค่า filter → ได้ผล 0 แถว ไม่ใช่ทั้งพอร์ต) |
| Schema ลูกค้า 100–1,000 ตาราง ยัด prompt ไม่ไหว | ไม่เกิด — prompt มีเฉพาะ metric ที่ retrieval มา (pgvector, `match_bi_metrics`) ไม่ใช่ schema ทั้งก้อน                                                                                        |
| Onboarding ต้อง map schema เป็นสัปดาห์          | ไม่เกิด — ทุก org ใช้ schema PERPOS เดียวกัน นิยาม metric ครั้งเดียวใช้ได้ทุก org ที่เปิด module                                                                                              |
| ต้องรองรับ connector หลาย DB                    | นอกขอบเขตจนกว่ามีลูกค้า external DB จริง                                                                                                                                                      |

**Moat:** ไม่ใช่ "chat with your data" (wrapper ใครก็เปิดแข่งได้) แต่คือความแม่นโดย construction (semantic layer ผูกกับตัวช่วยกลางของโดเมนที่เราเขียนเองอยู่แล้ว) + onboarding เป็นศูนย์เพราะข้อมูลอยู่ในบ้านเราแล้ว

---

## 2. สถาปัตยกรรม + flow 6 สเต็ปต่อ 1 คำถาม

```
[Web /:orgSlug/bi]  chat UI ──┐
[LINE — Phase 2 ยังไม่ทำ] ────┤
                              ▼
              POST /api/bi/ask  →  askBi() orchestrator
```

โค้ดจริงของ orchestrator = [`lib/bi/ask.ts`](../apps/perpos/src/lib/bi/ask.ts) เรียก 6 สเต็ปตามลำดับ:

| #   | สเต็ป                  | ไฟล์ / ฟังก์ชันจริง                                                                                                                                                                              | หน้าที่                                                                                                                                                                                                                          |
| --- | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | resolve org + role     | [`app/api/bi/_lib.ts`](../apps/perpos/src/app/api/bi/_lib.ts) `requireBiMember()`                                                                                                                | ตรวจ `org_module_settings.is_enabled` + `module_members` role (`bi`) — ปฏิเสธก่อนแตะ DB ใด ๆ                                                                                                                                     |
| 2   | Intent + param extract | [`lib/bi/intent.ts`](../apps/perpos/src/lib/bi/intent.ts) `extractIntent()`                                                                                                                      | Gemini structured output (`gemini-2.5-flash`, `thinkingBudget:0`) → `{metric_candidates, params, needs_clarify}`                                                                                                                 |
| 3   | Metric Resolver        | [`lib/bi/resolver.ts`](../apps/perpos/src/lib/bi/resolver.ts) `embedQuestion()`/`matchMetrics()`                                                                                                 | embed คำถาม (`gemini-embedding-001`, `RETRIEVAL_QUERY`) → RPC `match_bi_metrics` (pgvector, ท่าเดียวกับ `kb_chunks`) — กรอง `status='verified'` + `module_scope` ที่ org เปิด + `allowed_roles` ตาม role ผู้ถามตั้งแต่ retrieval |
| 4   | Runner                 | [`lib/bi/runner.ts`](../apps/perpos/src/lib/bi/runner.ts) `validateParams()`/`runMetric()`                                                                                                       | validate params ตาม `param_schema` → RPC `run_bi_metric` (SECURITY DEFINER, bind `org_id`+`role`+`p_allow_draft=false` เสมอ)                                                                                                     |
| 5   | Answer + Chart Gen     | [`lib/bi/chart.ts`](../apps/perpos/src/lib/bi/chart.ts) `chooseChart()`/`buildChartSpec()` + [`lib/bi/answer.ts`](../apps/perpos/src/lib/bi/answer.ts) `narrateAnswer()`/`buildDefinitionLine()` | เลือกชนิดกราฟ deterministic + Gemini เรียบเรียง bullet ไทย (skip เมื่อ `no_summarize=true` หรือ grain=รายการ)                                                                                                                    |
| 6   | audit                  | [`lib/bi/threads.ts`](../apps/perpos/src/lib/bi/threads.ts) `appendMessage()` + `bi_query_log` insert ใน `ask.ts`                                                                                | บันทึกทุกคำถาม: ใคร/org/metric ที่ match/params/latency/token/cost                                                                                                                                                               |

**Web:** render chart JSON ด้วย [`ChartRenderer`](<../apps/perpos/src/app/(hydrogen)/[orgSlug]/bi/_components/chart-renderer.tsx>) (Recharts) · **LINE:** ยังไม่ทำ (Phase 2)

### 2.1 ทริกเกอร์บน LINE (`/bi <คำถาม>`) — วางแผนไว้แล้ว ยังไม่ implement

Contract ตัดสินใจว่าจะใช้คำสั่ง `/bi` (alias `/ถาม`) แทนการ mention บอท เพราะ 1:1 chat ไม่มี UI ให้ tag และ `mentionees[].isSelf` พึ่งพาไม่ได้ — ตรงกฎ repo (ทุกคำสั่งขึ้นต้น `/`), ไม่ชนผู้ช่วยโฟล์ (Flow RAG) ที่กิน free text, ทำงานได้ทั้งกลุ่มและ 1:1 ด้วยโค้ดชุดเดียว **แต่ยังไม่มีโค้ดใน webhook ตอนนี้** — ดู §9 (สถานะ/ที่ยังไม่ได้ทำ) Phase 2

---

## 3. Semantic Layer = หัวใจของ module

> BI Chat ไม่ได้ฉลาดเพราะ LLM แต่ฉลาดเพราะชั้นนี้ — ถ้านิยามไม่นิ่ง AI จะตอบมั่วอย่างมั่นใจ

### 3.1 กฎเหล็ก (บังคับทุก metric ใหม่)

1. **หนึ่ง metric = หนึ่งนิยาม = หนึ่งเจ้าของ** — ห้ามมี "ยอดขาย" สองความหมายในระบบ ถ้าต้องการสองมุมจริง ให้แยกเป็นคนละ metric ที่ชื่อต่างกันชัด (ดูตัวอย่างจริง: D1 บังคับให้ทุก measure ที่เป็นมูลค่ามีสอง key คือ `..._incl_vat` และ `..._excl_vat`)
2. **ห้าม BI คิดกฎโดเมนเอง** — metric ฝั่ง gov_procure ต้องยึด [`lib/gov-procure/summary.ts`](../apps/perpos/src/lib/gov-procure/summary.ts) (`computeSummary`/`isOverdue`/`computeAging`/`computeDuration`) ไม่ใช่คิดสูตรใหม่ — golden test ยิง `run_bi_metric` แล้วเทียบกับ `computeSummary()` บนชุดข้อมูลเดียวกัน (ไม่ใช่เทียบเลขคำนวณมือ) ถ้าตัวเลขไม่ตรง = เทสแดง
3. **aggregate ที่ SQL เสมอ** — ห้ามดึงแถวมารวมใน JS (PostgREST ตัด 1,000 แถวเงียบ ๆ)
4. **ไม่มั่นใจ = ไม่ตอบ** — match ไม่เจอ metric ที่ confidence พอ หรือเจอหลายตัวคะแนนใกล้กัน → ถามกลับให้เลือก ห้ามเดา (`answer_status='clarify'`)
5. **ทุกคำตอบต้องอธิบายนิยามได้** — แนบบรรทัด "นิยาม: …" + ช่วงเวลาที่ใช้เสมอ (`definition_line` ใน `answer_meta`)
6. **metric ทุกตัวมี golden test** — [`lib/bi/metrics.golden.test.ts`](../apps/perpos/src/lib/bi/metrics.golden.test.ts) (ท่าเดียวกับ `accounting-rules.test.ts`) · metric ฝั่งขาย/บัญชี (ยังไม่ทำใน Phase 1) ต้องเทียบกับ `selectBillingDocuments()` เมื่อถึงเวลาทำจริง

### 3.2 กระบวนการเพิ่ม metric ใหม่ (ทำซ้ำได้ ไม่ใช่แล้วแต่คนเขียน)

```
เขียนนิยามเป็นภาษาคน
      → เจ้าของธุรกิจยืนยัน (owner_label + verified_by)
      → เขียน SQL (sql_template ตาม §5 สัญญา)
      → เทียบเลขกับหน้าจอ/รายงานที่ใช้อยู่จริงให้ตรง 100% (เช่น /:orgSlug/gov-procure)
      → เขียน golden test
      → status='verified' (ผ่านสคริปต์ `_bi_activate_metrics.sql` เท่านั้น — ห้าม set ตอน seed)
      → pnpm bi:embed
      → ใช้งานได้จริง
```

**metric ที่ยัง `draft` ตอบไม่ได้** — บอทตอบว่า "ยังไม่มีนิยามที่ยืนยันสำหรับคำถามนี้" (พฤติกรรมที่ถูกต้อง ไม่ใช่บั๊ก)

### 3.3 metric = cube (measure × มิติ allowlist) ไม่ใช่ SQL ตายตัว

จุดขายคือคำถามที่ไม่ได้ตั้งไว้ล่วงหน้า ("ยอดผูกพันไตรมาสนี้ แยกตามหมวด เทียบปีก่อน") — ถ้า metric เป็น SQL ตายตัวหนึ่งคำถามต่อหนึ่งแถว จะต้องเขียนเป็นร้อยตัว ทางออก: หนึ่ง metric = measure หนึ่งตัว + **ชุดมิติที่อนุญาต** (`dimensions[]`, `time_grains[]`, `comparisons[]`, `filters[]` — allowlist คอลัมน์จริง)

SQL template เขียนแบบมีรูให้เสียบ (`{{dim_select}}`/`{{group_by}}`/`{{time_filter}}`/`{{filters}}`) — **binder ฝั่งเซิร์ฟเวอร์แปลง key → ชื่อคอลัมน์จาก allowlist เท่านั้น** ไม่ต่อสตริงจากข้อความผู้ใช้เลย → สิ่งที่ LLM ส่งกลับมามีแต่ enum key ไม่ใช่ SQL

**drill-down = เปลี่ยนมิติ ไม่ใช่ query ใหม่** — คลิกแท่งกราฟ = เติม filter แล้วรัน metric เดิม · "ดูรายตัว" = metric detail template คู่กัน (suffix `_detail`, grain = รายการ)

### 3.4 กฎ "หนึ่ง key = หนึ่งนิยามตลอดกาล" — เปลี่ยนนิยาม = ตั้ง key ใหม่

`key` รูปแบบ `<module_scope>.<measure_snake_case>` — **ห้าม mutate นิยามของ key เดิมเงียบ ๆ** (ผู้บริหารเคยเห็นเลขเก่าอยู่) เปลี่ยนนิยาม = สร้าง key ใหม่ + set ตัวเก่าเป็น `deprecated` · metric รายละเอียด (drill-down, grain=รายการ) ใช้ suffix `_detail`

### 3.5 สัญญาของ metric (`bi_metrics` — ทุกช่องบังคับ)

| ช่อง                                                                              | ความหมาย                                                                    |
| --------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| `key`                                                                             | ชื่อเชิงเทคนิค ไม่ซ้ำ (`<module_scope>.<measure>`)                          |
| `label_th` / `definition_th`                                                      | ชื่อที่คนเรียก / นิยามเป็นประโยคที่ business owner เซ็นรับ — แสดงในทุกคำตอบ |
| `includes` / `excludes`                                                           | สิ่งที่นับ/ไม่นับ (กันข้อโต้แย้ง)                                           |
| `grain`                                                                           | หน่วยของแถว (เช่น `order`)                                                  |
| `time_basis`                                                                      | ชื่อคอลัมน์วันที่จริงที่ยึด · NULL = snapshot ไม่อิงเวลา                    |
| `unit` / `unit_decimals`                                                          | `thb`\|`count`\|`days`\|`percent` + ทศนิยม                                  |
| `synonyms[]`                                                                      | คำที่ผู้ใช้เรียกจริง — ใช้ตอน retrieval/embed                               |
| `sql_template` / `param_schema`                                                   | SQL ที่ verify แล้ว + พารามิเตอร์ที่ validate ได้                           |
| `dimensions[]` / `time_grains[]` / `comparisons[]` / `filters[]` / `default_view` | นิยาม cube (§3.3)                                                           |
| `chart_hint`                                                                      | ชนิดกราฟที่เหมาะ (override ไม่ได้ 3 กรณี — ดู Review Log [B2])              |
| `module_scope`                                                                    | `gov_procure`\|`accounting`\|`core`                                         |
| `allowed_roles[]`                                                                 | role ที่เห็น metric นี้ได้ (RBAC ระดับ metric — กรองตั้งแต่ retrieval)      |
| `owner_label` / `verified_at` / `verified_by`                                     | ใครเป็นเจ้าของนิยามนี้ + ยืนยันเมื่อไร                                      |
| `status`                                                                          | `draft`\|`verified`\|`deprecated` — **ตอบได้เฉพาะ `verified`**              |
| `no_summarize`                                                                    | `true` = ห้ามส่ง result เข้า LLM สรุป (มิติเป็นบุคคล/อ่อนไหว)               |
| `max_period_months`                                                               | เพดานช่วงเวลาต่อ metric                                                     |
| `embedding`                                                                       | `vector(768)`, `gemini-embedding-001`, `RETRIEVAL_DOCUMENT`                 |

---

## 4. สัญญาการแสดงผล — หนึ่งคำตอบต้องมีอะไรบ้าง

ทุกคำตอบประกอบด้วย 5 ส่วน (บนเว็บครบทั้ง 5 — `AnswerCard` [`_components/answer-card.tsx`](<../apps/perpos/src/app/(hydrogen)/[orgSlug]/bi/_components/answer-card.tsx>); บน LINE ยังไม่ทำ):

1. **สรุปเป็น bullet 2–4 ข้อ** — ภาษาไทยผู้บริหาร ห้ามใส่ตัวเลขที่ไม่ได้มาจาก result set (คุมด้วย `verifyBulletNumbers()`)
2. **กราฟที่เลือกให้อัตโนมัติตามรูปทรงข้อมูล** — [`ChartRenderer`](<../apps/perpos/src/app/(hydrogen)/[orgSlug]/bi/_components/chart-renderer.tsx>) รองรับ Phase 1 ครบ 6 ชนิด: stat/line/bar/donut/funnel/table
3. **ตารางข้อมูลดิบ** พับเก็บไว้ — [`raw-rows.tsx`](<../apps/perpos/src/app/(hydrogen)/[orgSlug]/bi/_components/raw-rows.tsx>) + ปุ่มคัดลอก/ดาวน์โหลด CSV
4. **นิยามที่ใช้ + ช่วงเวลา + คำถามต่อยอดที่แนะนำ** — `definition_line` + `follow_ups[]`
5. **"ดูวิธีคำนวณ" (show your work)** — panel พับเก็บ: metric ที่ใช้ + params, SQL จริงที่รัน, จำนวนแถว, เวลารัน (`work.sql/params/elapsed_ms/row_count`) — deterministic 100% เพราะไม่ใช่ให้ LLM เล่า reasoning ย้อนหลัง

### กติกาเลือกชนิดกราฟ (deterministic จากรูปทรง result set → `chart_hint` override ได้ ยกเว้น 3 กรณี)

| รูปทรงข้อมูล                    | แสดงเป็น                                                |
| ------------------------------- | ------------------------------------------------------- |
| ตัวเลขเดียว                     | **stat** ใหญ่ + delta เทียบช่วงก่อน                     |
| อนุกรมเวลา 1 ชุด                | **line** (หลายชุด = multi-line)                         |
| หมวดหมู่ ≤ 8 กลุ่ม              | **bar** (แนวนอนถ้าชื่อหมวดยาว)                          |
| หมวดหมู่ > 8 กลุ่ม              | **bar top-N + รวมที่เหลือเป็น "อื่น ๆ"**                |
| สัดส่วนของทั้งหมด ≤ 5 กลุ่ม     | **donut** (เกิน 5 กลุ่ม → bar)                          |
| ขั้นตอน/สถานะเป็นลำดับ          | **funnel** (pipeline จัดซื้อ 6 stage)                   |
| แถวรายการ (grain = transaction) | **ตาราง** เสมอ (บังคับ ไม่ให้ override — data boundary) |

**บังคับไม่ให้ override 3 กรณี:** grain รายการ → table เสมอ · `stat` กับผลหลายแถว → เปลี่ยนชนิด · `donut` เกิน 5 กลุ่ม → bar (กันกราฟโกหก)

ทั้งหมดใช้ `<Table>`/`StatCard`/พาเลตต์ตาม DESIGN.md · ตัวเลขเงิน tabular+ชิดขวา · ยอดลบใช้ U+2212 · **สีกราฟใช้ CSS token** (`rgb(var(--primary-default))` ฯลฯ) ไม่มี hex ดิบ

---

## 5. DB Schema — 7 ตาราง + RPC 4 ตัว + trigger

Migration ที่ applied prod (project `zftnyipifpaiqzukiyzi`) — 5 ไฟล์เรียงลำดับ:

| ไฟล์                                                                                                              | เนื้อหา                                                                             |
| ----------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| [`20260724090000_bi_schema.sql`](../supabase/migrations/20260724090000_bi_schema.sql)                             | 7 ตาราง + RLS + index + trigger `fn_bi_strip_sensitive_rows` + 4 RPC + REVOKE/GRANT |
| [`20260724091000_bi_metrics_seed.sql`](../supabase/migrations/20260724091000_bi_metrics_seed.sql)                 | seed 29 metric ทั้งหมด `status='draft'`                                             |
| [`20260724092000_bi_messages_answer_meta.sql`](../supabase/migrations/20260724092000_bi_messages_answer_meta.sql) | เพิ่มคอลัมน์ `bi_messages.answer_meta jsonb` (5 ส่วนของคำตอบตาม §4)                 |
| [`20260724093000_bi_revoke_trigger_fn.sql`](../supabase/migrations/20260724093000_bi_revoke_trigger_fn.sql)       | REVOKE trigger function ที่ตกหล่นจากไฟล์แรก                                         |
| [`20260724094000_bi_metrics_seed_fix.sql`](../supabase/migrations/20260724094000_bi_metrics_seed_fix.sql)         | แก้ `default_view.period`/`is_snapshot` ของ 13 metric (BLOCKER-2, ดู §7)            |

**สคริปต์ที่ไม่ใช่ migration** (ขึ้นต้น `_` — ห้าม apply อัตโนมัติ): [`_bi_metric_check.sql`](../supabase/migrations/_bi_metric_check.sql) (ตรวจเลขจริงบน prod) · [`_bi_activate_metrics.sql`](../supabase/migrations/_bi_activate_metrics.sql) (เปิด draft→verified หลังผ่านด่าน — ดู §3.2/§8)

### ตาราง

| ตาราง                                  | หน้าที่                                                                                    | RLS                                                                                               |
| -------------------------------------- | ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------- |
| `bi_metrics`                           | semantic layer — **ไม่มี `org_id`** (ตารางกลาง นิยามครั้งเดียวใช้ได้ทุก org)               | **deny-all** (ท่าเดียวกับ `kb_chunks`) — อ่าน/เขียนผ่าน service-role เท่านั้น                     |
| `bi_threads`                           | ประวัติแชทต่อ org ต่อ user + `preferences jsonb` (จำ incl/excl VAT ที่เลือกไว้ในเธรด — D1) | RLS `USING (is_org_member)` **แต่ REVOKE จาก anon/authenticated แล้ว** → RLS ไม่ทำงานจริง (ดู §6) |
| `bi_messages`                          | ข้อความต่อเธรด + `metric_key`/`params`/`chart_spec`/`result_rows`/`answer_meta`            | เดียวกัน                                                                                          |
| `bi_dashboards` / `bi_dashboard_items` | dashboard ที่ปักหมุด — **สร้างตารางแล้วแต่หน้า/API เป็น Phase 3 ยังไม่ทำ**                 | เดียวกัน                                                                                          |
| `bi_query_log`                         | audit ทุกคำถาม (ใคร/org/metric/params/latency/token/cost/feedback)                         | write **deny-all เต็ม** (แก้ตั้งแต่ B1-r2 — org admin เคยลบ/แก้ audit ได้ ปิดแล้ว)                |
| `bi_usage_daily`                       | rate-limit ต่อคน/วัน (ท่า `flow_chat_usage`), PK `(org_id, profile_id, day)`               | **deny-all**                                                                                      |

> ตารางที่มี `org_id` ทั้ง 6 ตัว (ยกเว้น `bi_metrics`) ถูก **REVOKE ALL จาก anon, authenticated** เป็นชั้นความปลอดภัยหลัก — RLS policy ที่เหลือไว้เป็นชั้นสอง เผื่อมีการ GRANT กลับโดยไม่ตั้งใจ (ดู §6 ทำไมเรื่องนี้สำคัญมาก)

### Enum (text + CHECK — ไม่สร้าง PG enum type)

`metric_status` (draft/verified/deprecated) · `chart_type` (stat/line/bar/donut/funnel/table/stacked_bar/heatmap) · `bi_role` (owner/analyst/viewer) · `time_grain` (day/week/month/quarter/fiscal_year/year) · `comparison` (none/prev_period/yoy/target) · `message_role` (user/assistant) · `answer_source` (web/line) · `answer_status` (answered/clarify/no_match/refused/error) · `module_scope` (gov_procure/accounting/core)

### RPC (SECURITY DEFINER, `SET search_path=public`, REVOKE FROM PUBLIC/anon/authenticated + GRANT ... TO service_role)

```sql
-- signature จริงหลังรีวิวความปลอดภัย S2 (5 arg — ไม่ใช่ 3 arg ตาม draft เดิมของ contract)
run_bi_metric(p_org_id uuid, p_metric_key text, p_params jsonb, p_role text, p_allow_draft boolean DEFAULT false)
RETURNS jsonb  -- { rows, row_count, truncated, sql, elapsed_ms, metric, effective_params }
-- ตรวจ allowed_roles/status เป็นด่านสุดท้าย (RAISE ถ้าไม่ผ่าน) · p_allow_draft=true ใช้ได้เฉพาะ golden test/สคริปต์ตรวจ ห้ามใช้ใน path ผู้ใช้จริง

match_bi_metrics(p_query_embedding vector(768), p_scopes text[], p_role text,
                 p_match_count int DEFAULT 5, p_min_similarity float DEFAULT 0.6)
RETURNS TABLE (key, label_th, definition_th, synonyms, dimensions, time_grains,
               comparisons, filters, default_view, chart_hint, unit, param_schema,
               max_period_months, no_summarize, similarity)
-- กรอง status='verified' AND module_scope = ANY(p_scopes) AND p_role = ANY(allowed_roles)

upsert_bi_metric_embedding(p_key text, p_embedding float8[]) RETURNS uuid   -- ใช้โดย scripts/bi-embed.mjs
incr_bi_usage(p_org_id uuid, p_profile_id uuid, p_daily_limit int DEFAULT 50) RETURNS boolean
```

### `sql_template` — สัญญาที่ RPC บังคับ (กัน SQL อิสระ)

ห้าม `;` · ห้ามขึ้นต้น `WITH` · alias ตารางหลักต้องเป็น `o` + พารามิเตอร์ `__p` · **บังคับต้องมี `WHERE o.org_id = __p.org_id`** (RPC ตรวจด้วย regex ตอน seed/insert — เป็นด่านชั้นที่สอง ด่านจริงคือสิทธิ์เขียน `bi_metrics` = service-role เท่านั้น) · placeholder ที่ใช้ได้: `{{dim_select}}` / `{{group_by}}` / `{{time_filter}}` / `{{filters}}`

### trigger

`fn_bi_strip_sensitive_rows()` (BEFORE INSERT OR UPDATE บน `bi_messages`) — ล้าง `result_rows` เป็น NULL ที่ชั้น DB เองเมื่อ metric ของแถวนั้น `no_summarize=true` (กัน S1 ไม่ให้กลับมาเกิดซ้ำแม้โค้ดแอปพลาด)

---

## 6. ความปลอดภัย — ข้อผูกพันถาวร (ส่วนสำคัญที่สุดของเอกสารนี้)

### 6.1 REVOKE ⇒ service-role ⇒ RLS ไม่ทำงาน ⇒ ต้องกรองเจ้าของเองทุก read path

ตาราง `bi_*` (ยกเว้น `bi_metrics`) ถูก `REVOKE ALL ... FROM anon, authenticated` — ดังนั้น **ทุก read path วิ่งผ่าน service-role client** (`createAdminClient()`) และ **RLS ของ Postgres ไม่มีผลอะไรเลย** ในทางปฏิบัติ (แม้ policy ยังเขียนไว้เป็นชั้นสอง)

**ผลที่ตามมา (ข้อผูกพันถาวร):**

- `profileId` เป็น **พารามิเตอร์บังคับ** ของทุกฟังก์ชันที่อ่าน thread/message: `listThreads()`, `getThread()`, `getThreadPreferences()`, `setThreadPreferences()`, `lastAssistantTurn()` — **ห้ามทำเป็น optional/null**
- ทุกฟังก์ชันเหล่านี้ต้องกรอง `created_by = profileId` เอง (เทียบเท่า `isThreadOwnedBy()`/`isMessageOwnedBy()` ใน [`lib/bi/threads.ts`](../apps/perpos/src/lib/bi/threads.ts))
- ไม่ใช่เจ้าของ = **404 (ห้าม 403)** — ไม่บอกฝ่ายที่ไม่มีสิทธิ์ว่า resource นั้นมีอยู่จริง
- หน้าเว็บ ([`_components/guard.ts`](<../apps/perpos/src/app/(hydrogen)/[orgSlug]/bi/_components/guard.ts>)) **ห้ามอ่านตาราง `bi_*` ด้วย RLS client (`createSupabaseServerClient`) เด็ดขาด** — จะได้ permission denied เสมอ ต้องผ่าน `lib/bi/*` ที่ส่ง service-role client เข้าไป

นี่คือบทเรียนจาก BLOCKER-1 (Review Log [B4-review]): "รัดชั้น DB แล้วเปิดทางลัด service-role = ย้ายภาระกรองมาที่โค้ด ต้องกรองเองทุก read path" — และ route `POST /api/bi/ask` ต้องตรวจความเป็นเจ้าของ `threadId` **ก่อน** rate-limit และก่อนแตะ DB (กันคำขอที่ไม่ชอบธรรมกินโควตาของเจ้าตัว)

### 6.2 สิทธิ์เขียน `bi_metrics` = service-role/super_admin เท่านั้นตลอดไป

`bi_metrics.sql_template` รันแบบ SECURITY DEFINER ผ่าน `run_bi_metric` = **สิทธิ์อ่านทั้ง DB โดยพฤตินัย** ดังนั้น:

- สิทธิ์เขียน `bi_metrics` **ต้องเป็น service-role/super_admin เท่านั้นตลอดไป** ห้ามผูกกับ role ระดับ org
- **Phase 4 (หน้า admin จัดการ `bi_metrics`) ห้ามเปิดให้ role ระดับ org แก้ `sql_template` เด็ดขาด** แม้จะทำหน้า UI ให้ดูสวยแค่ไหนก็ตาม — นี่คือกฎเดียวที่ห้ามละเมิดแม้ตอนขยาย feature ในอนาคต

### 6.3 RBAC ระดับ metric

`allowed_roles` กรองตั้งแต่ชั้น retrieval (`match_bi_metrics`) — role ที่ไม่มีสิทธิ์จะ "match ไม่เจอ" ตั้งแต่ต้น ไม่ใช่เห็นแล้วถูกบัง · `run_bi_metric` เช็ค `p_role`/`status` อีกชั้นเป็นด่านสุดท้าย (เพราะ metric key มาจาก thread history + `bi_dashboard_items` ที่ org admin เขียนเองได้ — ด่าน API เดียวไม่พอ)

D4 (gate G4): กำไร/ต้นทุน/คอมมิชชั่น/กองทุน/ปันผล/นักลงทุน = **`owner` เท่านั้น** · analyst/viewer เห็น: มูลค่าพอร์ต, pipeline ต่อ stage, จำนวนงาน, เงินค้างรับ/aging, ยอดรับจริง

### 6.4 Data boundary — ขอบเขตข้อมูลที่เข้า LLM

- เข้า LLM ได้: คำถาม, metric metadata, **result set ที่ aggregate แล้วเท่านั้น**
- **ห้ามเข้า LLM**: result set ระดับ transaction/รายแถว (drill-down detail) — ส่งตรงเข้า `<Table>` ฝั่ง client โดยไม่ผ่าน summarizer
- metric ที่มิติเป็นบุคคล (นักลงทุน) → `no_summarize=true` (แสดงกราฟ+ตารางโดยไม่มี bullet จาก LLM) **และ** `result_rows` ไม่ถูกบันทึกลง `bi_messages` เลย (trigger ล้างที่ DB + engine ไม่เขียนตั้งแต่ต้น)
- `p_allow_draft=true` ใช้ได้เฉพาะ golden test/สคริปต์ตรวจ — เส้นทางผู้ใช้จริง (`/api/bi/ask`) ส่ง `false` เสมอ (ยืนยันด้วยเทส)

### 6.5 Query guardrails

`statement_timeout` + `LIMIT` ใน RPC · `param_schema` จำกัดช่วงเวลาสูงสุดต่อ metric (`max_period_months`) · rate-limit ต่อคน/วัน (`bi_usage_daily`, default 50/วัน) · log token/cost ทุกครั้งลง `bi_query_log` (write deny-all — org admin แก้/ลบไม่ได้)

---

## 7. กับดักที่แก้แล้ว (อาการ → สาเหตุ → วิธีแก้)

### S1 [CRITICAL] ผลลัพธ์อ่อนไหวรั่วผ่านตารางข้อความ

- **อาการ:** viewer หรือแม้แต่คนที่ไม่ได้อยู่ใน module `bi` ยิง PostgREST ตรงก็เห็นยอดปันผล/กำไร/ต้นทุน/คอมมิชชั่นครบได้
- **สาเหตุ:** `bi_messages.result_rows` เก็บผลของ metric owner-only แต่ RLS อ่าน = `is_org_member` ทั้ง org — D4 (RBAC) ถูกบังคับแค่ตอน "ตอบ" ไม่ถูกบังคับกับ "คำตอบที่เก็บไว้แล้ว"
- **วิธีแก้ (3 ชั้น):** (1) policy ระดับผู้ใช้ `created_by = auth.uid()` (2) `REVOKE ALL ... FROM anon, authenticated` ทุกตาราง `bi_*` (3) **ห้ามเก็บ `result_rows` เมื่อ `no_summarize=true`** — trigger `fn_bi_strip_sensitive_rows` ล้างที่ DB เอง

### BLOCKER-1 [ความปลอดภัย] ช่องเดิมกลับมาเปิดที่ฝั่งแอปหลัง REVOKE

- **อาการ:** ตาราง `bi_*` REVOKE แล้วก็จริง แต่ `guard.ts:70` เคยส่ง `profileId: null` (ดึง thread ทั้ง org ไม่กรอง) และ `threads.ts` `getThread()` ไม่กรอง `created_by` + `feedback/route.ts` แก้ feedback ของคนอื่นได้ → viewer/analyst อ่าน `result_rows` ของ metric owner-only ได้อยู่ดี (เพราะ metric พวกนี้ `no_summarize=false` จึงไม่ถูก trigger ล้าง)
- **สาเหตุ:** REVOKE ที่ DB ทำให้ path เดียวที่เหลืออยู่คือ service-role (bypass RLS ทั้งหมด) — ถ้าโค้ดแอปไม่กรองเจ้าของเอง ก็ไม่มีอะไรกรองให้เลย
- **วิธีแก้:** `profileId` เป็นพารามิเตอร์บังคับของทุกฟังก์ชันอ่าน thread/message (ไม่ optional) + กรอง `created_by` เองทุกครั้ง + ไม่ใช่เจ้าของ = 404 — **ข้อผูกพันถาวร ดู §6.1**

### S2 [HIGH] RPC ไม่เช็ค role/status

- **อาการ:** metric key มาจาก thread history หรือ `bi_dashboard_items` (org admin เขียนเองได้) หรือ payload follow-up ก็ยิงผ่านได้ ถ้า RPC ไม่เช็คเอง
- **สาเหตุ:** ด่าน API (ชั้นเดียว) ไม่พอ เพราะ metric key ไม่ได้มาจาก retrieval เสมอไป
- **วิธีแก้:** เพิ่ม `p_role`/`p_allow_draft` ให้ RPC `run_bi_metric` เป็นด่านสุดท้าย (signature 5-arg) — RAISE เมื่อ role ไม่อยู่ใน `allowed_roles` หรือ `status != 'verified'` (เว้น `p_allow_draft=true` เฉพาะ golden test)

### S3 [HIGH] audit log ลบได้

- **อาการ:** `bi_query_log` policy `FOR ALL is_org_admin` ทำให้ org admin ลบ audit ของตัวเองได้ หรือแก้ `cost_usd` บิดรายงานต้นทุน
- **วิธีแก้:** write = **deny-all เต็ม** (ไม่มี exception สำหรับ org admin)

### BLOCKER-2 `period='snapshot'` ทำให้บรรทัดนิยามโกหกเรื่องช่วงเวลา

- **อาการ:** `default_view.period='snapshot'` ไม่มีในสัญญา `BiDefaultView.period` (6 ค่าที่รับรู้) → engine ตกไปใช้ปีปฏิทิน default → RPC ปฏิเสธ (metric snapshot ไม่มี `time_filter` ให้เติม) → retry ตัดวันที่เงียบ **แต่บรรทัดนิยามยังพิมพ์ "ช่วงเวลา: ปี 2569"** ทั้งที่ SQL ไม่ได้กรองวันที่จริง — ขัด §3.1 ข้อ 5 (ทุกคำตอบต้องบอกช่วงเวลาที่ใช้จริง)
- **สาเหตุ:** ของจริงกลับหัวกว่าที่รายงานตอนแรก — ก่อนแก้ engine ตีเป็น snapshot 7 ตัว **ซึ่งเป็นชุดที่ผิดทั้งหมด** (มี `time_basis` ทุกตัว จึงไม่ใช่ snapshot) ส่วน 6 ตัวที่ควรเป็น snapshot จริงกลับไม่ถูกตีเป็น snapshot
- **วิธีแก้:** migration fix (`20260724094000`) แก้ `default_view.period`/`is_snapshot` ให้ตรงตาม `time_basis` จริง + golden test เพิ่ม regression guard (parse seed ทั้งดิบ+fix รวมกัน แล้ว assert `time_basis IS NULL ⇒ period='all'` และ metric ที่มี `time_basis` ต้องไม่เข้าเงื่อนไข snapshot — พร้อม assert ว่า seed ดิบ**ยังมีค่าผิดอยู่จริง** กันเทสผ่านหลอกถ้าใครลบไฟล์ fix)

### N3 มิติถูกรับแล้วเงียบหาย

- **อาการ:** ผู้ใช้ถาม "แยกรายเดือน" ได้คำตอบก้อนเดียวที่ดูเหมือนตอบแล้ว (แต่จริง ๆ ไม่ได้แยก)
- **สาเหตุ:** `time_grain`/`dimension` ที่ intent ส่งมา ถ้า SQL template ของ metric นั้นไม่มีรู (`{{group_by}}`) ให้เสียบ ก็ถูกละเลยเงียบ ๆ
- **วิธีแก้:** ตรวจว่า template รองรับมิติที่ขอมาก่อนรัน ถ้าไม่รองรับ → RAISE (ผู้ใช้เห็นข้อความปฏิเสธที่ชัดเจน แทนคำตอบที่ดูสมบูรณ์แต่ผิด)

### metric ถูกตั้ง verified ก่อน golden test (module-reviewer FAIL 1 blocker)

- **อาการ:** seed migration ตั้ง `status='verified'` 13–14 ตัวตั้งแต่ต้น (ตอนที่ยังไม่มี golden test เขียวและยังไม่ผ่าน gate G4) — แถวเดียวกันยังขัดกันเอง (`owner_label='…(รอเซ็นรับ)'` แต่ `verified_at` ไม่ NULL)
- **สาเหตุ:** ข้ามด่าน §3.1 ข้อ 6 + §8.2 ("golden test → G4 เซ็นรับ → verified" ต้องเรียงตามลำดับ)
- **วิธีแก้:** seed ทุกตัวเป็น `draft` เสมอ + เปิดผ่านสคริปต์แยก [`_bi_activate_metrics.sql`](../supabase/migrations/_bi_activate_metrics.sql) ที่รันได้ก็ต่อเมื่อครบ 3 เงื่อนไข (apply migration + golden test เขียว + G4 เซ็นรับ)

### กับดัก D1: ยอดรวม VAT กับก่อน VAT คนละฐานประชากร

- **อาการ:** `pipeline_value_incl_vat` (รวม VAT) = 1,095,277.35 จาก **13 ใบ** ในขณะที่ `pipeline_value_excl_vat` (ก่อน VAT) = 1,023,623.71 จาก **17 ใบ** — ยอด excl **น้อยกว่า** ยอด incl ทั้งที่ครอบคลุมใบ**มากกว่า** ผู้ใช้ที่เทียบสองตัวเลขนี้แบบผิวเผินจะสรุปผิดทันที (เข้าใจว่า incl−excl ควรเป็นแค่ VAT ของชุดเดียวกัน)
- **สาเหตุ:** ข้อมูลจริงบน prod มีใบที่ยังไม่กรอก `price_incl_vat` อยู่ 4 ใบ (แต่กรอก `price_excl_vat` ครบ 17/17) — สอง metric นี้จึงนับคนละจำนวนใบ ไม่ใช่แค่หักภาษีจากฐานเดียวกัน
- **วิธีแก้:** `definition_th`/`excludes` ของทั้งสอง metric ต้องระบุจำนวนใบที่นับได้ชัดเจน + UI แสดง `priced_count` คู่กับตัวเลขเสมอ (ไม่ใช่แค่ตัวเลขเดี่ยว) — เทสคุมส่วนต่างที่ยอมรับได้ (≤ 1 บาท จากปัดเศษ) ไว้ที่ `PIPELINE_PAIR_NOTE` ใน [`metrics.expected.ts`](../apps/perpos/src/lib/bi/metrics.expected.ts) · **D1 ยังบังคับด้วยว่าคำถามที่ไม่ระบุ incl/excl ต้อง `clarify` ไม่เดา default เงียบ ๆ** (ผ่อนแรง: เลือกครั้งเดียวในเธรดแล้วจำไว้ผ่าน `bi_threads.preferences`)

---

## 8. Provisioning Runbook + Rollback

### 8.1 ลำดับที่ apply แล้วบน prod (org `p2p-x-89`)

1. Migration 4 ไฟล์ผ่าน (`090000`→`094000`, ดู §5) — apply ด้วย Supabase Management API (ไม่ใช่ MCP `apply_migration` เพราะ agent ตัวที่ทำจริงมีแค่ `execute_sql` ในชุดเครื่องมือ — **บันทึกไว้เป็นบทเรียน**: ระบุ tool ที่ agent มีจริงก่อนสั่งงาน หรือให้ orchestrator เป็นคน apply เอง)
2. Verify บน prod: RLS 7/7 ตาราง · `bi_metrics`/`bi_usage_daily` ไม่มี policy (deny-all) · grants anon/authenticated **ว่างทั้ง 7 ตาราง** · `run_bi_metric` เหลือ signature 5-arg ตัวเดียว · trigger `fn_bi_strip_sensitive_rows` เป็น BEFORE INSERT OR UPDATE · `get_advisors` ไม่มีคลาสใหม่
3. ลงทะเบียน `lib/modules.ts` (`ALL_MODULES` key `bi`) + `MODULE_MENUS.bi` (เมนู `chat` + `metrics`) + menu builder ใน [`layouts/hydrogen/menu-items.tsx`](../apps/perpos/src/layouts/hydrogen/menu-items.tsx)
4. `org_module_settings` — 1 แถวเดียวในทั้งระบบ: `organization_id=<p2p-x-89>`, `module_key='bi'`, `is_enabled=true` — **ไม่ใช้ `forOrgSlugs`** (shared module, org binding ทำผ่าน `/admin/modules` ปกติ)
5. `module_members` — seed `iprite@gmail.com` เป็น `bi:owner` เท่านั้น (ไม่ได้ seed LINE user 2 คนของ p2p-x-89 ตามที่ผู้ใช้สั่งตอน B5 — ต่างจากข้อเสนอเดิมของ architect ที่จะให้ทั้ง 2 คนเป็น owner)
6. seed `bi_metrics` 29 metric ทั้งหมด `status='draft'` (`INSERT ... ON CONFLICT (key) DO UPDATE` — idempotent)
7. `pnpm bi:embed` ([`scripts/bi-embed.mjs`](../scripts/bi-embed.mjs), อ่าน key จาก `apps/perpos/.env.local` ท่าเดียวกับ `kb:embed`) — **ต้องรันซ้ำทุกครั้งที่แก้ `label_th`/`synonyms`/`definition_th`** — embedding ครบ 29/29
8. golden test (`lib/bi/metrics.golden.test.ts`) เขียว → รัน [`_bi_metric_check.sql`](../supabase/migrations/_bi_metric_check.sql) ยืนยันเลขจริง (17 ใบ, incl 1,095,277.35 จาก 13 ใบ, excl 1,023,623.71 จาก 17 ใบ, cost 618,112.00 จาก 12 ใบ, stage 13/4, company 4 ราย, capital flows 4 แถว)
9. gate G4 — เจ้าของธุรกิจ p2p-x-89 เซ็นรับ `definition_th` → รัน [`_bi_activate_metrics.sql`](../supabase/migrations/_bi_activate_metrics.sql) ชุดที่ 1 (14 metric) → `status='verified'`

### 8.2 env / secret

`GEMINI_API_KEY` มีอยู่แล้วฝั่ง Next.js (ใช้ร่วมกับ `lib/ai/client.ts`/`lib/assistant/flow-rag.ts`) — **ไม่ต้องตั้ง secret ใหม่** · optional: `BI_GEMINI_*_USD_PER_M` (โมเดลราคาใน [`lib/bi/cost.ts`](../apps/perpos/src/lib/bi/cost.ts)), `BI_DAILY_LIMIT` (default 50 คำถาม/คน/วัน) · **ไม่มี storage bucket / cron / worker ใหม่** (Phase 1 ตอบสด, ไม่เก็บไฟล์)

### 8.3 sanity ก่อนรัน `_bi_activate_metrics.sql`

**3 เงื่อนไขบังคับ (ตรวจครบก่อนรัน ไม่ใช่แค่แนะนำ):**

1. migration schema + seed apply แล้ว
2. golden test เขียว **และ** `_bi_metric_check.sql` ยืนยันเลขจริงตรงทุกบล็อก
3. gate G4 — เจ้าของธุรกิจเซ็นรับ `definition_th` ของ metric ที่จะเปิด **ทีละตัว** (ไม่ใช่เซ็นรวดเดียวทั้งชุด)

สคริปต์แบ่งเป็น **ชุดที่ 1** (14 metric ที่ข้อมูลจริงรองรับแล้ว — เปิดได้) และ **ชุดที่ 2** (15 metric ที่ผ่าน G4 ได้แต่ยังเปิดไม่ได้เพราะข้อมูลจริงยังไม่มี — ตอบ 0 ทุกคำถามจะทำลายความเชื่อถือมากกว่าไม่ตอบ ดู §9)

### 8.4 Rollback — 4 ระดับ

1. **ปิดเร็วทั้ง module:** `UPDATE org_module_settings SET is_enabled=false WHERE module_key='bi' AND organization_id=<p2p-x-89>` — เมนูหาย (หน้าเว็บเช็ค `is_enabled` จริงผ่าน `requireBiPage`), ข้อมูลอยู่ครบ
2. **ปิดเฉพาะการตอบ (ไม่ปิดทั้ง module):** `UPDATE bi_metrics SET status='draft', verified_at=NULL, verified_by=NULL` — บอทตอบ "ยังไม่มีนิยามที่ยืนยัน" แทนตอบเลขผิด (คำสั่งอยู่ในคอมเมนต์ท้าย `_bi_activate_metrics.sql`)
3. **ปิดเฉพาะ metric เดียว:** `UPDATE bi_metrics SET status='draft' WHERE key='<key>'`
4. **ถอดทั้งก้อน:** ตารางทั้ง 7 เป็นของใหม่ทั้งหมด ไม่แตะ schema เดิม (`gov_procure_*` ไม่ถูกแก้เลย) → `DROP TABLE bi_*` ได้โดยไม่กระทบ module อื่น

---

## 9. สถานะปัจจุบัน + ที่ยังไม่ได้ทำ

### 9.1 Phase 1 (โครง module + Engine + Web chat) — เสร็จ, apply prod แล้ว

- migration 5 ไฟล์ applied · module ลงทะเบียนใน `lib/modules.ts` · engine ครบ 9 ไฟล์ (`resolver/intent/runner/chart/answer/ask/threads/metrics/cost/format/period`) · 5 API route · หน้าเว็บ `[orgSlug]/bi` (chat, hybrid SSR) + `[orgSlug]/bi/metrics` (สารบัญตัวชี้วัด, full SSR) พร้อม `loading.tsx` ทั้งคู่
- ChartRenderer ครบ 6 ชนิดตามสัญญา Phase 1 (stat/line/bar/donut/funnel/table) + ตารางดิบพับเก็บ+CSV + panel "ดูวิธีคำนวณ" + ปุ่ม 👍/👎
- golden test (`metrics.golden.test.ts`) parse seed SQL แล้วบังคับ invariant 10 ข้อ ครบทั้ง 29 metric, พิสูจน์ด้วย mutation test 5 แบบว่าจับผิดได้จริง
- vitest รวม **800 เทส / 16 ไฟล์** ผ่านทั้งหมด · tsc 0 · lint clean ตลอดทั้ง build (ไม่มีรอบไหนที่ orchestrator ต้องแก้โค้ดเอง)
- **verified 14 / draft 15** (2026-07-24, gate G4 เซ็นรับแล้ว) — embedding ครบ 29/29

**verified 14 ตัว** (ข้อมูลจริงรองรับแล้ว, เปิดผ่าน `_bi_activate_metrics.sql` ชุดที่ 1):
`order_count` · `pipeline_value_incl_vat` / `_excl_vat` · `pipeline_by_stage_incl_vat` / `_excl_vat` · `by_company_incl_vat` / `_excl_vat` · `purchase_cost_total` · `orders_detail` (no_summarize) · `capital_flow_by_type` · `capital_allocated` · `capital_contribution` · `investor_dividend` (no_summarize) · `investor_repayment` (no_summarize)

**draft 15 ตัว** (ผ่าน G4 ได้แต่ **เปิดไม่ได้เพราะข้อมูลจริงยังไม่มี** — ตอบ 0 ทุกคำถามจะทำลายความเชื่อถือมากกว่าไม่ตอบ ตาม §3.1 ข้อ 4):

| metric                                     | รออะไร                                                                                                                                    |
| ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `receivable_outstanding`                   | มีงาน `stage='delivered'` และกรอก `net_receivable`                                                                                        |
| `receivable_overdue`                       | ข้างต้น + กรอก `delivery_date`                                                                                                            |
| `receivable_aging_buckets`                 | ข้างต้น + กรอก `delivery_date`                                                                                                            |
| `revenue_collected`                        | มีงาน `stage in (paid,closed)` + กรอก `receipt_date`                                                                                      |
| `cycle_time_avg`                           | กรอกครบทั้ง `contract_date` และ `receipt_date`                                                                                            |
| `profit_realized` / `profit_pending`       | กรอก `net_profit_89` (ตอนนี้ = 0 ทุกแถว)                                                                                                  |
| `profit_margin_pct_incl_vat` / `_excl_vat` | เช่นเดียวกัน (ไม่งั้นได้ 0% ทุกกลุ่ม)                                                                                                     |
| `commission_payable`                       | กรอก `commission_net_payable` (ตอนนี้ = 0)                                                                                                |
| `stuck_orders`                             | กรอกวันที่หมุด (ตอนนี้เหลือ fallback `start_date` อย่างเดียว)                                                                             |
| `cost_total`                               | กรอก `total_cost_89` (ตอนนี้ว่าง — ใช้ `purchase_cost_total` แทนไปก่อน)                                                                   |
| `top_customers_incl_vat` / `_excl_vat`     | มีหน่วยงานผู้ซื้อมากกว่า 1 ราย (ตอนนี้ `customer_name` distinct = 1)                                                                      |
| `capital_pool_balance`                     | เจ้าของยืนยัน "ทิศทางเข้า-ออก" ของ `flow_type` ทั้ง 5 ชนิด (เป็นยอดสะสมทุกช่วงเวลา ไม่ใช่ยอดของช่วง — ต้องให้เจ้าของธุรกิจอ่านตอนเซ็นรับ) |

เปิดทีละตัวได้ด้วย `UPDATE bi_metrics SET status='verified', verified_at=now(), verified_by='<uuid>' WHERE key='<key>' AND status='draft'` เมื่อข้อมูลไหลเข้าตามเงื่อนไข — **ไม่ต้องแก้โค้ด**

### 9.2 ที่ยังไม่ทำ

- **Phase 2 — LINE `/bi <คำถาม>`:** ยังไม่มีโค้ดใน webhook เลย — ต้องเพิ่มคำสั่ง `/bi`/`/ถาม` ใน [`api/line/webhook/route.ts`](../apps/perpos/src/app/api/line/webhook/route.ts), ตาราง `bi_line_groups` (mapping กลุ่ม↔org, ยังไม่มีใน migration), Loading Animation API + push Flex KPI card, dedup ต่อ `line_message_id` + rate-limit
- **Phase 3 — Interactive Dashboard เต็มรูป:** ตาราง `bi_dashboards`/`bi_dashboard_items` **สร้างไว้แล้วใน migration** แต่**ไม่มีหน้า `/:orgSlug/bi/dashboards/[id]` และไม่มี API ปักหมุด** · **`comparison` (prev_period/yoy) คำนวณช่วงเทียบและแสดงในบรรทัดนิยามแล้ว แต่ยังไม่ยิง query รอบสองเพื่อดึงตัวเลขช่วงก่อนจริง** (โครง engine รองรับไว้แล้ว รอวัด latency จริง < 8s ก่อนเปิด) · drill-down คลิก datapoint → รายการ transaction ยังไม่เชื่อมกับ UI (metric `_detail` มีแล้วในระดับ SQL แต่ chart ยังไม่มี onClick)
- **Phase 4:** ยังไม่รีวิว `bi_query_log` เป็น loop ปรับปรุง semantic layer · org ที่สอง (บัญชี) ยังไม่เปิด (metric accounting = ไม่ทำใน Phase 1 ตามมติ D3) · ยังไม่มีหน้า admin จัดการ `bi_metrics` (แก้ SQL ยังต้องทำผ่าน migration/สคริปต์มือเท่านั้น — **ตั้งใจ**: ดู §6.2 ข้อผูกพันถาวรเรื่องสิทธิ์เขียน)
- **Phase 5 — Free-form SQL fallback + Proactive:** ยังไม่ทำทั้งหมด (validator `node-sql-parser`, anomaly alert, cache)
- **accounting metric (§7.4 ของ contract):** ยังไม่ทำใน Phase 1 ตามมติ D3 — วางไว้ Phase 4 ข้อ 2 (จุดพิสูจน์ shared module) รอ org ที่สองเปิดจริง

---

## 10. Code Map

### Migration (`supabase/migrations/`)

| ไฟล์                                                                                                              | เนื้อหา                                                |
| ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| [`20260724090000_bi_schema.sql`](../supabase/migrations/20260724090000_bi_schema.sql)                             | 7 ตาราง + RLS + index + trigger + 4 RPC + REVOKE/GRANT |
| [`20260724091000_bi_metrics_seed.sql`](../supabase/migrations/20260724091000_bi_metrics_seed.sql)                 | seed 29 metric (draft ทั้งหมด)                         |
| [`20260724092000_bi_messages_answer_meta.sql`](../supabase/migrations/20260724092000_bi_messages_answer_meta.sql) | คอลัมน์ `bi_messages.answer_meta`                      |
| [`20260724093000_bi_revoke_trigger_fn.sql`](../supabase/migrations/20260724093000_bi_revoke_trigger_fn.sql)       | REVOKE trigger fn ที่ตกหล่น                            |
| [`20260724094000_bi_metrics_seed_fix.sql`](../supabase/migrations/20260724094000_bi_metrics_seed_fix.sql)         | แก้ `default_view.period` (BLOCKER-2)                  |
| `_bi_metric_check.sql` (ไม่ apply อัตโนมัติ)                                                                      | ตรวจเลขจริงบน prod เทียบทุก metric                     |
| `_bi_activate_metrics.sql` (ไม่ apply อัตโนมัติ)                                                                  | เปิด draft→verified หลังผ่าน 3 เงื่อนไข + rollback     |

### lib (`apps/perpos/src/lib/bi/`)

| ไฟล์                                                                                         | export หลัก                                                                                                                                                                                                          |
| -------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `types.ts`                                                                                   | `BiRole`, `MetricStatus`, `ChartType`, `TimeGrain`, `Comparison`, `AnswerStatus`, `AnswerSource`, `BiMetric`, `BiMetricParams`, `BiAnswer`, `BiChartSpec`, `BiThread`, `BiMessage`, `BiDefaultView`, `BiResultShape` |
| `resolver.ts`                                                                                | `embedQuestion()`, `matchMetrics()`, `resolveOrgScopes()`                                                                                                                                                            |
| `intent.ts`                                                                                  | `extractIntent()` (Gemini structured output)                                                                                                                                                                         |
| `runner.ts`                                                                                  | `validateParams()`, `runMetric()`, `classifyRunError()`                                                                                                                                                              |
| `chart.ts`                                                                                   | `chooseChart()`, `buildChartSpec()`                                                                                                                                                                                  |
| `answer.ts`                                                                                  | `narrateAnswer()`, `buildDefinitionLine()`, `verifyBulletNumbers()`                                                                                                                                                  |
| `ask.ts`                                                                                     | `askBi()` — orchestrator 6 สเต็ป                                                                                                                                                                                     |
| `threads.ts`                                                                                 | `listThreads()`, `getThread()`, `createThread()`, `appendMessage()`, `getThreadPreferences()`, `setThreadPreferences()`, `isThreadOwnedBy()`, `isMessageOwnedBy()`                                                   |
| `metrics.ts`                                                                                 | `listVisibleMetrics()`                                                                                                                                                                                               |
| `cost.ts`                                                                                    | `getBiPricing()`, `estimateBiCostUsd()` (mirror `lib/assistant/stt-cost.ts`)                                                                                                                                         |
| `format.ts`                                                                                  | `formatMetricValue()`                                                                                                                                                                                                |
| `period.ts`                                                                                  | ช่วยคำนวณ `default_view.period` → ช่วงวันที่จริง                                                                                                                                                                     |
| `metrics.golden.test.ts` / `metrics.expected.ts`                                             | golden test + ค่าที่ verify กับ prod แล้ว                                                                                                                                                                            |
| `chart.test.ts` / `format.test.ts` / `period.test.ts` / `history.test.ts` / `engine.test.ts` | เทสหน่วยย่อยของแต่ละไฟล์                                                                                                                                                                                             |

### API (`apps/perpos/src/app/api/bi/`)

| Route                   | Method   | หน้าที่                                                      |
| ----------------------- | -------- | ------------------------------------------------------------ |
| `_lib.ts`               | —        | `requireBiMember(req, orgId)` → `{ok,userId,orgId,role,rls}` |
| `ask/route.ts`          | POST     | orchestrator เต็ม 6 สเต็ป                                    |
| `threads/route.ts`      | GET/POST | list/create thread                                           |
| `threads/[id]/route.ts` | GET      | ดูประวัติ thread เดียว                                       |
| `feedback/route.ts`     | POST     | 👍/👎 ต่อ message                                            |
| `metrics/route.ts`      | GET      | metric ที่ role นี้เห็นได้ (verified เท่านั้น)               |

### หน้าเว็บ (`apps/perpos/src/app/(hydrogen)/[orgSlug]/bi/`)

| ไฟล์                                       | หน้าที่                                                                                                      |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------ |
| `page.tsx` / `loading.tsx`                 | หน้าแชทหลัก (hybrid: SSR initial thread + client mutation)                                                   |
| `metrics/page.tsx` / `metrics/loading.tsx` | สารบัญตัวชี้วัด (full SSR)                                                                                   |
| `_components/guard.ts`                     | `requireBiPage()`, `loadChatInitialData()`, `loadVisibleMetrics()` — service-role only, กรอง `profileId` เอง |
| `_components/chat-client.tsx`              | client chat state + mutation                                                                                 |
| `_components/answer-card.tsx`              | AnswerCard ตามสัญญา §4 (5 ส่วน)                                                                              |
| `_components/chart-renderer.tsx`           | switch ชนิดกราฟ 6 แบบ (Recharts, สี = CSS token)                                                             |
| `_components/raw-rows.tsx`                 | ตารางดิบพับเก็บ + CSV export                                                                                 |

### อื่น ๆ

- `lib/modules.ts` — entry `bi` (`ALL_MODULES`) + `MODULE_MENUS.bi` (chat/metrics) + `layouts/hydrogen/menu-items.tsx`
- `lib/ai/prompts/bi-intent.v1.txt`, `bi-answer.v1.txt` — prompt versioned
- [`scripts/bi-embed.mjs`](../scripts/bi-embed.mjs) + `pnpm bi:embed` — re-embed metric (label/synonyms/definition)
