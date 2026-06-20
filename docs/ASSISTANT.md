# คัมภีร์: ผู้ช่วย AI (Assistant Umbrella)

> เอกสารอ้างอิงฉบับเต็มสำหรับ AI agents / devs ที่ทำงานกับ **ร่ม "ผู้ช่วย AI" (assistant)** — ชั้นสถาปัตยกรรมที่ครอบ STT/MoM และผู้ช่วยตัวอื่นในอนาคต
> อัปเดตล่าสุด: 2026-06-17 · production แล้ว (Supabase + Cloud Run + Vercel)
>
> 📘 **รายละเอียด STT/MoM เฉพาะทาง** (worker, Gemini, PDF, duration, กับดัก STT) → อ่าน [`docs/STT_MOM_FEATURE.md`](STT_MOM_FEATURE.md)
> เอกสารนี้เน้น **โครงร่ม** ที่ใช้ร่วมกันทุก kind — ไม่ทำซ้ำเนื้อหา STT

---

## 0. TL;DR — เข้าใจใน 60 วินาที

- **"ผู้ช่วย AI" = บริการ per-profile (รายบุคคล)** ต่างจาก ERP ที่เป็น per-org. login ด้วย **LINE เท่านั้น** · ทุกคนที่แอด LINE OA ได้สิทธิ์อัตโนมัติ (auto-onboard + trial)
- เป็น **umbrella** ที่ออกแบบให้ generic: ตอนนี้มี **kind เดียว = `stt`** (แกะเสียง→รายงานการประชุม MoM) แต่โครงสร้างพร้อมเพิ่ม kind ใหม่
- URL top-level **ไม่มี `[orgSlug]`**: `/assistant`, `/assistant/usage`, `/assistant/billing`
- **กฎเหล็ก 3 ข้อ:**
  1. **per-profile ทุกอย่าง** — scope ด้วย `profile_id` (= `auth.uid()`) ไม่ใช่ org. "home org" มีไว้แค่เก็บไฟล์/เรียก worker (ไม่โผล่ใน URL)
  2. **generic = `assistant_*`, STT แท้ = `stt_*`** — job hub กลางชื่อ `assistant_jobs` (มี `kind`), ของเฉพาะ STT (`stt_quota/stt_plans/stt_subscriptions`, bucket, worker) คงชื่อ `stt`
  3. **เพิ่ม kind ใหม่ = แก้ที่ seam เดียว** (`lib/assistant/kinds.ts`) ไม่ปั้น DB key `'assistant'`

---

## 1. ทำไมต้องเป็น "ร่ม" (umbrella) ไม่ใช่ฟีเจอร์เดี่ยว

STT เริ่มเป็นฟีเจอร์ org-scoped แล้ว refactor (v2/v3) เป็น **บริการ per-profile ใต้ร่ม assistant** เพราะ:

- **โมเดลธุรกิจ B2C** — ขายรายคน (subscription ฿99/เดือน) ไม่ใช่รายองค์กร → สิทธิ์/quota/บิล ต้องผูกกับ `profile` ไม่ใช่ `org`
- **future-proof** — วางแผนเพิ่มผู้ช่วยตัวอื่น (เช่น สรุปเอกสาร, ตอบอีเมล) ที่ใช้ onboarding/billing/quota pattern เดียวกัน → ทำเป็น "kind" ใต้ร่มเดียว ไม่ใช่สร้างระบบใหม่ทุกครั้ง

> ผลคือ "assistant" เป็นนามธรรมชั้นบน, "stt" เป็น kind แรกที่รูปธรรม. โค้ด/ตารางที่ **generic จริง** ใช้ชื่อ `assistant_*`; โค้ด/ตารางที่ **ผูกกับ STT โดยเฉพาะ** (quota เป็น "นาทีเสียง", worker แกะเสียง) คงชื่อ `stt_*` เพื่อเลี่ยง rename FK และสื่อความหมายตรง

---

## 2. B2C (ผู้ช่วย AI) vs B2B (ERP) — เส้นแบ่ง

