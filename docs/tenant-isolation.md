# PERPOS Tenant Isolation — คัมภีร์การแยกข้อมูลลูกค้า

> **ผู้อ่านเป้าหมาย**: Developer ที่สร้าง feature ใหม่ / Security Reviewer  
> **ความเสี่ยงสูงสุด**: บริษัท A อ่านข้อมูลของบริษัท B — เกิดจาก RLS ขาด หรือใช้ admin client ผิดจุด  
> **อัพเดทล่าสุด**: 2026-05-23

---

## 1. RLS (Row Level Security) Strategy

### 1.1 Tenant Key — "ตัวแทนบริษัท" ในแต่ละตาราง

PERPOS ใช้ **2 ชื่อคอลัมน์** ขึ้นอยู่กับ module (ข้อจำกัดทางประวัติศาสตร์):

| Module | Tenant Key | ตัวอย่างตาราง |
|--------|-----------|--------------|
| Core (ERP, Finance, Payroll) | `organization_id` | `journal_entries`, `invoices`, `finance_accounts` |
| TMC | `org_id` | `tmc_finance_entries`, `tmc_accounts`, `tmc_members` |

> **กฎ**: ตารางใหม่ให้ใช้ **`org_id`** เสมอ (standard ใหม่)  
> ตาราง core เดิมที่ใช้ `organization_id` ห้ามเปลี่ยนชื่อ (breaking change)

---

### 1.2 RLS Helper Functions

มี 2 ฟังก์ชัน SECURITY DEFINER พร้อมใช้:

```sql
-- ตรวจว่า user เป็นสมาชิกของ org (ทุก role)
is_org_member(p_org uuid, p_user uuid) → boolean

-- ตรวจว่า user มี role = 'owner' หรือ 'admin' ใน org
is_org_admin(p_org uuid, p_user uuid) → boolean
```

**ใช้เมื่อไหร่**:

```sql
-- ✅ อ่านข้อมูล: สมาชิกทุกคนเห็น
USING (is_org_member(table_name.org_id, auth.uid()))

-- ✅ แก้ไข/ลบ: เฉพาะ admin/owner
USING (is_org_admin(table_name.org_id, auth.uid()))

-- ✅ ตาราง core ที่ใช้ organization_id (pattern เดิม)
USING (is_org_member(table_name.organization_id, auth.uid()))
```

---

### 1.3 Policy Templates — 3 ระดับ

#### Template A — "สมาชิกอ่านได้, admin เขียนได้" (ใช้บ่อยที่สุด)

```sql
ALTER TABLE <new_table> ENABLE ROW LEVEL SECURITY;

-- SELECT: สมาชิกทุกคน
CREATE POLICY "<new_table>_select"
  ON <new_table> FOR SELECT
  USING (is_org_member(<new_table>.org_id, auth.uid()));

-- INSERT: admin/owner เท่านั้น
CREATE POLICY "<new_table>_insert"
  ON <new_table> FOR INSERT
  WITH CHECK (is_org_admin(<new_table>.org_id, auth.uid()));

-- UPDATE: admin/owner เท่านั้น
CREATE POLICY "<new_table>_update"
  ON <new_table> FOR UPDATE
  USING  (is_org_admin(<new_table>.org_id, auth.uid()))
  WITH CHECK (is_org_admin(<new_table>.org_id, auth.uid()));

-- DELETE: admin/owner เท่านั้น
CREATE POLICY "<new_table>_delete"
  ON <new_table> FOR DELETE
  USING (is_org_admin(<new_table>.org_id, auth.uid()));
```

#### Template B — "สมาชิกอ่านและเขียนได้" (เช่น task, comment)

```sql
ALTER TABLE <new_table> ENABLE ROW LEVEL SECURITY;

CREATE POLICY "<new_table>_member_all"
  ON <new_table>
  USING  (is_org_member(<new_table>.org_id, auth.uid()))
  WITH CHECK (is_org_member(<new_table>.org_id, auth.uid()));
```

#### Template C — "เจ้าของ record เท่านั้น" (เช่น personal notes)

```sql
ALTER TABLE <new_table> ENABLE ROW LEVEL SECURITY;

CREATE POLICY "<new_table>_owner_only"
  ON <new_table>
  USING  (<new_table>.created_by = auth.uid())
  WITH CHECK (<new_table>.created_by = auth.uid());
```

---

### 1.4 ตาราง Checklist เมื่อสร้างตารางใหม่

```
□ มี org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE
□ มี index: CREATE INDEX ON <table>(org_id)
□ ALTER TABLE <table> ENABLE ROW LEVEL SECURITY
□ มี policy ครบ: SELECT + INSERT + UPDATE + DELETE
□ ไม่มี policy ที่ USING (true) — นั่นคือ public read ซึ่งไม่ควรมีในตาราง tenant
□ ถ้ามี sensitive fields → ผูก audit trigger (ดู docs/audit.md)
```

