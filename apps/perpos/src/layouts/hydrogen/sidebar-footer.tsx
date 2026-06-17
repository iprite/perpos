"use client";

import Link from "next/link";
import { Mic, Building2, Shield } from "lucide-react";
import { usePathname } from "next/navigation";
import ProfileMenu from "@/layouts/profile-menu";
import { useAuth } from "@/app/shared/auth-provider";
import { useEnabledModules } from "@/app/shared/module-provider";
import cn from "@core/utils/class-names";
import type { OrganizationSummary } from "@/lib/accounting/queries";

const SYSTEM_SEGMENTS = new Set(["admin", "user", "signin", "no-org", "no-module", "assistant"]);
const isPersonalOrg = (o: OrganizationSummary) =>
  o.name.startsWith("พื้นที่ส่วนตัว") || /^u[a-z0-9]{10}$/.test(o.slug);

interface SidebarFooterProps {
  organizations?: OrganizationSummary[];
  activeOrganizationId?: string | null;
}

export function ContextToggle({ organizations, activeOrganizationId, className }: SidebarFooterProps & { className?: string }) {
  const pathname = usePathname();
  const { role } = useAuth();
  const enabledModuleKeys = useEnabledModules();
  const segments = pathname.split("/").filter(Boolean);
  const isSuperAdmin = role === "super_admin";
  const hasAssistant = enabledModuleKeys.includes("stt");
  const onAdmin = segments[0] === "admin";
  const onAssistant = segments[0] === "assistant";
  const onBiz = !!segments[0] && !SYSTEM_SEGMENTS.has(segments[0]);

  const bizOrgs = (organizations ?? []).filter((o) => !isPersonalOrg(o));
  const activeBiz = bizOrgs.find((o) => o.id === activeOrganizationId) ?? bizOrgs[0];

  type Item = { key: string; label: string; icon: React.ReactNode; href: string; active: boolean };
  const items: Item[] = [];
  if (isSuperAdmin) items.push({ key: "admin", label: "Admin", icon: <Shield className="h-3 w-3 shrink-0" />, href: "/admin", active: onAdmin });
  if (activeBiz)    items.push({ key: "biz", label: "Ai ERP", icon: <Building2 className="h-3 w-3 shrink-0" />, href: `/${activeBiz.slug}`, active: onBiz });
  if (hasAssistant) items.push({ key: "assistant", label: "Ai Assistant", icon: <Mic className="h-3 w-3 shrink-0" />, href: "/assistant", active: onAssistant });

  if (items.length <= 1) return null;

  return (
    <div className={cn("inline-flex items-center gap-0.5 rounded-full border border-slate-200 bg-white p-0.5", className)}>
      {items.map((it) => (
        <Link
          key={it.key}
          href={it.href}
          title={it.label}
          aria-current={it.active ? "page" : undefined}
          className={cn(
            "inline-flex h-6 items-center gap-1 rounded-full px-2 text-[11px] font-medium transition-colors",
            it.active ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100",
          )}
        >
          {it.icon}
          <span className="max-w-[100px] truncate">{it.label}</span>
        </Link>
      ))}
    </div>
  );
}

export function SidebarFooter({ organizations, activeOrganizationId }: SidebarFooterProps) {
  const { userId } = useAuth();
  if (!userId) return null;

  return (
    <div className="shrink-0 border-t border-gray-100 p-3 dark:border-gray-200/10">
      <div className="mb-2 flex items-center justify-center">
        <ContextToggle organizations={organizations} activeOrganizationId={activeOrganizationId} />
      </div>
      <ProfileMenu />
    </div>
  );
}
