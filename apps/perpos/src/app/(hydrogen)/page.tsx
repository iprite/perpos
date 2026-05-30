import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  getActiveOrganizationId,
  getOrganizationsForCurrentUser,
  getEnabledModulesForOrg,
  getActiveModuleKey,
} from "@/lib/accounting/queries";
import { ALL_MODULES } from "@/lib/modules";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect("/signin");

  // Admin → admin console
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  const isSuperAdmin = profile?.role === "super_admin";

  // Everyone → first enabled module for active org
  const [activeOrgId, orgs] = await Promise.all([
    getActiveOrganizationId(),
    getOrganizationsForCurrentUser(),
  ]);

  // No org membership → super_admin goes to admin console, others to no-org
  if (orgs.length === 0) {
    if (isSuperAdmin) redirect("/admin");
    redirect("/no-org");
  }

  const activeOrg = orgs.find((o) => o.id === activeOrgId) ?? orgs[0];
  const orgSlug = activeOrg.slug ?? activeOrg.id;
  const enabledKeys = await getEnabledModulesForOrg(activeOrg.id, activeOrg.role ?? null);

  // No accessible module → super_admin falls back to admin console
  if (!ALL_MODULES.some((m) => enabledKeys.includes(m.key))) {
    if (isSuperAdmin) redirect("/admin");
    redirect("/no-org");
  }

  // Restore last-active module for this org, fall back to first enabled
  const savedModuleKey = await getActiveModuleKey(orgSlug, enabledKeys);
  const targetModule = (savedModuleKey ? ALL_MODULES.find((m) => m.key === savedModuleKey) : null)
    ?? ALL_MODULES.find((m) => enabledKeys.includes(m.key));

  if (!targetModule) {
    if (isSuperAdmin) redirect("/admin");
    redirect("/no-org");
  }

  redirect(`/${orgSlug}${targetModule.href}`);
}