| มิติ       | ผู้ช่วย AI (B2C)                        | ERP (B2B)                    |
| ---------- | --------------------------------------- | ---------------------------- |
| Scope      | **per-profile** (`profile_id`)          | per-org (`org_id`)           |
| URL        | top-level `/assistant/*` (ไม่มี slug)   | `/[orgSlug]/...`             |
| สิทธิ์     | `personal_module_grants` (kind)         | org module (`admin/modules`) |
| Guard เว็บ | `requireAssistantUser`                  | `requireModuleMember`        |
| Guard LINE | `checkSttAccess`                        | `checkPermission`            |
| ใครเปิดให้ | **อัตโนมัติตอนแอด LINE** (auto-onboard) | super_admin เปิดต่อ org      |
| บิล        | Stripe per-profile (`stt_*`)            | `org_billing`/`org_stripe`   |

- **สลับกัน:** header มีปุ่ม "ผู้ช่วย AI" (→ `/assistant`) + org switcher (ERP). B2C เห็นแค่ผู้ช่วย · B2B เห็นทั้งคู่ · super_admin → `/admin`
- **redirect หลัง login:** ERP (B2B) > ผู้ช่วย AI (B2C) > no-org · super_admin → `/admin`
- `assistant` อยู่ใน **SYSTEM_SEGMENTS** (ไม่ใช่ org slug) — กัน path ชนกับ org จริง

---

## 3. สถาปัตยกรรมร่ม (ชั้นที่ทุก kind ใช้ร่วมกัน)

```
            ┌─────────────────── ผู้ช่วย AI (assistant umbrella) ───────────────────┐
  LINE ───► │  guard: checkSttAccess (LINE) / requireAssistantUser (เว็บ)             │
  เว็บ  ───► │  access = มี grant ของ kind ใด ๆ ใน ASSISTANT_KINDS  หรือ super_admin    │
            │                                                                         │
            │  job hub กลาง:  assistant_jobs (kind, profile_id, source, status, ...)   │
            │  มิเตอร์/quota:  ต่อ kind  (STT = stt_quota เป็น "วินาทีเสียง")            │
            │  บิล:           Stripe per-profile  (STT = stt_plans/subscriptions)      │
            └───────────────────────────────┬─────────────────────────────────────────┘
                                             │  kind='stt'
                                             ▼
                         ┌──────── STT (kind แรก) ────────┐
                         │  stt-worker (Cloud Run) → MoM   │  ◄── docs/STT_MOM_FEATURE.md
                         └─────────────────────────────────┘
```

**Seam หลัก** = [`lib/assistant/kinds.ts`](../apps/perpos/src/lib/assistant/kinds.ts):

- `ASSISTANT_KINDS = ['stt']` — registry ของ kind ทั้งหมด (module_key)
- `enabledAssistantKinds(admin, userId)` → คืน kind ที่ผู้ใช้มี grant (`personal_module_grants.is_enabled`)
- **umbrella access** = `kinds.length > 0` หรือ super_admin (ไม่ใช้ DB key `'assistant'` เป็น grant — key นั้นชนกับ Task Manager เดิมที่ลบไปแล้ว + FK `module_registry`)

---

## 4. Guard & Home Org

### `requireAssistantUser(req)` — guard เว็บ ([api/\_lib/assistant-auth.ts](../apps/perpos/src/app/api/_lib/assistant-auth.ts))

คืน `{ ok, userId, orgId, isSuperAdmin, kinds[], rls }`. ลำดับ:

1. `requireUser` (Bearer token + active)
2. หา role → super_admin เห็นทุก kind, คนอื่น = `enabledAssistantKinds`
3. ถ้า `kinds.length === 0` และไม่ใช่ super_admin → fallback legacy perm `bot.assistant.transcribe`; ไม่มี → **403**
4. `resolveHomeOrg` → ถ้าไม่มี → **409**

### `checkSttAccess(admin, profileId, role)` — guard LINE ([line/webhook/route.ts](../apps/perpos/src/app/api/line/webhook/route.ts))

`is_active=false` → false · super_admin → true · ไม่งั้น = `bot.assistant.transcribe` **หรือ** `personal_module_grants('stt')`

