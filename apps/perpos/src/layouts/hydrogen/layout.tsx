import React from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import Header from "./header";
import Sidebar from "./sidebar";
import Link from "next/link";
import { Breadcrumb } from "@/components/ui/breadcrumb";
import StickyFooter from "@/layouts/sticky-footer";
import { ModuleProvider } from "@/app/shared/module-provider";
import { ALL_MODULES } from "@/lib/modules";
import {
  getOrganizationsForCurrentUser,
  getActiveOrganizationId,
  getEnabledModulesForOrg,
} from "@/lib/accounting/queries";

export default async function HydrogenLayout({ children }: { children: React.ReactNode }) {
  const [activeOrgId, orgs] = await Promise.all([
    getActiveOrganizationId(),
    getOrganizationsForCurrentUser(),
  ]);
  const activeOrg    = orgs.find((o) => o.id === activeOrgId);
  const enabledKeys  = await getEnabledModulesForOrg(activeOrgId, activeOrg?.role ?? null);

  // ── Server-side module access guard ─────────────────────────────────────────
  // Read the pathname forwarded by middleware (x-pathname header).
  // If the current route belongs to a module the active org hasn't enabled,
  // redirect immediately — no flash, no client-side delay.
  const headersList = await headers();
  const pathname    = headersList.get("x-pathname") ?? "/";

  // Skip guard for root (handled by page.tsx) and /admin/* (role-guarded separately)
  if (pathname !== "/" && !pathname.startsWith("/admin")) {
    const currentModule = ALL_MODULES.find((m) => m.match(pathname));
    if (currentModule && !enabledKeys.includes(currentModule.key)) {
      const firstEnabled = ALL_MODULES.find((m) => enabledKeys.includes(m.key));
      redirect(firstEnabled?.href ?? "/no-module");
    }
  }

  return (
    <ModuleProvider enabledKeys={enabledKeys}>
    <main className="flex min-h-screen flex-grow">
      <Sidebar className="fixed hidden xl:block dark:bg-gray-50" />
      <div className="flex w-full flex-col xl:ms-[270px] xl:w-[calc(100%-270px)] 2xl:ms-72 2xl:w-[calc(100%-288px)]">
        <Header enabledModuleKeys={enabledKeys} />
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
