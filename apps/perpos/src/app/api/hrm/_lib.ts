import { NextRequest, NextResponse } from "next/server";
import { createAuthedClient, createAdminClient } from "../_lib/supabase";
import { requireModuleMember } from "../_lib/module-auth";
import type { HrmRole } from "@/lib/hrm/types";

export const MODULE_KEY = "hrm";
export type { HrmRole } from "@/lib/hrm/types";

export interface HrmAuth {
  ok: true;
  userId: string;
  orgId: string;
  role: HrmRole;
  isSuperAdmin: boolean;
  rls: ReturnType<typeof createAuthedClient>;
}

export type HrmAuthFailure = { ok: false; res: NextResponse };

/**
 * Require user to be an active member of the HRM module for `orgId`.
 * Delegates to the generic requireModuleMember() registry checker (key='hrm').
 * (เลียน tmc/_lib.ts เป๊ะ)
 */
export async function requireHrmMember(
  req: NextRequest,
  orgId: string,
): Promise<HrmAuth | HrmAuthFailure> {
  const result = await requireModuleMember(req, orgId, MODULE_KEY);
  if (!result.ok) return result;

  return {
    ok: true,
    userId: result.userId,
    orgId: result.orgId,
    role: result.moduleRole as HrmRole,
    isSuperAdmin: result.isSuperAdmin,
    rls: result.rls,
  };
}

/** owner + hr เขียนได้ · viewer อ่านอย่างเดียว (spec §5) */
export function canWriteHrm(role: HrmRole): boolean {
  return role === "owner" || role === "hr";
}

/** alias เดิม (กัน import เก่าค้าง) */
export const canWrite = canWriteHrm;

/**
 * สิทธิ์อนุมัติ/จ่ายเงินเดือน (run → approved | paid) = **owner เท่านั้น** (binding spec).
 * super_admin ได้ moduleRole='owner' จาก requireModuleMember → ผ่านด้วย.
 */
export function canApprovePayroll(role: HrmRole): boolean {
  return role === "owner";
}

/** error ไทย + status (helper ตอบกลาง) */
export function hrmError(message: string, status = 400): NextResponse {
  return NextResponse.json({ error: message }, { status });
}

/** ดึง orgId จาก query string (?orgId=) */
export function orgIdFromQuery(req: NextRequest): string {
  return req.nextUrl.searchParams.get("orgId") ?? "";
}

/**
 * กัน cross-org FK pollution — ตรวจว่า employee_id ที่ client ส่งมาอยู่ org เดียวกับ caller จริง
 * (FK ใน DB อ้าง hrm_employees(id) แบบไม่ scope org → ถ้าไม่เช็ค HR ของ org A อ้าง employee org B ได้)
 * ใช้ก่อน insert ทุก row ที่อ้าง employee_id จาก body (leave/time/documents).
 */
export async function employeeInOrg(
  admin: ReturnType<typeof createAdminClient>,
  orgId: string,
  employeeId: string,
): Promise<boolean> {
  if (!employeeId) return false;
  const { data } = await admin
    .from("hrm_employees")
    .select("id")
    .eq("id", employeeId)
    .eq("org_id", orgId)
    .maybeSingle();
  return !!data;
}