### Home Org — "พื้นที่เก็บงาน" ที่ไม่โผล่ใน URL

`resolveHomeOrg`:

1. **`profiles.personal_org_id`** — แหล่งความจริง deterministic (เขียนโดย `provisionLineUser`)
2. fallback (โปรไฟล์เก่า backfill ไม่ถึง): membership จริง — `line_active_org_id` ถ้ายังเป็นสมาชิก ไม่งั้น org แรกตาม `created_at`

> ⚠️ **อย่าเดา personal org ด้วย regex/prefix ของ slug/email อีก** — ใช้ `personal_org_id` เท่านั้น (บทเรียน phase 2a)

---

## 5. Auto-onboarding (LINE-first / zero friction)

`follow` event (แอด OA) → [`provisionLineUser`](../apps/perpos/src/app/api/line/_provision.ts) — **idempotent + self-heal** (เรียกซ้ำ = เติมส่วนที่ขาด ไม่ใช่คืนของค้าง):

1. **profile** — find by `line_user_id` หรือสร้าง **shadow auth user** (email `line.<id>@stt-line.perpos.io`, `profiles.id → auth.users(id)` จึงสร้าง profile ลอยไม่ได้)
2. **personal org + owner membership** — reuse ถ้ามี (เช็ค 4 ชั้น: preferred → owned → orphan by `created_by` → สร้างใหม่ slug `u<rand>`)
3. **grant** — `ensureRow('personal_module_grants', {user_id, module_key:'stt'}, ...)`
4. **pointers + quota** — `personal_org_id` (= home org), `line_active_org_id`, `ensureQuota` (อ่าน default จาก `stt_settings.default_quota_seconds` fallback 18000s = 300 นาที trial)

พิมพ์ `/mom` ได้ทันที — **ไม่แจกโมดูล B2B ใด ๆ**

---

## 6. Map: Routes / Pages / Tables (ทั้งร่ม)

### API (`apps/perpos/src/app/api/assistant/`)

| Route             | Method   | Scope   | หน้าที่                                                                  |
| ----------------- | -------- | ------- | ------------------------------------------------------------------------ |
| `jobs`            | GET/POST | generic | สร้าง/ลิสต์งาน (POST set `kind:'stt'`, ตรวจ path ไฟล์ใต้ `<profileId>/`) |
| `jobs/process`    | POST     | generic | claim + ยิง stt-worker (ผ่าน `triggerSttWorker`)                         |
| `quota`           | GET      | generic | โควต้าตัวเอง (`limit/used/remaining` วินาที)                             |
| `stats`           | GET      | generic | สถิติงานตัวเอง (แยก web/line, นาที)                                      |
| `scheduler`       | POST     | cron    | stuck-sweep + requeue + PDPA cleanup ([STT doc §scheduler])              |
| `stt/mom-pdf`     | —        | STT     | เว็บดาวน์โหลด PDF                                                        |
| `stt/mom-deliver` | POST     | STT     | worker callback → PDF → LINE Flex (`x-worker-secret`)                    |
| `stt/checkout`    | POST     | STT     | Stripe Checkout (สร้าง price อัตโนมัติ, metadata `kind='stt'`)           |
| `stt/portal`      | POST     | STT     | Stripe Customer Portal (ยกเลิก/เปลี่ยนบัตรเอง)                           |

> generic route = kind-agnostic (อนาคต reuse ได้) · `stt/*` = STT เฉพาะ

### Pages (`apps/perpos/src/app/(hydrogen)/assistant/`)

- **`layout.tsx`** — shared shell ของทุกหน้าในร่ม (ดู §UI Shell ด้านล่าง)
- `page.tsx` (อัป+poll+Dialog MoM+ดาวน์โหลด+quota banner) · `usage/` (กราฟ personal) · `billing/` (ซื้อแพ็ก) — **top-level ไม่มี `[orgSlug]`**

### Admin (super_admin)

`admin/stt-users`, `admin/stt-stats`, `admin/stt-billing`, `admin/stt-cost` + API คู่กัน

### Tables

