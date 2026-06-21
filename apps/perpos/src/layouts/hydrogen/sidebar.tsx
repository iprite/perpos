"use client";

import cn from "@core/utils/class-names";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { SidebarMenu } from "./sidebar-menu";
import { SidebarFooter, ContextToggle } from "./sidebar-footer";
import { SidebarModuleSwitcher } from "@/components/sidebar-module-switcher";
import { OrgSwitcher } from "@/components/accounting/org-switcher";
import type { OrganizationSummary } from "@/lib/accounting/queries";

const HIDE_ORG_SWITCHER_SEGMENTS = new Set(["admin", "assistant"]);
// segment ที่ไม่ใช่บริบทองค์กร (ERP) — ไม่ต้องโชว์บล็อก org/module switcher ด้านล่าง
const NON_BIZ_SEGMENTS = new Set(["admin", "assistant", "user", "no-org", "no-module", "signin"]);

const isPersonalOrg = (o: OrganizationSummary) =>
  o.name.startsWith("พื้นที่ส่วนตัว") || /^u[a-z0-9]{10}$/.test(o.slug);

interface SidebarProps {
  className?: string;
  organizations?: OrganizationSummary[];
  activeOrganizationId?: string | null;
}

export default function Sidebar({
  className,
  organizations = [],
  activeOrganizationId = null,
}: SidebarProps) {
  const pathname = usePathname();
  const firstSegment = pathname.split("/").filter(Boolean)[0] ?? "";
  const bizOrgs = organizations.filter((o) => !isPersonalOrg(o));
  const showOrgSwitcher = bizOrgs.length > 1 && !HIDE_ORG_SWITCHER_SEGMENTS.has(firstSegment);
  const inBizContext = !!firstSegment && !NON_BIZ_SEGMENTS.has(firstSegment);

  // wordmark suffix ตามบริบท — Admin / Flow (assistant) / Suite (biz default)
  const brand =
    firstSegment === "admin"
      ? { word: "ADMIN", className: "text-gray-500" }
      : firstSegment === "assistant"
        ? { word: "FLOW", className: "text-green-600" }
        : { word: "SUITE", className: "text-orange-600" };

  return (
    <aside
      className={cn(
        "fixed bottom-0 start-0 top-[var(--impersonation-banner-height,0px)] z-50 flex w-[270px] flex-col border-e-2 border-gray-100 bg-white dark:bg-gray-100/50 2xl:w-72",
        className,
      )}
    >
      <div className="shrink-0 bg-gray-0/10 pb-2 pt-8 dark:bg-gray-100/5">
        <Link
          href={"/"}
          aria-label="PERPOS"
          className="flex justify-center px-6 pb-4 text-gray-900 hover:text-gray-700 2xl:px-8"
        >
          <span className="font-neo-tech flex items-center gap-2 text-2xl font-bold leading-none tracking-[0.18em]">
            <span>PERPOS</span>
            <span
              className="h-[1.05em] w-0.5 -translate-y-[0.08em] rounded-full bg-gray-300"
              aria-hidden="true"
            />
            <span className={brand.className}>{brand.word}</span>
          </span>
        </Link>

        {/* context toggle (Admin / Suite / Flow) — บนสุดใต้โลโก้ */}
        <div className="flex items-center justify-center px-4 2xl:px-6">
          <ContextToggle
            organizations={organizations}
            activeOrganizationId={activeOrganizationId}
          />
        </div>
      </div>

      <div className="custom-scrollbar min-h-0 flex-1 overflow-y-auto scroll-smooth">
        <SidebarMenu />
      </div>

      {/* org + module switcher — ย้ายลงมาด้านล่าง (ที่เดิมของ pill) */}
      {inBizContext && (
        <div className="shrink-0 border-t border-gray-100 pt-3 dark:border-gray-200/10">
          {/* org switcher — ซ่อนเมื่ออยู่ใน assistant / admin context */}
          {showOrgSwitcher && (
            <div className="px-4 pb-3 2xl:px-6">
              <OrgSwitcher
                organizations={organizations}
                activeOrganizationId={activeOrganizationId}
              />
            </div>
          )}

          <SidebarModuleSwitcher />
        </div>
      )}

      <SidebarFooter organizations={organizations} activeOrganizationId={activeOrganizationId} />
    </aside>
  );
}
