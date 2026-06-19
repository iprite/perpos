# PERPOS Audit Log — คัมภีร์ระบบ

> **ผู้อ่านเป้าหมาย**: Developer ที่ต้องการผูก trigger กับตารางใหม่ / Auditor ที่ต้องตรวจสอบย้อนหลัง  
> **อัพเดทล่าสุด**: 2026-05-23  
> **Migration files**: `supabase/migrations/20260523000003–000007_audit_logs_v2_*.sql`

---

## 1. Architecture Overview

ระบบ audit ใช้ **Hybrid 3-Layer** — แต่ละชั้นเสริมกัน ไม่พึ่งชั้นเดียว:

```
┌─────────────────────────────────────────────────────────────────────┐
│                          USER / API REQUEST                          │
│  Next.js Route Handler                                               │
│  ① setAuditContext(req, userId, orgId)  ← best-effort GUC           │
│     └─ sets audit.actor_id / ip / ua / request_id (session-level)   │
└────────────────────────────┬────────────────────────────────────────┘
                             │  INSERT / UPDATE / DELETE
                             ▼
┌─────────────────────────────────────────────────────────────────────┐
│                        PostgreSQL Trigger                            │
│  AFTER INSERT OR UPDATE OR DELETE ON <table>                         │
│  fn_audit_log_changes()  — SECURITY DEFINER (owned by postgres)      │
│                                                                      │
│  ② Tier-1 GUC read    → actor_id, org_id, ip, ua, request_id        │
│  ③ Tier-2 row fallback → created_by / user_id, org_id (จาก row)     │
│  ④ payload_hash  = SHA-256(canonical JSON)                           │
│  ⑤ chain_hash    = SHA-256(prev_chain_hash ∥ payload_hash)          │
│  ⑥ INSERT INTO audit_logs (immutable, FORCE RLS, REVOKE write)       │
│  ⑦ Clear GUC session vars (ป้องกัน leakage)                         │
└────────────────────────────┬────────────────────────────────────────┘
                             │  async (cron every 5 min)
                             ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    External Log Shipping (P3)                        │
│  POST /api/internal/audit-ship  (protected by CRON_SECRET)           │
│  └─ reads audit_logs WHERE sequence_no > last_seq                    │
│  └─ ships batch → Axiom (queryable) / S3 Object Lock (WORM)         │
│  └─ updates audit_ship_cursors.last_seq                             │
│                                                                      │
│  ⚠ Optional: ถ้าไม่ config AXIOM_API_TOKEN → skip gracefully        │
└─────────────────────────────────────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    Super Admin UI  /admin/audit                      │
│  Filter · Timeline · Detail (old/new JSON) · Integrity Check · CSV  │
└─────────────────────────────────────────────────────────────────────┘
```

### เหตุใดต้อง 3 ชั้น?

| ชั้น | ป้องกันอะไร | ข้อจำกัด |
|------|-------------|----------|
| DB Trigger | App crash, bypass API | ถูก DROP ได้ถ้า DB ถูกเจาะ |
| FORCE RLS + REVOKE | App/service_role แก้ log ตรง | Superuser ยังเข้าได้ |
| External Shipping | DB ถูกลบทั้งหมด | ต้อง config เอง (optional) |

---

## 2. The 5 Ws Schema

```sql
TABLE audit_logs
```

### Who — ใคร?
| Column | Type | คำอธิบาย |
|--------|------|----------|
| `actor_id` | uuid | FK → `profiles.id` — ผู้ที่ทำการเปลี่ยนแปลง (Tier-1: GUC, Tier-2: row fallback) |
| `org_id` | uuid | FK → `organizations.id` — องค์กรที่เป็นเจ้าของข้อมูล |
| `ip_address` | text | IP ของ client (จาก `x-forwarded-for`, best-effort) |
| `user_agent` | text | Browser/client string (best-effort) |

### What — อะไร?
| Column | Type | คำอธิบาย |
|--------|------|----------|
| `action` | text | `INSERT` / `UPDATE` / `DELETE` |
| `table_name` | text | ชื่อตารางที่ถูกแก้ไข |
| `record_id` | uuid | PK ของ record ที่ถูกแก้ไข (อ่านจาก `NEW.id` หรือ `OLD.id`) |
| `diff_keys` | text[] | ชื่อฟิลด์ที่มีค่าเปลี่ยน (เฉพาะ UPDATE) |
| `old_data` | jsonb | Snapshot ของ row **ก่อน** แก้ไข (null สำหรับ INSERT) |
| `new_data` | jsonb | Snapshot ของ row **หลัง** แก้ไข (null สำหรับ DELETE) |

