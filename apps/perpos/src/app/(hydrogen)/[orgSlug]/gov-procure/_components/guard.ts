// guard.ts — server helper สำหรับหน้า [orgSlug]/gov-procure/* (per-org module, RLS)
// resolve slug → orgId + เช็คสมาชิกโมดูล gov_procure (super_admin = owner)
// pattern ตาม DESIGN/CONTEXT §5 (mirror hrm/_components/guard.ts): member + RLS
// ห้ามใช้ admin service-role กับข้อมูล per-org
import "server-only";

import { notFound } from "next/navigation";
import {
  getOrganizationsForCurrentUser,
  getModuleRoleForCurrentUser,
} from "@/lib/accounting/queries";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { GovProcureRole } from "@/lib/gov-procure/types";

export interface GovProcurePageContext {
  orgId: string;
  orgSlug: string;
  role: GovProcureRole;
  /** เขียน order/stage/attachment ได้ไหม — owner/manager/staff (spec §1) */
  canWrite: boolean;
  /** แก้ field การเงินได้ไหม — owner/manager (staff ถูกล็อก, spec §1) */
  canEditFinance: boolean;
  /** RLS-scoped client (session) — ใช้ดึง initial data ผ่าน lib/gov-procure/* */
  rls: SupabaseClient;
}

/** owner/manager/staff เขียนได้ · viewer อ่านอย่างเดียว (spec §1) */
export function canWriteGovProcure(role: GovProcureRole): boolean {
  return role === "owner" || role === "manager" || role === "staff";
}

/** owner/manager แก้การเงินได้ · staff ถูกล็อก field การเงิน (spec §1) */
export function canEditFinanceGovProcure(role: GovProcureRole): boolean {
  return role === "owner" || role === "manager";
}

/**
 * Guard หน้า gov-procure — เรียกบนสุดของทุก server page ใต้ [orgSlug]/gov-procure
 * ไม่ใช่สมาชิก/ไม่พบ org/ไม่มีสิทธิ์ → notFound()
 */
export async function requireGovProcurePage(orgSlug: string): Promise<GovProcurePageContext> {
  const orgs = await getOrganizationsForCurrentUser();
  const org = orgs.find((o) => o.slug === orgSlug);
  if (!org) notFound();

  const role = (await getModuleRoleForCurrentUser(org.id, "gov_procure")) as GovProcureRole | null;
  if (!role) notFound();

  const rls = await createSupabaseServerClient();
  return {
    orgId: org.id,
    orgSlug,
    role,
    canWrite: canWriteGovProcure(role),
    canEditFinance: canEditFinanceGovProcure(role),
    rls,
  };
}
