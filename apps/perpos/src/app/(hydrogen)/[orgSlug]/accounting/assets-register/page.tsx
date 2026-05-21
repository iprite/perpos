import React from "react";

import { getActiveOrganizationId } from "@/lib/accounting/queries";
import { listAssetsAction, type AssetRow } from "@/lib/assets/actions";
import { AssetRegisterClient } from "@/components/assets/asset-register-client";

export const dynamic = "force-dynamic";

export default async function AssetRegisterPage() {
  const activeOrganizationId = await getActiveOrganizationId();

  let initialRows: AssetRow[] = [];

  if (activeOrganizationId) {
    const res = await listAssetsAction({ organizationId: activeOrganizationId });
    if (res.ok) initialRows = res.rows;
  }

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6">
      <div className="mb-6">
        <div className="text-xl font-semibold text-slate-900">ทะเบียนสินทรัพย์</div>
        <div className="mt-1 text-sm text-slate-600">จัดการข้อมูลสินทรัพย์ถาวรขององค์กร</div>
      </div>

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
    </div>
  );
}