---

## 2. Bypass Rules — เมื่อไหรที่ใช้ Admin Client ได้

### 2.1 ความแตกต่างของ 2 Client

```typescript
// ✅ RLS-ENFORCED — ใช้ใน API routes ที่มี user context
import { createAuthedClient } from '../_lib/supabase';
const rls = createAuthedClient(accessToken); // respects ALL RLS policies

// ⚠️ BYPASSES RLS — ใช้เฉพาะกรณีที่ระบุด้านล่าง
import { createAdminClient } from '../_lib/supabase';
const admin = createAdminClient(); // service_role — เห็นทุกแถวทุก org
```

---

### 2.2 ✅ กรณีที่ใช้ `createAdminClient()` ได้

| กรณี | เหตุผล | ตัวอย่างในโค้ด |
|------|--------|---------------|
| **Cron / Scheduled job** | ไม่มี user JWT — ต้อง process ข้ามหลาย org | `/api/assistant/scheduler` |
| **Audit trigger** (SECURITY DEFINER) | ต้องเขียน `audit_logs` ซึ่ง block RLS | `fn_audit_log_changes()` |
| **External log shipping** | Batch read ไม่มี user context | `/api/internal/audit-ship` |
| **Super Admin operations** | ผ่าน `requireAdmin()` แล้ว — org scope ชัดเจน | `/api/admin/users/*` |
| **Cross-table lookup** หลัง verify membership | ตรวจ membership ผ่าน RLS client ก่อน แล้วค่อย admin fetch | ดู pattern ด้านล่าง |
| **Migration scripts** | DDL/DML ที่ไม่มี user context | `supabase/migrations/*.sql` |

**Pattern ที่ถูกต้อง: "verify via RLS → fetch via admin"**

```typescript
export async function POST(req: NextRequest) {
  const auth = await requireTmcMember(req, orgId); // ← RLS client ตรวจ membership
  if (!auth.ok) return auth.res;

  // ✅ ตอนนี้รู้แล้วว่า user อยู่ใน org → ใช้ admin ได้
  const admin = createAdminClient();
  const { data } = await admin
    .from('tmc_finance_entries')
    .select('*')
    .eq('org_id', orgId);          // ← ยังต้อง filter org_id เสมอ!
}
```

---

### 2.3 ❌ กรณีที่ห้ามใช้ `createAdminClient()` เด็ดขาด

#### ❌ 1 — Trust org_id จาก request body โดยไม่ตรวจ membership

```typescript
// ❌ อันตราย: attacker ส่ง orgId ของบริษัทอื่นมา
const orgId = body.orgId;
const admin = createAdminClient();
const { data } = await admin.from('invoices').select('*').eq('org_id', orgId);
```

```typescript
// ✅ ถูกต้อง: ตรวจ membership ก่อนเสมอ
const auth = await requireTmcMember(req, body.orgId); // ตรวจ JWT + membership
if (!auth.ok) return auth.res;
// ค่อยใช้ admin ได้ โดยยัง filter orgId
```

---

#### ❌ 2 — SELECT ไม่มี org_id filter แม้ใช้ admin client

```typescript
// ❌ อันตราย: return ข้อมูลทุก org ให้ user คนเดียว
const { data } = await admin.from('tmc_finance_entries').select('*');

// ✅ ถูกต้อง: filter เสมอแม้จะ bypass RLS
const { data } = await admin
  .from('tmc_finance_entries')
  .select('*')
  .eq('org_id', auth.orgId);      // ← บังคับ
```

---

#### ❌ 3 — ใช้ admin client ใน Client-Side Code

```typescript
// ❌ NEVER: service_role key ต้องไม่ถูก expose ไปฝั่ง browser
// SUPABASE_SERVICE_ROLE_KEY ต้องเป็น server-only env var เสมอ
// ห้าม prefix ด้วย NEXT_PUBLIC_
```

---

#### ❌ 4 — Cross-org write ใน bulk operation

```typescript
// ❌ อันตราย: loop ข้าม orgs โดยไม่ตรวจ scope ชัดเจน
for (const entry of allEntries) {
  await admin.from('tmc_finance_entries').update({ note: '...' }).eq('id', entry.id);
}

// ✅ ถูกต้อง: เพิ่ม org_id ใน WHERE ทุกครั้ง
for (const entry of allEntries) {
  await admin
    .from('tmc_finance_entries')
    .update({ note: '...' })
    .eq('id', entry.id)
    .eq('org_id', targetOrgId);   // ← lock scope
}
```

---

### 2.4 สรุป Decision Tree

