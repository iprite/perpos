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
  const activeOrg = orgs.find((o) => o.id === activeOrgId);
  const enabledKeys = await getEnabledModulesForOrg(activeOrgId, activeOrg?.role ?? null);
  const firstModule = ALL_MODULES.find((m) => enabledKeys.includes(m.key));

  // Admin with no org/modules → admin console; otherwise go to first module
  redirect(firstModule?.href ?? (isAdmin ? "/admin" : "/executive-dashboard"));
}
