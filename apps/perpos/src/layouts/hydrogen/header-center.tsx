'use client';

import { usePathname } from 'next/navigation';
import { ModuleSwitcher } from '@/components/module-switcher';
import { OrgSwitcher } from '@/components/accounting/org-switcher';
import type { OrganizationSummary } from '@/lib/accounting/queries';

interface Props {
  enabledModuleKeys: string[];
  organizations: OrganizationSummary[];
  activeOrganizationId: string | null;
}

export function HeaderCenter({ enabledModuleKeys, organizations, activeOrganizationId }: Props) {
  return (
    <div className="mx-2 flex items-center gap-3 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:mx-4">
      <div className="shrink-0">
        <ModuleSwitcher enabledModuleKeys={enabledModuleKeys} />
      </div>
      <div className="shrink-0">
        <OrgSwitcher organizations={organizations} activeOrganizationId={activeOrganizationId} />
      </div>
    </div>
  );
}
