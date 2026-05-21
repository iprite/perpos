import React from "react";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getActiveOrganizationId } from "@/lib/accounting/queries";
import { ReturnsClient } from "@/components/inventory/returns-client";
import type { ReturnRow } from "@/lib/inventory/actions";

export const dynamic = "force-dynamic";

export default async function ReturnsPage() {
  const activeOrganizationId = await getActiveOrganizationId();
  const supabase = await createSupabaseServerClient();

  let rows: ReturnRow[] = [];
  let inventoryItems: { id: string; name: string; uom: string }[] = [];
  let error: string | null = null;

  if (activeOrganizationId) {
    const [retResult, itemsResult] = await Promise.all([
      supabase
        .from("stock_returns")
        .select("id,doc_number,doc_date,requisition_id,notes,status,created_at")
        .eq("organization_id", activeOrganizationId)
        .order("created_at", { ascending: false })
        .limit(500),
      supabase
        .from("inventory_items")
        .select("id,name,uom")
        .eq("organization_id", activeOrganizationId)
        .eq("status", "active")
        .order("name", { ascending: true })
        .limit(500),
    ]);

    if (retResult.error) error = retResult.error.message;
    rows = (retResult.data ?? []).map((r: any) => ({
      id: String(r.id),
      docNumber: String(r.doc_number),
      docDate: String(r.doc_date),
      requisitionId: r.requisition_id ? String(r.requisition_id) : null,
      notes: r.notes ? String(r.notes) : null,
      status: String(r.status),
      createdAt: String(r.created_at),
    }));

    inventoryItems = (itemsResult.data ?? []).map((r: any) => ({
      id: String(r.id),
      name: String(r.name),
      uom: String(r.uom),
    }));
  }

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-xl font-semibold text-slate-900">ใบส่งคืนเบิกสินค้า</div>
          <div className="mt-1 text-sm text-slate-600">บันทึกการส่งคืนสินค้า</div>
        </div>
      </div>

      {error ? (
        <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>
      ) : null}

      {activeOrganizationId ? (
        <div className="mt-6">
          <ReturnsClient
            organizationId={activeOrganizationId}
            initialRows={rows}
            inventoryItems={inventoryItems}
          />
        </div>
      ) : (
        <div className="mt-6 rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-700">กรุณาเลือกองค์กร</div>
      )}
    </div>
  );
}
