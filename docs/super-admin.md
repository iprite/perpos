# Super Admin Blueprint — คัมภีร์ Orchestrator

> Super Admin ของ PERPOS ไม่ใช่แค่ IT Admin ทั่วไป  
> แต่คือ **Orchestrator** — ผู้ควบคุมสถาปัตยกรรมของทุก Tenant  
> เปิด-ปิด module, กำหนดฟิลด์พิเศษ, สวมรอยแก้ปัญหา, ดูแลทรัพยากร  
> ทั้งหมดนี้ต้องทำจากจุดเดียว ปลอดภัย และ audit trail ทุกขั้นตอน

---

## 0. สถานะปัจจุบัน (Phase 0 — Built ✅)

| หน้า | URL | สถานะ | หน้าที่ |
|------|-----|--------|---------|
| Admin Dashboard | `/admin` | ✅ | overview เบื้องต้น |
| User Management | `/admin/users` | ✅ | invite, delete, permissions |
| Function Permissions | `/admin/permissions` | ✅ | สิทธิ์ LINE Bot |
| **Module Manager** | `/admin/modules` | ✅ | เปิด/ปิด module + allowed roles |
| News Agent | `/admin/news-agent` | ✅ | ตั้งค่า RSS + AI summary |
| LINE Delivery | `/admin/delivery` | ✅ | cron schedule |
| **Audit Log UI** | `/admin/audit` | ✅ | tamper-evident chain + shipping |

Phase ต่อไปสร้างต่อยอดจากฐานนี้

---

## 1. ภาพรวม Control Surface

```
Super Admin Console
│
├── Phase 0 (Built)
│   ├── Users, Permissions, Modules, News, Delivery, Audit
│
├── Phase 1: Core Operations          ← ทำก่อนที่สุด
│   ├── Tenant Onboarding Wizard      ← สร้าง org ใหม่แบบ guided
│   ├── Module Provisioning Dashboard  ← upgrade /admin/modules
│   └── Impersonation Tool            ← debug as tenant user
│
├── Phase 2: Customization Layer
│   ├── Custom Fields Manager         ← เพิ่ม field ให้ org
│   └── Label Override Manager        ← ปรับคำศัพท์ประจำ org
│
├── Phase 3: Reliability
│   ├── Tenant Resource Monitor       ← noisy neighbor detection
│   └── Webhook Gateway Control       ← external integrations
│
└── Phase 4: Growth Infrastructure
    ├── API Rate Limiting             ← quota per org
    ├── Billing & Plan Manager        ← subscription tiers
    ├── Tenant Health Scoring         ← org status dashboard
    └── Maintenance Mode              ← per-org read-only
```

---

## Phase 1: Core Operations

### 1.1 Tenant Onboarding Wizard

**ปัญหาปัจจุบัน**: เพิ่ม tenant ใหม่ต้องรัน SQL manually, ไม่มี UI guide

**Solution**: Multi-step wizard ที่ `/admin/onboarding`

```
Step 1: Organization Info
  ├── ชื่อบริษัท, slug (URL), ประเภทธุรกิจ
  └── ตรวจ slug ไม่ซ้ำ realtime

Step 2: Module Selection
  ├── เลือก Shared Modules (accounting, payroll, assistant)
  ├── ผูก Specific Module ถ้ามี (specific: true)
  └── Preview sidebar menu ที่จะ generate

Step 3: Owner Account
  ├── email ของเจ้าของ org
  └── ส่ง invite email อัตโนมัติ

Step 4: Review & Confirm
  └── สรุปทุกอย่างก่อนกด Create
```

**DB actions ที่ wizard ทำ:**
```sql
-- สร้างโดย API /api/admin/onboarding (protected by requireAdmin)
INSERT INTO organizations (name, slug) VALUES (...)
INSERT INTO organization_members (organization_id, user_id, role='owner') VALUES (...)
INSERT INTO org_module_settings (organization_id, module_key, is_enabled) VALUES (...)
-- ส่ง invite email ผ่าน /api/admin/users/invite
```

**Audit**: บันทึก actor_id = super_admin ที่กด Create

---

### 1.2 Module Provisioning Dashboard

