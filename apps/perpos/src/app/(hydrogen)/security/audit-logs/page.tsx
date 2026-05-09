import React from "react";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getActiveOrganizationId, getOrganizationsForCurrentUser } from "@/lib/accounting/queries";
import { OrgSwitcher } from "@/components/accounting/org-switcher";
import { AuditLogsClient } from "@/components/phase4/security/audit-logs-client";
import type { AuditLogRow } from "@/lib/phase4/security/actions";

export const dynamic = "force-dynamic";

export default async function AuditLogsPage() {
  const organizations = await getOrganizationsForCurrentUser();
  const activeOrganizationId = await getActiveOrganizationId();
  const supabase = await createSupabaseServerClient();

  let rows: AuditLogRow[] = [];
  let error: string | null = null;

  if (activeOrganizationId) {
    const { data, error: e } = await supabase
      .from("audit_logs")
      .select("id,created_at,user_id,action,table_name,record_id,old_value,new_value")
      .eq("organization_id", activeOrganizationId)
      .order("created_at", { ascending: false })
      .limit(200);
    if (e) error = e.message;
    rows = (data ?? []).map((r: any) => ({
      id: String(r.id),
      createdAt: String(r.created_at),
      userId: r.user_id ? String(r.user_id) : null,
      action: String(r.action),
      tableName: String(r.table_name),
      recordId: r.record_id ? String(r.record_id) : null,
      oldValue: r.old_value ?? null,
      newValue: r.new_value ?? null,
    }));
  }

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-xl font-semibold text-slate-900">Audit Logs</div>
          <div className="mt-1 text-sm text-slate-600">ติดตามว่าใครแก้ไขอะไร และเมื่อไหร่</div>
        </div>
        <OrgSwitcher organizations={organizations} activeOrganizationId={activeOrganizationId} />
      </div>

      {error ? <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div> : null}

      {activeOrganizationId ? (
        <div className="mt-6">
          <AuditLogsClient organizationId={activeOrganizationId} initialRows={rows} />
        </div>
      ) : (
        <div className="mt-6 rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-700">กรุณาเลือกองค์กรก่อน</div>
      )}
    </div>
  );
}

