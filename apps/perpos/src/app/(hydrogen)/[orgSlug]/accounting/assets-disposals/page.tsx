import React from "react";

import { getActiveOrganizationId } from "@/lib/accounting/queries";
import { listAssetsAction, type AssetRow } from "@/lib/assets/actions";
import { AssetDisposalClient } from "@/components/assets/asset-disposal-client";
import { PageShell } from "@/components/ui/page-shell";

export const dynamic = "force-dynamic";

export default async function AssetDisposalsPage() {
  const activeOrganizationId = await getActiveOrganizationId();

  let activeAssets: AssetRow[] = [];

  if (activeOrganizationId) {
    const res = await listAssetsAction({ organizationId: activeOrganizationId });
    if (res.ok) activeAssets = res.rows.filter((r) => r.status === "active" || r.status === "idle");
  }

  return (
    <PageShell
      width="default"
      title="ขายสินทรัพย์"
      description={<>บันทึกการจำหน่ายสินทรัพย์ถาวรขององค์กร</>}
    >
      {activeOrganizationId ? (
        <AssetDisposalClient
          organizationId={activeOrganizationId}
          activeAssets={activeAssets}
        />
      ) : (
        <div className="rounded-lg border border-dashed border-slate-200 py-12 text-center text-sm text-slate-500">
          กรุณาเลือกองค์กร
        </div>
      )}
    </PageShell>
  );
}
