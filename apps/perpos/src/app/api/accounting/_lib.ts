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
//
// รับ auth object ทั้งก้อน (ไม่ใช่ role เดี่ยว) เพราะต้องดู isSuperAdmin ด้วย —
// requireModuleMember map super_admin เป็น moduleRole "owner" เสมอ ซึ่ง "owner" ไม่ผ่าน
// ด่านหลังบ้าน (ต้องเป็น accountant) → super_admin จะลงบัญชี/ปิดงวด/จัดการภาษีไม่ได้เลย
// ขัดกับกฎ "admin ข้ามการเช็ค permission ทั้งหมด" ใน AGENTS.md
// ───────────────────────────────────────────────────────────────────────────

/** สิ่งที่ helper สิทธิ์ต้องใช้ตัดสิน — ส่ง `auth` จาก requireAccountingMember ได้ตรง ๆ */
export type AccountingRoleCheck = { role: AccountingRole; isSuperAdmin?: boolean };

/** เขียนหน้าบ้านได้: owner / accountant / staff (viewer = อ่าน) */
export function canWriteFrontstage(a: AccountingRoleCheck): boolean {
  if (a.isSuperAdmin) return true;
  return a.role === "owner" || a.role === "accountant" || a.role === "staff";
}

/** เขียนหลังบ้านได้ (journal/accounts/tax/assets): owner เห็นเป็น view, เขียนจริง = accountant */
export function canWriteBackstage(a: AccountingRoleCheck): boolean {
  if (a.isSuperAdmin) return true;
  return a.role === "accountant";
}

/** ปิด/เปิดงวด = accountant เท่านั้น (role matrix periods = A) */
export function canClosePeriod(a: AccountingRoleCheck): boolean {
  if (a.isSuperAdmin) return true;
  return a.role === "accountant";
}

/** แก้ตั้งค่าองค์กร (settings PUT, VAT toggle) = owner เท่านั้น */
export function canEditSettings(a: AccountingRoleCheck): boolean {
  if (a.isSuperAdmin) return true;
  return a.role === "owner";
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

// ───────────────────────────────────────────────────────────────────────────
// Phase 1.4 — ล็อกเอกสารที่ออกแล้ว
// ───────────────────────────────────────────────────────────────────────────

/**
 * สถานะที่เปลี่ยนไปได้จากสถานะปัจจุบัน (เอกสารขาย)
 * เดิม PATCH ตั้งสถานะอะไรก็ได้ → ย้อนจาก paid กลับ draft ได้ = หลักฐานเพี้ยน
 *   draft   → sent / void            (ยังไม่ออก ยกเลิกได้เลย)
 *   sent    → accepted / paid / overdue / void
 *   accepted→ paid / overdue / void
 *   overdue → paid / void
 *   paid    → (จบแล้ว — ต้องออกใบลดหนี้ ไม่ใช่ย้อนสถานะ)
 *   void    → (จบแล้ว)
 */
const DOC_STATUS_TRANSITIONS: Record<string, string[]> = {
  draft: ["sent", "void"],
  sent: ["accepted", "paid", "overdue", "void"],
  accepted: ["paid", "overdue", "void"],
  overdue: ["paid", "void"],
  paid: [],
  void: [],
};

export function canTransitionDocStatus(from: string, to: string): boolean {
  if (from === to) return true;
  return (DOC_STATUS_TRANSITIONS[from] ?? []).includes(to);
}

/** เอกสารที่ "ออกไปแล้ว" — ห้ามลบจริง ต้อง void แทน (พ.ร.บ.การบัญชี ม.14 เก็บ 5 ปี) */
export function isIssuedDoc(status: string): boolean {
  return status !== "draft";
}

/** รหัสนำหน้าเริ่มต้นต่อชนิดเอกสาร (ใช้เมื่อ org ไม่ได้ตั้งเอง) */
export const DEFAULT_DOC_PREFIX: Record<string, string> = {
  quotation: "QT",
  invoice: "INV",
  receipt: "RC",
  tax_invoice: "TIV",
  receipt_tax_invoice: "RTV",
  credit_note: "CN",
  debit_note: "DN",
  billing_note: "BN",
  delivery_note: "DO",
  journal: "JV",
};

/**
 * ทำความสะอาดรหัสนำหน้าที่ผู้ใช้กรอก → เหลือเฉพาะ "รหัส" (เลขปี+ลำดับต่อท้ายให้ระบบใส่เอง)
 * รองรับค่าที่ค้างจาก UI รุ่นเก่าซึ่งเก็บทั้งก้อน เช่น "QT-2026-" → "QT"
 * กันอักขระที่ทำให้เลขเอกสารพัง (เว้นวรรค/ตัวคั่น) — เหลือ A-Z 0-9 เท่านั้น
 */
export function normalizeDocPrefix(raw: unknown, fallback: string): string {
  let s = String(raw ?? "").trim();
  if (!s) return fallback;
  s = s.replace(/[-_\s]+$/, ""); // ตัดตัวคั่นท้าย
  s = s.replace(/[-_\s]*\d{4}$/, ""); // ตัดปีท้าย (QT-2026 → QT)
  s = s.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
  return s || fallback;
}

/** อ่านรหัสนำหน้าที่ org ตั้งไว้ใน acc_org_settings.doc_number_prefix (ถ้าไม่มี → ค่า default) */
export async function resolveDocPrefix(
  admin: ReturnType<typeof createAdminClient>,
  orgId: string,
  docKind: string,
): Promise<string> {
  const fallback = DEFAULT_DOC_PREFIX[docKind] ?? "DOC";
  const { data } = await admin
    .from("acc_org_settings")
    .select("doc_number_prefix")
    .eq("org_id", orgId)
    .maybeSingle();
  const map = (data as { doc_number_prefix?: Record<string, string> | null } | null)
    ?.doc_number_prefix;
  return normalizeDocPrefix(map?.[docKind], fallback);
}

/**
 * จองเลขรันเอกสาร/journal ต่อ (org, ชนิด, ปี) แบบ atomic — เช่น INV-2026-0001
 *
 * ใช้ RPC next_acc_doc_number (INSERT..ON CONFLICT DO UPDATE..RETURNING) ซึ่งล็อกแถว
 * ตัวนับใน transaction เดียว → สอง request พร้อมกันไม่มีทางได้เลขซ้ำ
 *
 * ต่างจากของเดิม (COUNT(*)+1):
 *   • concurrency ชนกันไม่ได้อีก
 *   • ลบ/ยกเลิกเอกสารแล้วเลข **ไม่ย้อนกลับมาใช้ซ้ำ** (เลขที่ใบกำกับภาษีต้องไม่ซ้ำตลอดกาล)
 *   • เลขกระโดดได้ถ้าจองแล้วสร้างไม่สำเร็จ — ยอมรับได้ ดีกว่าเลขซ้ำ
 */
export async function nextDocNumber(
  admin: ReturnType<typeof createAdminClient>,
  orgId: string,
  docKind: string,
  year: number,
  prefix?: string,
): Promise<string> {
  const px = prefix ?? (await resolveDocPrefix(admin, orgId, docKind));
  const { data, error } = await admin.rpc("next_acc_doc_number", {
    p_org_id: orgId,
    p_doc_kind: docKind,
    p_year: year,
    p_prefix: px,
  });
  if (error) throw new Error(`ออกเลขที่เอกสารไม่สำเร็จ: ${error.message}`);
  return String(data);
}