**ปัญหาปัจจุบัน**: `/admin/modules` มีอยู่แล้วแต่ขาด:
- Preview sidebar ที่จะ generate จริง
- Specific module ยังต้อง enable ด้วย SQL
- ไม่มี history ว่าเปิด/ปิดเมื่อไหร่

**Enhancement ที่ต้องทำ:**

```
/admin/modules  (upgrade)
│
├── [Left] Org Selector
│   └── เลือกองค์กร → โหลด module settings
│
├── [Center] Module Toggles
│   ├── Shared Modules section
│   │   ├── ✅ Accounting [enabled]  [Roles: owner, admin]
│   │   ├── ✅ Payroll    [enabled]
│   │   └── ☐  Assistant  [disabled]
│   │
│   └── Specific Modules section (badge: CUSTOM)
│       └── ✅ TMC Management [enabled]  ← specific: true
│
├── [Right] Live Sidebar Preview
│   └── แสดง menu จริงที่ user จะเห็น
│       (render จาก MODULE_MENUS ที่เลือก)
│
└── [Bottom] Change History (ใหม่)
    └── "เปิด Payroll โดย admin@perpos.ai เมื่อ 3 ม.ค. 2026"
```

**DB ใหม่: `org_module_change_log`**
```sql
CREATE TABLE org_module_change_log (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      uuid NOT NULL REFERENCES organizations(id),
  module_key  text NOT NULL,
  action      text NOT NULL CHECK (action IN ('enabled','disabled','roles_updated')),
  changed_by  uuid NOT NULL REFERENCES profiles(id),
  old_value   jsonb,
  new_value   jsonb,
  changed_at  timestamptz NOT NULL DEFAULT now()
);
```

---

### 1.3 Impersonation Tool

**Use case**: ลูกค้าโทรบอก "กดบันทึกแล้วตัวเลขไม่ขึ้น" — Super Admin ต้องเห็นหน้าจอเดียวกัน

**Security Guardrails (Non-Negotiable):**

```
1. แถบ Header เปลี่ยนเป็น "⚠️ IMPERSONATION MODE — You are viewing as [NAME]"
   สีแดง ตลอดเวลา ลบไม่ได้

2. ทุก action ในโหมดนี้ audit_logs บันทึก:
   actor_id     = super_admin UUID
   actor_role   = 'super_admin'
   impersonated_user_id = target user UUID
   (ปัดความรับผิดชอบไม่ได้)

3. Session หมดอายุใน 30 นาที อัตโนมัติ

4. ออกจากโหมดได้ตลอดเวลาด้วยปุ่ม "End Session"

5. ไม่สามารถ impersonate super_admin คนอื่น
```

**Implementation:**

```typescript
// POST /api/admin/impersonate
// Body: { targetUserId: string, orgId: string, reason: string }
// Returns: { impersonationToken: string, expiresAt: string }

// impersonationToken = JWT signed ด้วย service role key ที่มี custom claims:
// {
//   sub: targetUserId,
//   impersonated_by: superAdminId,
//   impersonation_reason: reason,
//   expires_at: now + 30min
// }

// Frontend ตรวจ claim นี้ → แสดง red banner ตลอด
```

**DB: `impersonation_sessions`**
```sql
CREATE TABLE impersonation_sessions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  super_admin_id  uuid NOT NULL REFERENCES profiles(id),
  target_user_id  uuid NOT NULL REFERENCES profiles(id),
  org_id          uuid NOT NULL REFERENCES organizations(id),
  reason          text NOT NULL,
  started_at      timestamptz NOT NULL DEFAULT now(),
  ended_at        timestamptz,
  is_active       boolean NOT NULL DEFAULT true
);
```

**UI ใน `/admin/users`**: เพิ่มปุ่ม "View As" ต่อ user row → modal กรอกเหตุผล → redirect เข้า org

---

## Phase 2: Customization Layer

### 2.1 Custom Fields Manager

**Use case**: ลูกค้า TMC อยากเพิ่มฟิลด์ "ทะเบียนรถ" ในหน้าบันทึกบัญชี  
→ ไม่ต้องแก้ schema DB จริง → เก็บใน `custom_properties jsonb`

**Strategy: EAV-lite via JSONB**

