"use client";

import Logo from "@core/components/logo";
import cn from "@core/utils/class-names";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { SidebarMenu } from "./sidebar-menu";
import { SidebarFooter } from "./sidebar-footer";
import { SidebarModuleSwitcher } from "@/components/sidebar-module-switcher";
import { OrgSwitcher } from "@/components/accounting/org-switcher";
import type { OrganizationSummary } from "@/lib/accounting/queries";

const HIDE_ORG_SWITCHER_SEGMENTS = new Set(["admin", "assistant"]);

const isPersonalOrg = (o: OrganizationSummary) =>
  o.name.startsWith("พื้นที่ส่วนตัว") || /^u[a-z0-9]{10}$/.test(o.slug);

interface SidebarProps {
  className?: string;
  organizations?: OrganizationSummary[];
  activeOrganizationId?: string | null;
}

export default function Sidebar({ className, organizations = [], activeOrganizationId = null }: SidebarProps) {
  const pathname = usePathname();
  const firstSegment = pathname.split("/").filter(Boolean)[0] ?? "";
  const bizOrgs = organizations.filter((o) => !isPersonalOrg(o));
  const showOrgSwitcher = bizOrgs.length > 1 && !HIDE_ORG_SWITCHER_SEGMENTS.has(firstSegment);

  return (
    <aside
      className={cn(
        "fixed top-[var(--impersonation-banner-height,0px)] bottom-0 start-0 z-50 flex w-[270px] flex-col border-e-2 border-gray-100 bg-white dark:bg-gray-100/50 2xl:w-72",
        className
      )}
    >
      <div className="shrink-0 bg-gray-0/10 pb-2 pt-5 dark:bg-gray-100/5">
        <Link
          href={"/"}
          aria-label="Site Logo"
          className="flex justify-center px-6 pb-4 text-gray-800 hover:text-gray-900 2xl:px-8"
        >
          <Logo className="max-w-[155px]" />
        </Link>

        {/* org switcher — ซ่อนเมื่ออยู่ใน assistant / admin context */}
        {showOrgSwitcher && (
          <div className="px-4 pb-3 2xl:px-6">
            <OrgSwitcher organizations={organizations} activeOrganizationId={activeOrganizationId} />
          </div>
        )}

        <SidebarModuleSwitcher />
      </div>

      <div className="custom-scrollbar min-h-0 flex-1 overflow-y-auto scroll-smooth">
        <SidebarMenu />
      </div>

      <SidebarFooter organizations={organizations} activeOrganizationId={activeOrganizationId} />
    </aside>
  );
}
