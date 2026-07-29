# SPEC — Client Document Vault (คลังเอกสารลูกค้า)

**Module:** Accounting Office (สำนักงานบัญชี · `acc_firm`) · **Product:** Perpos · **Tenant แรก:** JTACC (org slug `jtacc`)
**Stack:** Next.js (App Router) · Supabase (Postgres + RLS + Storage) · pnpm monorepo · Gemini API · LINE Messaging API

> **สถานะ:** อนุมัติแนวทางแล้ว 2026-07-29 — ดู **§11 Decisions** ท้ายไฟล์ (ข้อที่ spec ต้นฉบับขัดกับ pattern ของ repo ถูกตัดสินไว้แล้ว **§11 ชนะเสมอ**)

---

## 1. Problem

สำนักงานบัญชีรับเอกสารจากลูกค้าเป็นกล่อง เป็นไฟล์ LINE เป็นอีเมล กระจัดกระจาย ทำให้เกิด 3 ปัญหาจริง:

1. **ทวงเอกสารไม่จบ** — ไม่รู้ว่าลูกค้ารายไหนขาดเอกสารอะไรของเดือนไหน จนใกล้ deadline ยื่นแบบ
2. **ข้อพิพาท "ส่งแล้ว/ไม่ได้รับ"** — ไม่มีทะเบียนรับ-ส่งเอกสารที่พิสูจน์ได้ สำนักงานเป็นฝ่ายเสียเปรียบเสมอ
3. **Compliance เสี่ยง** — พ.ร.บ.การบัญชี 2543 ม.13 บังคับเก็บ ≥ 5 ปี, ม.15 เอกสารสูญหายต้องแจ้งสารวัตรบัญชีภายใน 15 วัน, และ PDPA เพราะไฟล์มีบัตรประชาชน/เงินเดือนพนักงานลูกค้า

**เป้าหมายของ feature:** ทำให้ "แฟ้มลูกค้า 1 ราย" เป็นของดิจิทัลที่ค้นได้ ตรวจครบได้ พิสูจน์การรับ-ส่งได้ และหมดอายุเก็บอัตโนมัติตามกฎหมาย

---

## 2. Scope

### In scope (Phase 1–2)

- Client registry + fiscal year
- Document taxonomy + checklist ต่อ client-year / client-period
- Upload (web drag-drop, mobile, LINE) + versioning
- **Document Custody Log** (ทะเบียนรับ-ส่งเอกสาร)
- Retention engine + Legal Hold
- Access log / audit trail (PDPA)
- Missing-document alerts ผูกกับ deadline ยื่นแบบภาษี

### Out of scope (อย่าเพิ่งทำ)

- ลงบัญชีอัตโนมัติ / posting เข้า GL
- e-Tax Invoice integration
- ยื่นแบบผ่าน RD API
- OCR full-text ทุกหน้า (Phase 3)

---

## 3. Document Taxonomy (seed data)

โครงเป็น 2 ชั้น: `permanent` (แฟ้มถาวร) กับ `periodic` (แฟ้มรายงวด)

| code  | group                   | scope                     | ตัวอย่างเอกสาร                                                                                     |
| ----- | ----------------------- | ------------------------- | -------------------------------------------------------------------------------------------------- |
| `REG` | Registration & KYC      | permanent                 | หนังสือรับรอง, บอจ.2/3/5, ภ.พ.20, ใบอนุญาตเฉพาะธุรกิจ, ผังผู้ถือหุ้น                               |
| `ENG` | Engagement & Legal      | permanent                 | สัญญาจ้างทำบัญชี, หนังสือมอบอำนาจ, DPA, NDA, หนังสือแจ้งเป็นผู้ทำบัญชี (e-Accountant), Rep. Letter |
| `SRC` | Source Documents        | periodic (monthly)        | ใบกำกับภาษีซื้อ/ขาย, ใบเสร็จ, ใบแจ้งหนี้, voucher, bank statement, payroll                         |
| `BOK` | Books & Financials      | periodic (yearly)         | สมุดรายวัน, แยกประเภท, งบทดลอง, working paper, งบการเงิน, สบช.3                                    |
| `TAX` | Tax & Statutory Filings | periodic (monthly/yearly) | ภ.ง.ด.1/3/53/54, ภ.พ.30/36, ภ.ง.ด.50/51, สปส.1-10, 50 ทวิ, TP Disclosure Form                      |
| `ADM` | Firm Admin              | periodic                  | ใบรับ-คืนเอกสาร, ใบทวงเอกสาร, backup log                                                           |

