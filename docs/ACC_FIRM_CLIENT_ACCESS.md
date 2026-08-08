# สำนักงานบัญชีเข้าทำบัญชีให้ org ลูกค้า (firm access) — `acc_firm` × `accounting`

> **อ่านก่อนแตะ guard สิทธิ์ของ `/[orgSlug]/accounting/*` หรือ `requireModuleMember` ทุกครั้ง**
> คู่กับ [`ACC_FIRM_VAULT_FEATURE.md`](ACC_FIRM_VAULT_FEATURE.md) (ทะเบียนลูกค้า/engagement)
> และ [`ACCOUNTING_FEATURE.md`](ACCOUNTING_FEATURE.md) (role matrix ของโมดูล accounting)

ทำให้พนักงานสำนักงานบัญชี (เช่น `jtacc`) เปิดหน้าบัญชีเต็มรูปของ org ลูกค้าได้
(`/[clientSlug]/accounting/*` — สมุดรายวัน, ผังบัญชี, ใบกำกับซื้อ, ภาษี & ปิดงวด, สินทรัพย์)
**โดยไม่ต้องเป็นสมาชิกใน `organization_members` ของลูกค้า**

## 1. ทำไมไม่ใช้ membership ตรง ๆ

| ทางเลือก                                                  | ปัญหา                                                                                                                        |
| --------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| เพิ่มพนักงานสำนักงานเข้า `organization_members` ของลูกค้า | รกทะเบียนสมาชิกของลูกค้า · ต้องเพิ่ม/ถอนมือทีละคนทีละ org ทุกครั้งที่รับ-เลิกลูกค้าหรือคนเข้า-ออกทีม · ลืมถอน = สิทธิ์ค้าง   |
| ทำ workspace บัญชีลูกค้าฝังใน `/acc-firm/clients/[id]/…`  | ต้อง proxy ทุก API + ทำ UI บัญชีซ้ำทั้งชุด (แพงมาก, จะ drift จากของจริง)                                                     |
| **ผูกสิทธิ์กับ engagement** ✅                            | รับลูกค้าใหม่ = ทีมเข้าทำได้ทันที · เปลี่ยน engagement เป็น `ended`/`paused` = ตัดสิทธิ์ทั้งทีมทันที โดยไม่แตะ org ลูกค้าเลย |

## 2. invariant ที่ห้ามพัง

| #   | กฎ                                                                                                                                                                                                                                                                                                           | บังคับที่ไหน                                                  |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------- |
| F1  | **สำนักงานไม่มีทางได้ `owner` ในโมดูลของลูกค้า** — เพดานคือ `accountant` เสมอ ⇒ "ตั้งค่าองค์กร" ของลูกค้า (VAT toggle, ข้อมูลผู้เสียภาษี, โลโก้/เลขเอกสาร) ยังเป็นของลูกค้าคนเดียว                                                                                                                           | `firmRoleToClientRole()` + เทสใน `firm-access.test.ts`        |
| F2  | **ขอบเขต = `FIRM_ACCESS_MODULES` (`accounting` เท่านั้น)** — สำนักงานบัญชีมาทำบัญชี ไม่ใช่มาดู CRM/HR/คลังสินค้า/ยอดขายของลูกค้า                                                                                                                                                                             | `resolveFirmAccess()` + `getEnabledModulesForOrg(…, viaFirm)` |
| F3  | **membership จริงชนะเสมอ** — ต้องลอง `module_members` ก่อน แล้วค่อย fallback มา firm access (ไม่งั้นคนที่เป็นทั้งสมาชิกลูกค้าและพนักงานสำนักงานจะถูกลดสิทธิ์)                                                                                                                                                | `requireModuleMember` + `getModuleRoleForCurrentUser`         |
| F4  | **ฝั่งหน้าเว็บกับฝั่ง API ต้องตอบตรงกัน** — ถ้าอันหนึ่งมี fallback อีกอันไม่มี จะได้ "หน้าเปิดได้แต่กดอะไรก็ 403" (หรือแย่กว่า: API ปล่อยผ่านทั้งที่หน้าไม่ให้เข้า)                                                                                                                                          | ทั้งคู่เรียก `resolveFirmAccess()` ตัวเดียวกัน                |
| F5  | **engagement ต้อง `status='active'` และสำนักงานต้องยังเปิดโมดูล `acc_firm`** — ปิดโมดูลสำนักงาน = ตัดสิทธิ์เข้าลูกค้าทั้งหมดทันที                                                                                                                                                                            | `resolveFirmAccess()` (join 2 เงื่อนไข)                       |
| F6  | **org ลูกค้าที่เข้าผ่านสำนักงาน ห้ามโผล่ใน org switcher และห้ามกลายเป็น "org ที่ใช้อยู่"** — ไม่งั้นกลับหน้าแรกแล้วเด้งเข้าบัญชีลูกค้าแทนสำนักงานตัวเอง                                                                                                                                                      | `ownMemberships()` + `getActiveOrganizationId()`              |
| F7  | **ด่านแอปกับ RLS ต้องเปิดพร้อมกัน** — การอ่านจริงวิ่งผ่าน RLS (`auth.rls` ใน API GET + `createSupabaseServerClient` ใน SSR) ส่วนการเขียนวิ่ง service-role · ถ้าเปิดแค่ guard ฝั่งแอป จะได้สภาพ **"ลงบัญชีได้แต่มองไม่เห็นสิ่งที่ลงไป"** (ทุก list คืน `[]` เงียบ ๆ ไม่มี error) ซึ่งอันตรายกว่าเข้าไม่ได้เลย | policy `acc_*_select_firm` + `acc_firm_has_client_access()`   |
| F8  | **การถอนสิทธิ์รายบุคคลชนะ engagement** — `DELETE /api/acc-firm/provision` ปิดแถว `module_members` ของ org ลูกค้า · ถ้า engagement re-grant ทับ = ถอนไม่ได้จริง ⇒ ทั้งฝั่งแอปและ SQL ต้องเช็ค `is_active=false` แล้วปฏิเสธ                                                                                    | `resolveFirmAccess()` + `acc_firm_has_client_access()`        |
| F9  | **ต้องเคารพ `engagement.modules_managed`** — engagement ที่ผูกไว้แค่ `['hrm']` ห้ามเปิดสิทธิ์ accounting (route `provision` เคารพอยู่แล้ว — สองทางต้องตรงกัน)                                                                                                                                                | `resolveFirmAccess()` + `acc_firm_has_client_access()`        |

