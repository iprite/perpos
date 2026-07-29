// guard.ts — server helper สำหรับหน้า [orgSlug]/p2p-group/* (per-org module, RLS)
// pattern เดียวกับ gov-procure/hrm: member + RLS · ห้ามใช้ admin service-role กับข้อมูล per-org
import "server-only";

import { notFound } from "next/navigation";
import {
  getModuleRoleForCurrentUser,
  getOrganizationsForCurrentUser,
} from "@/lib/accounting/queries";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { canSeeSensitive, canWriteP2pGroup, type P2pGroupRole } from "@/lib/p2p-group/types";

export interface P2pGroupPageContext {
  orgId: string;
  orgSlug: string;
  role: P2pGroupRole;
  /** owner|manager เขียนได้ · viewer อ่านอย่างเดียว */
  canWrite: boolean;
  /** owner|manager เห็นกำไร/เงินลงทุน/เงินกู้/เงินสด (contract §4) */
  canSeeMoney: boolean;
  rls: SupabaseClient;
}

/**
 * Guard หน้า p2p-group — เรียกบนสุดของทุก server page ใต้ [orgSlug]/p2p-group
 * ไม่ใช่สมาชิก/ไม่พบ org → notFound()
 */
export async function requireP2pGroupPage(orgSlug: string): Promise<P2pGroupPageContext> {
  const orgs = await getOrganizationsForCurrentUser();
  const org = orgs.find((o) => o.slug === orgSlug);
  if (!org) notFound();

  const role = (await getModuleRoleForCurrentUser(org.id, "p2p_group")) as P2pGroupRole | null;
  if (!role) notFound();

  const rls = await createSupabaseServerClient();
  return {
    orgId: org.id,
    orgSlug,
    role,
    canWrite: canWriteP2pGroup(role),
    canSeeMoney: canSeeSensitive(role),
    rls,
  };
}

/**
 * หน้าที่มีแต่ตัวเลขอ่อนไหว (เงินลงทุน/ระหว่างกัน/ธนาคาร/งบรวม) — viewer เข้าไม่ได้เลย
 * ใช้แทน requireP2pGroupPage ในหน้าเหล่านั้น
 */
export async function requireP2pGroupMoneyPage(orgSlug: string): Promise<P2pGroupPageContext> {
  const ctx = await requireP2pGroupPage(orgSlug);
  if (!ctx.canSeeMoney) notFound();
  return ctx;
}
