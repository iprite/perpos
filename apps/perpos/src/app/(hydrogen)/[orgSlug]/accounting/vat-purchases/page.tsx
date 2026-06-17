import React from "react";
import { getActiveOrganizationId } from "@/lib/accounting/queries";
import { getVatPurchases } from "@/lib/tax/actions";
import { VatDocsClient } from "@/components/tax/vat-docs-client";
import type { VatDocRow } from "@/lib/tax/actions";
import { PageShell } from "@/components/ui/page-shell";

export const dynamic = "force-dynamic";

export default async function VatPurchasesPage() {
  const activeOrganizationId = await getActiveOrganizationId();

  let rows: VatDocRow[] = [];
  let error: string | null = null;

  if (activeOrganizationId) {
    const now = new Date();
    const currentYear = now.getFullYear();

    const results = await Promise.all(
      Array.from({ length: 12 }, (_, i) =>
        getVatPurchases({ organizationId: activeOrganizationId, year: currentYear, month: i + 1 })
      )
    );

    for (const r of results) {
      if (r.ok) rows.push(...r.rows);
      else if (!error) error = r.error;
    }
  }

  return (
    <PageShell
      width="default"
      title="รายงานภาษีซื้อ"
      description={<>ใบกำกับภาษีซื้อที่มี VAT (สำหรับคำนวณ ภ.พ.30)</>}
    >
      {error ? (
        <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      {activeOrganizationId ? (
        <div className="mt-6">
          <VatDocsClient rows={rows} title="รายงานภาษีซื้อ" />
        </div>
      ) : (
        <div className="mt-6 rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-700">
          กรุณาเลือกองค์กรก่อน
        </div>
      )}
    </PageShell>
  );
}
