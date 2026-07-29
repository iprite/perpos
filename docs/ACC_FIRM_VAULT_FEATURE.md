# คลังเอกสารลูกค้า (Client Document Vault) — `acc_firm`

> ต่อเติมบน module **สำนักงานบัญชี** (`acc_firm`, per-org, ปัจจุบันเปิดให้ `jtacc`)
> spec ธุรกิจ/กฎหมาย = [`docs/specs/jtacc-document-vault.md`](specs/jtacc-document-vault.md) ·
> contract วิศวกรรม = `.claude/feature-factory/specs/acc-firm-vault.md`
> **อ่านไฟล์นี้ก่อนแตะ `/acc-firm/vault` ทุกครั้ง**

ทำให้ "แฟ้มลูกค้า 1 ราย" เป็นของดิจิทัลที่ **ค้นได้ · ตรวจครบได้ · พิสูจน์การรับ-ส่งได้ · หมดอายุเก็บตามกฎหมายเอง**
แก้ 3 ปัญหาจริงของสำนักงานบัญชี: ทวงเอกสารไม่จบ · ข้อพิพาท "ส่งแล้ว/ไม่ได้รับ" · ความเสี่ยง พ.ร.บ.การบัญชี + PDPA

---

## 1. invariant ที่ห้ามพัง (ผิดแล้วผิดกฎหมาย/เสียหลักฐาน)

| #   | กฎ                                                                                                                                                                                                                                                                                                                                     | บังคับที่ไหน                                                                                   |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| I1  | **`retention_until` คำนวณโดย DB เท่านั้น** — ค่าที่ client ส่งมาถูกเขียนทับทุก INSERT/UPDATE                                                                                                                                                                                                                                           | trigger `acc_firm_vault_set_retention()` (ยิงทุก UPDATE ไม่ใช่เฉพาะบางคอลัมน์ — เคยพลาดมาแล้ว) |
| I2  | **เอกสารที่บันทึกแล้วลบทิ้งไม่ได้** — ต้องเดิน `active → pending_purge → purged` และ**เก็บ metadata + sha256 ไว้ตลอด** เป็นหลักฐานว่าเคยมีและถูกทำลายเมื่อไร                                                                                                                                                                           | trigger `acc_firm_vault_guard_delete()` (อนุญาตลบเฉพาะ `draft` ที่ไม่ติด legal hold)           |
| I3  | **เอกสารที่ติด `legal_hold` แตะไม่ได้** และ**ปลด hold ได้เฉพาะ module role `owner`**                                                                                                                                                                                                                                                   | trigger `acc_firm_vault_guard_hold()`                                                          |
| I4  | **ไฟล์เข้าถึงได้ผ่าน signed URL ≤ 60 วินาทีเท่านั้น** และ**ต้องเขียน `acc_firm_vault_access_log` ก่อนคืน URL เสมอ** (ไม่มี log = ไม่ให้ไฟล์)                                                                                                                                                                                           | `createDownloadUrl()` ใน `lib/acc-firm/vault/documents.ts`                                     |
| I5  | **access log + audit เป็น append-only** — `UPDATE/DELETE` ถูก `REVOKE` จากทุก role **รวม `service_role`** ห้าม GRANT คืน                                                                                                                                                                                                               | migration `20260729160000`                                                                     |
| I6  | เอกสารประเภท `is_sensitive` (payroll, สำเนาบัตรประชาชน, ภ.ง.ด.1, สปส.) **ดาวน์โหลดได้เฉพาะ `owner`** + UI เตือนก่อนเปิด                                                                                                                                                                                                                | `createDownloadUrl()` + `documents-tab.tsx`                                                    |
| I7  | **path ห้ามมีชื่อลูกค้า/เลขบัตร** — `{firm_org_id}/{client_id}/{fiscal_year}/{category_code}/{uuid}.{ext}`                                                                                                                                                                                                                             | `buildStoragePath()` (ชื่อไฟล์เดิมถูกทิ้ง ใช้ uuid)                                            |
| I8  | **วันครบกำหนดยื่นแบบไม่คำนวณซ้ำที่นี่** — ของนั้นอยู่ที่ [`lib/acc-firm/tax-calendar.ts`](../apps/perpos/src/lib/acc-firm/tax-calendar.ts) · vault คำนวณเฉพาะ `due_rule` ของ checklist (`PERIOD_END+<n>d`)                                                                                                                             | `resolveDueDate()`                                                                             |
| I9  | ทะเบียนลูกค้าของ vault = **`acc_firm_service_clients`** — ลูกค้า**ไม่จำเป็นต้องมี org ใน perpos** (ผูกได้ผ่าน `client_org_id` ถ้ามี) · ตั้งแต่ 2026-07-29 ตารางนี้เป็น **ทะเบียนลูกค้าตัวเดียวของทั้ง acc_firm** (หน้าเดียว `/acc-firm/clients`) และ `acc_firm_clients` = engagement ของแถวในทะเบียน — engagement ต้องมีแถวทะเบียนเสมอ | ทั้งฟีเจอร์                                                                                    |

