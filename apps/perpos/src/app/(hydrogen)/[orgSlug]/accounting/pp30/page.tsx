import React from "react";
import { getActiveOrganizationId } from "@/lib/accounting/queries";
import { listPP30 } from "@/lib/tax/actions";
import { PP30ListClient } from "@/components/tax/pp30-list-client";
import type { PP30Row } from "@/lib/tax/actions";
import { PageShell } from "@/components/ui/page-shell";

export const dynamic = "force-dynamic";

export default async function PP30ListPage() {
  const activeOrganizationId = await getActiveOrganizationId();

  let rows: PP30Row[] = [];
  let error: string | null = null;

  if (activeOrganizationId) {
    const result = await listPP30({ organizationId: activeOrganizationId });
    if (result.ok) {
      rows = result.rows;
    } else {
      error = result.error;
    }
  }

  return (
    <PageShell
      width="default"
      title="แบบ ภ.พ.30"
      description={<>แบบแสดงรายการภาษีมูลค่าเพิ่ม (ภ.พ.30)</>}
    >
      {error ? (
        <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      {activeOrganizationId ? (
        <div className="mt-6">
          <PP30ListClient organizationId={activeOrganizationId} rows={rows} />
        </div>
      ) : (
        <div className="mt-6 rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-700">
          กรุณาเลือกองค์กรก่อน
        </div>
      )}
    </PageShell>
  );
}