แต่ละ category ต้องมี field: `retention_years`, `is_sensitive` (มีข้อมูลส่วนบุคคล/อ่อนไหว), `required_by_default`, `frequency` (`once` | `monthly` | `yearly`)

---

## 4. Data Model (Postgres / Supabase)

> **§11 D1/D2 ปรับจาก spec ต้นฉบับ**: ไม่มีตาราง `firms` / `firm_members` / `clients` ใหม่ —
> ใช้ `organizations` + `organization_members` + `module_members` ที่มีอยู่ และ **ทะเบียนลูกค้า = `acc_firm_service_clients`**
> ทุกตารางใหม่ขึ้นต้น `acc_firm_vault_*` และมี `firm_org_id uuid not null references organizations(id)` + เปิด RLS

```
-- ของเดิมที่ reuse (ไม่แก้ schema)
organizations / organization_members / module_members        -- tenant + สิทธิ์ (module 'acc_firm')
acc_firm_clients(firm_org_id, client_org_id, ...)            -- ลูกค้าที่มี org ใน perpos
acc_firm_service_clients(id, firm_org_id, client_code,
                         company_name, svc_*, is_active, ...) -- ลูกค้าทุกราย (ไม่ต้องมี org) ← ทะเบียนหลักของ vault
acc_tax_filings                                               -- deadline/สถานะยื่นแบบ (ใช้กับ §7 alerts)

-- ส่วนขยายบน acc_firm_service_clients (Phase 1)
ALTER TABLE acc_firm_service_clients ADD COLUMN
  tax_id text, entity_type text, vat_registered bool,
  fiscal_year_end date,                     -- default 12-31
  storage_location text,                    -- ที่เก็บเอกสารจริง (ม.13)
  dbd_relocation_notified bool,             -- แจ้งย้ายสถานที่เก็บบัญชีต่อ DBD แล้วหรือยัง
  client_org_id uuid null references organizations(id)   -- ผูกกับ org ถ้าลูกค้าใช้ perpos ด้วย

-- ตารางใหม่
acc_firm_vault_periods(id, firm_org_id, client_id, kind, period_start, period_end,
                       fiscal_year int, closed_at)          -- kind: month | year
acc_firm_vault_categories(id, code, group_code, name_th, name_en,
                          frequency, retention_years int, is_sensitive bool,
                          required_by_default bool)          -- global seed (§11 D6 — ไม่มี firm_org_id)
acc_firm_vault_templates(id, firm_org_id, name, entity_type, vat_registered)
acc_firm_vault_template_items(id, template_id, category_id, is_required, due_rule)
                                                             -- due_rule เช่น 'PERIOD_END+7d'
acc_firm_vault_checklist(id, firm_org_id, client_id, period_id, category_id,
                         status, due_date, waived_reason, last_reminded_at)
                                                             -- status: missing|received|verified|na
acc_firm_vault_documents(id, firm_org_id, client_id, period_id, category_id,
                         title, storage_path, mime_type, size_bytes,
                         sha256 text not null,               -- dedupe + tamper evidence
                         doc_date date, amount numeric, counterparty text,
                         classification text,                -- public|internal|confidential|personal_data
                         status,                             -- draft|active|superseded|pending_purge|purged
                         retention_until date not null,
                         legal_hold bool default false,
                         uploaded_by, uploaded_at, source)   -- web|line|email|scan|api
acc_firm_vault_document_versions(id, document_id, version int, storage_path, sha256,
                                 created_by, created_at)
acc_firm_vault_custody_log(id, firm_org_id, client_id, direction,     -- in | out
                           handed_by text, received_by uuid, method text,
                           item_summary text, item_count int,
                           signature_path text, photo_path text,
                           occurred_at timestamptz, note text)
acc_firm_vault_access_log(id, firm_org_id, document_id, user_id, action, ip, user_agent, at)
                                                             -- action: view|download|share|delete
acc_firm_vault_incidents(id, firm_org_id, client_id, type, occurred_at, discovered_at,
                         reported_to_dbd_at, reported_to_pdpc_at, description)
                                                             -- type: document_lost|document_damaged|data_breach
acc_firm_vault_audit(id, firm_org_id, actor_id, entity, entity_id, action,
                     before jsonb, after jsonb, at)
```

