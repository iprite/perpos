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

  const isAdmin = profile?.role === "admin";

  // Everyone → first enabled module for active org
  const [activeOrgId, orgs] = await Promise.all([
    getActiveOrganizationId(),
    getOrganizationsForCurrentUser(),
  ]);

  // No org membership at all
  if (!isAdmin && orgs.length === 0) redirect("/no-org");

  const activeOrg = orgs.find((o) => o.id === activeOrgId);
  const enabledKeys = await getEnabledModulesForOrg(activeOrgId, activeOrg?.role ?? null);
  const firstModule = ALL_MODULES.find((m) => enabledKeys.includes(m.key));

  // Admin → admin console if no module found
  if (isAdmin && !firstModule) redirect("/admin");

  // Regular user with no accessible module
  if (!firstModule) redirect("/no-module");

  // Redirect to /:orgSlug/:module/:defaultMenu
  const orgSlug = activeOrg?.slug ?? activeOrgId ?? "";
  redirect(`/${orgSlug}${firstModule.href}`);
}