## 3. Code map

| ชิ้น                                                                                                      | หน้าที่                                                                                                                                                                                                                                          |
| --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| [`lib/acc-firm/firm-access.ts`](../apps/perpos/src/lib/acc-firm/firm-access.ts)                           | **แหล่งความจริงเดียว** — `resolveFirmAccess()` (org เดียว) · `listFirmClientOrgs()` (ทั้งหมด) · `firmRoleToClientRole()` · `FIRM_ACCESS_MODULES`                                                                                                 |
| [`lib/acc-firm/firm-clients.ts`](../apps/perpos/src/lib/acc-firm/firm-clients.ts)                         | wrapper ฝั่ง server component (ดึง user จาก session ให้)                                                                                                                                                                                         |
| [`api/_lib/module-auth.ts`](../apps/perpos/src/app/api/_lib/module-auth.ts)                               | guard ฝั่ง API — fallback เมื่อไม่มีแถว `module_members` · คืน `firm` มาใน `ModuleAuth`                                                                                                                                                          |
| [`lib/accounting/queries.ts`](../apps/perpos/src/lib/accounting/queries.ts)                               | guard ฝั่งหน้าเว็บ — `getModuleRoleForCurrentUser` fallback · `getFirmAccessForOrg` · `ownMemberships` · `getOrganizationsForCurrentUser` เติม org ลูกค้าพร้อมธง `viaFirm`                                                                       |
| [`components/acc-firm/firm-context-bar.tsx`](../apps/perpos/src/components/acc-firm/firm-context-bar.tsx) | แถบ "กำลังทำงานในนาม …" + สลับลูกค้า + กลับสำนักงาน (เรนเดอร์ที่ `accounting/layout.tsx`)                                                                                                                                                        |
| migration `20260808040000_acc_firm_client_access_rls.sql`                                                 | ฟังก์ชัน `acc_firm_has_client_access()` + policy `SELECT` ชื่อ `<table>_select_firm` บนตารางบัญชี 18 ตัว — **เพิ่มตาราง `acc_*` ใหม่ที่คีย์ด้วย `org_id` ต้องเพิ่ม policy นี้ด้วย** ไม่งั้นหน้านั้นจะว่างเปล่าเฉพาะกับผู้ใช้ที่เข้าในนามสำนักงาน |

## 4. สิทธิ์ที่ได้จริง

