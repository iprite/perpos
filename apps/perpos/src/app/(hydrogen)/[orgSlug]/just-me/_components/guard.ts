// guard.ts — server helper ของหน้า [orgSlug]/just-me/* (per-org module, RLS)
// pattern เดียวกับ p2p-group/gov-procure: member + RLS
// ⛔ ห้ามใช้ admin service-role client กับข้อมูล per-org (AGENTS.md — Page Load Performance ข้อ 3)
import "server-only";

import { notFound } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  getModuleRoleForCurrentUser,
  getOrganizationsForCurrentUser,
} from "@/lib/accounting/queries";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type JustMeRole = "owner" | "manager" | "viewer";

export interface JustMePageContext {
  orgId: string;
  orgSlug: string;
  role: JustMeRole;
  /** owner|manager แก้ข้อมูลได้ · viewer อ่านอย่างเดียว */
  canWrite: boolean;
  /** owner|manager เห็นต้นทุน/margin/กำไร (ตรงกับ `just_me_has_cost_access()` ที่ DB) */
  canSeeCost: boolean;
  /** RLS client — viewer อ่านตารางต้นทุนตรงจะได้ 0 แถว จึงต้องอ่านผ่าน view `*_basic` */
  rls: SupabaseClient;
}

/** ไม่ใช่สมาชิกโมดูล/ไม่พบ org → notFound() (ไม่บอกว่ามีอยู่จริงไหม) */
export async function requireJustMePage(orgSlug: string): Promise<JustMePageContext> {
  const orgs = await getOrganizationsForCurrentUser();
  const org = orgs.find((o) => o.slug === orgSlug);
  if (!org) notFound();

  const role = (await getModuleRoleForCurrentUser(org.id, "just_me")) as JustMeRole | null;
  if (!role) notFound();

  const rls = await createSupabaseServerClient();
  return {
    orgId: org.id,
    orgSlug,
    role,
    canWrite: role === "owner" || role === "manager",
    canSeeCost: role !== "viewer",
    rls,
  };
}
