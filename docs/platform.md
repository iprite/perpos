# PERPOS Platform — คัมภีร์

> **คำนิยาม**: PERPOS ไม่ใช่ SaaS สำเร็จรูป แต่เป็น **ERP Platform** สำหรับสร้าง custom ERP ให้องค์กรที่ว่าจ้าง  
> แต่ละลูกค้าได้ระบบของตัวเองที่สร้างบน shared infrastructure เดียวกัน

---

## 1. Vision

```
ลูกค้า A (TMC) ──┐
ลูกค้า B         ├──► PERPOS Platform ──► Custom ERP of their own
ลูกค้า C         │         │
...         ─────┘    shared infra:
                       - Next.js App Router
                       - Supabase (multi-tenant)
                       - Auth, Audit, Billing, ...
```

**สิ่งที่ลูกค้าได้:**
- URL path เฉพาะของตัวเอง: `perpos.io/<org-slug>/...`
- Data isolation — ไม่เห็นข้อมูลองค์กรอื่น
- Module เฉพาะที่ออกแบบตามธุรกิจของเขา
- Shared modules (accounting, payroll, assistant) ที่เปิด/ปิดได้

**สิ่งที่ PERPOS ได้:**
- Build ครั้งเดียว ใช้ infrastructure ซ้ำ
- Module ใหม่ที่สร้างให้ลูกค้า A อาจ reuse ให้ลูกค้า B ในอนาคต
- Operational cost ต่ำ เพราะ single codebase, single DB cluster

---

## 2. โมเดล Module

### 2.1 Shared Module
Module มาตรฐานที่ทุกองค์กรเปิดใช้ได้

| Module Key  | ชื่อ           | หน้าที่                           |
|-------------|----------------|----------------------------------|
| `accounting` | Accounting     | บัญชี, ภาษี, รายงาน              |
| `payroll`    | Payroll        | เงินเดือน, พนักงาน               |
| `assistant`  | Assistant      | AI Task Manager, LINE Bot        |

### 2.2 Specific Module
Module ที่สร้างเฉพาะให้องค์กรหนึ่ง (`specific: true` ใน `ALL_MODULES`)

| Module Key | ลูกค้า | หน้าที่                                        |
|------------|--------|-----------------------------------------------|
| `tmc`      | TMC    | Dashboard, บัญชี-การเงิน, Stock, การเข้าพัก  |
| *(next)*   | ...    | สร้างตาม spec ลูกค้าใหม่                       |

**กฎ Specific Module:**
- ซ่อนจาก Module Manager ขององค์กรอื่น
- เปิดใช้งานได้โดย super_admin เท่านั้น
- ใช้ org_id ของลูกค้านั้นเป็น primary scope ทุก query

---

## 3. โครงสร้าง Database

### 3.1 Multi-tenant Strategy
**ใช้ Row-Level Security (RLS)** — ทุก table มี `org_id` หรือ `organization_id`  
ไม่ใช้ separate DB per tenant เพราะ cost สูงและ Supabase ไม่รองรับ natively

```
organizations          ← ทะเบียนลูกค้าทั้งหมด
  ├── organization_members   ← สมาชิกองค์กร + org-level role
  ├── org_module_settings    ← module ใดเปิด/ปิด + allowed roles
  │
  ├── [shared tables]        ← customers, workers, orders, ...
  │     ∟ organization_id FK → organizations
  │
  └── [specific tables]      ← tmc_finance_entries, tmc_accounts, ...
        ∟ org_id FK → organizations
```

### 3.2 Naming Convention

| ประเภท | ตัวอย่าง | หมายเหตุ |
|--------|---------|---------|
| Shared table | `customers`, `orders` | ใช้ `organization_id` |
| Specific table | `tmc_*` | prefix ด้วย module key, ใช้ `org_id` |
| Junction/config | `org_module_settings` | prefix ด้วย `org_` |

### 3.3 RLS Pattern

```sql
-- Shared module table
CREATE POLICY "select_own_org"
  ON customers FOR SELECT
  USING (is_org_member(organization_id, auth.uid()));

-- Specific module table
CREATE POLICY "select_own_org"
  ON tmc_finance_entries FOR SELECT
  USING (is_org_member(org_id, auth.uid()));
```

