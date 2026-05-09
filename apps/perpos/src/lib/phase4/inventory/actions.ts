"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";

export type InventoryItemRow = {
  id: string;
  sku: string;
  name: string;
  uom: string;
  currentStock: number;
  unitCost: number;
  inventoryAccountId: string | null;
  cogsAccountId: string | null;
  status: string;
};

export async function listInventoryItemsAction(params: { organizationId: string }) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("inventory_items")
    .select("id,sku,name,uom,current_stock,unit_cost,inventory_account_id,cogs_account_id,status")
    .eq("organization_id", params.organizationId)
    .order("sku", { ascending: true })
    .limit(500);
  if (error) return { ok: false as const, error: error.message ?? "query_failed" };
  const rows: InventoryItemRow[] = (data ?? []).map((r: any) => ({
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
  return { ok: true as const, rows };
}

export async function upsertInventoryItemAction(params: {
  organizationId: string;
  id?: string;
  sku: string;
  name: string;
  uom: string;
  inventoryAccountId?: string | null;
  cogsAccountId?: string | null;
  unitCost?: number;
  status: "active" | "inactive";
}) {
  const supabase = await createSupabaseServerClient();
  const payload: any = {
    organization_id: params.organizationId,
    sku: params.sku,
    name: params.name,
    uom: params.uom,
    inventory_account_id: params.inventoryAccountId ?? null,
    cogs_account_id: params.cogsAccountId ?? null,
    unit_cost: params.unitCost ?? 0,
    status: params.status,
  };
  if (params.id) payload.id = params.id;
  const { data, error } = await supabase.from("inventory_items").upsert(payload).select("id").maybeSingle();
  if (error) return { ok: false as const, error: error.message ?? "save_failed" };
  return { ok: true as const, id: String((data as any)?.id ?? params.id) };
}

export async function receiveInventoryAction(params: { organizationId: string; itemId: string; qty: number; unitCost: number }) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("rpc_inventory_receive", {
    p_organization_id: params.organizationId,
    p_inventory_item_id: params.itemId,
    p_qty: params.qty,
    p_unit_cost: params.unitCost,
    p_source_type: "manual",
    p_source_id: null,
  });
  if (error) return { ok: false as const, error: error.message ?? "rpc_failed" };
  return { ok: true as const, layerId: data ? String(data) : null };
}

export async function issueInventoryFifoAction(params: { organizationId: string; itemId: string; qty: number }) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("rpc_inventory_issue_fifo", {
    p_organization_id: params.organizationId,
    p_inventory_item_id: params.itemId,
    p_qty: params.qty,
    p_source_type: "manual",
    p_source_id: null,
  });
  if (error) return { ok: false as const, error: error.message ?? "rpc_failed" };
  return { ok: true as const, cogs: Number(data ?? 0) };
}

export async function listInventoryMovementsAction(params: { organizationId: string; limit: number }) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("inventory_movements")
    .select("id,inventory_item_id,movement_type,qty,unit_cost,source_type,source_id,created_at")
    .eq("organization_id", params.organizationId)
    .order("created_at", { ascending: false })
    .limit(params.limit);
  if (error) return { ok: false as const, error: error.message ?? "query_failed" };
  return { ok: true as const, rows: data ?? [] };
}

export async function listInventoryLayersAction(params: { organizationId: string; itemId: string }) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("inventory_layers")
    .select("id,qty_remaining,unit_cost,received_at,source_ref")
    .eq("organization_id", params.organizationId)
    .eq("inventory_item_id", params.itemId)
    .order("received_at", { ascending: true })
    .limit(500);
  if (error) return { ok: false as const, error: error.message ?? "query_failed" };
  return { ok: true as const, rows: data ?? [] };
}

export async function postInvoiceCogsAction(params: { invoiceId: string; organizationId: string }) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("rpc_post_invoice_cogs", { p_invoice_id: params.invoiceId });
  if (error) return { ok: false as const, error: error.message ?? "rpc_failed" };
  return { ok: true as const, journalEntryId: data ? String(data) : null };
}