```
org_custom_fields  ← ระบุว่า org มีฟิลด์อะไรบ้าง
      ↓
tmc_finance_entries.custom_properties  ← เก็บ value จริงใน jsonb
```

**DB: `org_custom_fields`**
```sql
CREATE TABLE org_custom_fields (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id       uuid        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  module_key   text        NOT NULL,
  entity_type  text        NOT NULL, -- 'finance_entry', 'customer', 'order'
  field_key    text        NOT NULL, -- 'license_plate', 'villa_number'
  label_th     text        NOT NULL, -- "ทะเบียนรถ"
  label_en     text,                 -- "License Plate"
  field_type   text        NOT NULL  -- 'text' | 'number' | 'date' | 'select' | 'boolean'
    CHECK (field_type IN ('text','number','date','select','boolean')),
  select_options jsonb,              -- สำหรับ type='select': [{"value":"a","label":"A"}]
  is_required  boolean     NOT NULL DEFAULT false,
  sort_order   int         NOT NULL DEFAULT 0,
  created_by   uuid        REFERENCES profiles(id),
  created_at   timestamptz NOT NULL DEFAULT now(),

  UNIQUE (org_id, module_key, entity_type, field_key)
);
```

**ใน data table ที่ต้องการรองรับ custom fields:**
```sql
ALTER TABLE tmc_finance_entries ADD COLUMN IF NOT EXISTS custom_properties jsonb DEFAULT '{}';
ALTER TABLE customers          ADD COLUMN IF NOT EXISTS custom_properties jsonb DEFAULT '{}';
```

**วิธีใช้ฝั่ง Frontend:**

```typescript
// 1. โหลด field definitions ของ org นี้
const { data: fields } = await supabase
  .from('org_custom_fields')
  .select('*')
  .eq('org_id', orgId)
  .eq('module_key', 'tmc')
  .eq('entity_type', 'finance_entry')
  .order('sort_order');

// 2. Render dynamic form fields จาก definitions

// 3. Save: รวม custom values เข้า custom_properties
const payload = {
  ...standardFields,
  custom_properties: {
    license_plate: "กข 1234",
    villa_number:  "A12",
  },
};
```

**UI ที่ `/admin/custom-fields`:**
```
[เลือก Org] [เลือก Module] [เลือก Entity]
─────────────────────────────────────────
ฟิลด์ที่มีอยู่:
  1. ทะเบียนรถ (text, required)  [แก้ไข] [ลบ]
  2. หมายเลขวิลล่า (text)        [แก้ไข] [ลบ]

[+ เพิ่มฟิลด์ใหม่]
```

---

### 2.2 Label Override Manager

**Use case**: TMC อยากให้คำว่า "รายรับ" แสดงเป็น "ค่าเช่า" ในระบบของเขา

**Strategy: Client-side i18n override**

```
org_label_overrides (ใน DB)
      ↓
API: GET /api/org/labels?orgId=xxx
      ↓
Frontend Context: useOrgLabels() hook
      ↓
Component: <OrgLabel labelKey="finance.income" />
```

**DB: `org_label_overrides`**
```sql
CREATE TABLE org_label_overrides (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id     uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  label_key  text NOT NULL,     -- 'finance.income', 'finance.expense', 'nav.reports'
  locale     text NOT NULL DEFAULT 'th',
  value      text NOT NULL,     -- "ค่าเช่า", "รายรับจากการขาย"
  updated_by uuid REFERENCES profiles(id),
  updated_at timestamptz NOT NULL DEFAULT now(),

  UNIQUE (org_id, label_key, locale)
);
```

**Default Label Registry** (เก็บใน `src/lib/labels/defaults.ts`):
```typescript
export const DEFAULT_LABELS: Record<string, string> = {
  'finance.income':        'รายรับ',
  'finance.expense':       'รายจ่าย',
  'finance.balance':       'ยอดคงเหลือ',
  'nav.accounting':        'บัญชี',
  'nav.reports':           'รายงาน',
  // ... ครอบคลุมทุก label ใน UI
};
```

