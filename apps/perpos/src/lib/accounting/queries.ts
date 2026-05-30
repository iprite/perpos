import { cookies } from "next/headers";

import { createSupabaseServerClient } from "@/lib/supabase/server";

export type OrganizationSummary = {
  id: string;
  name: string;
  slug: string;
  role: "owner" | "admin" | "team_lead" | "team_member";
};

// NOTE: ไม่ใช้ React cache() เพื่อป้องกัน cross-request cache pollution
// เมื่อ test หลาย account — Next.js จะ deduplicate ได้เองภายใน render tree
// เดียวกันผ่าน concurrent request coalescing
export async function getOrganizationsForCurrentUser(): Promise<OrganizationSummary[]> {
  // Use user-level client only for auth (to get the current user's UID)
  const supabase = await createSupabaseServerClient();
  const { data: userRes, error: userErr } = await supabase.auth.getUser();
  if (userErr || !userRes.user) return [];

  const uid = userRes.user.id;

  // Use admin client to bypass RLS
  const { createSupabaseAdminClient } = await import("@/lib/supabase/admin");
  const adminClient = createSupabaseAdminClient();

  // Check if user is a system admin — admins can see ALL organizations
  const { data: profile } = await adminClient
    .from("profiles")
    .select("role")
    .eq("id", uid)
    .maybeSingle();

  if (profile?.role === "super_admin") {
    const { data: allOrgs, error: orgsErr } = await adminClient
      .from("organizations")
      .select("id,name,slug")
      .order("name");
    if (orgsErr || !allOrgs?.length) return [];
    return (allOrgs as any[]).map((o) => ({
      id:   String(o.id),
      name: String(o.name),
      slug: String(o.slug ?? o.id),
      role: "admin" as OrganizationSummary["role"],
    }));
  }

  // Regular users — only orgs they are a member of
  const { data: memberships, error: memErr } = await adminClient
    .from("organization_members")
    .select("organization_id,role")
    .eq("user_id", uid);
  if (memErr || !memberships?.length) return [];

  const orgIds = Array.from(new Set(memberships.map((m: any) => String(m.organization_id))));
  const { data: orgs, error: orgErr } = await adminClient.from("organizations").select("id,name,slug").in("id", orgIds);
  if (orgErr || !orgs?.length) return [];

  const roleByOrg = new Map<string, OrganizationSummary["role"]>();
  for (const m of memberships as any[]) {
    roleByOrg.set(String(m.organization_id), String(m.role) as OrganizationSummary["role"]);
  }

  return (orgs as any[])
    .map((o) => ({
      id:   String(o.id),
      name: String(o.name),
      slug: String(o.slug ?? o.id),
      role: roleByOrg.get(String(o.id)) ?? "team_member",
    }))
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

/**
 * Fetch a user's role inside a specific module (module_members.module_role).
 * Super-admins always get "owner". Returns null if not a member.
 */
export async function getModuleRoleForCurrentUser(
  orgId: string,
  moduleKey: string,
): Promise<string | null> {
  const supabase = await createSupabaseServerClient();
  const { data: userRes } = await supabase.auth.getUser();
  if (!userRes.user) return null;

  const { createSupabaseAdminClient } = await import("@/lib/supabase/admin");
  const admin = createSupabaseAdminClient();

  // Super-admins bypass module membership
  const { data: profile } = await admin
    .from("profiles")
    .select("role")
    .eq("id", userRes.user.id)
    .maybeSingle();
  if ((profile as any)?.role === "super_admin") return "owner";

  const { data: member } = await admin
    .from("module_members")
    .select("module_role")
    .eq("org_id", orgId)
    .eq("module_key", moduleKey)
    .eq("user_id", userRes.user.id)
    .eq("is_active", true)
    .maybeSingle();

  return (member as any)?.module_role ?? null;
}

/** Fetch menu_labels for the given module keys from module_registry.
 *  Returns: { moduleKey: { menuKey: customLabel } } — only keys with non-empty labels. */
export async function getModuleMenuLabels(
  moduleKeys: string[],
): Promise<Record<string, Record<string, string>>> {
  if (!moduleKeys.length) return {};
  const { createSupabaseAdminClient } = await import("@/lib/supabase/admin");
  const supabase = createSupabaseAdminClient();
  const { data } = await supabase
    .from("module_registry")
    .select("key, menu_labels")
    .in("key", moduleKeys);

  if (!data?.length) return {};
  const result: Record<string, Record<string, string>> = {};
  for (const row of data as { key: string; menu_labels: Record<string, string> | null }[]) {
    const labels = row.menu_labels ?? {};
    const filtered = Object.fromEntries(Object.entries(labels).filter(([, v]) => v && v.trim()));
    if (Object.keys(filtered).length) result[row.key] = filtered;
  }
  return result;
}

/** Returns the current authenticated user's ID, or null if not signed in. Server-only. */
export async function getCurrentUserId(): Promise<string | null> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getUser();
  return data.user?.id ?? null;
}

/** Returns personal module keys for a user — only if grant is_enabled AND user has LINE connected. */
export async function getPersonalModulesForUser(userId: string | null): Promise<string[]> {
  if (!userId) return [];
  const { createSupabaseAdminClient } = await import("@/lib/supabase/admin");
  const supabase = createSupabaseAdminClient();

  // Check LINE connection first
  const { data: profile } = await supabase
    .from("profiles")
    .select("line_user_id")
    .eq("id", userId)
    .maybeSingle();

  if (!(profile as Record<string, unknown> | null)?.line_user_id) return [];

  // Fetch enabled personal grants
  const { data: grants } = await supabase
    .from("personal_module_grants")
    .select("module_key")
    .eq("user_id", userId)
    .eq("is_enabled", true);

  return (grants ?? []).map((g) => (g as Record<string, string>).module_key);
}

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