### When — เมื่อไหร่?
| Column | Type | คำอธิบาย |
|--------|------|----------|
| `logged_at` | timestamptz | เวลา DB บันทึก (`now()` ภายใน trigger) |
| `sequence_no` | bigint IDENTITY | เลขลำดับ monotonically increasing — ถ้า gap = มีการลบ log |

### Where — ที่ไหน (request context)?
| Column | Type | คำอธิบาย |
|--------|------|----------|
| `request_id` | text | UUID ของ HTTP request (correlation ID) |

### How — ตรวจสอบความสมบูรณ์ได้ยังไง?
| Column | Type | คำอธิบาย |
|--------|------|----------|
| `payload_hash` | text | `SHA-256(canonical_json)` ของ payload ทั้งหมด |
| `chain_hash` | text | `SHA-256(prev_chain_hash ∥ payload_hash)` — blockchain-style linking |

---

## 3. Developer Guidelines

### 3.1 เพิ่ม Trigger ให้กับตารางใหม่

ทุกครั้งที่สร้างตารางใหม่ที่ต้องการ audit ให้เพิ่ม trigger ใน migration file:

```sql
-- ใน supabase/migrations/YYYYMMDDHHMMSS_<feature>.sql

-- เพิ่มบรรทัดนี้หลัง CREATE TABLE <new_table> (...)
CREATE TRIGGER trg_audit_<new_table>
  AFTER INSERT OR UPDATE OR DELETE ON <new_table>
  FOR EACH ROW EXECUTE FUNCTION fn_audit_log_changes();
```

**ตัวอย่าง** — ตาราง `tmc_payments`:
```sql
CREATE TRIGGER trg_audit_tmc_payments
  AFTER INSERT OR UPDATE OR DELETE ON tmc_payments
  FOR EACH ROW EXECUTE FUNCTION fn_audit_log_changes();
```

ตารางนั้นจะถูก audit ทันที — ไม่ต้องแก้ไขโค้ดที่อื่น

> **หมายเหตุ**: ถ้าต้องการ audit เฉพาะ UPDATE/DELETE (ไม่ต้องการ log INSERT):
> ```sql
> AFTER UPDATE OR DELETE ON <new_table>
> ```

---

### 3.2 การเรียก `setAuditContext()` จาก API Route

เรียกก่อน mutation ทุกครั้ง เพื่อให้ log ได้รับ IP / UA / request_id:

```typescript
// apps/perpos/src/app/api/tmc/your-feature/route.ts
import { setAuditContext } from '../../_lib/audit';

export async function POST(req: NextRequest) {
  const auth = await requireTmcMember(req, orgId);
  if (!auth.ok) return auth.res;

  // เรียกก่อน mutation เสมอ
  await setAuditContext(req, auth.userId, orgId);

  // ... mutation code ...
}
```

> **ข้อสังเกต**: `setAuditContext()` เป็น best-effort (non-fatal)  
> ถึงจะ fail → trigger ยังทำงาน และดึง actor/org จาก row data ได้

---

### 3.3 ⛔ ฟิลด์ที่ต้อง Mask/Sanitize — ห้ามหลุดเข้า Log เด็ดขาด

Trigger บันทึก **ทุกฟิลด์** ใน row ผ่าน `row_to_json()` โดยอัตโนมัติ  
ฟิลด์ต่อไปนี้**ต้องไม่มีอยู่ใน table ที่ attach trigger** หรือต้อง mask ก่อน:

| ประเภทข้อมูล | ตัวอย่างชื่อฟิลด์ | วิธีรับมือ |
|-------------|-----------------|-----------|
| Password / Hash | `password_hash`, `hashed_password` | อย่า store ใน table นั้น — ใช้ Supabase Auth แทน |
| API Token / Secret | `api_key`, `access_token`, `refresh_token` | เก็บใน `supabase_vault.secrets` แทน |
| OTP / PIN | `otp_code`, `pin_hash` | ลบทิ้งทันทีหลังใช้ หรือใช้ expires TTL |
| PII ที่ sensitive | `id_card_number`, `passport_no` | ใช้ field-level encryption ก่อน store |
| Session Token | `session_token`, `csrf_token` | อย่า persist ใน DB |