**UI ที่ `/admin/labels`:**
```
[เลือก Org] [Locale: TH/EN]
─────────────────────────────────────────
Label Key              | Default    | Override
finance.income         | รายรับ     | [ค่าเช่า      ✏️]
finance.expense        | รายจ่าย    | [            ✏️]
nav.reports            | รายงาน     | [            ✏️]
```

---

## Phase 3: Reliability

### 3.1 Tenant Resource Monitor

**Use case**: org B รัน year-end calc หนัก → ทำให้ org A, C ช้า (Noisy Neighbor)

**Approach**: Supabase ไม่ expose per-org metrics โดยตรง ต้องสร้าง sampling layer เอง

**Strategy A: Application-level sampling (ทำได้ทันที)**
```typescript
// Middleware บันทึก request metrics ต่อ org
// ใน every API route: log { org_id, duration_ms, ts }
// → aggregate ใน query_metrics table
```

**DB: `api_request_metrics`**
```sql
CREATE TABLE api_request_metrics (
  id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  org_id       uuid,
  route        text,        -- '/api/tmc/finance'
  method       text,
  duration_ms  int,
  status_code  int,
  logged_at    timestamptz NOT NULL DEFAULT now()
);

-- Partition by day หรือ cleanup cron ทุก 7 วัน
```

**Dashboard ที่ `/admin/resources`:**
```
[เลือกช่วงเวลา: 1h / 6h / 24h]

Requests Per Minute (by org)
  TMC     ████████████████  142 req/min
  Org B   ████              38 req/min
  Org C   ██                12 req/min

Avg Latency (by org)
  TMC     ▓▓▓▓▓▓▓           280ms
  Org B   ▓▓▓▓▓▓▓▓▓▓▓       420ms  ⚠️ สูงผิดปกติ
  Org C   ▓▓▓               95ms

Error Rate (5xx)
  TMC     0.2%
  Org B   3.8%  🔴
  Org C   0.0%
```

**Strategy B: Supabase Logs API (ถ้ามีแผน Pro+)**
- ดึง logs ผ่าน `GET /v1/projects/{ref}/logs?sql=SELECT...`
- Filter by `metadata.request.header.x-org-id` ที่เราใส่ใน middleware

---

### 3.2 Webhook Gateway Control

**Use case**: PERPOS ต้องส่งข้อมูลออกไปยังระบบลูกค้า (เช่น ERP สำนักงานใหญ่, LINE Notify องค์กร)

**DB Schema:**
```sql
CREATE TABLE tenant_webhooks (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id       uuid        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name         text        NOT NULL,
  url          text        NOT NULL,
  event_types  text[]      NOT NULL,  -- ['finance.entry.created', 'invoice.approved']
  secret_hash  text,                  -- HMAC-SHA256 ลงนาม payload
  is_active    boolean     NOT NULL DEFAULT true,
  timeout_ms   int         NOT NULL DEFAULT 10000,
  retry_count  int         NOT NULL DEFAULT 3,
  created_by   uuid        REFERENCES profiles(id),
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE webhook_delivery_logs (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  webhook_id     uuid        NOT NULL REFERENCES tenant_webhooks(id),
  event_type     text        NOT NULL,
  payload        jsonb       NOT NULL,
  response_status int,
  response_body  text,
  latency_ms     int,
  attempt_no     int         NOT NULL DEFAULT 1,
  success        boolean     NOT NULL DEFAULT false,
  delivered_at   timestamptz NOT NULL DEFAULT now()
);
```

**Event System (Publisher):**
```typescript
// src/lib/webhooks/publish.ts
export async function publishWebhookEvent(
  orgId:     string,
  eventType: string,  // 'finance.entry.created'
  payload:   unknown,
) {
  // หา webhooks ที่ subscribe event นี้
  const { data: hooks } = await admin
    .from('tenant_webhooks')
    .select('*')
    .eq('org_id', orgId)
    .eq('is_active', true)
    .contains('event_types', [eventType]);

  // Fire & forget — ไม่ block response
  void Promise.allSettled(
    (hooks ?? []).map((hook) => deliverWebhook(hook, eventType, payload))
  );
}
```

