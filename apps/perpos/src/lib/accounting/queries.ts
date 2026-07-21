import { cache } from "react";
import { cookies } from "next/headers";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getAuthUser } from "@/lib/supabase/auth-user";

export type OrganizationSummary = {
  id: string;
  name: string;
  slug: string;
  role: "owner" | "admin" | "team_lead" | "team_member";
};

// cache() = dedupe ต่อ request (scope ต่อ render pass, ไม่ leak ข้าม request) —
// HydrogenLayout เรียกฟังก์ชันนี้ 2 รอบ (ตรง ๆ + ผ่าน getActiveOrganizationId) → query ซ้ำ
export const getOrganizationsForCurrentUser = cache(async (): Promise<OrganizationSummary[]> => {
  // getAuthUser() = getUser() ที่ dedupe ต่อ request เช่นกัน
  const user = await getAuthUser();
  if (!user) return [];

  const uid = user.id;

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
    // ตัด personal "home org" (ที่ provisionLineUser สร้างให้ผู้ใช้ทุกคนตอนแอด LINE)
    // ออกจาก switcher — super_admin ควรเห็นเฉพาะองค์กรธุรกิจจริง (B2B) ไม่ใช่พื้นที่ส่วนตัวของทุกคน
    const { data: personalRows } = await adminClient
      .from("profiles")
      .select("personal_org_id")
      .not("personal_org_id", "is", null);
    const personalOrgIds = new Set((personalRows ?? []).map((r: any) => String(r.personal_org_id)));

    const { data: allOrgs, error: orgsErr } = await adminClient
      .from("organizations")
      .select("id,name,slug")
      .order("name");
    if (orgsErr || !allOrgs?.length) return [];
    return (allOrgs as any[])
      .filter((o) => !personalOrgIds.has(String(o.id)))
      .map((o) => ({
        id: String(o.id),
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
  const { data: orgs, error: orgErr } = await adminClient
    .from("organizations")
    .select("id,name,slug")
    .in("id", orgIds);
  if (orgErr || !orgs?.length) return [];

  const roleByOrg = new Map<string, OrganizationSummary["role"]>();
  for (const m of memberships as any[]) {
    roleByOrg.set(String(m.organization_id), String(m.role) as OrganizationSummary["role"]);
  }

  return (orgs as any[])
    .map((o) => ({
      id: String(o.id),
      name: String(o.name),
      slug: String(o.slug ?? o.id),
      role: roleByOrg.get(String(o.id)) ?? "team_member",
    }))
    .sort((a, b) => a.name.localeCompare(b.name, "th"));
});

export async function getActiveOrganizationId(): Promise<string | null> {
  const cookieStore = await cookies();
  const preferred = cookieStore.get("perpos.activeOrgId")?.value ?? null;

  const orgs = await getOrganizationsForCurrentUser();
  if (!orgs.length) return null;
  if (preferred && orgs.some((o) => o.id === preferred)) return preferred;
  return orgs[0].id;
}

/** Read the last-active module key for a given org slug from the cookie.
 *  Returns null if no cookie is found or not in enabledKeys. */
export async function getActiveModuleKey(
  orgSlug: string,
  enabledKeys: string[],
): Promise<string | null> {
  const cookieStore = await cookies();
  const saved = cookieStore.get(`perpos.activeModule.${orgSlug}`)?.value ?? null;
  if (saved && enabledKeys.includes(saved)) return saved;
  return null;
}

/**
 * Fetch a user's role inside a specific module (module_members.module_role).
 * Super-admins always get "owner". Returns null if not a member.
 */
export async function getModuleRoleForCurrentUser(
  orgId: string,
  moduleKey: string,
): Promise<string | null> {
  const user = await getAuthUser();
  if (!user) return null;

  const { createSupabaseAdminClient } = await import("@/lib/supabase/admin");
  const admin = createSupabaseAdminClient();

  // Super-admins bypass module membership
  const { data: profile } = await admin
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  if ((profile as any)?.role === "super_admin") return "owner";

  const { data: member } = await admin
    .from("module_members")
    .select("module_role")
    .eq("org_id", orgId)
    .eq("module_key", moduleKey)
    .eq("user_id", user.id)
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
  return (await getAuthUser())?.id ?? null;
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
  const { createSupabaseAdminClient } = await import("@/lib/supabase/admin");
  const { ALL_MODULES } = await import("@/lib/modules");
  const supabase = createSupabaseAdminClient();

  // Fetch org slug alongside module settings — needed to enforce forOrgSlugs
  const [{ data: orgData }, { data }] = await Promise.all([
    supabase.from("organizations").select("slug").eq("id", orgId).single(),
    supabase
      .from("org_module_settings")
      .select("module_key,is_enabled,allowed_roles")
      .eq("organization_id", orgId),
  ]);

  if (!data?.length) return [];

  const orgSlug = (orgData as { slug: string } | null)?.slug ?? "";

  return (data as any[])
    .filter((row) => {
      if (!row.is_enabled) return false;
      if (memberRole && !(row.allowed_roles as string[]).includes(memberRole)) return false;
      // Guard: specific modules with forOrgSlugs must match this org's slug.
      // This prevents a module from being served to a wrong org even if DB has stale data.
      const def = ALL_MODULES.find((m) => m.key === row.module_key);
      if (def?.forOrgSlugs && !def.forOrgSlugs.includes(orgSlug)) return false;
      return true;
    })
    .map((row) => row.module_key as string);
}

/** true ถ้าผู้ใช้ปัจจุบันเป็น super_admin (profiles.role) — ใช้ปลดด่านสิทธิ์ตาม AGENTS.md */
export async function isSuperAdminUser(): Promise<boolean> {
  const user = await getAuthUser();
  if (!user) return false;
  const { createSupabaseAdminClient } = await import("@/lib/supabase/admin");
  const admin = createSupabaseAdminClient();
  const { data } = await admin.from("profiles").select("role").eq("id", user.id).maybeSingle();
  return (data as { role?: string } | null)?.role === "super_admin";
}