**Constraints ที่ต้องมีจริง:**

- `acc_firm_vault_documents`: unique `(firm_org_id, client_id, sha256)` เพื่อกัน upload ซ้ำ
- `acc_firm_vault_audit` และ `_access_log`: `REVOKE UPDATE, DELETE` จาก role ทั้งหมด — append-only เท่านั้น
- `retention_until` คำนวณจาก `period.fiscal_year_end + category.retention_years` ด้วย trigger ไม่ให้ client ส่งค่ามาเอง
- RLS ทุกตาราง: `EXISTS (SELECT 1 FROM organization_members WHERE organization_id = firm_org_id AND user_id = auth.uid() AND is_active)` (+ super_admin bypass) ตามแบบ `acc_firm_service_clients`

---

## 5. Retention Rules (hard-code ค่า default เหล่านี้)

| ประเภท                       | retention_years | อ้างอิง                                                |
| ---------------------------- | --------------- | ------------------------------------------------------ |
| SRC (เอกสารประกอบการลงบัญชี) | 7               | พ.ร.บ.การบัญชี ม.13 (ขั้นต่ำ 5 อธิบดีขยายได้ถึง 7)     |
| BOK (สมุดบัญชี + งบการเงิน)  | 10              | สรรพากรประเมินย้อนหลังได้ถึง 10 ปีกรณีไม่ยื่น/ยื่นเท็จ |
| TAX (แบบ + ใบเสร็จ)          | 10              | เหตุผลเดียวกัน                                         |
| REG / ENG                    | 0 = เก็บถาวร    | ใช้ตลอดอายุความสัมพันธ์ + 10 ปีหลังเลิกสัญญา           |
| ADM                          | 5               | อายุความทางแพ่ง                                        |

**Purge job (§11 D3 — tier `t60` ใน `/api/assistant/scheduler` ไม่ใช่ Edge Function/pg_cron):**

1. เลือกเอกสารที่ `retention_until < now()` และ `legal_hold = false`
2. เปลี่ยน status → `pending_purge` และแจ้ง manager รอ 30 วัน
3. ต้องมี manual approve ก่อนลบจริง — **ห้าม auto-delete โดยไม่มีคนกด**
4. ลบไฟล์จาก Storage แต่ **เก็บ metadata row + sha256 ไว้ตลอด** เป็นหลักฐานว่าเคยมีและถูกทำลายเมื่อไหร่

---

## 6. PDPA Requirements (บังคับ ไม่ใช่ nice-to-have)

- Bucket **`acc_vault`** (§11 D5 — bucket ใหม่ ไม่ใช้ `client_documents` เดิม) ต้องเป็น **private** เท่านั้น
  เข้าถึงผ่าน **signed URL TTL ≤ 60 วินาที** และทุกครั้งต้องเขียน `acc_firm_vault_access_log`
- Path convention: `{firm_org_id}/{client_id}/{fiscal_year}/{category_code}/{uuid}.{ext}` — ห้ามใส่ชื่อลูกค้าหรือเลขบัตรใน path
- เอกสารที่ `is_sensitive = true` (payroll, สำเนาบัตรประชาชน) → ต้องมี role `owner` ของ module จึงดาวน์โหลดได้ และแสดง banner เตือนก่อนดาวน์โหลด
- หน้า **RoPA export** — ออกรายงานกิจกรรมการประมวลผลข้อมูลต่อลูกค้า 1 ราย (JTACC เป็น Data Processor ให้ลูกค้า)
- หน้า **Incident** — บันทึกเหตุเอกสารสูญหาย/ข้อมูลรั่ว พร้อมนับถอยหลัง **15 วัน** (แจ้ง DBD ตาม ม.15) และ **72 ชั่วโมง** (แจ้ง PDPC)

