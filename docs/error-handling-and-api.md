# Error Handling & API Standards — คัมภีร์

> ระบบ ERP ที่ error กลางทางแล้ว "เงียบ" คือภัยร้ายที่สุด  
> บัญชีบันทึกไปครึ่งทาง, สต๊อกหักแต่ออเดอร์ไม่สร้าง, โอนเงินซ้ำสองรอบ —  
> ทุกสถานการณ์เหล่านี้ป้องกันได้ด้วยมาตรฐานที่นิ่ง

---

## 1. Standard Response Envelope

ทุก API route ใน PERPOS **ต้องตอบกลับในรูปแบบนี้เสมอ** ไม่มีข้อยกเว้น

### 1.1 โครงสร้าง

```typescript
// ✅ สำเร็จ
{
  "ok": true,
  "data": { ... }          // object หรือ array
}

// ✅ สำเร็จ — สร้างของใหม่ (HTTP 201)
{
  "ok": true,
  "data": { "id": "uuid", ... }
}

// ❌ Error
{
  "ok": false,
  "error": {
    "code":    "ERR_INSUFFICIENT_STOCK",      // รหัสคงที่ — ดูหมวด 2
    "message": "สต๊อกไม่พอสำหรับรายการนี้",  // อ่านแล้วเข้าใจ
    "details": {                               // optional — context เพิ่มเติม
      "requested": 10,
      "available": 3,
      "item_id": "abc-123"
    }
  }
}
```

### 1.2 กฎ

| กฎ | รายละเอียด |
|----|-----------|
| ไม่มี bare `{ error: "..." }` | ต้องมี `ok` และ `error.code` เสมอ |
| ไม่ leak stack trace | `error.message` เขียนสำหรับนักพัฒนา ไม่ใช่ user — ห้ามส่ง Postgres error message ดิบๆ |
| HTTP status สื่อความหมาย | ดูตาราง 1.3 |
| Array ว่างคือ `data: []` ไม่ใช่ `null` | ไม่ต้อง null-check ฝั่ง client |

### 1.3 HTTP Status Codes

| Status | ใช้เมื่อ |
|--------|---------|
| `200 OK` | GET / PUT / DELETE สำเร็จ |
| `201 Created` | POST สร้างของใหม่สำเร็จ |
| `400 Bad Request` | ข้อมูลที่ส่งมาผิด (missing field, invalid format) |
| `401 Unauthorized` | ไม่มี token หรือ token หมดอายุ |
| `403 Forbidden` | token valid แต่ไม่มีสิทธิ์ (wrong role, wrong org) |
| `404 Not Found` | หา record ไม่เจอ |
| `409 Conflict` | duplicate entry, optimistic lock conflict |
| `422 Unprocessable` | business logic ล้มเหลว (สต๊อกไม่พอ, period ปิดแล้ว) |
| `429 Too Many Requests` | rate limit |
| `500 Internal Server Error` | DB error หรือ unexpected crash |

---

## 2. Global Error Codes

รหัส error ทั้งหมดขึ้นต้นด้วย `ERR_` และใช้ `SCREAMING_SNAKE_CASE`

### 2.1 Auth & Access

| Code | HTTP | ความหมาย |
|------|------|----------|
| `ERR_UNAUTHENTICATED` | 401 | ไม่มี token หรือ token invalid/expired |
| `ERR_UNAUTHORIZED_TENANT` | 403 | token valid แต่ user ไม่ใช่สมาชิกองค์กรนี้ |
| `ERR_MODULE_DISABLED` | 403 | module ยังไม่เปิดใช้งานสำหรับองค์กรนี้ |
| `ERR_INSUFFICIENT_ROLE` | 403 | role ไม่พอ (เช่น team_member พยายาม write) |
| `ERR_USER_INACTIVE` | 403 | account ถูก deactivate |

### 2.2 Validation

| Code | HTTP | ความหมาย |
|------|------|----------|
| `ERR_MISSING_FIELD` | 400 | field บังคับขาดหายไป |
| `ERR_INVALID_FORMAT` | 400 | รูปแบบข้อมูลผิด (เช่น วันที่ไม่ใช่ ISO 8601) |
| `ERR_INVALID_DATE_RANGE` | 400 | from > to หรือวันที่อยู่นอก range ที่อนุญาต |
| `ERR_VALUE_OUT_OF_RANGE` | 400 | ตัวเลขติดลบหรือเกิน limit |

