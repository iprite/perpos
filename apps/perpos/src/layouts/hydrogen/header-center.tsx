'use client';

import { usePathname } from 'next/navigation';
import { ModuleSwitcher } from '@/components/module-switcher';
import { OrgSwitcher } from '@/components/accounting/org-switcher';
import type { OrganizationSummary } from '@/lib/accounting/queries';

interface Props {
  enabledModuleKeys: string[];
  organizations: OrganizationSummary[];
  activeOrganizationId: string | null;
  isCustomErpOrg: boolean;
}

export function HeaderCenter({ enabledModuleKeys, organizations, activeOrganizationId, isCustomErpOrg }: Props) {
  const pathname = usePathname() ?? '';
  const isTmcPath = pathname.startsWith('/tmc');
  const hideModules = isCustomErpOrg || isTmcPath;

  return (
    <div className="mx-2 flex items-center gap-3 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:mx-4">
      {!hideModules && (
        <div className="shrink-0">
          <ModuleSwitcher enabledModuleKeys={enabledModuleKeys} />
        </div>
      )}
      {hideModules && isCustomErpOrg && (
        <div className="shrink-0">
          <span className="inline-flex items-center gap-1.5 rounded-lg bg-blue-50 px-3 py-1.5 text-sm font-medium text-blue-700 ring-1 ring-blue-200">
            <span className="h-1.5 w-1.5 rounded-full bg-blue-500" />
            Custom ERP
          </span>
        </div>
      )}
      <div className="shrink-0">
        <OrgSwitcher organizations={organizations} activeOrganizationId={activeOrganizationId} />
      </div>
    </div>
  );
}
