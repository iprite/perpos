import React from "react";

import { getActiveOrganizationId } from "@/lib/accounting/queries";
import { listAssetsAction, type AssetRow } from "@/lib/assets/actions";
import { AssetRegisterClient } from "@/components/assets/asset-register-client";
import { PageShell } from "@/components/ui/page-shell";

export const dynamic = "force-dynamic";

export default async function AssetRegisterPage() {
  const activeOrganizationId = await getActiveOrganizationId();

  let initialRows: AssetRow[] = [];

  if (activeOrganizationId) {
    const res = await listAssetsAction({ organizationId: activeOrganizationId });
    if (res.ok) initialRows = res.rows;
  }

  return (
    <PageShell
      width="default"
      title="ทะเบียนสินทรัพย์"
      description={<>จัดการข้อมูลสินทรัพย์ถาวรขององค์กร</>}
    >
      {activeOrganizationId ? (
        <AssetRegisterClient
          organizationId={activeOrganizationId}
          initialRows={initialRows}
        />
      ) : (
        <div className="rounded-lg border border-dashed border-slate-200 py-12 text-center text-sm text-slate-500">
          กรุณาเลือกองค์กร
        </div>
      )}
    </PageShell>
  );
}
