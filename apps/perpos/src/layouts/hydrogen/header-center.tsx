"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Shield } from "lucide-react";
import cn from "@core/utils/class-names";
import type { OrganizationSummary } from "@/lib/accounting/queries";
import { useAuth } from "@/app/shared/auth-provider";
import { BrandIcon } from "@/components/ui/brand-icon";
import { UsvillaLangDropdown } from "./usvilla-lang-dropdown";

const SYSTEM_SEGMENTS = new Set(["admin", "user", "signin", "no-org", "no-module", "assistant"]);
const isPersonalOrg = (o: OrganizationSummary) =>
  o.name.startsWith("พื้นที่ส่วนตัว") || /^u[a-z0-9]{10}$/.test(o.slug);

interface Props {
  enabledModuleKeys: string[];
  organizations: OrganizationSummary[];
  activeOrganizationId: string | null;
}

type Segment = {
  key: string;
  label: string;
  icon: (active: boolean) => React.ReactNode;
  href: string;
  active: boolean;
  activeClass: string;
};

export function HeaderCenter({ enabledModuleKeys, organizations, activeOrganizationId }: Props) {
  const pathname = usePathname();
  const { role } = useAuth();
  const segments = pathname.split("/").filter(Boolean);
  const isUsvilla = segments[1] === "usvilla";
  const isSuperAdmin = role === "super_admin";

  // ผู้ช่วย AI (assistant) — internal key ยังเป็น 'stt'
  const hasAssistant = enabledModuleKeys.includes("stt");
  const onAssistant = segments[0] === "assistant";
  const onAdmin = segments[0] === "admin";
  // อยู่ในบริบท Biz (ERP) = segment แรกเป็น org slug (ไม่ใช่ system segment)
  const onBiz = !!segments[0] && !SYSTEM_SEGMENTS.has(segments[0]);

  // Biz (ERP) — org ที่ไม่ใช่ personal · สลับไป biz ของ active/แรก
  const bizOrgs = organizations.filter((o) => !isPersonalOrg(o));
  const activeBiz = bizOrgs.find((o) => o.id === activeOrganizationId) ?? bizOrgs[0];

  // สร้างรายการ segment สำหรับ toggle — เรียง Super → Biz → ผู้ช่วย
  const toggleItems: Segment[] = [];
  if (isSuperAdmin) {
    toggleItems.push({
      key: "admin",
      label: "Super",
      icon: () => <Shield className="h-3 w-3 shrink-0" />,
      href: "/admin",
      active: onAdmin,
      activeClass: "bg-primary text-primary-foreground",
    });
  }
  if (activeBiz) {
    toggleItems.push({
      key: "biz",
      label: "Suite",
      icon: (active) => (
        <BrandIcon
          product="suite"
          className="h-3.5 w-3.5"
          fill={active ? "bg-primary" : undefined}
        />
      ),
      href: `/${activeBiz.slug}`,
      active: onBiz,
      activeClass: "bg-orange-500 text-primary",
    });
  }
  if (hasAssistant) {
    toggleItems.push({
      key: "assistant",
      label: "Flow",
      icon: (active) => (
        <BrandIcon
          product="flow"
          className="h-3.5 w-3.5"
          fill={active ? "bg-primary" : undefined}
        />
      ),
      href: "/assistant",
      active: onAssistant,
      activeClass: "bg-green-500 text-primary",
    });
  }

  return (
    <div className="mx-2 flex items-center gap-2 sm:mx-4">
      {isUsvilla && <UsvillaLangDropdown />}

      {/* Segmented toggle สลับบริบท Super / Biz / ผู้ช่วย AI */}
      {toggleItems.length > 1 && (
        <div className="inline-flex items-center gap-0.5 rounded-full border border-slate-200 bg-white p-0.5">
          {toggleItems.map((it) => (
            <Link
              key={it.key}
              href={it.href}
              title={it.label}
              aria-current={it.active ? "page" : undefined}
              className={cn(
                "inline-flex h-6 items-center gap-1 rounded-full px-2 text-[11px] font-medium transition-colors",
                it.active ? it.activeClass : "text-slate-600 hover:bg-slate-100",
              )}
            >
              {it.icon(it.active)}
              <span className="font-neo-tech max-w-[130px] translate-y-[1px] truncate leading-none">
                {it.label}
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
