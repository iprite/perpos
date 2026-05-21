import React from "react";
import { notFound } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getActiveOrganizationId } from "@/lib/accounting/queries";
import { getPP30, getVatSales, getVatPurchases } from "@/lib/tax/actions";
import { PP30DetailClient } from "@/components/tax/pp30-detail-client";
import type { VatDocRow } from "@/lib/tax/actions";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ id: string }>;
};

export default async function PP30DetailPage({ params }: Props) {
  const { id } = await params;
  const activeOrganizationId = await getActiveOrganizationId();

  if (!activeOrganizationId) {
    return (
      <div className="mx-auto w-full max-w-7xl px-4 py-6">
        <div className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-700">
          กรุณาเลือกองค์กรก่อน
        </div>
      </div>
    );
  }

  const result = await getPP30({ organizationId: activeOrganizationId, id });
  if (!result.ok) notFound();

  const row = result.row;

  // Fetch org settings for form preview
  const supabase = await createSupabaseServerClient();
  const { data: settings } = await supabase
    .from("org_settings")
    .select("company_name_th,tax_id,address")
    .eq("organization_id", activeOrganizationId)
    .maybeSingle();

  const orgName = settings ? String((settings as any).company_name_th ?? "") : undefined;
  const orgTaxId = settings ? String((settings as any).tax_id ?? "") : undefined;
  const orgAddress = settings ? String((settings as any).address ?? "") : undefined;

  // Fetch VAT sales and purchases for this period
  let salesRows: VatDocRow[] = [];
  let purchaseRows: VatDocRow[] = [];

  const [salesResult, purchasesResult] = await Promise.all([
    getVatSales({
      organizationId: activeOrganizationId,
      year: row.period_year,
      month: row.period_month,
    }),
    getVatPurchases({
      organizationId: activeOrganizationId,
      year: row.period_year,
      month: row.period_month,
    }),
  ]);

  if (salesResult.ok) salesRows = salesResult.rows;
  if (purchasesResult.ok) purchaseRows = purchasesResult.rows;

  const THAI_MONTHS_FULL = [
    "มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน",
    "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม",
  ];
  const monthTh = THAI_MONTHS_FULL[(row.period_month ?? 1) - 1];
  const beYear = row.period_year + 543;

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-6">
      <div className="mb-4">
        <div className="text-xl font-semibold text-slate-900">
          ภ.พ.30 {monthTh} {beYear}
        </div>
        <div className="mt-1 text-sm text-slate-600">{row.filing_number}</div>
      </div>

      <PP30DetailClient
        organizationId={activeOrganizationId}
        row={row}
        salesRows={salesRows}
        purchaseRows={purchaseRows}
        orgName={orgName}
        orgTaxId={orgTaxId}
        orgAddress={orgAddress}
      />
    </div>
  );
}