### 2.3 Business Logic — Accounting & Finance

| Code | HTTP | ความหมาย |
|------|------|----------|
| `ERR_JOURNAL_IMBALANCED` | 422 | เดบิต ≠ เครดิต ในรายการบัญชี |
| `ERR_PERIOD_CLOSED` | 422 | งวดบัญชีปิดแล้ว ไม่อนุญาตให้แก้ไข |
| `ERR_ENTRY_LOCKED` | 422 | รายการถูก lock หลังผ่านการอนุมัติแล้ว |
| `ERR_DUPLICATE_ENTRY` | 409 | รายการซ้ำ (ตรวจจากเลขเอกสาร + วันที่) |
| `ERR_INSUFFICIENT_BALANCE` | 422 | ยอดเงินในบัญชีไม่พอ |
| `ERR_ACCOUNT_NOT_FOUND` | 404 | ไม่มีบัญชีรหัสนี้ในผังบัญชี |
| `ERR_ACCOUNT_INACTIVE` | 422 | บัญชีถูก deactivate แล้ว |

### 2.4 Business Logic — Inventory

| Code | HTTP | ความหมาย |
|------|------|----------|
| `ERR_INSUFFICIENT_STOCK` | 422 | สต๊อกไม่พอตามที่ขอ |
| `ERR_ITEM_DISCONTINUED` | 422 | สินค้าหยุดผลิต/จำหน่ายแล้ว |
| `ERR_NEGATIVE_STOCK` | 422 | การตัดสต๊อกจะทำให้ติดลบ และ policy ไม่อนุญาต |

### 2.5 Business Logic — Documents (ใบเสนอราคา, ใบแจ้งหนี้)

| Code | HTTP | ความหมาย |
|------|------|----------|
| `ERR_DOCUMENT_ALREADY_APPROVED` | 409 | เอกสาร approve แล้ว ไม่สามารถแก้ไขได้ |
| `ERR_DOCUMENT_CANCELLED` | 422 | เอกสารถูกยกเลิกแล้ว |
| `ERR_INVALID_STATUS_TRANSITION` | 422 | เปลี่ยน status ไม่ได้ (เช่น draft → paid โดยข้าม approved) |

### 2.6 System

| Code | HTTP | ความหมาย |
|------|------|----------|
| `ERR_DB_CONSTRAINT` | 409 | Postgres constraint violation (foreign key, unique) |
| `ERR_DB_TIMEOUT` | 500 | Query ใช้เวลาเกิน timeout |
| `ERR_EXTERNAL_SERVICE` | 502 | เรียก service ภายนอกล้มเหลว (LINE API, Axiom, etc.) |
| `ERR_IDEMPOTENCY_MISMATCH` | 409 | Idempotency key ซ้ำแต่ request body ต่างกัน |

---

## 3. TypeScript Helpers

ใช้แทนการเขียน `NextResponse.json({ error: ... })` ตรงๆ ทุกที่

### 3.1 `src/app/api/_lib/response.ts`

