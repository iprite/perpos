import { cache } from "react";
import { cookies } from "next/headers";

import { createSupabaseServerClient } from "@/lib/supabase/server";

export type OrganizationSummary = {
  id: string;
  name: string;
  role: "owner" | "admin" | "team_lead" | "team_member";
};

export const getOrganizationsForCurrentUser = cache(async function getOrganizationsForCurrentUser(): Promise<OrganizationSummary[]> {
  // Use user-level client only for auth (to get the current user's UID)
  const supabase = await createSupabaseServerClient();
  const { data: userRes, error: userErr } = await supabase.auth.getUser();
  if (userErr || !userRes.user) return [];

  const uid = userRes.user.id;

  // Use admin client to bypass RLS — membership/org data is scoped by uid below
  const { createSupabaseAdminClient } = await import("@/lib/supabase/admin");
  const adminClient = createSupabaseAdminClient();

  const { data: memberships, error: memErr } = await adminClient
    .from("organization_members")
    .select("organization_id,role")
    .eq("user_id", uid);
  if (memErr || !memberships?.length) return [];

  const orgIds = Array.from(new Set(memberships.map((m: any) => String(m.organization_id))));
  const { data: orgs, error: orgErr } = await adminClient.from("organizations").select("id,name").in("id", orgIds);
  if (orgErr || !orgs?.length) return [];

  const roleByOrg = new Map<string, OrganizationSummary["role"]>();
  for (const m of memberships as any[]) {
    roleByOrg.set(String(m.organization_id), String(m.role) as OrganizationSummary["role"]);
  }

  return (orgs as any[])
    .map((o) => ({ id: String(o.id), name: String(o.name), role: roleByOrg.get(String(o.id)) ?? "team_member" }))
    .sort((a, b) => a.name.localeCompare(b.name, "th"));
});

export const getActiveOrganizationId = cache(async function getActiveOrganizationId(): Promise<string | null> {
  const cookieStore = await cookies();
  const preferred = cookieStore.get("perpos.activeOrgId")?.value ?? null;

  const orgs = await getOrganizationsForCurrentUser();
  if (!orgs.length) return null;
  if (preferred && orgs.some((o) => o.id === preferred)) return preferred;
  return orgs[0].id;
});

export async function getEnabledModulesForOrg(
  orgId: string | null,
  memberRole: "owner" | "admin" | "team_lead" | "team_member" | null,
): Promise<string[]> {
  if (!orgId) return [];
  // Use admin client to bypass RLS — this function is server-only and
  // the orgId + memberRole parameters already scope the result correctly.
  const { createSupabaseAdminClient } = await import("@/lib/supabase/admin");
  const supabase = createSupabaseAdminClient();
  const { data } = await supabase
    .from("org_module_settings")
    .select("module_key,is_enabled,allowed_roles")
    .eq("organization_id", orgId);

  // ถ้ายังไม่มีการตั้งค่า module ใน org นี้ ไม่ return all เพราะจะทำให้เห็น module ที่ไม่ได้เปิดไว้
  if (!data?.length) return [];

  return (data as any[])
    .filter((row) => {
      if (!row.is_enabled) return false;
      if (!memberRole) return true;
      return (row.allowed_roles as string[]).includes(memberRole);
    })
    .map((row) => row.module_key as string);
}
