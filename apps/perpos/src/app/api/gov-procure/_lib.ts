// api/gov-procure/_lib.ts — typed module-auth wrapper + write guards + field-level finance-lock
// specs/gov_procure.md §1 (Q4 hard-enforce การเงินที่ API) + §6 (API surface) · mirror pattern b2g/_lib.ts

import { NextRequest, NextResponse } from "next/server";
import { requireModuleMember, ModuleAuth } from "../_lib/module-auth";
import type { GovProcureRole } from "@/lib/gov-procure/types";

export const MODULE_KEY = "gov_procure";

export interface GovProcureAuth extends Omit<ModuleAuth, "moduleRole"> {
  role: GovProcureRole;
}

type AuthFailure = { ok: false; res: NextResponse };

/** guard เฉพาะ module gov_procure — คืน role typed (super_admin → 'owner') */
export async function requireGovProcureMember(
  req: NextRequest,
  orgId: string,
): Promise<GovProcureAuth | AuthFailure> {
  const result = await requireModuleMember(req, orgId, MODULE_KEY);
  if (!result.ok) return result;
  return { ...result, role: result.moduleRole as GovProcureRole };
}

/** เขียน order/stage/attachment ได้ไหม — owner/manager/staff = true · viewer = false (§1) */
export function canWrite(role: GovProcureRole): boolean {
  return role === "owner" || role === "manager" || role === "staff";
}

/** ลบได้เฉพาะ owner/manager (staff ห้ามลบ — §6/§task) · viewer read-only */
export function canDelete(role: GovProcureRole): boolean {
  return role === "owner" || role === "manager";
}

/** จัดการ settings ได้เฉพาะ owner/manager (B2 — §6 note) */
export function canManageSettings(role: GovProcureRole): boolean {
  return role === "owner" || role === "manager";
}

/** helper อ่าน orgId จาก query + error ไทยมาตรฐาน */
export function orgIdFromQuery(req: NextRequest): string | null {
  return req.nextUrl.searchParams.get("orgId");
}

export function govError(message: string, status = 400): NextResponse {
  return NextResponse.json({ error: message }, { status });
}

// ---- Field allowlists (anti mass-assignment + finance-lock) ----

/**
 * FINANCE_FIELDS — field การเงินที่ staff แก้ไม่ได้ (§1 Q4 hard-enforce ที่ API).
 * ถ้า role='staff' ส่ง field เหล่านี้มา → ตัดทิ้งเงียบ ๆ (ไม่ error) ใน sanitizeOrderPayload.
 *
 * รายการ = **ตัวเลขเงินล้วน 20 field ตรงกับ prototype `FINANCE_LOCKED_FIELDS` เป๊ะ**
 * (prototype ผ่าน gate ผู้ใช้แล้ว — B4 UI lens จะ mirror ชุดเดียวกัน กัน UI โชว์ field
 * ที่ API ตัดเงียบ). สิ่งที่**ไม่ล็อก**โดยตั้งใจ:
 * - `*_slip` ทั้ง 3 — สถานะ checklist "ทำแล้วหรือยัง" (§3.2) ไม่ใช่ตัวเลขเงิน;
 *   งานหลัก staff (§2 persona) = แนบสลิป/อัปเดตหลักฐาน
 * - `transfer_date/round1/round2` + `finance/support/commission_payment_date` — เป็น "วันที่"
 *   บันทึกเหตุการณ์ ไม่ใช่จำนวนเงิน (staff จดบันทึกหน้างานได้ ตาม prototype)
 */
export const FINANCE_FIELDS: readonly string[] = [
  "price_incl_vat",
  "price_excl_vat",
  "withholding_tax",
  "net_receivable",
  "cost_price",
  "gross_profit",
  "security_deposit",
  "customer_change",
  "petty_cash",
  "transport_buy",
  "transport_sell",
  "transport_other",
  "operate_89",
  "total_cost_89",
  "net_profit_89",
  "profit_pct",
  "commission_base_profit",
  "commission_amount",
  "commission_wht",
  "commission_net_payable",
] as const;

const FINANCE_SET = new Set<string>(FINANCE_FIELDS);

/**
 * ORDER_WRITABLE_FIELDS — คอลัมน์ที่ client เขียนได้ (whitelist §3.1 ทั้งหมด ยกเว้น
 * id/org_id/created_by/created_at/updated_at ที่ server กำหนดเอง + stage/stage_manual_override
 * ที่จัดการผ่าน endpoint /stage แยก เพื่อ audit/validate ชัด §6).
 */
export const ORDER_WRITABLE_FIELDS: readonly string[] = [
  // A — พื้นฐาน
  "seq_no",
  "customer_name",
  "department",
  "company",
  "qt_reference",
  "product_description",
  "start_date",
  // B — การเงิน
  "price_incl_vat",
  "price_excl_vat",
  "withholding_tax",
  "net_receivable",
  "cost_price",
  "gross_profit",
  "security_deposit",
  // C — ทุนหมุนเวียน
  "transfer_date",
  "transfer_round1",
  "transfer_round2",
  // D — แบ่งรายได้/ต้นทุน 89
  "customer_change",
  "customer_change_slip",
  "petty_cash",
  "petty_cash_slip",
  "transport_buy",
  "transport_sell",
  "transport_other",
  "operate_89",
  "total_cost_89",
  "net_profit_89",
  "profit_pct",
  // E — คอมมิชชั่น
  "commission_base_profit",
  "commission_amount",
  "commission_wht",
  "commission_net_payable",
  "commission_slip",
  // F — milestone timeline
  "contract_date",
  "payment_order_date",
  "delivery_date",
  "receipt_date",
  "finance_payment_date",
  "support_payment_date",
  "commission_payment_date",
  // G — หมายเหตุ
  "notes",
] as const;

/**
 * sanitizeOrderPayload — คัดเฉพาะ field ใน allowlist + แปลง '' → null.
 * **Q4 finance-lock (hard-enforce)**: ถ้า role==='staff' ตัด FINANCE_FIELDS ทิ้งเงียบ ๆ
 * (ไม่ throw/ไม่ error — แค่ไม่บันทึกค่านั้น) → staff แก้ได้เฉพาะ qt/product/milestone/notes ฯลฯ.
 * viewer เขียนไม่ได้อยู่แล้ว (canWrite=false → route ปฏิเสธก่อนถึงตรงนี้).
 */
export function sanitizeOrderPayload(
  body: Record<string, unknown>,
  role: GovProcureRole,
): Record<string, unknown> {
  const isStaff = role === "staff";
  const out: Record<string, unknown> = {};
  for (const key of ORDER_WRITABLE_FIELDS) {
    if (!(key in body)) continue;
    if (isStaff && FINANCE_SET.has(key)) continue; // finance-lock: ตัดเงียบ
    const v = body[key];
    out[key] = v === "" ? null : v;
  }
  return out;
}
