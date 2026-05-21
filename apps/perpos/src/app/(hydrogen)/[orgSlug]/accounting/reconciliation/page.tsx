import React from "react";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getActiveOrganizationId } from "@/lib/accounting/queries";
import { BankReconciliationClient } from "@/components/phase4/bank/bank-reconciliation-client";
import type { BankImportRow } from "@/lib/phase4/bank/actions";

export const dynamic = "force-dynamic";

export default async function BankReconciliationPage() {
  const activeOrganizationId = await getActiveOrganizationId();
  const supabase = await createSupabaseServerClient();

  let imports: BankImportRow[] = [];
  let error: string | null = null;

  if (activeOrganizationId) {
    const { data, error: e } = await supabase
      .from("bank_imports")
      .select("id,bank_name,bank_account_name,period_from,period_to,created_at")
      .eq("organization_id", activeOrganizationId)
      .order("created_at", { ascending: false })
      .limit(30);
    if (e) error = e.message;
    imports = (data ?? []).map((r: any) => ({
      id: String(r.id),
      bankName: String(r.bank_name),
      bankAccountName: String(r.bank_account_name),
      periodFrom: r.period_from ? String(r.period_from) : null,
      periodTo: r.period_to ? String(r.period_to) : null,
      createdAt: String(r.created_at),
    }));
  }

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-xl font-semibold text-slate-900">กระทบยอดธนาคาร</div>
          <div className="mt-1 text-sm text-slate-600">อัปโหลด statement และจับคู่กับรายการบัญชีในระบบ</div>
        </div>
      </div>

      {error ? <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div> : null}

      {activeOrganizationId ? (
        <div className="mt-6">
          <BankReconciliationClient organizationId={activeOrganizationId} initialImports={imports} />
        </div>
      ) : (
        <div className="mt-6 rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-700">กรุณาเลือกองค์กรก่อน</div>
      )}
    </div>
  );
}

