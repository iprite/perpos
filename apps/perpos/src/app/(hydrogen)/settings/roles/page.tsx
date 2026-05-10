import React from "react";

import { getActiveOrganizationId } from "@/lib/accounting/queries";
import { listOrgMembers, type OrgMemberRow } from "@/lib/settings/user-actions";
import { OrgRolesClient } from "@/components/settings/org-roles-client";

export const dynamic = "force-dynamic";

export default async function OrgRolesPage() {
  const activeOrganizationId = await getActiveOrganizationId();

  let members: OrgMemberRow[] = [];

  if (activeOrganizationId) {
    const res = await listOrgMembers({ organizationId: activeOrganizationId });
    if (res.ok) members = res.rows;
  }

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-6">
      {activeOrganizationId ? (
        <OrgRolesClient members={members} />
      ) : (
        <div className="rounded-lg border border-dashed border-slate-200 py-12 text-center text-sm text-slate-500">
          กรุณาเลือกองค์กร
        </div>
      )}
    </div>
  );
}
