import React from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import Sidebar from "./sidebar";
import { ContextToggle } from "./sidebar-footer";
import HamburgerButton from "@/layouts/hamburger-button";
import ProfileMenu from "@/layouts/profile-menu";
import { ImpersonationBanner } from "@/components/impersonation-banner";
import { AnnouncementBanner } from "@/components/announcement-banner";
import { Breadcrumb } from "@/components/ui/breadcrumb";
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
const SYSTEM_SEGMENTS = new Set(["admin", "user", "signin", "no-org", "assistant"]);

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
        <Sidebar
          className="fixed hidden xl:flex dark:bg-gray-50"
          organizations={orgs}
          activeOrganizationId={activeOrg?.id ?? null}
        />
        <div className="flex w-full flex-col xl:ms-[270px] xl:w-[calc(100%-270px)] 2xl:ms-72 2xl:w-[calc(100%-288px)] pt-[var(--impersonation-banner-height,0px)]">
          <ImpersonationBanner />
          <AnnouncementBanner />
          {/* Mobile header — สูงแค่พอดีปุ่ม hamburger, sticky ติดบนเมื่อ scroll (เฉพาะจอเล็ก) */}
          <header className="sticky top-[var(--impersonation-banner-height,0px)] z-40 flex h-12 items-center border-b border-gray-100 bg-white/95 px-3 backdrop-blur supports-[backdrop-filter]:bg-white/80 xl:hidden dark:border-gray-200/10 dark:bg-gray-50/95">
            <HamburgerButton
              className="me-0 sm:me-0"
              view={
                <Sidebar
                  className="static h-full w-full 2xl:w-full"
                  organizations={orgs}
                  activeOrganizationId={activeOrg?.id ?? null}
                />
              }
            />
            {/* toggle สลับ Ai ERP / ผู้ช่วย AI + ปุ่ม avatar ผู้ใช้ — ชิดขวา */}
            <div className="ms-auto flex items-center gap-2">
              <ContextToggle
                organizations={orgs}
                activeOrganizationId={activeOrg?.id ?? null}
              />
              {/* ปุ่ม avatar — เปิด profile menu ลงด้านล่าง */}
              <ProfileMenu variant="icon" />
            </div>
          </header>
          <div className="flex flex-grow flex-col px-4 pb-6 pt-3 md:px-5 lg:px-6 lg:pb-8 xl:pt-2 3xl:px-8 3xl:pt-4 4xl:px-10 4xl:pb-9">
            <Breadcrumb />
            {children}
          </div>
        </div>
      </main>
    </ModuleProvider>
  );
}
