import React from "react";

import { getActiveOrganizationId } from "@/lib/accounting/queries";
import { listAssetsAction, type AssetRow } from "@/lib/assets/actions";
import { AssetDisposalClient } from "@/components/assets/asset-disposal-client";

export const dynamic = "force-dynamic";

export default async function AssetDisposalsPage() {
  const activeOrganizationId = await getActiveOrganizationId();

  let activeAssets: AssetRow[] = [];

  if (activeOrganizationId) {
    const res = await listAssetsAction({ organizationId: activeOrganizationId });
    if (res.ok) activeAssets = res.rows.filter((r) => r.status === "active" || r.status === "idle");
  }

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-6">
      <div className="mb-6">
        <div className="text-xl font-semibold text-slate-900">ขายสินทรัพย์</div>
        <div className="mt-1 text-sm text-slate-600">บันทึกการจำหน่ายสินทรัพย์ถาวรขององค์กร</div>
      </div>

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
    </div>
  );
}
