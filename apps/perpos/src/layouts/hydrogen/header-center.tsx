'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { BotMessageSquare } from 'lucide-react';
import { OrgSwitcher } from '@/components/accounting/org-switcher';
import type { OrganizationSummary } from '@/lib/accounting/queries';
import { UsvillaLangDropdown } from './usvilla-lang-dropdown';

const SYSTEM_SEGMENTS = new Set(['admin', 'user', 'signin', 'no-org', 'no-module']);

interface Props {
  enabledModuleKeys: string[];
  organizations: OrganizationSummary[];
  activeOrganizationId: string | null;
}

export function HeaderCenter({ enabledModuleKeys, organizations, activeOrganizationId }: Props) {
  const pathname = usePathname();
  const segments = pathname.split('/').filter(Boolean);
  const isUsvilla = segments[1] === 'usvilla';

  const hasAssistant = enabledModuleKeys.includes('assistant');
  // Resolve orgSlug from URL — fallback to active org slug
  const orgSlugFromUrl = segments[0] && !SYSTEM_SEGMENTS.has(segments[0]) ? segments[0] : null;
  const activeOrgSlug  = organizations.find(o => o.id === activeOrganizationId)?.slug ?? null;
  const orgSlug        = orgSlugFromUrl ?? activeOrgSlug ?? '';

  return (
    <div className="mx-2 flex items-center gap-2 sm:mx-4">
      {isUsvilla && <UsvillaLangDropdown />}

      {/* Assistant shortcut — personal module users only */}
      {hasAssistant && orgSlug && (
        <Link
          href={`/${orgSlug}/assistant`}
          title="Task Manager (Assistant)"
          className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-500 hover:bg-violet-50 hover:border-violet-200 hover:text-violet-600 transition-colors"
        >
          <BotMessageSquare className="h-4 w-4" />
        </Link>
      )}

      <OrgSwitcher organizations={organizations} activeOrganizationId={activeOrganizationId} />
    </div>
  );
}