```typescript
import { NextResponse } from 'next/server';

// ─── Types ─────────────────────────────────────────────────────────

export type AppErrorCode =
  // Auth
  | 'ERR_UNAUTHENTICATED'
  | 'ERR_UNAUTHORIZED_TENANT'
  | 'ERR_MODULE_DISABLED'
  | 'ERR_INSUFFICIENT_ROLE'
  | 'ERR_USER_INACTIVE'
  // Validation
  | 'ERR_MISSING_FIELD'
  | 'ERR_INVALID_FORMAT'
  | 'ERR_INVALID_DATE_RANGE'
  | 'ERR_VALUE_OUT_OF_RANGE'
  // Accounting
  | 'ERR_JOURNAL_IMBALANCED'
  | 'ERR_PERIOD_CLOSED'
  | 'ERR_ENTRY_LOCKED'
  | 'ERR_DUPLICATE_ENTRY'
  | 'ERR_INSUFFICIENT_BALANCE'
  | 'ERR_ACCOUNT_NOT_FOUND'
  | 'ERR_ACCOUNT_INACTIVE'
  // Inventory
  | 'ERR_INSUFFICIENT_STOCK'
  | 'ERR_ITEM_DISCONTINUED'
  | 'ERR_NEGATIVE_STOCK'
  // Documents
  | 'ERR_DOCUMENT_ALREADY_APPROVED'
  | 'ERR_DOCUMENT_CANCELLED'
  | 'ERR_INVALID_STATUS_TRANSITION'
  // System
  | 'ERR_DB_CONSTRAINT'
  | 'ERR_DB_TIMEOUT'
  | 'ERR_EXTERNAL_SERVICE'
  | 'ERR_IDEMPOTENCY_MISMATCH';

export type ApiSuccess<T> = { ok: true;  data: T };
export type ApiError      = { ok: false; error: { code: AppErrorCode; message: string; details?: unknown } };
export type ApiResponse<T> = ApiSuccess<T> | ApiError;

// ─── Factories ─────────────────────────────────────────────────────

export function ok<T>(data: T, status = 200): NextResponse<ApiSuccess<T>> {
  return NextResponse.json({ ok: true, data }, { status });
}

export function created<T>(data: T): NextResponse<ApiSuccess<T>> {
  return ok(data, 201);
}

export function err(
  code: AppErrorCode,
  message: string,
  status: number,
  details?: unknown,
): NextResponse<ApiError> {
  return NextResponse.json(
    { ok: false, error: { code, message, ...(details !== undefined ? { details } : {}) } },
    { status },
  );
}

// ─── Shortcuts ─────────────────────────────────────────────────────

export const Err = {
  missingField:   (field: string) =>
    err('ERR_MISSING_FIELD', `ต้องระบุ field: ${field}`, 400, { field }),

  invalidFormat:  (field: string, hint?: string) =>
    err('ERR_INVALID_FORMAT', `${field} มีรูปแบบไม่ถูกต้อง${hint ? ` — ${hint}` : ''}`, 400, { field }),

  unauthorized:   () =>
    err('ERR_UNAUTHENTICATED', 'ต้องเข้าสู่ระบบก่อน', 401),

  forbidden:      (reason?: string) =>
    err('ERR_INSUFFICIENT_ROLE', reason ?? 'ไม่มีสิทธิ์ดำเนินการนี้', 403),

  wrongTenant:    () =>
    err('ERR_UNAUTHORIZED_TENANT', 'ไม่มีสิทธิ์เข้าถึงองค์กรนี้', 403),

  notFound:       (resource: string) =>
    err('ERR_ACCOUNT_NOT_FOUND', `ไม่พบ ${resource}`, 404),

  insufficientStock: (requested: number, available: number, itemId?: string) =>
    err('ERR_INSUFFICIENT_STOCK', 'สต๊อกไม่เพียงพอ', 422, { requested, available, item_id: itemId }),

  periodClosed:   (period: string) =>
    err('ERR_PERIOD_CLOSED', `งวดบัญชี ${period} ปิดแล้ว`, 422, { period }),

  dbError:        (e: unknown) =>
    err('ERR_DB_CONSTRAINT', 'เกิดข้อผิดพลาดในฐานข้อมูล กรุณาลองใหม่', 500,
      process.env.NODE_ENV === 'development' ? { raw: String(e) } : undefined),
};
```

### 3.2 วิธีใช้ใน Route Handler

```typescript
// ก่อน — ไม่มีมาตรฐาน
return NextResponse.json({ error: error.message }, { status: 500 });
return NextResponse.json({ ok: true });

// หลัง — standard
import { ok, created, Err } from '../../_lib/response';

export async function POST(req: NextRequest) {
  const auth = await requireTmcMember(req, ORG_ID);
  if (!auth.ok) return auth.res;

  if (!canWriteFinance(auth.role)) return Err.forbidden('ต้องการสิทธิ์ team_lead ขึ้นไป');

  const body = await req.json().catch(() => null);
  if (!body?.amount)   return Err.missingField('amount');
  if (!body?.category) return Err.missingField('category');

  const { data, error } = await admin.from('tmc_finance_entries').insert({...}).select().single();
  if (error) return Err.dbError(error);

  return created(data);  // HTTP 201, { ok: true, data: {...} }
}
```

---

## 4. Idempotency Key

### 4.1 ปัญหาที่แก้

