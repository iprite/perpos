import React from "react";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getActiveOrganizationId } from "@/lib/accounting/queries";
import { UnitsClient } from "@/components/inventory/units-client";
import type { ProductUnitRow } from "@/lib/inventory/actions";
import { PageShell } from "@/components/ui/page-shell";

export const dynamic = "force-dynamic";

export default async function UnitsPage() {
  const activeOrganizationId = await getActiveOrganizationId();
  const supabase = await createSupabaseServerClient();

  let units: ProductUnitRow[] = [];
  let error: string | null = null;

  if (activeOrganizationId) {
    const { data, error: e } = await supabase
      .from("product_units")
      .select("id,code,name,active")
      .eq("organization_id", activeOrganizationId)
      .order("code", { ascending: true })
      .limit(500);
    if (e) error = e.message;
    units = (data ?? []).map((r: any) => ({
      id: String(r.id),
      code: String(r.code),
      name: String(r.name),
      active: Boolean(r.active),
    }));
  }

  return (
    <PageShell
      width="default"
      title="หน่วยนับ"
      description={<>จัดการหน่วยนับสินค้าและบริการ</>}
    >
      {error ? (
        <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>
      ) : null}

      {activeOrganizationId ? (
        <div className="mt-6">
          <UnitsClient organizationId={activeOrganizationId} initialUnits={units} />
        </div>
      ) : (
        <div className="mt-6 rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-700">กรุณาเลือกองค์กร</div>
      )}
    </PageShell>
  );
}