```
มี user JWT ไหม?
├── ✅ มี → ใช้ createAuthedClient(token) ก่อน
│         → ถ้าต้องการ admin สำหรับ lookup พิเศษ
│           → ต้องผ่าน requireTmcMember/requireAdmin ก่อน
│           → ยัง filter org_id ใน query เสมอ
└── ❌ ไม่มี (cron/migration/trigger)
          → ใช้ createAdminClient() ได้
          → filter org_id ใน query เสมอ
```

---

## 3. Testing Isolation

### 3.1 หลักการ: Test ต้องพิสูจน์ "ข้ามไม่ได้"

Test ที่ดีต้องตอบได้ว่า:
- User ของ Org A อ่านข้อมูล Org B ได้กี่แถว → **ต้องได้ 0 แถว**
- User ของ Org A เขียนลงตาราง Org B ได้ไหม → **ต้องได้ error หรือ 0 rows affected**

---

### 3.2 SQL-Based RLS Test (รันใน Supabase SQL Editor)

Supabase รองรับการ simulate JWT claims ผ่าน `set_config`:

```sql
-- ── Setup: สร้างข้อมูลทดสอบ ─────────────────────────────────────
-- (สมมติ org A และ org B มีอยู่แล้วใน DB)
-- org_a_id = 'aaaaaaaa-0000-0000-0000-000000000001'
-- org_b_id = 'bbbbbbbb-0000-0000-0000-000000000002'
-- user_a_id = 'user-aaaa-0000-0000-0000-000000000001' (สมาชิก org A เท่านั้น)

INSERT INTO tmc_finance_entries (org_id, account_id, entry_date, description, category, income)
VALUES
  ('aaaaaaaa-0000-0000-0000-000000000001', ..., 'ยอดเงินบริษัท A'),
  ('bbbbbbbb-0000-0000-0000-000000000002', ..., 'ยอดเงินบริษัท B');

-- ── Test 1: User A อ่านข้อมูล — ต้องเห็นเฉพาะ Org A ──────────────
BEGIN;
  -- Simulate JWT ของ user_a
  SELECT set_config(
    'request.jwt.claims',
    json_build_object('sub', 'user-aaaa-0000-0000-0000-000000000001')::text,
    true
  );
  SET LOCAL role TO authenticated;

  -- Query: ต้องได้ผลลัพธ์เฉพาะ Org A (0 แถวของ Org B)
  SELECT org_id, description FROM tmc_finance_entries;
  -- Expected: ได้เฉพาะ row ที่ org_id = org_a_id

ROLLBACK;

-- ── Test 2: User A พยายาม INSERT ลง Org B — ต้องถูกบล็อก ──────────
BEGIN;
  SELECT set_config(
    'request.jwt.claims',
    json_build_object('sub', 'user-aaaa-0000-0000-0000-000000000001')::text,
    true
  );
  SET LOCAL role TO authenticated;

  INSERT INTO tmc_finance_entries (org_id, description, ...)
  VALUES ('bbbbbbbb-0000-0000-0000-000000000002', 'malicious insert', ...);
  -- Expected: ERROR: new row violates row-level security policy
  --           หรือ 0 rows inserted

ROLLBACK;

-- ── Test 3: User A พยายาม UPDATE record ของ Org B — ต้องถูกบล็อก ─
BEGIN;
  SELECT set_config(
    'request.jwt.claims',
    json_build_object('sub', 'user-aaaa-0000-0000-0000-000000000001')::text,
    true
  );
  SET LOCAL role TO authenticated;

  UPDATE tmc_finance_entries
  SET description = 'tampered'
  WHERE org_id = 'bbbbbbbb-0000-0000-0000-000000000002';
  -- Expected: UPDATE 0 (ไม่มี rows affected)

ROLLBACK;
```

---

### 3.3 API-Level Integration Test Pattern (TypeScript)

ใช้ Jest + Supabase test client:

