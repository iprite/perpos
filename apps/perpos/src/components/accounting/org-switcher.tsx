"use client";

import React, { useMemo, useTransition } from "react";
import { Building2 } from "lucide-react";
import { useRouter } from "next/navigation";

import { setActiveOrganizationAction } from "@/lib/accounting/actions";
import type { OrganizationSummary } from "@/lib/accounting/queries";
import { useAuth } from "@/app/shared/auth-provider";
import { Dropdown, type DropdownItem } from "@/components/ui/dropdown";
import cn from "@core/utils/class-names";

type OrgSwitcherProps = {
  organizations: OrganizationSummary[];
  activeOrganizationId: string | null;
  /** ทิศที่ dropdown เปิด — "up" สำหรับวางไว้ล่างสุด (เช่น ใน sidebar) */
  placement?: "down" | "up";
  className?: string;
};

const ROLE_LABEL: Record<string, string> = {
  owner: "OWNER",
  admin: "ADMIN",
  user:  "USER",
};

export function OrgSwitcher({ organizations, activeOrganizationId, placement = "down", className }: OrgSwitcherProps) {
  const router = useRouter();
  const { role } = useAuth();
  const isSystemAdmin = role === "super_admin";
  const [pending, startTransition] = useTransition();

  const selected = activeOrganizationId ?? (organizations[0]?.id ?? "");
  const selectedOrg = useMemo(() => organizations.find((o) => o.id === selected), [organizations, selected]);

  function switchOrg(id: string) {
    if (id === selected) return;
    startTransition(async () => {
      const res = await setActiveOrganizationAction(id);
      if (res.ok) {
        const org = organizations.find((o) => o.id === id);
        // Admin navigates directly to org slug so page.tsx /admin redirect is bypassed.
        // Regular users navigate to root — page.tsx resolves the active org + module.
        const dest = isSystemAdmin && org ? `/${org.slug}` : "/";
        router.push(dest);
        router.refresh();
      }
    });
  }

  const items: DropdownItem[] = organizations.map((org) => ({
    key:   org.id,
    label: org.name,
    onClick: () => switchOrg(org.id),
  }));

  return (
    <Dropdown
      label={selectedOrg?.name ?? "เลือกองค์กร"}
      leadingIcon={<Building2 className="h-4 w-4" />}
      badge={selectedOrg?.role ? (ROLE_LABEL[selectedOrg.role] ?? selectedOrg.role) : undefined}
      selectedKey={selected}
      items={items}
      placement={placement === "up" ? "top-start" : "bottom-start"}
      className={cn("w-full", className)}
      disabled={pending}
    />
  );
}
