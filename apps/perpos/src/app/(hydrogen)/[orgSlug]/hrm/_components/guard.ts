// guard.ts — server helper สำหรับหน้า [orgSlug]/hrm/* (per-org module, RLS)
// resolve slug → orgId + เช็คสมาชิกโมดูล hrm (super_admin = owner)
// pattern ตาม DESIGN/CONTEXT §5: member + RLS · ห้าม admin service-role กับข้อมูล per-org
import "server-only";

import { notFound } from "next/navigation";
import {
  getOrganizationsForCurrentUser,
  getModuleRoleForCurrentUser,
} from "@/lib/accounting/queries";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { HrmRole } from "@/lib/hrm/types";

export interface HrmPageContext {
  orgId: string;
  orgSlug: string;
  role: HrmRole;
  canWrite: boolean;
  /** RLS-scoped client (session) — ใช้ดึง initial data ผ่าน lib/hrm/* */
  rls: SupabaseClient;
}

/** owner + hr เขียนได้ · viewer อ่านอย่างเดียว (spec §5) */
export function canWriteHrm(role: HrmRole): boolean {
  return role === "owner" || role === "hr";
}

/**
 * Guard หน้า hrm — เรียกบนสุดของทุก server page ใต้ [orgSlug]/hrm
 * ไม่ใช่สมาชิก/ไม่พบ org/ไม่มีสิทธิ์ → notFound()
 */
export async function requireHrmPage(orgSlug: string): Promise<HrmPageContext> {
  const orgs = await getOrganizationsForCurrentUser();
  const org = orgs.find((o) => o.slug === orgSlug);
  if (!org) notFound();

  const role = (await getModuleRoleForCurrentUser(org.id, "hrm")) as HrmRole | null;
  if (!role) notFound();

  const rls = await createSupabaseServerClient();
  return {
    orgId: org.id,
    orgSlug,
    role,
    canWrite: canWriteHrm(role),
    rls,
  };
}