---

## 2. Data model

11 ตาราง prefix `acc_firm_vault_*` (ทุกตัวมี `firm_org_id` + RLS ยกเว้น taxonomy กลาง):

```
acc_firm_vault_categories        taxonomy กลาง 39 รายการ (REG/ENG/SRC/BOK/TAX/ADM) — ไม่มี firm_org_id
acc_firm_vault_templates         แม่แบบ checklist ต่อสำนักงาน
  └ _template_items              category + is_required + due_rule ('PERIOD_END+7d')
acc_firm_vault_periods           งวด (month|year) ต่อลูกค้า
acc_firm_vault_checklist         รายการที่ต้องเก็บของงวดนั้น (missing|received|verified|na)
acc_firm_vault_documents         เอกสาร + sha256 + retention_until + legal_hold
  └ _document_versions           เวอร์ชันย้อนหลัง
acc_firm_vault_custody_log       ทะเบียนรับ-ส่ง (in|out) + เลขที่ใบรับ RCV/RTN-<พ.ศ.>-NNNN
acc_firm_vault_access_log        PDPA access trail (append-only)
acc_firm_vault_audit             audit trail (append-only)
acc_firm_vault_incidents         เอกสารสูญหาย/ข้อมูลรั่ว + วันที่แจ้ง DBD (15 วัน) / PDPC (72 ชม.)
```

**คอลัมน์ที่เติมบน `acc_firm_service_clients`** (additive): `tax_id` · `entity_type` · `vat_registered` ·
`fiscal_year_end_month/day` · `storage_location` (ม.13) · `dbd_relocation_notified` · `client_org_id`

**Storage**: bucket **`acc_vault`** (private) · policy ผูก `foldername[1] = firm_org_id` ผ่าน
`acc_firm_member_path()` ที่ safe-cast (path เพี้ยน = ไม่ผ่าน ไม่ใช่ระเบิดทั้ง query)

**Retention default** (spec §5): SRC 7 ปี · BOK/TAX 10 ปี · REG/ENG ถาวร (`retention_years = 0` → `9999-12-31`) · ADM 5 ปี

---

## 3. Code map

| ชั้น                                   | ไฟล์                                                                                                                        |
| -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| types + **คำไทยทุก enum (แหล่งเดียว)** | [`lib/acc-firm/vault/types.ts`](../apps/perpos/src/lib/acc-firm/vault/types.ts)                                             |
| read path                              | [`lib/acc-firm/vault/queries.ts`](../apps/perpos/src/lib/acc-firm/vault/queries.ts)                                         |
| write path + storage + PDPA            | [`lib/acc-firm/vault/documents.ts`](../apps/perpos/src/lib/acc-firm/vault/documents.ts)                                     |
| seed แม่แบบตอนเปิด module              | [`lib/acc-firm/vault/provision.ts`](../apps/perpos/src/lib/acc-firm/vault/provision.ts) → เรียกจาก `seedModule('acc_firm')` |
| guard ที่ route ใช้ร่วม                | `app/api/acc-firm/vault/_lib.ts` (**ห้ามย้ายเข้า `route.ts`** — Next.js ให้ route export เฉพาะ handler)                     |
| API                                    | `api/acc-firm/vault/{clients,periods,checklist,documents,documents/[id]/download,custody}`                                  |
| หน้า                                   | `(hydrogen)/[orgSlug]/acc-firm/vault/{page,loading,[clientId]/page}` + `_components/*`                                      |
| เทส tenant isolation                   | [`supabase/tests/acc_firm_vault_rls.test.sql`](../supabase/tests/acc_firm_vault_rls.test.sql)                               |

**สิทธิ์**: API = `requireModuleMember(req, firmOrgId, 'acc_firm')` แล้วจึง `createAdminClient()` (ท่าของ module นี้) ·
**หน้า = RLS client** (`getModuleRoleForCurrentUser` + `createSupabaseServerClient`) ได้ เพราะตาราง vault เป็นของ firm เอง
ไม่ต้องอ่านข้าม org · `viewer` อ่านได้อย่างเดียว · `owner` เท่านั้นที่เปิดเอกสารอ่อนไหว/ปลด legal hold

