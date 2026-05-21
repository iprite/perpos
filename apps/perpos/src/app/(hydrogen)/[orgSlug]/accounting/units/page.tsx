import React from "react";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getActiveOrganizationId } from "@/lib/accounting/queries";
import { UnitsClient } from "@/components/inventory/units-client";
import type { ProductUnitRow } from "@/lib/inventory/actions";

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
    <div className="mx-auto w-full max-w-6xl px-4 py-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-xl font-semibold text-slate-900">หน่วยนับ</div>
          <div className="mt-1 text-sm text-slate-600">จัดการหน่วยนับสินค้าและบริการ</div>
        </div>
      </div>

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
    </div>
  );
}
