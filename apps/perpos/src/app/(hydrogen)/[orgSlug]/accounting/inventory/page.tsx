import React from "react";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getActiveOrganizationId } from "@/lib/accounting/queries";
import { InventoryClient } from "@/components/phase4/inventory/inventory-client";
import type { InventoryItemRow } from "@/lib/phase4/inventory/actions";

export const dynamic = "force-dynamic";

export default async function InventoryPage() {
  const activeOrganizationId = await getActiveOrganizationId();
  const supabase = await createSupabaseServerClient();

  let items: InventoryItemRow[] = [];
  let error: string | null = null;

  if (activeOrganizationId) {
    const { data, error: e } = await supabase
      .from("inventory_items")
      .select("id,sku,name,uom,current_stock,unit_cost,inventory_account_id,cogs_account_id,status")
      .eq("organization_id", activeOrganizationId)
      .order("sku", { ascending: true })
      .limit(500);
    if (e) error = e.message;
    items = (data ?? []).map((r: any) => ({
      id: String(r.id),
      sku: String(r.sku),
      name: String(r.name),
      uom: String(r.uom),
      currentStock: Number(r.current_stock ?? 0),
      unitCost: Number(r.unit_cost ?? 0),
      inventoryAccountId: r.inventory_account_id ? String(r.inventory_account_id) : null,
      cogsAccountId: r.cogs_account_id ? String(r.cogs_account_id) : null,
      status: String(r.status),
    }));
  }

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-xl font-semibold text-slate-900">สินค้า/สต๊อก (FIFO)</div>
          <div className="mt-1 text-sm text-slate-600">ติดตามสต๊อกและคำนวณต้นทุนแบบ FIFO</div>
        </div>
      </div>

      {error ? <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div> : null}

      {activeOrganizationId ? (
        <div className="mt-6">
          <InventoryClient organizationId={activeOrganizationId} initialItems={items} />
        </div>
      ) : (
        <div className="mt-6 rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-700">กรุณาเลือกองค์กรก่อน</div>
      )}
    </div>
  );
}