```
ผู้ใช้กด "บันทึกการโอน" → ระบบช้า → กดซ้ำอีกรอบ
→ บัญชีถูกตัดสองครั้ง แต่เงินโอนครั้งเดียว
```

**Idempotency Key** ทำให้ request เดิม (key เดิม) ที่ส่งซ้ำ  
ได้รับ response เดิมกลับไป — โดยไม่ execute อีกรอบ

### 4.2 โครงสร้าง DB

```sql
-- Migration: YYYYMMDDHHMMSS_idempotency_keys.sql
CREATE TABLE idempotency_keys (
  key         text        NOT NULL,
  user_id     uuid        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  request_path text       NOT NULL,
  request_hash text       NOT NULL,           -- SHA-256 ของ request body
  status_code  int        NOT NULL,
  response     jsonb      NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  expires_at   timestamptz NOT NULL DEFAULT now() + interval '24 hours',

  CONSTRAINT idempotency_keys_pk PRIMARY KEY (key, user_id)
);

-- Auto-cleanup expired keys
CREATE INDEX idempotency_keys_expires_idx ON idempotency_keys (expires_at);
```

### 4.3 Helper: `src/app/api/_lib/idempotency.ts`

```typescript
import { createAdminClient } from './supabase';
import { NextRequest, NextResponse } from 'next/server';
import { createHash } from 'crypto';

export type IdempotencyResult =
  | { hit: true;  response: NextResponse }   // cache hit — return immediately
  | { hit: false; save: (res: NextResponse, body: unknown) => Promise<void> };

/**
 * checkIdempotency — call at the START of any mutating handler
 *
 * Client must send header: `Idempotency-Key: <uuid-v4>`
 *
 * @example
 * const idem = await checkIdempotency(req, userId);
 * if (idem.hit) return idem.response;          // replay cached result
 *
 * // ... do work ...
 * const response = ok(newRecord);
 * await idem.save(response, newRecord);         // persist for 24h
 * return response;
 */
export async function checkIdempotency(
  req: NextRequest,
  userId: string,
): Promise<IdempotencyResult> {
  const key = req.headers.get('idempotency-key');
  if (!key) return { hit: false, save: async () => {} };  // header absent → skip

  const admin = createAdminClient();
  const path  = req.nextUrl.pathname;

  // Read raw body once for hashing (must clone — body stream is one-time)
  const rawBody   = await req.clone().text();
  const bodyHash  = createHash('sha256').update(rawBody).digest('hex');

  // Check cache
  const { data: existing } = await admin
    .from('idempotency_keys')
    .select('request_hash, status_code, response')
    .eq('key', key)
    .eq('user_id', userId)
    .gt('expires_at', new Date().toISOString())
    .maybeSingle();

  if (existing) {
    const row = existing as { request_hash: string; status_code: number; response: unknown };

    // Same key, DIFFERENT body → 409 conflict
    if (row.request_hash !== bodyHash) {
      return {
        hit: true,
        response: NextResponse.json(
          {
            ok: false,
            error: {
              code: 'ERR_IDEMPOTENCY_MISMATCH',
              message: 'Idempotency key ซ้ำแต่ request body ต่างกัน',
            },
          },
          { status: 409 },
        ),
      };
    }

    // Cache hit — replay original response
    return {
      hit: true,
      response: NextResponse.json(row.response, {
        status: row.status_code,
        headers: { 'X-Idempotent-Replayed': 'true' },
      }),
    };
  }

  // Cache miss — provide save function
  const save = async (res: NextResponse, body: unknown) => {
    await admin.from('idempotency_keys').insert({
      key,
      user_id:      userId,
      request_path: path,
      request_hash: bodyHash,
      status_code:  res.status,
      response:     body,
    });
  };

  return { hit: false, save };
}
```

### 4.4 วิธีใช้ใน Route Handler

