import React from "react";

import { getActiveOrganizationId } from "@/lib/accounting/queries";
import { listOrgMembers, listOrgInvites, type OrgMemberRow, type OrgInviteRow } from "@/lib/settings/user-actions";
import { OrgUsersClient } from "@/components/settings/org-users-client";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function OrgUsersPage() {
  const activeOrganizationId = await getActiveOrganizationId();

  let members: OrgMemberRow[] = [];
  let invites: OrgInviteRow[] = [];
  let currentUserId = "";

  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  currentUserId = user?.id ?? "";

  if (activeOrganizationId) {
    const [membRes, invRes] = await Promise.all([
      listOrgMembers({ organizationId: activeOrganizationId }),
      listOrgInvites({ organizationId: activeOrganizationId }),
    ]);
    if (membRes.ok) members = membRes.rows;
    if (invRes.ok)  invites  = invRes.rows;
  }

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-6">
      {activeOrganizationId ? (
        <OrgUsersClient
          organizationId={activeOrganizationId}
          initialMembers={members}
          initialInvites={invites}
          currentUserId={currentUserId}
        />
      ) : (
        <div className="rounded-lg border border-dashed border-slate-200 py-12 text-center text-sm text-slate-500">
          กรุณาเลือกองค์กร
        </div>
      )}
    </div>
  );
}
