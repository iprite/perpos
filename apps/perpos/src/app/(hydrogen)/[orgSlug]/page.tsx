import { notFound, redirect } from "next/navigation";
import {
  getOrganizationsForCurrentUser,
  getEnabledModulesForOrg,
} from "@/lib/accounting/queries";
import { ALL_MODULES } from "@/lib/modules";

export const dynamic = "force-dynamic";

export default async function OrgSlugPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug } = await params;
  const orgs = await getOrganizationsForCurrentUser();
  const org = orgs.find((o) => o.slug === orgSlug);

  if (!org) notFound();

  const enabledKeys = await getEnabledModulesForOrg(org.id, org.role);
  const firstModule = ALL_MODULES.find((m) => enabledKeys.includes(m.key));

  if (!firstModule) redirect("/no-org");

  redirect(`/${orgSlug}${firstModule.href}`);
}
