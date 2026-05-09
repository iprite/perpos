import React from "react";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getActiveOrganizationId, getOrganizationsForCurrentUser } from "@/lib/accounting/queries";
import { OrgSwitcher } from "@/components/accounting/org-switcher";
import { AccountsManager, type AccountRow } from "@/components/accounting/accounts-manager";

export const dynamic = "force-dynamic";

export default async function AccountsPage() {
  const organizations = await getOrganizationsForCurrentUser();
  const activeOrganizationId = await getActiveOrganizationId();

  const supabase = await createSupabaseServerClient();
  let accounts: AccountRow[] = [];
  let error: string | null = null;

  if (activeOrganizationId) {
    const { data, error: e } = await supabase
      .from("accounts")
      .select("id,organization_id,code,name,type,normal_balance,parent_account_id,description,is_active")
      .eq("organization_id", activeOrganizationId)
      .order("type", { ascending: true })
      .order("code", { ascending: true });
    if (e) {
      error = e.message;
    } else {
      accounts = (data ?? []).map((r: any) => ({
        id: String(r.id),
        organizationId: String(r.organization_id),
        code: String(r.code),
        name: String(r.name),
        type: r.type,
        normalBalance: r.normal_balance,
        parentAccountId: r.parent_account_id ? String(r.parent_account_id) : null,
        description: r.description ? String(r.description) : null,
        isActive: Boolean(r.is_active),
      }));
    }
  }

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-xl font-semibold text-slate-900">ผังบัญชี</div>
          <div className="mt-1 text-sm text-slate-600">จัดการรหัสบัญชีและโครงสร้างบัญชีขององค์กร</div>
        </div>
        <OrgSwitcher organizations={organizations} activeOrganizationId={activeOrganizationId} />
      </div>

      {error ? <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div> : null}

      <div className="mt-6">
        <AccountsManager organizations={organizations} activeOrganizationId={activeOrganizationId} accounts={accounts} />
      </div>
    </div>
  );
}