---

## 7. Alerts (ผูกกับ deadline จริง)

| แบบ                  | Deadline                                    | เตือนก่อน      |
| -------------------- | ------------------------------------------- | -------------- |
| ภ.ง.ด.1 / 3 / 53     | วันที่ 7 ของเดือนถัดไป (e-Filing +8 วัน)    | 10, 5, 2 วัน   |
| ภ.พ.30               | วันที่ 15 ของเดือนถัดไป (e-Filing +8 วัน)   | 10, 5, 2 วัน   |
| สปส.1-10             | วันที่ 15 ของเดือนถัดไป                     | 5 วัน          |
| ภ.ง.ด.51             | ภายใน 2 เดือนนับแต่วันสุดท้ายของ 6 เดือนแรก | 30, 14, 7 วัน  |
| ภ.ง.ด.50 + งบการเงิน | ภายใน 150 วันนับแต่วันปิดบัญชี              | 45, 30, 14 วัน |

Alert ยิงเข้า **LINE** ผ่าน `sendLineMessages()` เดิม (Flex ตาม [line-flex-card-guide.md](../line-flex-card-guide.md))
ทั้งฝั่งพนักงาน JTACC และฝั่งลูกค้า — deep link เข้าหน้าเว็บ vault (§11 D8: **ยังไม่มี LIFF** ในระบบ ยกไป Phase 3)
วันครบกำหนดใช้ตัวเดียวกับ [tax-calendar.ts](../../apps/perpos/src/lib/acc-firm/tax-calendar.ts) — ห้ามคำนวณ deadline ซ้ำที่อื่น

---

## 8. Phasing

**Phase 1 — Foundation (~2 สัปดาห์)**
schema + RLS + upload/download + taxonomy seed + checklist ต่อ period + custody log + audit trail

**Phase 2 — Compliance (~2 สัปดาห์)**
retention engine + purge approval flow + access log UI + incident tracker + RoPA export + LINE alerts

**Phase 3 — AI (~3 สัปดาห์)**
Gemini auto-classify เอกสารที่อัปโหลด → เดา `category_id`, ดึง `doc_date`, `amount`, `counterparty`, เลขผู้เสียภาษี
แล้ว auto-match กับ checklist item + LINE/LIFF upload flow + full-text search (pgvector)
— ต่อยอดจาก pipeline OCR เดิม ([ACC_FIRM_OCR_FEATURE.md](../ACC_FIRM_OCR_FEATURE.md))

---

## 9. Acceptance Criteria (Phase 1)

- [ ] ผู้ใช้จาก firm A **ไม่สามารถ**อ่าน/เขียน row ของ firm B ได้เลย — พิสูจน์ด้วย test ที่รันด้วย 2 tenant
- [ ] อัปโหลดไฟล์เดิมซ้ำ → ระบบตรวจ sha256 แล้วเตือน ไม่สร้าง row ใหม่
- [ ] เปิดหน้า client-period แล้วเห็นทันทีว่า "ขาดอะไรบ้าง" เป็น checklist สีแดง/เขียว
- [ ] บันทึกรับเอกสารพร้อมลายเซ็นลูกค้า (canvas signature) แล้วออกใบรับเอกสารเป็น PDF ได้ (ผ่าน `pdf-renderer` เดิม)
- [ ] ทุกการ download มี row ใน `acc_firm_vault_access_log` — ลองแก้/ลบ row นั้นแล้วต้อง error
- [ ] `retention_until` ถูกคำนวณอัตโนมัติ ไม่ยอมรับค่าจาก client payload

---

## 10. ข้อห้าม

- ห้ามใช้ service_role key ในโค้ดฝั่ง client หรือใน route handler **ที่ยังไม่ผ่าน guard** — pattern ที่ถูกคือ
  `requireModuleMember(req, firmOrgId, 'acc_firm')` **ก่อน** แล้วจึง `createAdminClient()` (§11 D4)
