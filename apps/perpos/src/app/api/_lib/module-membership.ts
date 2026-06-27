/**
 * Keep `module_members` in sync with `organization_members`.
 *
 * Why: the sidebar menu + page/API guards diverge —
 *   - menu visibility = org role + org_module_settings.allowed_roles
 *   - actual access (requireModuleMember / getModuleRoleForCurrentUser) = module_members row
 * A user added to an org (organization_members) without a matching module_members
 * row sees the module in their menu, enters the org area, then gets hard-bounced
 * (page guard returns null → redirect("/")). Calling these helpers whenever an
 * org membership changes keeps the two layers consistent.
 */

import type { createAdminClient } from "./supabase";

type Admin = ReturnType<typeof createAdminClient>;

/**
 * Grant/refresh module access for every enabled module whose allowed_roles
 * includes `role`, and revoke (deactivate) module rows the new role can no
 * longer access. module_role mirrors the org role.
 */
export async function syncModuleMembersForOrgRole(
  admin: Admin,
  userId: string,
  orgId: string,
  role: string,
): Promise<void> {
  const { data: settings } = await admin
    .from("org_module_settings")
    .select("module_key, is_enabled, allowed_roles")
    .eq("organization_id", orgId);

  const allowedKeys = (settings ?? [])
    .filter(
      (s: Record<string, unknown>) =>
        s.is_enabled === true &&
        Array.isArray(s.allowed_roles) &&
        (s.allowed_roles as string[]).includes(role),
    )
    .map((s: Record<string, unknown>) => String(s.module_key));

  // Grant / refresh access for allowed modules
  if (allowedKeys.length > 0) {
    await admin.from("module_members").upsert(
      allowedKeys.map((module_key) => ({
        org_id: orgId,
        module_key,
        user_id: userId,
        module_role: role,
        is_active: true,
      })),
      { onConflict: "org_id,module_key,user_id" },
    );
  }

  // Revoke modules the new role can no longer access
  const { data: existing } = await admin
    .from("module_members")
    .select("module_key")
    .eq("org_id", orgId)
    .eq("user_id", userId)
    .eq("is_active", true);

  const toRevoke = (existing ?? [])
    .map((m: Record<string, unknown>) => String(m.module_key))
    .filter((k) => !allowedKeys.includes(k));

  if (toRevoke.length > 0) {
    await admin
      .from("module_members")
      .update({ is_active: false })
      .eq("org_id", orgId)
      .eq("user_id", userId)
      .in("module_key", toRevoke);
  }
}

/** Deactivate all module access when an org member is removed. */
export async function deactivateModuleMembersForOrg(
  admin: Admin,
  userId: string,
  orgId: string,
): Promise<void> {
  await admin
    .from("module_members")
    .update({ is_active: false })
    .eq("org_id", orgId)
    .eq("user_id", userId);
}