```typescript
// tests/tenant-isolation.test.ts

describe('Tenant Isolation', () => {
  let tokenA: string; // JWT ของ user ที่อยู่ใน Org A
  let tokenB: string; // JWT ของ user ที่อยู่ใน Org B
  const orgAId = process.env.TEST_ORG_A_ID!;
  const orgBId = process.env.TEST_ORG_B_ID!;

  beforeAll(async () => {
    // Sign in test users (ใช้ Supabase test accounts)
    const resA = await supabase.auth.signInWithPassword({ email: 'test-a@perpos.ai', password: '...' });
    const resB = await supabase.auth.signInWithPassword({ email: 'test-b@perpos.ai', password: '...' });
    tokenA = resA.data.session!.access_token;
    tokenB = resB.data.session!.access_token;
  });

  // ── Test 1: Cross-org read blocked ────────────────────────────────
  it('User A cannot read Org B finance entries via API', async () => {
    const res = await fetch(`/api/tmc/finance?orgId=${orgBId}`, {
      headers: { Authorization: `Bearer ${tokenA}` },
    });
    // ต้องได้ 403 Forbidden (membership check ใน requireTmcMember)
    expect(res.status).toBe(403);
  });

  // ── Test 2: Correct org returns data ──────────────────────────────
  it('User A can read Org A finance entries', async () => {
    const res = await fetch(`/api/tmc/finance?orgId=${orgAId}`, {
      headers: { Authorization: `Bearer ${tokenA}` },
    });
    expect(res.status).toBe(200);
    const json = await res.json();
    // ทุก entry ต้องเป็น org A
    expect(json.entries.every((e: { org_id: string }) => e.org_id === orgAId)).toBe(true);
  });

  // ── Test 3: Cross-org write blocked ───────────────────────────────
  it('User A cannot create entry in Org B', async () => {
    const res = await fetch('/api/tmc/finance', {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokenA}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        orgId:       orgBId,     // ← พยายามเขียนลง Org B
        accountId:   '...',
        entryDate:   '2026-01-01',
        description: 'cross-tenant attack',
        category:    'test',
        income:      9999999,
      }),
    });
    expect(res.status).toBe(403);
  });

  // ── Test 4: org_id in response never leaks other orgs ─────────────
  it('Response entries only contain requesting org_id', async () => {
    const res = await fetch(`/api/tmc/finance?orgId=${orgAId}`, {
      headers: { Authorization: `Bearer ${tokenA}` },
    });
    const json = await res.json();
    const leaked = json.entries.filter((e: { org_id: string }) => e.org_id !== orgAId);
    expect(leaked).toHaveLength(0); // zero tolerance
  });

  // ── Test 5: Admin endpoint requires super_admin role ──────────────
  it('Org member cannot access super admin audit endpoint', async () => {
    const res = await fetch('/api/admin/audit-logs', {
      headers: { Authorization: `Bearer ${tokenA}` },
    });
    expect(res.status).toBe(403);
  });
});
```

---

### 3.4 Checklist ก่อน PR — Tenant Isolation Review

```
Security Review Checklist (ทำทุกครั้งที่สร้าง feature ใหม่):

□ ตาราง DB ใหม่มี org_id + RLS policy ครบ 4 operations
□ ไม่มี policy USING (true) ในตาราง tenant data
□ API route ใช้ requireTmcMember() หรือ requireAdmin() ก่อน access ข้อมูลเสมอ
□ ทุก query ที่ใช้ admin client มี .eq('org_id', ...) หรือ .eq('organization_id', ...)
□ org_id ใน request body/params ถูก verify ผ่าน membership check แล้ว ไม่ใช้ตรงๆ
□ ไม่มี SUPABASE_SERVICE_ROLE_KEY ใน client-side code หรือ env ที่ prefix NEXT_PUBLIC_
□ Test isolation ผ่านทั้ง 5 cases ข้างต้น
□ ถ้า feature มี bulk operation → มี org_id scope ใน WHERE ทุก statement
```

---

## 4. Known Inconsistencies & Mitigation

| ปัญหา | ผลกระทบ | Mitigation |
|-------|---------|-----------|
| Core modules ใช้ `organization_id`, TMC ใช้ `org_id` | สับสน join ข้าม module | กำหนดให้ตารางใหม่ทุกตัวใช้ `org_id` — เอกสาร section 1.1 |
| `tmc_audit_logs` มี policy `USING (true)` | ข้ามองค์กรอ่านได้ถ้า direct query | ตาราง TMC audit log เป็น internal-only, API ต้องตรวจ orgId ก่อน |
| `audit_logs` ใช้ `FORCE RLS` แต่ service_role มี BYPASSRLS | Service role อ่าน log ข้าม org ได้ | API `/api/admin/audit-logs` ต้องผ่าน `requireAdmin` เสมอ |
| Admin client ใน route ที่ loop หลาย org | อาจ return ข้ามถ้า filter ขาด | Code review บังคับ: ทุก admin query ต้องมี org scope |

---

## Quick Reference

| ต้องการ | ใช้ |
|---------|-----|
| ตรวจ user เป็นสมาชิก org | `requireTmcMember(req, orgId)` |
| ตรวจ user เป็น super_admin | `requireAdmin(req)` |
| Query ที่ user มี JWT | `createAuthedClient(token)` — RLS บังคับอัตโนมัติ |
| Query ที่ไม่มี JWT (cron/migration) | `createAdminClient()` + filter org_id ทุกครั้ง |
| RLS policy สำหรับ "สมาชิกอ่าน" | `is_org_member(table.org_id, auth.uid())` |
| RLS policy สำหรับ "admin เขียน" | `is_org_admin(table.org_id, auth.uid())` |
| Test isolation แบบ SQL | section 3.2 |
| Test isolation แบบ API | section 3.3 |