**flow อัปโหลด** (ไฟล์ไม่วิ่งผ่าน route — กัน memory ของ Vercel):
`POST documents {intent:'upload-url'}` → `storage.uploadToSignedUrl()` จาก browser → คำนวณ sha256 ที่ browser →
`POST documents {intent:'register'}` → ถ้า sha256 ซ้ำ API ลบไฟล์ที่เพิ่งอัปทิ้งแล้วตอบ 409 → ถ้าสำเร็จ checklist ของงวดนั้นเลื่อน `missing → received` เอง

---

## 4. กับดักที่แก้แล้ว (อย่าให้เกิดซ้ำ)

1. **`BEFORE UPDATE OF <คอลัมน์>` = ด่านที่เลี่ยงได้** — trigger retention เดิมผูกกับ 3 คอลัมน์ ⇒ `UPDATE ... SET retention_until='2020-01-01'` ทะลุ ทั้งที่เทสเขียว (เทสพิสูจน์แค่ตอน INSERT) → **คอลัมน์ที่เป็นคำสัญญาเชิงกฎหมายต้องคำนวณใหม่ทุก UPDATE**
2. **`SECURITY DEFINER` ไม่พอถ้าอ่านตารางที่ policy เรียกฟังก์ชันนั้นกลับ** — `public.is_admin()` → `current_role()` อ่าน `profiles` ที่ policy เรียก `is_admin()` เอง ⇒ `54001 stack depth exceeded` (บั๊กเดิมของฐาน, แก้ที่ `20260729163000` ด้วย `SET row_security = off`) — **ยังไม่ได้ไล่ตรวจ path เดิมทั้งหมดที่พึ่ง `is_admin()`**
3. **เทส RLS ต้องมี negative control** — ปิด RLS แล้วเทสต้องแดง ไม่งั้นไม่รู้ว่าเทส "ผ่าน" เพราะกันได้จริงหรือเพราะไม่มีข้อมูล
4. **ทดสอบสิทธิ์ด้วย super_admin = ไม่ได้ทดสอบ** — ต้องสวมสิทธิ์ member จริงที่ไม่ใช่ super_admin (บทเรียนเดียวกับ OPS-1)
5. **เลขที่เอกสารที่ลูกค้าเห็นต้องเป็น พ.ศ.** — เลขใบรับเคยออกเป็น `RCV-2026-…` ขณะที่ทั้งหน้าแสดง 2569
6. **REVOKE EXECUTE ฟังก์ชันที่ policy เรียก = ทุก query พัง** — `acc_firm_member()/writer()` ต้องคง EXECUTE ให้ `authenticated` (advisor 0028/0029 เตือน แต่แก้ด้วยการย้าย schema เท่านั้น ไม่ใช่ revoke)

---

## 4.5 กลุ่ม LINE ของลูกค้า (client LINE group) — เชื่อมด้วยรหัส + ส่งอัปเดตรายลูกค้า

**โมเดล:** 1 ลูกค้าในทะเบียน (`acc_firm_service_clients`) = 1 กลุ่ม LINE
(ต่างจาก gov_procure ที่ผูก "1 กลุ่มต่อ org" ใน `gov_procure_settings`)

**วิธีเชื่อม (ทีมงานคุมทั้งหมด):** เพิ่ม Perpos OA เข้ากลุ่มลูกค้า → ทีมกด "สร้างรหัสเชื่อมกลุ่ม"
ในกล่องแก้ไขลูกค้าที่ `/acc-firm/clients` → ได้รหัส `PP-XXXXXX` (ใช้ครั้งเดียว, หมดอายุ 24 ชม.) →
พิมพ์รหัสนั้นในกลุ่ม → webhook ผูก `line_group_id` เข้ากับลูกค้ารายนั้น

**invariant / กติกาความปลอดภัย**

- **กลุ่มที่ยังไม่ผูก บอทเงียบเสมอ** — ตอบเฉพาะรหัสที่มีอยู่จริงเท่านั้น (รหัสมั่ว = ไม่ตอบ กันคนสุ่มรหัสในกลุ่มอื่น)
- **รหัสคือ secret** — ใช้ครั้งเดียว ล้างทิ้งทันทีที่ผูกสำเร็จ/เลิกผูก
- 1 กลุ่มผูกได้ลูกค้าเดียว และ 1 ลูกค้าผูกได้กลุ่มเดียว (unique index ทั้งสองฝั่ง)
- ทุกข้อความ query ด้วย `service_client_id` ตรงเสมอ → ไม่มีทางส่งข้อมูลลูกค้ารายอื่นเข้ากลุ่ม