**ถ้าจำเป็นต้องเก็บ sensitive field ในตารางที่ติด trigger**  
ให้สร้าง sanitize function wrapper:

```sql
-- ตัวอย่าง: mask sensitive fields ใน trigger
CREATE OR REPLACE FUNCTION fn_audit_log_changes()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_new jsonb;
  v_old jsonb;
BEGIN
  v_new := row_to_json(NEW)::jsonb;
  v_old := row_to_json(OLD)::jsonb;

  -- Mask sensitive fields ก่อน log
  v_new := v_new - 'password_hash' - 'api_token' - 'otp_code';
  v_old := v_old - 'password_hash' - 'api_token' - 'otp_code';

  -- ... rest of trigger ...
END;
$$;
```

> ⚠ **ปัจจุบัน** `fn_audit_log_changes()` ไม่ได้ mask ฟิลด์ใดๆ  
> ตารางที่ attach trigger ทั้งหมดต้องไม่มี sensitive fields ในระดับ column

---

### 3.4 ตรวจสอบ sequence gap (การลบ log)

```sql
-- ตรวจหา gap ใน sequence_no (ถ้ามี = มีการ DELETE row ออกไป)
SELECT
  a.sequence_no + 1 AS missing_from,
  b.sequence_no - 1 AS missing_to
FROM audit_logs a
JOIN audit_logs b ON b.sequence_no = (
  SELECT MIN(sequence_no) FROM audit_logs
  WHERE sequence_no > a.sequence_no
)
WHERE b.sequence_no <> a.sequence_no + 1
ORDER BY a.sequence_no;
```

ถ้า query คืน rows → มีการลบ audit log ออกไป (tamper evidence)

---

## 4. Integrity & Verification

### 4.1 วิธีรัน `verify_audit_chain()`

ฟังก์ชันนี้ตรวจว่า hash chain ยังต่อกันสมบูรณ์ — ถ้า `ok = false` ที่ row ใดแสดงว่า row นั้น (หรือก่อนหน้า) ถูกแก้ไข

**ผ่าน Supabase Dashboard (SQL Editor)**:
```sql
SELECT * FROM verify_audit_chain('tmc_finance_entries')
ORDER BY seq_no;
```

**ผ่าน Admin UI**:
1. เปิด `/admin/audit`
2. เลื่อนลงส่วน **"ตรวจสอบความสมบูรณ์ของ Hash Chain"**
3. เลือกชื่อตาราง → กด **"ตรวจสอบ"**

**ผลลัพธ์ที่คาดหวัง (ปกติ)**:
```
 seq_no │ chain_hash       │ expected         │ ok
────────┼──────────────────┼──────────────────┼──────
      1 │ 5924437a897e…    │ 5924437a897e…    │ true
      2 │ a3f1c2d4e5b6…    │ a3f1c2d4e5b6…    │ true
```

**ผลลัพธ์เมื่อพบปัญหา**:
```
 seq_no │ chain_hash       │ expected         │ ok
────────┼──────────────────┼──────────────────┼──────
     42 │ 9f2a1b3c4d5e…    │ 7c8d9e0f1a2b…    │ FALSE  ← ถูกแก้ไข
     43 │ 1a2b3c4d5e6f…    │ 4d5e6f7a8b9c…    │ FALSE  ← downstream effect
```

> chain_hash ที่ผิดแพร่ลงมาถึง row ถัดๆ ไปด้วย (domino effect)  
> **row แรกที่ `ok = false`** คือจุดที่ถูกแก้ไข

---

### 4.2 รัน Integrity Check อัตโนมัติ (scheduled)

สำหรับทีมที่ต้องการตรวจทุกสัปดาห์ เพิ่ม cron ใน Google Cloud Scheduler:

```bash
# ตรวจทุกตารางสำคัญทุกวันอาทิตย์ 02:00 BKK
curl -X POST https://perpos.ai/api/internal/audit-verify \
  -H "Authorization: Bearer $CRON_SECRET"
```

