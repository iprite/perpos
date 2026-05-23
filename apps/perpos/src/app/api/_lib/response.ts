/**
 * Standard API Response Helpers
 *
 * Every route handler must use these instead of raw NextResponse.json().
 * See docs/error-handling-and-api.md for the full contract.
 *
 * Usage:
 *   import { ok, created, Err } from '../../_lib/response';
 *
 *   return ok(data);          // 200 { ok: true, data }
 *   return created(record);   // 201 { ok: true, data }
 *   return Err.forbidden();   // 403 { ok: false, error: { code, message } }
 */

import { NextResponse } from 'next/server';

// ─── Error codes ──────────────────────────────────────────────────────────────

export type AppErrorCode =
  // Auth & Access
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
  // Accounting & Finance
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

// ─── Response types ───────────────────────────────────────────────────────────

export type ApiSuccess<T> = { ok: true;  data: T };
export type ApiError      = {
  ok: false;
  error: { code: AppErrorCode; message: string; details?: unknown };
};

// ─── Factories ────────────────────────────────────────────────────────────────

/** 200 OK with data */
export function ok<T>(data: T): NextResponse<ApiSuccess<T>> {
  return NextResponse.json({ ok: true, data }, { status: 200 });
}

/** 201 Created with data */
export function created<T>(data: T): NextResponse<ApiSuccess<T>> {
  return NextResponse.json({ ok: true, data }, { status: 201 });
}

/** Generic error factory */
export function err(
  code: AppErrorCode,
  message: string,
  status: number,
  details?: unknown,
): NextResponse<ApiError> {
  return NextResponse.json(
    {
      ok: false,
      error: {
        code,
        message,
        ...(details !== undefined ? { details } : {}),
      },
    },
    { status },
  );
}

// ─── Shortcuts (Err.*) ────────────────────────────────────────────────────────

export const Err = {
  // ── Validation ────────────────────────────────────────────────────
  missingField: (field: string) =>
    err('ERR_MISSING_FIELD', `ต้องระบุ: ${field}`, 400, { field }),

  invalidFormat: (field: string, hint?: string) =>
    err(
      'ERR_INVALID_FORMAT',
      `${field} มีรูปแบบไม่ถูกต้อง${hint ? ` — ${hint}` : ''}`,
      400,
      { field },
    ),

  outOfRange: (field: string, min?: number, max?: number) =>
    err('ERR_VALUE_OUT_OF_RANGE', `${field} อยู่นอกช่วงที่อนุญาต`, 400, { field, min, max }),

  invalidDateRange: (from: string, to: string) =>
    err('ERR_INVALID_DATE_RANGE', 'ช่วงวันที่ไม่ถูกต้อง (from > to)', 400, { from, to }),

  // ── Auth ──────────────────────────────────────────────────────────
  unauthorized: () =>
    err('ERR_UNAUTHENTICATED', 'ต้องเข้าสู่ระบบก่อน', 401),

  forbidden: (reason?: string) =>
    err('ERR_INSUFFICIENT_ROLE', reason ?? 'ไม่มีสิทธิ์ดำเนินการนี้', 403),

  wrongTenant: () =>
    err('ERR_UNAUTHORIZED_TENANT', 'ไม่มีสิทธิ์เข้าถึงองค์กรนี้', 403),

  moduleDisabled: (moduleKey: string) =>
    err('ERR_MODULE_DISABLED', `Module '${moduleKey}' ยังไม่เปิดใช้งาน`, 403, { moduleKey }),

  // ── Business Logic ────────────────────────────────────────────────
  periodClosed: (period: string) =>
    err('ERR_PERIOD_CLOSED', `งวดบัญชี ${period} ปิดแล้ว ไม่สามารถแก้ไขได้`, 422, { period }),

  entryLocked: (id: string) =>
    err('ERR_ENTRY_LOCKED', 'รายการนี้ถูก lock หลังผ่านการอนุมัติแล้ว', 422, { id }),

  journalImbalanced: (debit: number, credit: number) =>
    err('ERR_JOURNAL_IMBALANCED', `เดบิต (${debit}) ≠ เครดิต (${credit})`, 422, { debit, credit }),

  insufficientStock: (requested: number, available: number, itemId?: string) =>
    err('ERR_INSUFFICIENT_STOCK', 'สต๊อกไม่เพียงพอสำหรับรายการนี้', 422, {
      requested,
      available,
      item_id: itemId,
    }),

  insufficientBalance: (required: number, balance: number) =>
    err('ERR_INSUFFICIENT_BALANCE', 'ยอดเงินในบัญชีไม่เพียงพอ', 422, { required, balance }),

  documentApproved: (id: string) =>
    err('ERR_DOCUMENT_ALREADY_APPROVED', 'เอกสารผ่านการอนุมัติแล้ว ไม่สามารถแก้ไขได้', 409, { id }),

  invalidStatusTransition: (from: string, to: string) =>
    err('ERR_INVALID_STATUS_TRANSITION', `ไม่สามารถเปลี่ยนสถานะจาก ${from} → ${to}`, 422, { from, to }),

  // ── Not Found ─────────────────────────────────────────────────────
  notFound: (resource: string, id?: string) =>
    err('ERR_ACCOUNT_NOT_FOUND', `ไม่พบ ${resource}${id ? ` (${id})` : ''}`, 404, { resource, id }),

  // ── Idempotency ───────────────────────────────────────────────────
  idempotencyMismatch: () =>
    err(
      'ERR_IDEMPOTENCY_MISMATCH',
      'Idempotency key ซ้ำแต่ request body ต่างกัน กรุณาใช้ key ใหม่',
      409,
    ),

  // ── System ────────────────────────────────────────────────────────
  /** Call this for any Postgres / Supabase error */
  dbError: (e: unknown) => {
    const raw = String(e);
    console.error('[ERR_DB_CONSTRAINT]', raw);
    return err(
      'ERR_DB_CONSTRAINT',
      'เกิดข้อผิดพลาดในฐานข้อมูล กรุณาลองใหม่อีกครั้ง',
      500,
      process.env.NODE_ENV === 'development' ? { raw } : undefined,
    );
  },

  externalService: (service: string, reason?: string) => {
    console.error(`[ERR_EXTERNAL_SERVICE] ${service}`, reason);
    return err('ERR_EXTERNAL_SERVICE', `ไม่สามารถเชื่อมต่อ ${service} ได้`, 502, { service });
  },
} as const;
