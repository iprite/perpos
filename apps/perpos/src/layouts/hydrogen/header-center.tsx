'use client';

import { usePathname } from 'next/navigation';
import { OrgSwitcher } from '@/components/accounting/org-switcher';
import type { OrganizationSummary } from '@/lib/accounting/queries';
import { UsvillaLangDropdown } from './usvilla-lang-dropdown';

interface Props {
  enabledModuleKeys: string[];
  organizations: OrganizationSummary[];
  activeOrganizationId: string | null;
}

export function HeaderCenter({ enabledModuleKeys: _enabledModuleKeys, organizations, activeOrganizationId }: Props) {
  const pathname = usePathname();
  // Show language dropdown only on usvilla module pages: /<orgSlug>/usvilla/*
  const isUsvilla = pathname.split('/').filter(Boolean)[1] === 'usvilla';

  return (
    <div className="mx-2 flex items-center gap-3 sm:mx-4">
      {isUsvilla && <UsvillaLangDropdown />}
      <OrgSwitcher organizations={organizations} activeOrganizationId={activeOrganizationId} />
    </div>
  );
}