| ตาราง                                              | generic?   | หน้าที่                                                                                                           |
| -------------------------------------------------- | ---------- | ----------------------------------------------------------------------------------------------------------------- |
| `assistant_jobs`                                   | ✅ generic | job hub — `kind`, `profile_id`, `source` (web/line), `status`, `transcript_json`, `duration_seconds`, token usage |
| `assistant_line_sessions`                          | ✅ generic | state "รอไฟล์หลัง /mom"                                                                                           |
| `personal_module_grants`                           | ✅ generic | สิทธิ์ per-profile ต่อ kind (`module_key`, `is_enabled`)                                                          |
| `stt_quota` / `stt_usage_transactions`             | STT        | โควต้า "วินาทีเสียง" + ledger                                                                                     |
| `stt_plans` / `stt_subscriptions` / `stt_payments` | STT        | บิล Stripe per-profile                                                                                            |
| `stt_settings`                                     | STT        | default quota (trial)                                                                                             |

---

## 7. Billing & Quota (per-profile)

- **Quota** = ด่านเก็บเงินจริง บังคับใช้ที่ **stt-worker ที่เดียว** (atomic `consume_stt_quota` reserve ก่อนเรียก Gemini, refund idempotent `refund_stt_job`)
- **Stripe** per-profile แยกจาก org billing สิ้นเชิง — แยกด้วย `metadata.kind='stt'` + `profile_id`
  - subscription ฿99/300นาที, ฿990/1200นาที (รายเดือน use-it-or-lose-it) · topup ปิดอยู่ (`is_active=false`)
  - checkout สร้าง Stripe price อัตโนมัติถ้ายังไม่มี + reuse customer ต่อ profile + กันสมัครซ้ำ
  - webhook (`api/stripe/webhook`) เติมโควต้า idempotent (reuse `stripe_events`)
- รายละเอียด RPC/migration → [STT doc §4](STT_MOM_FEATURE.md)

---

## 7.5 UI Shell & Layout convention

ทุกหน้าใต้ `/assistant/*` ใช้ **shared shell เดียว** = [`(hydrogen)/assistant/layout.tsx`](<../apps/perpos/src/app/(hydrogen)/assistant/layout.tsx>) — Next.js App Router layout ที่ render ครั้งเดียว คงอยู่ข้ามการสลับหน้า:

- ให้ **container + spacing** มาตรฐาน (`w-full px-4 py-6 lg:px-8`)
- ให้ **header** (ไอคอน chip + ชื่อ + คำอธิบาย) ตามแท็บที่ active
- ให้ **แท็บนำทาง** สลับ ถอดเสียง / การใช้งาน / การชำระเงิน (ก่อน refactor นี้ไม่มี — ต้องพึ่ง sidebar)

**กฎ:**

1. **หน้าลูกไม่มี container/header ของตัวเอง** — `return (<>...เนื้อหา...</>)` เท่านั้น (KPI/เนื้อหาเฉพาะหน้าวางใน fragment ตรง ๆ)
2. **เพิ่มหน้าใหม่ใต้ร่ม = เติม 1 entry ใน `TABS`** ใน `layout.tsx` (href/label/title/subtitle/icon) — header + แท็บอัปเดตเอง
3. header/แท็บ active ตัดสินจาก `usePathname()` (exact สำหรับ `/assistant`, prefix สำหรับ subpath)
4. สไตล์อิง DESIGN.md (indigo primary, แท็บ underline)

> เหตุผลเชิงสถาปัตยกรรม: layout = "เปลือกของร่ม" — ถ้ามี kind ที่ 2 ในอนาคต แท็บ/shell ขยายได้ที่จุดเดียว

---

## 8. การเพิ่มผู้ช่วยตัวใหม่ (kind ใหม่) — checklist

ออกแบบให้แตะ "seam เดียว" ให้ได้มากที่สุด:

1. **ลงทะเบียน module_key** ใหม่ใน `module_registry` (migration)
2. **เติม `ASSISTANT_KINDS`** ใน [`lib/assistant/kinds.ts`](../apps/perpos/src/lib/assistant/kinds.ts) — guard เว็บ+LINE จะรับรู้ทันที
3. **onboarding** — ตัดสินใจว่า kind ใหม่แจกอัตโนมัติด้วยไหม (เติม `ensureRow('personal_module_grants', ...)` ใน `provisionLineUser`) หรือต้องซื้อก่อน
4. **job** — reuse `assistant_jobs` ด้วย `kind=<ใหม่>` (มี column generic พอ; ถ้าต้อง field เฉพาะ ใส่ jsonb)
5. **worker** (ถ้ามีงานหนัก) — service ใหม่ใน `services/` ตามกฎ Cloud Run (plain Express, `.gcloudignore`, `x-worker-secret`) · **ลงทะเบียนใน `REGISTRY`** ของ [`api/admin/system/services/route.ts`](../apps/perpos/src/app/api/admin/system/services/route.ts) ด้วย (1 entry: `urlEnv`+`healthPath`+`secretEnv`) → จะโผล่ในหน้า admin **System / Infrastructure** พร้อม health สดอัตโนมัติ (REGISTRY เป็น source of truth — ไม่มี auto-discover เพราะ route handler บน Vercel มองไม่เห็น Cloud Run)
6. **quota/billing** — ถ้าใช้มิเตอร์คนละหน่วยกับ STT ให้ทำตาราง `<kind>_quota` ของตัวเอง (อย่าปน `stt_quota`)
7. **routes** — generic อันไหน reuse ได้ reuse (`jobs/*`, `quota`, `stats`); อันเฉพาะ kind วางใต้ `assistant/<kind>/*`
8. **UI** — เพิ่ม sub-page ใต้ `/assistant`; **ต้องเพิ่มลิงก์ใน menu-items ด้วยเสมอ**

---

## 9. ⚠️ บทเรียน/กับดักของชั้นร่ม (อย่าทำซ้ำ)

> กับดักเฉพาะ STT (worker, Gemini, PDF, duration) อยู่ใน [STT doc §7](STT_MOM_FEATURE.md) — ที่นี่เฉพาะชั้นร่ม

1. **อย่าใช้ DB key `'assistant'` เป็น umbrella grant** — ชนกับ Task Manager เดิม + FK. ใช้ "มี grant ของ kind ใด ๆ" แทน
2. **home org ต้องอ่านจาก `personal_org_id`** — ห้ามเดาจาก regex/prefix slug/email
3. **scope ด้วย `profile_id` เสมอ** ทุก route assistant (ไม่ใช่ org). RLS `assistant_jobs` = `profile_id = auth.uid()`
4. **path ไฟล์เว็บต้องอยู่ใต้ `<profileId>/`** — `jobs` POST ตรวจกันอ้างอิงไฟล์ข้ามคน; worker ก็ตรวจ `<orgId>/` ของ home org
5. **`APP_BASE_URL` ต้อง `https://app.perpos.ai`** (ไม่ใช่ `perpos.ai` ที่ 301 redirect) — ใช้ทั้ง deep-link ในแจ้งเตือน LINE และ worker callback. default ใน code ตั้งเป็น `app.perpos.ai` แล้ว (commit `1354ca8` — แก้ลิงก์ตาย `/{slug}/assistant/transcribe` เก่าเป็น top-level `/assistant`)
6. **LINE Login channel ต้อง provider เดียวกับ Messaging channel** — `userId` ถึงตรง `line_user_id` (ไม่งั้น provision เป็นคนละคน)

---

## 10. งานที่ยังเหลือ / ไอเดียต่อ (ระดับร่ม)

- **rate-limit / invite-code** กัน abuse จากการสร้าง LINE ใหม่เรื่อย ๆ เพื่อรับ trial ซ้ำ (ยังไม่มี)
- ผู้ช่วย kind ที่ 2 (พิสูจน์ว่า seam generic พอจริง)
- generic-ify quota/billing ให้ kind ใหม่ reuse ได้โดยไม่ต้องก็อป pattern `stt_*`
- (STT-specific TODO → ดู [STT doc §9](STT_MOM_FEATURE.md))