*(endpoint นี้ยังไม่ได้สร้าง — implement ตาม pattern ของ `/api/internal/audit-ship`)*

---

## 5. Disaster Recovery

### 5.1 กรณี: `verify_audit_chain()` คืน `ok = false`

```
ขั้นตอน:
1. บันทึก seq_no แรกที่ ok = false
2. ดึง record นั้นจาก audit_logs พร้อม old/new data
3. เทียบกับ external copy (Axiom / S3) ถ้า config ไว้
4. หาว่าใครมี DB access ช่วงเวลา logged_at ของ row นั้น
5. รายงาน incident และเก็บ snapshot ของ audit_logs ทั้งหมดทันที

⚠ ห้ามแก้ไข audit_logs เพื่อ "ซ่อม" chain — จะทำให้สืบสวนยากขึ้น
```

**Query สำหรับ incident response**:
```sql
-- ดู audit log ของ row ที่ถูก flag
SELECT * FROM audit_logs
WHERE sequence_no BETWEEN <broken_seq - 5> AND <broken_seq + 5>
ORDER BY sequence_no;

-- ดูว่าใคร login เข้า Supabase ช่วงนั้น (ถ้ามี access log)
SELECT * FROM auth.audit_log_entries
WHERE created_at BETWEEN '<timestamp - 1h>' AND '<timestamp + 1h>';
```

---

### 5.2 กรณี: External Shipping ล้มเหลว (Axiom down / ผิด token)

```
audit_ship_cursors.error_count จะเพิ่มขึ้น
audit_ship_cursors.last_error จะบอกสาเหตุ
```

**ตรวจสอบ**:
```sql
SELECT destination, error_count, last_error, last_shipped_at, unshipped
FROM audit_ship_cursors;
```

**วิธีรับมือ**:
```
1. แก้ไข env var (AXIOM_API_TOKEN / AXIOM_DATASET) ใน Vercel
2. Redeploy หรือรอ Cloud Scheduler รัน next cycle
3. ระบบ retry อัตโนมัติ — cursor ยังอยู่ที่ last_seq เดิม → ship ต่อจากจุดนั้น
4. audit_logs ใน Supabase ยังสมบูรณ์ตลอด — ไม่มีข้อมูลหาย
```

> **สำคัญ**: External shipping เป็น P3 (optional layer)  
> ถ้า Axiom ล่ม → DB audit log ยังครบ → ไม่มี data loss

---

### 5.3 กรณี: Trigger ถูก DROP โดยไม่ตั้งใจ

```sql
-- ตรวจสอบว่า trigger ยังอยู่ครบ
SELECT trigger_name, event_object_table
FROM information_schema.triggers
WHERE trigger_schema = 'public'
  AND trigger_name LIKE 'trg_audit_%'
ORDER BY event_object_table;

-- ถ้าหายไป — re-apply migration
-- หรือรันใหม่มือ:
CREATE TRIGGER trg_audit_<table>
  AFTER INSERT OR UPDATE OR DELETE ON <table>
  FOR EACH ROW EXECUTE FUNCTION fn_audit_log_changes();
```

---

### 5.4 กรณี: sequence_no มี gap

```sql
-- ดู gap query (จาก section 3.4)
-- ถ้าพบ gap:
1. ตรวจ external copy (Axiom) ว่า seq นั้นถูก ship ไปก่อนหน้าไหม
2. ถ้ามีใน Axiom → บันทึก incident, restore ไม่ได้ (immutable) แต่มีหลักฐาน
3. ถ้าไม่มีใน Axiom → หมายความว่าลบทั้ง DB และก่อน ship → serious incident
```

---

## Quick Reference

| ต้องการ | คำสั่ง / ที่ |
|---------|------------|
| ดู audit log | `/admin/audit` |
| ตรวจ hash chain | `SELECT * FROM verify_audit_chain('<table>')` |
| ตรวจ sequence gap | Section 3.4 ด้านบน |
| ดู shipping status | `SELECT * FROM audit_ship_cursors` |
| เพิ่ม trigger ตารางใหม่ | Section 3.1 ด้านบน |
| Migration files | `supabase/migrations/20260523000003–000007` |
| API endpoint list | Section Architecture (P3) |
