import { notFound } from "next/navigation";
import { getOrganizationsForCurrentUser } from "@/lib/accounting/queries";

/**
 * Validates that the current user is a member of the org identified by [orgSlug].
 * The parent HydrogenLayout handles sidebar/module rendering; this layout
 * just gates access so unknown/unauthorised org slugs return 404.
 */
export default async function OrgSlugLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug } = await params;
  const orgs = await getOrganizationsForCurrentUser();
  const org  = orgs.find((o) => o.slug === orgSlug);

  if (!org) {
    // User is not a member of this org (or slug doesn't exist)
    notFound();
  }

  return <>{children}</>;
}
