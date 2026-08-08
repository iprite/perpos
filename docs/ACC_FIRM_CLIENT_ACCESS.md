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

## 6. ยังไม่ทำ (Phase ถัดไป)

- **ร่องรอยการแก้ไข** — โมดูล accounting ยังไม่มี audit log ของตัวเอง · `ModuleAuth.firm` /
  `AccountingAuth.firm` ถูก expose ไว้แล้วเพื่อให้บันทึก "ทำในนามสำนักงานใด" ได้ทันทีที่มีตาราง audit
- **ลูกค้าเห็นว่าใครเข้าถึงบัญชีตัวเอง** — ตอนนี้พิสูจน์ได้จาก `acc_firm_clients` แต่ยังไม่มีหน้าให้ลูกค้าดู
- ขยาย `FIRM_ACCESS_MODULES` (เช่น `hrm` สำหรับสำนักงานที่รับทำเงินเดือน) — ต้องคิดเพดาน role ใหม่ก่อน
- แดชบอร์ด "งานค้างต่อลูกค้า" ที่ลิงก์ตรงเข้าจุดที่ค้าง (ข้อมูลมีแล้วจาก close-check/tax-calendar)