**Dashboard ที่ `/admin/webhooks`:**
```
[เลือก Org]
─────────────────────────────────────────
Webhooks ที่ตั้งค่าไว้:
  📡 ERP สำนักงานใหญ่
     URL: https://erp.company.com/callback
     Events: finance.entry.created, invoice.approved
     Status: ✅ Active | 98.2% success (7 วัน)
     [แก้ไข] [ดู Logs] [ปิด]

Delivery Logs:
  ✅ finance.entry.created  2025-01-15 14:30  200 OK  120ms
  ❌ invoice.approved       2025-01-15 10:15  503     timeout  [Retry]
  ✅ finance.entry.created  2025-01-14 16:45  200 OK  89ms
```

---

## Phase 4: Growth Infrastructure

### 4.1 API Rate Limiting Per Tenant

**DB: `tenant_rate_limits`**
```sql
CREATE TABLE tenant_rate_limits (
  org_id                    uuid    PRIMARY KEY REFERENCES organizations(id),
  requests_per_minute       int     NOT NULL DEFAULT 120,
  max_burst                 int     NOT NULL DEFAULT 200,    -- spike allowance
  ai_calls_per_day          int     NOT NULL DEFAULT 100,
  webhook_deliveries_per_hr int     NOT NULL DEFAULT 1000,
  updated_at                timestamptz NOT NULL DEFAULT now()
);
```

**Middleware Pattern:**
```typescript
// Sliding window counter ใน Supabase (หรือ Upstash Redis ถ้ามี)
// ใน API middleware ทุก request:
const count = await getRequestCount(orgId, '1m');
if (count > limits.requests_per_minute) {
  return Err.rateLimited(orgId);
}
```

---

### 4.2 Billing & Plan Manager

**Plan Tiers:**
```
Starter   → accounting module only, 5 users, 1,000 API/day
Business  → all shared modules, 20 users, 10,000 API/day
Enterprise→ all modules + specific modules, unlimited users, custom limits
```

**DB: `org_billing`**
```sql
CREATE TABLE org_billing (
  org_id          uuid    PRIMARY KEY REFERENCES organizations(id),
  plan            text    NOT NULL DEFAULT 'starter'
    CHECK (plan IN ('starter','business','enterprise','custom')),
  billing_email   text,
  billing_cycle   text    NOT NULL DEFAULT 'monthly',
  next_billing_at timestamptz,
  is_active       boolean NOT NULL DEFAULT true,
  notes           text,                -- internal notes
  updated_at      timestamptz NOT NULL DEFAULT now()
);
```

**Module Guard เพิ่มเติม:**
```typescript
// requireModuleMember() เพิ่ม check billing plan
const billing = await getBillingPlan(orgId);
if (!planAllowsModule(billing.plan, moduleKey)) {
  return Err.planUpgradeRequired(moduleKey);
}
```

---

### 4.3 Tenant Health Scoring

Admin Dashboard หลักแสดง "สถานะสุขภาพ" ต่อ org:

```
Org              Health   Users  Modules  Last Active  Alerts
─────────────────────────────────────────────────────────────
TMC Management   🟢 Good    7      4       2h ago       —
Org B            🟡 Warn    3      2       3d ago       ⚠️ Webhook fail
Org C            🔴 Crit    1      1       14d ago      🔴 No activity
```

**Health Score คำนวณจาก:**
- Error rate 7 วันล่าสุด
- Webhook success rate
- วันที่ login ล่าสุด
- Module settings ครบถ้วนหรือไม่

---

### 4.4 Maintenance Mode

Super Admin สามารถ lock org เป็น read-only ระหว่าง migration:

**DB:**
```sql
ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS maintenance_mode   boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS maintenance_reason text,
  ADD COLUMN IF NOT EXISTS maintenance_until  timestamptz;
```

**Middleware:**
```typescript
// ตรวจก่อนทุก mutating request
const { data: org } = await admin
  .from('organizations')
  .select('maintenance_mode, maintenance_reason, maintenance_until')
  .eq('id', orgId)
  .single();

if (org?.maintenance_mode && req.method !== 'GET') {
  return NextResponse.json({
    ok: false,
    error: {
      code:    'ERR_MAINTENANCE_MODE',
      message: `ระบบกำลังอยู่ในโหมดบำรุงรักษา: ${org.maintenance_reason}`,
      details: { until: org.maintenance_until },
    },
  }, { status: 503 });
}
```

