import React from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import Header from "./header";
import Sidebar from "./sidebar";
import Link from "next/link";
import { ImpersonationBanner } from "@/components/impersonation-banner";
import { Breadcrumb } from "@/components/ui/breadcrumb";
import StickyFooter from "@/layouts/sticky-footer";
import { ModuleProvider } from "@/app/shared/module-provider";
import { ALL_MODULES } from "@/lib/modules";
import {
  getOrganizationsForCurrentUser,
  getActiveOrganizationId,
  getEnabledModulesForOrg,
  getModuleRoleForCurrentUser,
  getModuleMenuLabels,
  getPersonalModulesForUser,
  getCurrentUserId,
} from "@/lib/accounting/queries";

// Path segments that are NOT org slugs
const SYSTEM_SEGMENTS = new Set(["admin", "user", "signin", "no-org"]);

export default async function HydrogenLayout({ children }: { children: React.ReactNode }) {
  const headersList = await headers();
  const pathname    = headersList.get("x-pathname") ?? "/";
  const segments    = pathname.split("/").filter(Boolean);

  // Determine the active org:
  // - If path is /:orgSlug/... → use slug lookup
  // - For /admin, /user, etc.  → fall back to cookie-based active org
  const orgs            = await getOrganizationsForCurrentUser();
  const firstSegment    = segments[0] ?? "";
  const isOrgRoute      = firstSegment.length > 0 && !SYSTEM_SEGMENTS.has(firstSegment);
  const orgSlugFromUrl  = isOrgRoute ? firstSegment : null;

  let activeOrg = orgSlugFromUrl
    ? orgs.find((o) => o.slug === orgSlugFromUrl)
    : (() => {
        // For non-org routes (admin, user) fall back to cookie-based active org
        return undefined; // enabledKeys not needed for admin/user routes
      })();

  // Fallback: if org slug in URL doesn't match any membership, keep activeOrg undefined.
  // The [orgSlug]/layout.tsx will handle notFound() for invalid slugs.

  // For non-org routes, fetch module keys using cookie-based active org (sidebar org switcher)
  if (!activeOrg && !isOrgRoute) {
    const cookieOrgId = await getActiveOrganizationId();
    activeOrg = orgs.find((o) => o.id === cookieOrgId);
  }

  const [orgModuleKeys, currentUserId] = await Promise.all([
    getEnabledModulesForOrg(activeOrg?.id ?? null, activeOrg?.role ?? null),
    getCurrentUserId(),
  ]);
  const personalKeys = await getPersonalModulesForUser(currentUserId);
  // Merge: personal modules are always visible regardless of org context
  const enabledKeys  = Array.from(new Set([...orgModuleKeys, ...personalKeys]));
  const menuLabels   = await getModuleMenuLabels(enabledKeys);

  // ── Server-side module access guard ─────────────────────────────────────────
  // Only enforce for org routes where a module segment is present.
  if (isOrgRoute && segments.length >= 2) {
    const currentModule = ALL_MODULES.find((m) => m.match(pathname));
    if (currentModule && !enabledKeys.includes(currentModule.key)) {
      const firstEnabled = ALL_MODULES.find((m) => enabledKeys.includes(m.key));
      const orgSlug      = activeOrg?.slug ?? orgSlugFromUrl ?? "";
      redirect(orgSlug && firstEnabled ? `/${orgSlug}${firstEnabled.href}` : "/");
    }
  }

  // ── Module-level role override ───────────────────────────────────────────────
  // For modules that use per-module roles (module_members table), use the
  // module role instead of the org-level role so sidebar gating is correct.
  let effectiveOrgRole: string | null = activeOrg?.role ?? null;
  if (isOrgRoute && segments[1] === "just-me" && activeOrg?.id) {
    const moduleRole = await getModuleRoleForCurrentUser(activeOrg.id, "just_me");
    if (moduleRole) effectiveOrgRole = moduleRole;
  }

  return (
    <ModuleProvider enabledKeys={enabledKeys} orgSlug={activeOrg?.slug ?? orgSlugFromUrl ?? ""} orgRole={effectiveOrgRole} menuLabels={menuLabels}>
      <main className="flex min-h-screen flex-grow">
        <Sidebar className="fixed hidden xl:block dark:bg-gray-50" />
        <div className="flex w-full flex-col xl:ms-[270px] xl:w-[calc(100%-270px)] 2xl:ms-72 2xl:w-[calc(100%-288px)] pt-[var(--impersonation-banner-height,0px)]">
          <Header enabledModuleKeys={enabledKeys} />
          <ImpersonationBanner />
          <div className="flex flex-grow flex-col px-4 pb-6 pt-2 md:px-5 lg:px-6 lg:pb-8 3xl:px-8 3xl:pt-4 4xl:px-10 4xl:pb-9">
            <Breadcrumb />
            {children}
          </div>
          <StickyFooter className="px-4 py-5 text-sm text-gray-600 md:px-5 lg:px-6 3xl:px-8 4xl:px-10">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="text-center sm:text-left">© 2026 P2P Solutions. All Rights Reserved.</div>
              <div className="hidden sm:flex flex-wrap gap-x-4 gap-y-2">
                <Link href="/privacy" className="hover:text-gray-900">
                  นโยบายความเป็นส่วนตัว
                </Link>
                <Link href="/terms" className="hover:text-gray-900">
                  ข้อกำหนดการให้บริการ
                </Link>
              </div>
            </div>
          </StickyFooter>
        </div>
      </main>
    </ModuleProvider>
  );
}