Helper functions (SECURITY DEFINER, อยู่ใน DB):
- `is_org_member(org_id, user_id)` — user เป็นสมาชิกองค์กรไหม
- `is_org_admin(org_id, user_id)` — user เป็น owner/admin ขององค์กรไหม

ดูเพิ่มเติม: [`docs/tenant-isolation.md`](./tenant-isolation.md)

---

## 4. โครงสร้าง Codebase

```
apps/perpos/src/
│
├── app/
│   ├── (hydrogen)/                    ← Protected pages
│   │   ├── [orgSlug]/                 ← Dynamic org routing
│   │   │   ├── accounting/            ← Shared module pages
│   │   │   ├── payroll/
│   │   │   ├── assistant/
│   │   │   └── tmc/                   ← Specific module pages
│   │   │
│   │   └── admin/                     ← Super Admin console
│   │       ├── modules/               ← Manage module settings per org
│   │       ├── users/
│   │       └── audit/
│   │
│   └── api/
│       ├── _lib/
│       │   ├── auth.ts                ← requireUser, requireAdmin
│       │   ├── module-auth.ts         ← requireModuleMember (generic)
│       │   ├── supabase.ts            ← createAdminClient, createAuthedClient
│       │   └── audit.ts               ← setAuditContext
│       │
│       ├── admin/                     ← Super Admin APIs
│       ├── tmc/                       ← Specific module API (TMC)
│       │   ├── _lib.ts                ← requireTmcMember (wraps requireModuleMember)
│       │   ├── finance/route.ts
│       │   ├── accounts/route.ts
│       │   └── ...
│       │
│       └── [next-module]/             ← Pattern เดียวกันกับ tmc/
│           ├── _lib.ts
│           └── .../route.ts
│
├── lib/
│   └── modules.ts                     ← ALL_MODULES registry + role defs
│
└── layouts/hydrogen/
    └── menu-items.tsx                 ← Menu per module context
```

### 4.1 Auth Stack

```
Request
  │
  ▼
requireUser(req)              ← JWT valid + user active
  │
  ▼
requireModuleMember(req, orgId, moduleKey)   ← module enabled + user is member
  │
  ▼
canModuleWrite(moduleKey, moduleRole)        ← check write permission
  │
  ▼
setAuditContext(req, userId, orgId)          ← wire audit before mutation
  │
  ▼
DB mutation
```

### 4.2 Module Registry (`src/lib/modules.ts`)

ทุก module ต้องลงทะเบียนที่นี่ก่อน:

```typescript
ALL_MODULES = [
  {
    key:      "tmc",
    label:    "TMC Management",
    specific: true,          // ซ่อนจากองค์กรอื่น
    roles: [
      { key: "owner",       canWrite: true  },
      { key: "admin",       canWrite: true  },
      { key: "team_lead",   canWrite: true  },
      { key: "team_member", canWrite: false },
    ],
    ...
  }
]
```

---

## 5. วงจรชีวิต: รับงานลูกค้าใหม่

```
Phase 1: Discovery (1-2 สัปดาห์)
  └── ทำความเข้าใจธุรกิจลูกค้า, ออกแบบ data model, วาง module scope

Phase 2: Setup (1 วัน)
  ├── สร้าง Organization ใน DB
  ├── เปิด shared modules ที่ต้องการ (accounting, payroll, ...)
  └── เตรียม org_id สำหรับ specific module

Phase 3: Build Specific Module (per sprint)
  ├── สร้าง migration: tmc_* tables
  ├── ลงทะเบียนใน ALL_MODULES (specific: true)
  ├── สร้าง API: src/app/api/<module>/
  ├── สร้าง Pages: src/app/(hydrogen)/[org]/<module>/
  └── เพิ่ม menu items

Phase 4: Deploy & Onboard
  ├── Apply migrations to production
  ├── เปิด module ผ่าน Admin Console
  ├── สร้าง accounts ให้ทีมลูกค้า
  └── ทดสอบ data isolation

Phase 5: Maintain
  ├── ลูกค้าขอ feature ใหม่ → Sprint
  └── Shared module improvements → ทุกลูกค้าได้รับอัตโนมัติ
```

---

## 6. Routing Strategy

### 6.1 URL Structure