```typescript
import { checkIdempotency } from '../../_lib/idempotency';
import { ok, Err } from '../../_lib/response';

export async function POST(req: NextRequest) {
  const auth = await requireTmcMember(req, ORG_ID);
  if (!auth.ok) return auth.res;

  // ── Step 1: ตรวจ idempotency ──────────────────────────────────────
  const idem = await checkIdempotency(req, auth.userId);
  if (idem.hit) return idem.response;   // replay หรือ 409 mismatch

  // ── Step 2: ทำงานจริง ─────────────────────────────────────────────
  const body = await req.json();
  const { data, error } = await admin
    .from('tmc_finance_entries')
    .insert({ org_id: auth.orgId, ...body })
    .select()
    .single();

  if (error) return Err.dbError(error);

  // ── Step 3: persist ก่อน return ───────────────────────────────────
  const response = ok(data, 201);     // ไม่ใช้ created() เพื่อให้ get response body ก่อน
  await idem.save(response, { ok: true, data });
  return response;
}
```

### 4.5 Client-side (Frontend)

```typescript
// สร้าง key ครั้งเดียวต่อ form submission
// เก็บไว้ใน state — ถ้า retry ใช้ key เดิม
const [idempotencyKey] = useState(() => crypto.randomUUID());

const handleSubmit = async () => {
  const res = await fetch('/api/tmc/finance', {
    method: 'POST',
    headers: {
      'Authorization':   `Bearer ${token}`,
      'Content-Type':    'application/json',
      'Idempotency-Key': idempotencyKey,    // ← แนบทุกครั้ง
    },
    body: JSON.stringify(form),
  });
  // ...
};
```

### 4.6 เมื่อไหรที่ควรใช้ Idempotency Key

| ควรใช้ ✅ | ไม่จำเป็น ❌ |
|-----------|------------|
| POST โอนเงิน / บันทึกบัญชี | GET ทุก endpoint |
| POST สร้างใบแจ้งหนี้ | PUT ที่ทำได้หลายรอบอยู่แล้ว |
| POST ตัดสต๊อก | DELETE (มักตรวจสอบ 404 ได้) |
| POST ส่ง LINE notification | POST ที่ idempotent อยู่แล้ว (เช่น upsert) |

---

## 5. Error Logging

### 5.1 Server-side Logging Pattern

```typescript
// ใน route handler — ก่อน return error
import { err, Err } from '../../_lib/response';

// ❌ ห้าม — กลืน error เงียบๆ
const { data, error } = await admin.from(...).insert(...);
if (error) return NextResponse.json({ error: 'failed' }, { status: 500 });

// ✅ ถูก — log แล้วค่อย return
if (error) {
  console.error('[tmc/finance POST]', {
    code:    error.code,
    message: error.message,
    userId:  auth.userId,
    orgId:   auth.orgId,
  });
  return Err.dbError(error);
}
```

### 5.2 Log Structure (ส่งไป Axiom พร้อมกับ audit logs)

```json
{
  "level":      "error",
  "route":      "POST /api/tmc/finance",
  "error_code": "ERR_DB_CONSTRAINT",
  "pg_code":    "23505",
  "user_id":    "uuid",
  "org_id":     "uuid",
  "request_id": "uuid",
  "ts":         "2026-05-23T10:30:00Z"
}
```

### 5.3 Error ที่ต้อง log vs ไม่ต้อง

| log ❌ | log ✅ |
|--------|--------|
| ERR_MISSING_FIELD (user mistake) | ERR_DB_CONSTRAINT |
| ERR_INSUFFICIENT_ROLE | ERR_DB_TIMEOUT |
| ERR_PERIOD_CLOSED | ERR_EXTERNAL_SERVICE |
| 400/401/403 ทั่วไป | 500 ทุกตัว |

---

## 6. Frontend Error Handling Pattern

### 6.1 Generic API Caller

```typescript
// src/lib/api.ts

export class ApiError extends Error {
  constructor(
    public code: string,
    message: string,
    public details?: unknown,
    public status?: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export async function apiFetch<T>(
  url: string,
  options: RequestInit & { token: string },
): Promise<T> {
  const { token, ...init } = options;

  const res = await fetch(url, {
    ...init,
    headers: {
      'Content-Type':  'application/json',
      'Authorization': `Bearer ${token}`,
      ...init.headers,
    },
  });

  const json = await res.json();

  if (!json.ok) {
    throw new ApiError(
      json.error?.code    ?? 'ERR_UNKNOWN',
      json.error?.message ?? 'เกิดข้อผิดพลาด',
      json.error?.details,
      res.status,
    );
  }

  return json.data as T;
}
```

### 6.2 ใช้ใน Component

