'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Mic } from 'lucide-react';
import { OrgSwitcher } from '@/components/accounting/org-switcher';
import type { OrganizationSummary } from '@/lib/accounting/queries';
import { UsvillaLangDropdown } from './usvilla-lang-dropdown';

const SYSTEM_SEGMENTS = new Set(['admin', 'user', 'signin', 'no-org', 'no-module', 'assistant']);

interface Props {
  enabledModuleKeys: string[];
  organizations: OrganizationSummary[];
  activeOrganizationId: string | null;
}

export function HeaderCenter({ enabledModuleKeys, organizations, activeOrganizationId }: Props) {
  const pathname = usePathname();
  const segments = pathname.split('/').filter(Boolean);
  const isUsvilla = segments[1] === 'usvilla';

  // ผู้ช่วย AI (assistant) — internal key ยังเป็น 'stt'
  const hasAssistant = enabledModuleKeys.includes('stt');
  const onAssistant  = segments[0] === 'assistant';

  return (
    <div className="mx-2 flex items-center gap-2 sm:mx-4">
      {isUsvilla && <UsvillaLangDropdown />}

      {/* ERP org switcher (B2B ที่มีหลาย org) — เลือก org = สลับกลับไป ERP */}
      {organizations.length > 1 && (
        <OrgSwitcher organizations={organizations} activeOrganizationId={activeOrganizationId} />
      )}

      {/* สลับไป "ผู้ช่วย AI" (per-profile) — แสดงเมื่อมีสิทธิ์และไม่ได้อยู่ในผู้ช่วย */}
      {hasAssistant && !onAssistant && (
        <Link
          href="/assistant"
          title="ผู้ช่วย AI"
          className="inline-flex h-9 items-center gap-1.5 rounded-md border border-indigo-200 bg-indigo-50 px-3 text-sm font-medium text-indigo-700 transition-colors hover:bg-indigo-100"
        >
          <Mic className="h-4 w-4" /> ผู้ช่วย AI
        </Link>
      )}
    </div>
  );
}
