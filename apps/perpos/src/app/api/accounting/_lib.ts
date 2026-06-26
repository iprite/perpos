import { NextRequest, NextResponse } from "next/server";
import { createAuthedClient, createAdminClient } from "../_lib/supabase";
import { requireModuleMember } from "../_lib/module-auth";
import type { AccountingRole } from "@/lib/accounting/types";

export const MODULE_KEY = "accounting";
export type { AccountingRole } from "@/lib/accounting/types";

export interface AccountingAuth {
  ok: true;
  userId: string;
  orgId: string;
  role: AccountingRole;
  isSuperAdmin: boolean;
  /** Authed Supabase client (respects RLS) — ใช้กับ GET (per-org อ่าน) */
  rls: ReturnType<typeof createAuthedClient>;
}

export type AccountingAuthFailure = { ok: false; res: NextResponse };

/**
 * Require user to be an active member of the accounting module for `orgId`.
 * Delegates to the generic requireModuleMember() registry checker (key='accounting').
 * (เลียน hrm/tmc _lib.ts เป๊ะ — reuse, ไม่สร้าง guard ใหม่)
 */
export async function requireAccountingMember(
  req: NextRequest,
  orgId: string,
): Promise<AccountingAuth | AccountingAuthFailure> {
  const result = await requireModuleMember(req, orgId, MODULE_KEY);
  if (!result.ok) return result;

  return {
    ok: true,
    userId: result.userId,
    orgId: result.orgId,
    role: result.moduleRole as AccountingRole,
    isSuperAdmin: result.isSuperAdmin,
    rls: result.rls,
  };
}

// ───────────────────────────────────────────────────────────────────────────
// Role helpers (role matrix §4 contract — ui+api ตรงกัน)
//   หน้าบ้าน (contacts/documents/entries/products): owner/accountant/staff = W · viewer = V
//   หลังบ้าน (accounts/journal/periods/tax/assets): owner = V · accountant = W · staff/viewer = –/V
//   periods close: accountant (A) · settings PUT: owner (A)
// ───────────────────────────────────────────────────────────────────────────

/** เขียนหน้าบ้านได้: owner / accountant / staff (viewer = อ่าน) */
export function canWriteFrontstage(role: AccountingRole): boolean {
  return role === "owner" || role === "accountant" || role === "staff";
}

/** เขียนหลังบ้านได้ (journal/accounts/tax/assets): owner เห็นเป็น view, เขียนจริง = accountant */
export function canWriteBackstage(role: AccountingRole): boolean {
  return role === "accountant";
}

/** ปิด/เปิดงวด = accountant เท่านั้น (role matrix periods = A) */
export function canClosePeriod(role: AccountingRole): boolean {
  return role === "accountant";
}

/** แก้ตั้งค่าองค์กร (settings PUT, VAT toggle) = owner เท่านั้น */
export function canEditSettings(role: AccountingRole): boolean {
  return role === "owner";
}

/** error ไทย + status (helper ตอบกลาง — ผู้ใช้เห็นได้) */
export function accError(message: string, status = 400): NextResponse {
  return NextResponse.json({ error: message }, { status });
}

/** ดึง orgId จาก query string (?orgId=) */
export function orgIdFromQuery(req: NextRequest): string {
  return req.nextUrl.searchParams.get("orgId") ?? "";
}

// ───────────────────────────────────────────────────────────────────────────
// Money / numeric guards (binding — R1-R8: ยอด≥0, NaN guard, ปัด 2 ตำแหน่ง)
// ───────────────────────────────────────────────────────────────────────────

/** ปัดทศนิยม 2 ตำแหน่ง (เงิน numeric(14,2)) */
export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/** number guard — คืน 0 ถ้า NaN/Infinity/undefined/null. ไม่ยอมติดลบถ้า nonNeg */
export function num(v: unknown, opts?: { nonNeg?: boolean }): number {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return 0;
  if (opts?.nonNeg && n < 0) return 0;
  return n;
}

/**
 * เช็คงวด open ก่อน post (R1). คืน:
 *   { ok:true } ถ้าไม่มี period row (ยังไม่เคยเปิด = ถือว่า open) หรือ status='open'
 *   { ok:false } ถ้า status='closed' → caller ตอบ 409
 * period คีย์ด้วย (org_id, year, month) จาก entry_date.
 */
export async function assertPeriodOpen(
  admin: ReturnType<typeof createAdminClient>,
  orgId: string,
  year: number,
  month: number,
): Promise<{ ok: true; periodId: string | null } | { ok: false }> {
  const { data } = await admin
    .from("acc_periods")
    .select("id, status")
    .eq("org_id", orgId)
    .eq("year", year)
    .eq("month", month)
    .maybeSingle();
  const row = data as { id: string; status: string } | null;
  if (row && row.status === "closed") return { ok: false };
  return { ok: true, periodId: row?.id ?? null };
}

/**
 * สร้างเลขรันเอกสาร/journal ต่อชนิดต่อปี (เช่น INV-2026-0001, JV-2026-0001).
 * count แถวที่มีอยู่ + 1 (ภายใต้ unique constraint จึง retry-safe พอประมาณ;
 * concurrency ชนกัน → unique violation → caller จัดการ/retry).
 */
export async function nextDocNumber(
  admin: ReturnType<typeof createAdminClient>,
  table: "acc_documents" | "acc_journal_entries",
  orgId: string,
  prefix: string,
  year: number,
  extraFilter?: { column: string; value: string },
): Promise<string> {
  let q = admin.from(table).select("id", { count: "exact", head: true }).eq("org_id", orgId);
  if (extraFilter) q = q.eq(extraFilter.column, extraFilter.value);
  // นับเฉพาะปีนั้นผ่าน prefix pattern ใน column เลข
  const numberCol = table === "acc_documents" ? "doc_number" : "entry_number";
  q = q.ilike(numberCol, `${prefix}-${year}-%`);
  const { count } = await q;
  const seq = String((count ?? 0) + 1).padStart(4, "0");
  return `${prefix}-${year}-${seq}`;
}