```
/admin/*                    ← Super Admin (เฉพาะทีม PERPOS)
/<orgSlug>/<module>/*       ← ลูกค้าใช้งาน

ตัวอย่าง:
  /tmc/tmc/finance          ← org slug "tmc", module "tmc"
  /p2p/accounting/invoices  ← org slug "p2p", module "accounting"
```

### 6.2 Module Guard

Frontend ตรวจว่า module ที่ลูกค้า access มีอยู่ใน `org_module_settings`  
Backend API ทุก route เรียก `requireModuleMember()` เสมอ — ไม่เชื่อ frontend

---

## 7. Audit & Security

ทุก specific module **ต้องมี audit trigger** บน tables หลัก  
ดูรายละเอียด: [`docs/audit.md`](./audit.md)

```sql
CREATE TRIGGER my_module_audit
  AFTER INSERT OR UPDATE OR DELETE ON tmc_finance_entries
  FOR EACH ROW EXECUTE FUNCTION fn_audit_log_changes();
```

API route ทุกตัวที่ mutate ข้อมูล **ต้อง call `setAuditContext()`** ก่อน mutation:

```typescript
await setAuditContext(req, auth.userId, auth.orgId);
// แล้วค่อย insert/update/delete
```

---

## 8. Checklist เพิ่มลูกค้าใหม่

### 8.1 Setup ใน DB (super_admin)

```sql
-- 1. สร้างองค์กร
INSERT INTO organizations (id, name, slug)
VALUES (gen_random_uuid(), 'ชื่อบริษัท', 'org-slug');

-- 2. เพิ่มเจ้าของ
INSERT INTO organization_members (organization_id, user_id, role)
VALUES ('<org_id>', '<owner_user_id>', 'owner');

-- 3. เปิด shared modules (ตามที่ตกลง)
INSERT INTO org_module_settings (organization_id, module_key, is_enabled, allowed_roles)
VALUES ('<org_id>', 'accounting', true, ARRAY['owner','admin','team_lead','team_member']);
```

### 8.2 Build Specific Module

ดู checklist ครบ: [`docs/module-scaffold.md`](./module-scaffold.md)

### 8.3 Go-Live Checklist

- [ ] Migration applied ใน production
- [ ] RLS policies ทดสอบ (ดู `docs/tenant-isolation.md#testing`)
- [ ] Audit triggers ทำงาน — verify ผ่าน Admin Console → Audit Log
- [ ] Org slug ใน URL ถูกต้อง
- [ ] Menu items แสดงตาม module ที่เปิด
- [ ] ทดสอบ login ด้วย account ของลูกค้า (ไม่ใช่ super_admin)
- [ ] ตรวจว่า data ข้ามองค์กรรั่วไหลไม่ได้

---

## 9. ข้อควรระวัง

### ❌ ห้ามทำ

```typescript
// ❌ ใช้ anon key ใน API route (ไม่ผ่าน RLS อย่างถูกต้อง)
const { data } = await supabase.from('tmc_finance_entries').select();

// ❌ ไม่เช็ค org_id (ข้อมูลข้ามองค์กรได้)
await admin.from('tmc_finance_entries').select().eq('id', id);

// ❌ Hardcode org_id ใน frontend (ควรอยู่ใน env หรือ session)
const ORG = "1f52618c-...";  // ใน client component
```

### ✅ Pattern ที่ถูกต้อง

```typescript
// ✅ ใช้ createAdminClient() ใน API routes เสมอ
const admin = createAdminClient();

// ✅ scope ทุก query ด้วย org_id ที่มาจาก auth result
await admin
  .from('tmc_finance_entries')
  .select()
  .eq('org_id', auth.orgId)   // auth.orgId มาจาก requireModuleMember()
  .eq('id', id);

// ✅ Org ID sensitive values อยู่ใน env เสมอ
const TMC_ORG_ID = process.env.TMC_ORG_ID!;
```

---

## 10. เอกสารที่เกี่ยวข้อง

| เอกสาร | เนื้อหา |
|--------|---------|
| [`docs/platform.md`](./platform.md) | เอกสารนี้ — ภาพรวม platform |
| [`docs/module-scaffold.md`](./module-scaffold.md) | How-to: สร้าง specific module ใหม่ |
| [`docs/tenant-isolation.md`](./tenant-isolation.md) | RLS strategy, testing isolation |
| [`docs/audit.md`](./audit.md) | Audit log architecture & verification |
