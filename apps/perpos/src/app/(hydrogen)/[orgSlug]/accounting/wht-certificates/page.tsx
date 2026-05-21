import React from "react";
import { getActiveOrganizationId } from "@/lib/accounting/queries";
import { listWHTCerts, type WHTCertRow } from "@/lib/tax/actions";
import { WhtCertListClient } from "@/components/tax/wht-cert-list-client";

export const dynamic = "force-dynamic";

export default async function WhtCertificatesPage() {
  const activeOrganizationId = await getActiveOrganizationId();

  let rows: WHTCertRow[] = [];
  let error: string | null = null;

  if (activeOrganizationId) {
    const result = await listWHTCerts({ organizationId: activeOrganizationId });
    if (result.ok) {
      rows = result.rows;
    } else {
      error = result.error;
    }
  }

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-xl font-semibold text-slate-900">
            หนังสือรับรองหัก ณ ที่จ่าย
          </div>
          <div className="mt-1 text-sm text-slate-600">
            ใบรับรองการหักภาษี ณ ที่จ่าย (50 ทวิ) ขององค์กร
          </div>
        </div>
      </div>

      {error ? (
        <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      {activeOrganizationId ? (
        <div className="mt-6">
          <WhtCertListClient rows={rows} />
        </div>
      ) : (
        <div className="mt-6 rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-700">
          กรุณาเลือกองค์กรก่อน
        </div>
      )}
    </div>
  );
}
