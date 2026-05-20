import Link from "next/link";
import HamburgerButton from "@/layouts/hamburger-button";
import Sidebar from "@/layouts/hydrogen/sidebar";
import Logo from "@core/components/logo";
import HeaderMenuRight from "@/layouts/header-menu-right";
import StickyHeader from "@/layouts/sticky-header";
import { HeaderCenter } from "@/layouts/hydrogen/header-center";
import {
  getOrganizationsForCurrentUser,
  getActiveOrganizationId,
  getEnabledModulesForOrg,
} from "@/lib/accounting/queries";

// Custom ERP orgs — these orgs have their own module system and don't need the Module Switcher
const CUSTOM_ERP_ORG_IDS = new Set([
  '1f52618c-09c4-49c5-a929-ea5060f26e7d', // TMC Management
]);

export default async function Header() {
  const organizations        = await getOrganizationsForCurrentUser();
  const activeOrganizationId = await getActiveOrganizationId();
  const activeOrg            = organizations.find((o) => o.id === activeOrganizationId);
  const isCustomErpOrg       = activeOrganizationId ? CUSTOM_ERP_ORG_IDS.has(activeOrganizationId) : false;
  const enabledModuleKeys    = isCustomErpOrg
    ? []
    : await getEnabledModulesForOrg(activeOrganizationId, activeOrg?.role ?? null);

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
      <HeaderCenter
        enabledModuleKeys={enabledModuleKeys}
        organizations={organizations}
        activeOrganizationId={activeOrganizationId}
        isCustomErpOrg={isCustomErpOrg}
      />
      <HeaderMenuRight />
    </StickyHeader>
  );
}