| role ใน `acc_firm`          | → role ใน `accounting` ของลูกค้า | ทำอะไรได้                                                      |
| --------------------------- | -------------------------------- | -------------------------------------------------------------- |
| owner / accountant / อื่น ๆ | `accountant`                     | เขียนหน้าบ้าน + หลังบ้าน + **ปิดงวด** · แก้ตั้งค่าองค์กรไม่ได้ |
| viewer                      | `viewer`                         | อ่านอย่างเดียว (แถบบริบทขึ้นป้าย "อ่านอย่างเดียว")             |

## 5. UX — เข้าอย่างไรโดยไม่ต้องเปลี่ยน org

จุดเข้ามีอยู่แล้วในโมดูล `acc_firm` และตอนนี้ใช้งานได้จริง (เดิม 404 เพราะติดด่าน membership):

- แดชบอร์ด `/[firmSlug]/acc-firm` → คลิกแถวลูกค้า → `/[clientSlug]/accounting`
- `/[firmSlug]/acc-firm/clients` → เปิดกล่องลูกค้า → ปุ่ม **"เปิดสมุดบัญชี"**
- เมื่ออยู่ในหน้าบัญชีของลูกค้า **แถบบริบทจะขึ้นเสมอ** — บอกว่าทำในนามสำนักงานไหน ให้ใคร
  พร้อมปุ่ม "สลับลูกค้า" (อยู่หน้าเดิม เปลี่ยนแค่บริษัท) และ "กลับสำนักงาน"

## 6. ร่องรอยการแก้ไข (audit trail)

ร่องรอยมี **2 ชั้น เขียนลง `audit_logs` ตารางเดียวกัน** (hash chain ต่อกันต่อ `table_name`
จึงตรวจโซ่ด้วยเครื่องมือเดิมได้) — ตอบคนละคำถาม ไม่ใช่ของซ้ำกัน:

| ชั้น       | มาจาก                                                                              | ตอบว่า                                                  | จุดอ่อน                                                                                                                                                                    |
| ---------- | ---------------------------------------------------------------------------------- | ------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **DML**    | trigger `fn_audit_log_changes` (audit v2 — มีบน 16 ตาราง `acc_*` **อยู่ก่อนแล้ว**) | เปลี่ยนอะไร (old/new เต็มแถว)                           | **ไม่รู้ว่าใครทำ** — actor มาจาก `created_by` ของแถวเท่านั้น (ของจริง: `acc_periods` INSERT 120/120 ไม่มี actor · ทุกแถว DELETE ไม่มี actor) และไม่รู้ว่าทำในนามสำนักงานใด |
| **ธุรกิจ** | `logAccountingAudit()` จาก API (ของใหม่)                                           | ใครทำ · ในนามสำนักงานใด · เจตนาอะไร (`business_action`) | ต้องเรียกเอง → กันลืมด้วยเทส `audit-coverage.test.ts`                                                                                                                      |

| คอลัมน์                           | ความหมาย                                                                                     |
| --------------------------------- | -------------------------------------------------------------------------------------------- |
| `action`                          | DML verb (`INSERT`/`UPDATE`/`DELETE`) — คง CHECK เดิมไว้เพื่อความเข้ากันได้กับ consumer เก่า |
| `business_action`                 | ชื่อการกระทำเชิงธุรกิจ (`journal.post`, `document.void`, `period.close`, …)                  |
| `on_behalf_of_org_id`             | **ไม่ null = ทำในนามสำนักงานบัญชีนี้** (มาจาก `auth.firm.firmOrgId`)                         |
| `old_data`/`new_data`/`diff_keys` | สภาพก่อน-หลัง + ฟิลด์ที่เปลี่ยนจริง                                                          |

**invariant:**