- ห้ามทำ public bucket
- ห้ามเขียน raw SQL ที่รับ input จาก user โดยไม่ parameterize
- ห้าม auto-delete เอกสารโดยไม่มี approval flow

---

## 11. Decisions — ข้อที่ปรับจาก spec ต้นฉบับให้เข้ากับ repo (อนุมัติ 2026-07-29)

| #   | spec ต้นฉบับ                                 | ของจริงใน repo                                                                                                | มติ                                                                                                                       |
| --- | -------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| D1  | `firms`, `firm_members`, JWT claim `firm_id` | ไม่มี custom JWT claim — `organizations` + `organization_members` + `module_members`                          | ใช้ `firm_org_id` แทน `firm_id` ทุกตาราง · สิทธิ์ = `requireModuleMember(..., 'acc_firm')`                                |
| D2  | ตาราง `clients` ใหม่                         | มี `acc_firm_clients` (ลูกค้าที่มี org) + `acc_firm_service_clients` (ลูกค้าทุกราย)                           | **vault ผูกกับ `acc_firm_service_clients`** — ลูกค้าไม่จำเป็นต้องมี org ใน perpos · เพิ่มคอลัมน์ optional `client_org_id` |
| D3  | Edge Function + `pg_cron`                    | cron = Google Cloud Scheduler → `/api/assistant/scheduler` + tier `t5/t15/t60`                                | purge sweep + alert = tier `t60` ใน scheduler เดิม                                                                        |
| D4  | ห้าม service_role ใน route handler ทุกกรณี   | ทั้ง module ใช้ `createAdminClient()` หลัง guard (firm member ไม่ได้เป็นสมาชิก client org จึงต้อง bypass)     | **คง pattern เดิม** — guard ก่อน แล้ว admin client · RLS เป็นชั้นสอง                                                      |
| D5  | path `{firm_id}/…` ใน bucket เดิม            | `client_documents` policy ผูก prefix = `client_org_id`                                                        | สร้าง bucket ใหม่ **`acc_vault`** (private) แยก ไม่ยัดลงของเดิม                                                           |
| D6  | "ทุกตารางมี firm_id ไม่มีข้อยกเว้น"          | ขัดกันเองใน spec — taxonomy เป็น seed กลาง                                                                    | `acc_firm_vault_categories` = global (ไม่มี `firm_org_id`) · template/checklist มี `firm_org_id`                          |
| D7  | integration test ด้วย JWT 2 firm             | มีแค่ vitest unit ([accounting-rules.test.ts](../../apps/perpos/src/lib/accounting/accounting-rules.test.ts)) | สร้าง test tenant-isolation ใหม่ (SQL 2 role / harness) — ต้องแดงก่อนแล้วค่อยเขียว                                        |
| D8  | LIFF upload page                             | ระบบยังไม่มี LIFF (มีแค่ webhook + magic link `/web`)                                                         | Phase 1–2 = LINE push + deep link เข้าเว็บ · LIFF ยกไป Phase 3                                                            |
| D9  | checklist ต่อ period แยกหน้า                 | มี **close-check** (ตรวจปิดงวด) อยู่แล้ว                                                                      | รวมเป็นแท็บเดียวกันภายใต้ `/acc-firm` — ไม่ทำหน้าซ้ำ                                                                      |

### ที่วางไฟล์ (Phase 1)

| ชั้น      | path                                                                            |
| --------- | ------------------------------------------------------------------------------- |
| migration | `supabase/migrations/2026…_acc_firm_vault.sql` (+ `…_seed.sql`, `…_bucket.sql`) |
| lib       | `apps/perpos/src/lib/acc-firm/vault/*.ts`                                       |
| API       | `apps/perpos/src/app/api/acc-firm/vault/*`                                      |
| UI        | `apps/perpos/src/app/(hydrogen)/[orgSlug]/acc-firm/vault/*`                     |
| docs      | `docs/ACC_FIRM_VAULT_FEATURE.md` (เขียนตอนจบ Phase 1)                           |
