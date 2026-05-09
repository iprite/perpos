import { cookies } from "next/headers";

import { createSupabaseServerClient } from "@/lib/supabase/server";

export type OrganizationSummary = {
  id: string;
  name: string;
  role: "owner" | "admin" | "member";
};

export async function getOrganizationsForCurrentUser(): Promise<OrganizationSummary[]> {
  const supabase = await createSupabaseServerClient();
  const { data: userRes, error: userErr } = await supabase.auth.getUser();
  if (userErr || !userRes.user) return [];

  const uid = userRes.user.id;
  const { data: memberships, error: memErr } = await supabase
    .from("organization_members")
    .select("organization_id,role")
    .eq("user_id", uid);
  if (memErr || !memberships?.length) return [];

  const orgIds = Array.from(new Set(memberships.map((m: any) => String(m.organization_id))));
  const { data: orgs, error: orgErr } = await supabase.from("organizations").select("id,name").in("id", orgIds);
  if (orgErr || !orgs?.length) return [];

  const roleByOrg = new Map<string, OrganizationSummary["role"]>();
  for (const m of memberships as any[]) {
    roleByOrg.set(String(m.organization_id), String(m.role) as OrganizationSummary["role"]);
  }

  return (orgs as any[])
    .map((o) => ({ id: String(o.id), name: String(o.name), role: roleByOrg.get(String(o.id)) ?? "member" }))
    .sort((a, b) => a.name.localeCompare(b.name, "th"));
}

export async function getActiveOrganizationId(): Promise<string | null> {
  const cookieStore = await cookies();
  const preferred = cookieStore.get("perpos.activeOrgId")?.value ?? null;

  const orgs = await getOrganizationsForCurrentUser();
  if (!orgs.length) return null;
  if (preferred && orgs.some((o) => o.id === preferred)) return preferred;
  return orgs[0].id;
}