| #   | กฎ                                                                                                                                                                                                                                                                       | บังคับที่ไหน                                                                         |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------ |
| A1  | **ห้ามพึ่ง session GUC (`set_audit_context`) หา actor ของ accounting** — PostgREST ใช้ connection pool, GUC ผูกกับ session ⇒ context ที่ค้างจาก request ที่ล้มเหลวจะไปติดกับ **คนอื่น** ⇒ บันทึกผิดคน (แย่กว่าไม่รู้ว่าใคร) · actor/firm ต้องส่งเข้า RPC ตรง ๆ           | `log_audit_event()` + `logAccountingAudit()`                                         |
| A2  | **`audit_logs` เป็น append-only** — `REVOKE update/delete/truncate` จากทุก role **รวม `service_role`** ห้าม GRANT คืน                                                                                                                                                    | migration `20260808060000`                                                           |
| A3  | **route ใหม่ที่เขียนข้อมูลต้องเรียก `logAccountingAudit`** — มีเทสกันลืม สแกนทุก `route.ts` ที่มี handler POST/PUT/PATCH/DELETE (ยกเว้นได้เฉพาะที่ระบุเหตุผลใน `EXEMPT`)                                                                                                 | [`audit-coverage.test.ts`](../apps/perpos/src/lib/accounting/audit-coverage.test.ts) |
| A4  | **เขียนร่องรอยผ่าน `after()` ของ Next 15** ห้ามเป็น promise ลอย ๆ — บน Vercel ฟังก์ชันถูก freeze ตอนตอบ ร่องรอยจะหาย (กฎเดียวกับ `recordUsage`)                                                                                                                          | `logAccountingAudit()`                                                               |
| A5  | **ทุกทางที่เขียน `audit_logs` ต้อง `pg_advisory_xact_lock(hashtext('audit_chain:'                                                                                                                                                                                        |                                                                                      | table_name))`ก่อนอ่าน prev hash** — โซ่ต่อกันต่อ`table_name` ถ้าสองงานพร้อมกันต่อจาก prev เดียวกัน โซ่จะแตกถาวรและเครื่องมือตรวจจะฟ้อง "ถูกแก้ไข" ทั้งที่ไม่มีใครแก้ · **ล็อกฝั่งเดียวไม่พอ** (trigger กับ RPC เขียนสายเดียวกัน) | `log_audit_event()` + `fn_audit_log_changes()` |
| A6  | **สิทธิ์อ่านของสำนักงานจำกัดที่ `table_name like 'acc\_%'`** — ตารางอื่นก็คีย์ด้วย `org_id` ของลูกค้าเหมือนกัน (`tmc_finance_entries`, `organization_members`, `profiles`) ถ้าไม่กรอง สำนักงานจะอ่าน old_data/new_data ของโมดูลอื่นได้ ขัดกับขอบเขต accounting-only (F2) | policy `audit_logs_select_firm`                                                      |
| A7  | **การลบต้องระบุ `dml: "DELETE"`** เมื่อไม่ได้อ่านแถวเดิมมาก่อน — ไม่มีทั้ง old/new จะถูกเดาเป็น `UPDATE` แล้วกรอง DELETE ที่ `/admin/audit` จะไม่เจอการลบเลย                                                                                                             | `AuditEventInput.dml` + `log_audit_event()`                                          |

**ดูที่ไหน:** `/admin/audit` (super_admin) — มีคอลัมน์ "การกระทำ" + ช่อง "ทำในนาม (สำนักงาน)"
ในกล่องรายละเอียด และ export CSV ครบทั้งสองฟิลด์ · สำนักงานบัญชีอ่านร่องรอยของลูกค้าที่ตัวเอง
ดูแลได้ผ่าน policy `audit_logs_select_firm` (ยังไม่มีหน้าเว็บให้ดู — ดูข้อ 7)

**ข้อจำกัดที่ยอมรับ:** การเขียนร่องรอยเป็น best-effort — ถ้าเขียนไม่สำเร็จจะ log error แต่
ไม่ทำให้ mutation ที่สำเร็จแล้วล้มตาม (ตัวเลือกตรงข้ามคือบัญชีล่มเมื่อระบบ log มีปัญหา)

## 7. ยังไม่ทำ (Phase ถัดไป)

- **หน้าดูร่องรอยของสำนักงาน/ลูกค้า** — DB เปิดสิทธิ์อ่านแล้ว (`audit_logs_select_firm`)
  แต่ยังไม่มี UI ใต้ `/acc-firm` หรือหน้าให้ลูกค้าเห็นว่าใครแตะบัญชีตัวเองบ้าง
- ร่องรอยระดับ **บรรทัด** ของเอกสาร/สมุดรายวัน (ตอนนี้เก็บที่ระดับหัวเอกสาร + สรุปบรรทัด)
- ขยาย `FIRM_ACCESS_MODULES` (เช่น `hrm` สำหรับสำนักงานที่รับทำเงินเดือน) — ต้องคิดเพดาน role ใหม่ก่อน
- แดชบอร์ด "งานค้างต่อลูกค้า" ที่ลิงก์ตรงเข้าจุดที่ค้าง (ข้อมูลมีแล้วจาก close-check/tax-calendar)
- ขยาย `FIRM_ACCESS_MODULES` (เช่น `hrm` สำหรับสำนักงานที่รับทำเงินเดือน) — ต้องคิดเพดาน role ใหม่ก่อน
- แดชบอร์ด "งานค้างต่อลูกค้า" ที่ลิงก์ตรงเข้าจุดที่ค้าง (ข้อมูลมีแล้วจาก close-check/tax-calendar)
