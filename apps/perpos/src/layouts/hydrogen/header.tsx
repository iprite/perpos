import Link from "next/link";
import HamburgerButton from "@/layouts/hamburger-button";
import Sidebar from "@/layouts/hydrogen/sidebar";
import Logo from "@core/components/logo";
import HeaderMenuRight from "@/layouts/header-menu-right";
import StickyHeader from "@/layouts/sticky-header";
import { OrgSwitcher } from "@/components/accounting/org-switcher";
import { ModuleSwitcher } from "@/components/module-switcher";
import {
  getOrganizationsForCurrentUser,
  getActiveOrganizationId,
  getEnabledModulesForOrg,
} from "@/lib/accounting/queries";

export default async function Header() {
  const organizations        = await getOrganizationsForCurrentUser();
  const activeOrganizationId = await getActiveOrganizationId();
  const activeOrg            = organizations.find((o) => o.id === activeOrganizationId);
  const enabledModuleKeys    = await getEnabledModulesForOrg(
    activeOrganizationId,
    activeOrg?.role ?? null,
  );

  return (
    <StickyHeader className="z-[990] 2xl:py-5 3xl:px-8 4xl:px-10">
      <div className="flex shrink-0 items-center">
        <HamburgerButton view={<Sidebar className="static w-full 2xl:w-full" />} />
        <Link
          href={"/"}
          aria-label="Site Logo"
          className="me-4 w-9 shrink-0 text-gray-800 hover:text-gray-900 lg:me-5 xl:hidden"
        >
          <Logo iconOnly={true} />
        </Link>
      </div>

      <div className="flex-1" />
      <div className="mx-2 flex items-center gap-3 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:mx-4">
        <div className="shrink-0">
          <ModuleSwitcher enabledModuleKeys={enabledModuleKeys} />
        </div>
        <div className="shrink-0">
          <OrgSwitcher organizations={organizations} activeOrganizationId={activeOrganizationId} />
        </div>
      </div>

      <HeaderMenuRight />
    </StickyHeader>
  );
}
