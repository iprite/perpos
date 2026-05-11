import Link from "next/link";
import HamburgerButton from "@/layouts/hamburger-button";
import Sidebar from "@/layouts/hydrogen/sidebar";
import Logo from "@core/components/logo";
import HeaderMenuRight from "@/layouts/header-menu-right";
import StickyHeader from "@/layouts/sticky-header";
import { OrgSwitcher } from "@/components/accounting/org-switcher";
import { ModuleSwitcher } from "@/components/module-switcher";
import { getOrganizationsForCurrentUser, getActiveOrganizationId } from "@/lib/accounting/queries";

export default async function Header() {
  const organizations        = await getOrganizationsForCurrentUser();
  const activeOrganizationId = await getActiveOrganizationId();

  return (
    <StickyHeader className="z-[990] 2xl:py-5 3xl:px-8 4xl:px-10">
      <div className="flex w-full max-w-2xl items-center">
        <HamburgerButton view={<Sidebar className="static w-full 2xl:w-full" />} />
        <Link
          href={"/"}
          aria-label="Site Logo"
          className="me-4 w-9 shrink-0 text-gray-800 hover:text-gray-900 lg:me-5 xl:hidden"
        >
          <Logo iconOnly={true} />
        </Link>
      </div>

      <div className="mx-2 flex flex-1 items-center gap-3 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:mx-4">
        <div className="shrink-0"><ModuleSwitcher /></div>
        <div className="shrink-0"><OrgSwitcher organizations={organizations} activeOrganizationId={activeOrganizationId} /></div>
      </div>

      <HeaderMenuRight />
    </StickyHeader>
  );
}