---

## Phase Summary

| Phase | ฟีเจอร์ | ความซับซ้อน | Impact |
|-------|---------|------------|--------|
| **0** | User Mgmt, Modules, Audit | ✅ Done | — |
| **1a** | Tenant Onboarding Wizard | 🟡 Medium | 🔴 Critical |
| **1b** | Module Provisioning (upgrade) | 🟢 Low | 🔴 Critical |
| **1c** | Impersonation Tool | 🟡 Medium | 🔴 Critical |
| **2a** | Custom Fields Manager | 🔴 High | 🟡 High |
| **2b** | Label Override Manager | 🟢 Low | 🟡 High |
| **3a** | Tenant Resource Monitor | 🟡 Medium | 🟡 High |
| **3b** | Webhook Gateway Control | 🔴 High | 🟡 High |
| **4a** | API Rate Limiting | 🟡 Medium | 🟢 Medium |
| **4b** | Billing & Plan Manager | 🔴 High | 🟢 Medium |
| **4c** | Tenant Health Scoring | 🟢 Low | 🟢 Medium |
| **4d** | Maintenance Mode | 🟢 Low | 🟢 Medium |

**แนะนำลำดับทำ:** 1b → 1a → 1c → 2b → 3a → 2a → 3b → 4c → 4d → 4a → 4b

---

## DB Migration Plan

```
Phase 1:
  ├── org_module_change_log     (audit trail ของ module toggle)
  └── impersonation_sessions    (log การ impersonate)

Phase 2:
  ├── org_custom_fields         (custom field definitions per org)
  └── org_label_overrides       (label customization per org)

Phase 3:
  ├── api_request_metrics       (performance sampling)
  ├── tenant_webhooks           (webhook registration)
  └── webhook_delivery_logs     (delivery history)

Phase 4:
  ├── tenant_rate_limits        (quota per org)
  ├── org_billing               (plan & subscription)
  └── ALTER organizations       (+maintenance_mode columns)
```

**ทุก table ต้องมี:**
- `ENABLE ROW LEVEL SECURITY`
- Policy อ่านได้เฉพาะ org member ของตัวเอง
- Policy เขียนได้เฉพาะ super_admin (ผ่าน service_role key)
- Audit trigger สำหรับ table ที่ sensitive

---

## Security Checklist Per Phase

### Phase 1 — Impersonation (critical)
- [ ] JWT claim `impersonated_by` ต้องตรวจใน middleware ทุก route
- [ ] Red banner render บน **server component** ไม่ใช่ client-only (ป้องกัน bypass)
- [ ] ออก impersonation mode ล้าง JWT ทุกตัวใน browser
- [ ] Audit log บันทึก `impersonated_user_id` ทุก action

### Phase 2 — Custom Fields
- [ ] `field_key` ผ่าน allowlist validation (alphanumeric + underscore เท่านั้น)
- [ ] `select_options` ผ่าน JSON schema validation
- [ ] ห้าม field_key ซ้ำกับ column จริงใน table (เช่น `id`, `org_id`)

### Phase 3 — Webhooks
- [ ] HMAC-SHA256 signature ทุก delivery
- [ ] URL allowlist (ห้าม `localhost`, `169.254.*`, internal IPs)
- [ ] Payload ผ่าน PII masking ก่อนส่งออก (ดู `docs/agent.md §4.1`)
- [ ] Max payload size: 1MB

---

## เอกสารที่เกี่ยวข้อง

| เอกสาร | ความสัมพันธ์ |
|--------|-------------|
| [`docs/platform.md`](./platform.md) | Architecture overview — super admin คือส่วนหนึ่งของ platform |
| [`docs/tenant-isolation.md`](./tenant-isolation.md) | RLS ที่ทุก Phase 2-4 table ต้องทำตาม |
| [`docs/audit.md`](./audit.md) | Impersonation actions ต้องบันทึกตาม spec นี้ |
| [`docs/module-scaffold.md`](./module-scaffold.md) | เมื่อ super admin เปิด specific module ใหม่ |
| [`docs/error-handling-and-api.md`](./error-handling-and-api.md) | Error codes: `ERR_MAINTENANCE_MODE`, rate limit errors |
