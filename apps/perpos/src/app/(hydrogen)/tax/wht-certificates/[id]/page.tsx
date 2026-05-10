import React from "react";
import { notFound } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getActiveOrganizationId } from "@/lib/accounting/queries";
import { getWHTCert } from "@/lib/tax/actions";
import { WhtCertDetailClient } from "@/components/tax/wht-cert-detail-client";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ id: string }>;
};

export default async function WhtCertDetailPage({ params }: Props) {
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

  const result = await getWHTCert({ organizationId: activeOrganizationId, id });
  if (!result.ok) notFound();

  const row = result.row;

  // Fetch payer address from org settings
  const supabase = await createSupabaseServerClient();
  const { data: settings } = await supabase
    .from("org_settings")
    .select("address")
    .eq("organization_id", activeOrganizationId)
    .maybeSingle();

  const payerAddress = settings ? String((settings as any).address ?? "") : undefined;

  // Try to find receiver address from contacts by receiver_name / receiver_tax_id
  let receiverAddress: string | undefined;
  if (row.receiver_tax_id) {
    const { data: contact } = await supabase
      .from("contacts")
      .select("address")
      .eq("organization_id", activeOrganizationId)
      .eq("tax_id", row.receiver_tax_id)
      .maybeSingle();
    if (contact?.address) receiverAddress = String(contact.address);
  }

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-6">
      <div className="mb-4">
        <div className="text-xl font-semibold text-slate-900">
          หนังสือรับรองหัก ณ ที่จ่าย
        </div>
        <div className="mt-1 text-sm text-slate-600">
          {row.certificate_no ?? "(ยังไม่มีเลขที่)"} — {row.receiver_name}
        </div>
      </div>

      <WhtCertDetailClient
        row={row}
        payerAddress={payerAddress}
        receiverAddress={receiverAddress}
      />
    </div>
  );
}