```typescript
import { apiFetch, ApiError } from '@/lib/api';

const handleSave = async () => {
  setSaving(true);
  setError('');
  try {
    const record = await apiFetch<FinanceEntry>('/api/tmc/finance', {
      method: 'POST',
      token,
      body: JSON.stringify(form),
      headers: { 'Idempotency-Key': idempotencyKey },
    });
    // สำเร็จ
    toast.success('บันทึกสำเร็จ');
    onSaved(record);
  } catch (e) {
    if (e instanceof ApiError) {
      // แยก error code เพื่อแสดงข้อความที่เหมาะสม
      switch (e.code) {
        case 'ERR_PERIOD_CLOSED':
          setError(`งวดบัญชีปิดแล้ว ไม่สามารถบันทึกได้`);
          break;
        case 'ERR_INSUFFICIENT_ROLE':
          setError('ไม่มีสิทธิ์ดำเนินการ กรุณาติดต่อผู้ดูแลระบบ');
          break;
        default:
          setError(e.message);
      }
    } else {
      setError('เกิดข้อผิดพลาดที่ไม่ทราบสาเหตุ');
    }
  } finally {
    setSaving(false);
  }
};
```

---

## 7. Migration Path (Existing Code)

API routes ปัจจุบันยังใช้ pattern เดิม — ให้ migrate เมื่อแตะไฟล์นั้น:

```typescript
// ก่อน (pattern เดิม — ยังพบทั่วโปรเจกต์)
return NextResponse.json({ error: error.message }, { status: 500 });
return NextResponse.json({ ok: true });
return NextResponse.json(data);
return NextResponse.json({ error: 'ต้องการสิทธิ์' }, { status: 403 });

// หลัง (standard ใหม่)
import { ok, created, Err } from '../../_lib/response';

return Err.dbError(error);
return ok({ success: true });
return ok(data);
return Err.forbidden('ต้องการสิทธิ์ team_lead ขึ้นไป');
```

**กฎ Migration**: ไม่ต้อง migrate ทั้งหมดในครั้งเดียว  
ทำแบบ **Boy Scout Rule** — แตะไฟล์ไหน ให้ standard ไฟล์นั้นก่อน return

---

## 8. Quick Reference

### Response Shapes

```
GET list   → { ok: true, data: [...] }
GET single → { ok: true, data: {...} }
POST new   → { ok: true, data: {...} }  HTTP 201
PUT/DELETE → { ok: true, data: {...} }  HTTP 200
Error      → { ok: false, error: { code, message, details? } }
```

### Error Codes ที่ใช้บ่อยที่สุด

```
ERR_MISSING_FIELD          400   ขาด required field
ERR_UNAUTHENTICATED        401   ไม่มี/expired token
ERR_INSUFFICIENT_ROLE      403   role ไม่พอ
ERR_UNAUTHORIZED_TENANT    403   ไม่ใช่สมาชิกองค์กร
ERR_PERIOD_CLOSED          422   งวดบัญชีปิดแล้ว
ERR_INSUFFICIENT_STOCK     422   สต๊อกไม่พอ
ERR_JOURNAL_IMBALANCED     422   เดบิต ≠ เครดิต
ERR_DB_CONSTRAINT          500   Postgres error
ERR_IDEMPOTENCY_MISMATCH   409   Key ซ้ำ body ต่าง
```

### Idempotency Key Flow

```
Client                          Server
  │                               │
  ├─ POST + Idempotency-Key ──────►│
  │                               ├─ key ใหม่? → execute + cache
  │◄─────────────── 201 ──────────┤
  │                               │
  ├─ POST (retry, key เดิม) ──────►│
  │                               ├─ key เจอใน cache → replay
  │◄───── 201 + X-Idempotent-Replayed: true ──┤
```

---

## เอกสารที่เกี่ยวข้อง

| เอกสาร | เนื้อหา |
|--------|---------|
| [`docs/audit.md`](./audit.md) | บันทึกทุก mutation ที่ผ่านระบบ |
| [`docs/tenant-isolation.md`](./tenant-isolation.md) | RLS — ป้องกัน ERR_UNAUTHORIZED_TENANT |
| [`docs/platform.md`](./platform.md) | ภาพรวม architecture ระบบ |
