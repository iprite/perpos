'use client';

import { OrgSwitcher } from '@/components/accounting/org-switcher';
import type { OrganizationSummary } from '@/lib/accounting/queries';

interface Props {
  enabledModuleKeys: string[];
  organizations: OrganizationSummary[];
  activeOrganizationId: string | null;
}

export function HeaderCenter({ enabledModuleKeys: _enabledModuleKeys, organizations, activeOrganizationId }: Props) {
  return (
    <div className="mx-2 flex items-center gap-3 sm:mx-4">
      <OrgSwitcher organizations={organizations} activeOrganizationId={activeOrganizationId} />
    </div>
  );
}
