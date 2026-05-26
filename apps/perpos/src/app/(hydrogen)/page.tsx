import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  getActiveOrganizationId,
  getOrganizationsForCurrentUser,
  getEnabledModulesForOrg,
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
  const enabledKeys = await getEnabledModulesForOrg(activeOrg.id, activeOrg.role ?? null);
  const firstModule = ALL_MODULES.find((m) => enabledKeys.includes(m.key));

  // No accessible module → super_admin falls back to admin console
  if (!firstModule) {
    if (isSuperAdmin) redirect("/admin");
    redirect("/no-org");
  }

  // Redirect to /:orgSlug/:module/:defaultMenu
  const orgSlug = activeOrg.slug ?? activeOrg.id;
  redirect(`/${orgSlug}${firstModule.href}`);
}