**อัปเดตที่ส่งได้ (สวิตช์รายลูกค้า)** — `CLIENT_LINE_EVENTS` ใน [`lib/acc-firm/line-group.ts`](../apps/perpos/src/lib/acc-firm/line-group.ts)

| event          | เกิดเมื่อ                                     | ต้นทาง                                                   |
| -------------- | --------------------------------------------- | -------------------------------------------------------- |
| `doc_received` | บันทึกเอกสารเข้าคลังสำเร็จ                    | `POST /api/acc-firm/vault/documents` (intent=register)   |
| `tax_due`      | ก่อนครบกำหนดยื่น 7 / 3 / 1 วัน และวันครบกำหนด | scheduler tier **t60** → `sweepClientTaxDueReminders`    |
| `tax_filed`    | ทีมกดยืนยันว่ายื่นแบบแล้ว                     | `POST /api/accounting/tax-filings/[id]/mark-filed`       |
| `billing`      | ทีมพิมพ์ส่งเอง                                | `POST /api/acc-firm/client-line-group` (`action:"send"`) |
| `announce`     | ทีมพิมพ์ส่งเอง                                | เหมือนบน                                                 |

**dedup:** งานอัตโนมัติส่งผ่าน `dedupKey` (`tax_due:<filingId>:<daysLeft>`, `tax_filed:<filingId>`) →
unique index บน `(service_client_id, dedup_key)` ทำให้ scheduler รันซ้ำกี่รอบก็ไม่ส่งซ้ำ

**คำสั่งในกลุ่ม (ฝั่งลูกค้า):** `/สถานะ` (สถานะยื่นภาษี 6 งวดล่าสุด) · `/help` — เลิกเชื่อมทำจากฝั่งเว็บเท่านั้น

**ตาราง:** `acc_firm_client_line_groups` (สถานะ + รหัส + สวิตช์ 5 ตัว) ·
`acc_firm_client_line_messages` (log การส่ง + dedup, INSERT/UPDATE ถูก revoke จาก authenticated)
— migration [`20260730100000_acc_firm_client_line_group.sql`](../supabase/migrations/20260730100000_acc_firm_client_line_group.sql)

**Code map:** `lib/acc-firm/line-group.ts` (ผูก/เลิกผูก/router ในกลุ่ม/ตัวส่ง + Flex) ·
`lib/acc-firm/line-reminders.ts` (sweep เตือนภาษี) · `api/acc-firm/client-line-group/route.ts` ·
`(hydrogen)/[orgSlug]/acc-firm/clients/_line-group-section.tsx` · hook ใน webhook (branch กลุ่ม, วางก่อน gov_procure)

---

## 5. สถานะ + สิ่งที่ยังไม่ทำ

**เสร็จแล้ว (Phase 1)**: schema + RLS + retention/deletion/legal-hold guard + bucket + taxonomy + แม่แบบ +
API 7 เส้น + หน้าแรกคลัง + แฟ้มลูกค้า (checklist ตามงวด / เอกสาร / ทะเบียนรับ-ส่ง) + seed hook ตอนเปิด module

**ยังไม่ทำ**

- **Phase 2 (compliance)**: purge approval flow (DB กันแล้ว แต่ยังไม่มีหน้าให้อนุมัติ) · หน้า incident + นับถอยหลัง 15 วัน/72 ชม. · access-log viewer · RoPA export
  — **LINE alert ผูก deadline เสร็จแล้ว** (ดู §4.5 กลุ่ม LINE ของลูกค้า) แต่ยังไม่มีหน้าดูประวัติการส่ง (`acc_firm_client_line_messages`) และยังไม่มี event "ทวงเอกสารที่ยังไม่ครบตาม checklist"
- **Phase 3 (AI)**: Gemini auto-classify ต่อยอดจาก [`ACC_FIRM_OCR_FEATURE.md`](ACC_FIRM_OCR_FEATURE.md) · LIFF upload · full-text search
- ลายเซ็นลูกค้า (canvas) + ใบรับเอกสาร PDF ผ่าน `pdf-renderer` · งวดรายปีในหน้า (API รองรับแล้ว) ·
  paging ตารางเอกสาร (ยังไม่ใช้ `lib/accounting/paging.ts` → เสี่ยงเพดาน 1,000 แถวเมื่อเอกสารเยอะ)
