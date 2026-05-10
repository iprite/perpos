"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";

// ---- Product Units ----

export type ProductUnitRow = {
  id: string;
  code: string;
  name: string;
  active: boolean;
};

export async function listProductUnitsAction(params: { organizationId: string }): Promise<{ ok: true; rows: ProductUnitRow[] } | { ok: false; error: string }> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("product_units")
    .select("id,code,name,active")
    .eq("organization_id", params.organizationId)
    .order("code", { ascending: true })
    .limit(500);
  if (error) return { ok: false, error: error.message ?? "query_failed" };
  const rows: ProductUnitRow[] = (data ?? []).map((r: any) => ({
    id: String(r.id),
    code: String(r.code),
    name: String(r.name),
    active: Boolean(r.active),
  }));
  return { ok: true, rows };
}

export async function upsertProductUnitAction(params: {
  organizationId: string;
  id?: string;
  code: string;
  name: string;
  active: boolean;
}): Promise<{ ok: true; id?: string } | { ok: false; error: string }> {
  const supabase = await createSupabaseServerClient();
  const payload: any = {
    organization_id: params.organizationId,
    code: params.code.trim(),
    name: params.name.trim(),
    active: params.active,
  };
  if (params.id) payload.id = params.id;
  const { data, error } = await supabase.from("product_units").upsert(payload).select("id").maybeSingle();
  if (error) return { ok: false, error: error.message ?? "save_failed" };
  return { ok: true, id: String((data as any)?.id ?? params.id) };
}

export async function deleteProductUnitAction(params: { id: string }): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("product_units").delete().eq("id", params.id);
  if (error) return { ok: false, error: error.message ?? "delete_failed" };
  return { ok: true };
}

// ---- Stock Requisitions ----

export type RequisitionRow = {
  id: string;
  docNumber: string;
  docDate: string;
  requester: string | null;
  department: string | null;
  notes: string | null;
  status: string;
  createdAt: string;
};

export async function listStockRequisitionsAction(params: { organizationId: string }): Promise<{ ok: true; rows: RequisitionRow[] } | { ok: false; error: string }> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("stock_requisitions")
    .select("id,doc_number,doc_date,requester,department,notes,status,created_at")
    .eq("organization_id", params.organizationId)
    .order("created_at", { ascending: false })
    .limit(500);
  if (error) return { ok: false, error: error.message ?? "query_failed" };
  const rows: RequisitionRow[] = (data ?? []).map((r: any) => ({
    id: String(r.id),
    docNumber: String(r.doc_number),
    docDate: String(r.doc_date),
    requester: r.requester ? String(r.requester) : null,
    department: r.department ? String(r.department) : null,
    notes: r.notes ? String(r.notes) : null,
    status: String(r.status),
    createdAt: String(r.created_at),
  }));
  return { ok: true, rows };
}

export async function createStockRequisitionAction(params: {
  organizationId: string;
  docNumber: string;
  docDate: string;
  requester?: string;
  department?: string;
  notes?: string;
  items: { inventoryItemId?: string; productName: string; qty: number; unit: string; notes?: string }[];
}): Promise<{ ok: true; id?: string } | { ok: false; error: string }> {
  const supabase = await createSupabaseServerClient();
  const { data: header, error: headerErr } = await supabase
    .from("stock_requisitions")
    .insert({
      organization_id: params.organizationId,
      doc_number: params.docNumber.trim(),
      doc_date: params.docDate,
      requester: params.requester?.trim() ?? null,
      department: params.department?.trim() ?? null,
      notes: params.notes?.trim() ?? null,
      status: "draft",
    })
    .select("id")
    .maybeSingle();
  if (headerErr) return { ok: false, error: headerErr.message ?? "insert_failed" };
  const requisitionId = String((header as any)?.id);

  if (params.items.length > 0) {
    const itemRows = params.items.map((item, idx) => ({
      requisition_id: requisitionId,
      inventory_item_id: item.inventoryItemId ?? null,
      product_name: item.productName,
      qty: item.qty,
      unit: item.unit || "EA",
      notes: item.notes ?? null,
      sort_order: idx,
    }));
    const { error: itemsErr } = await supabase.from("stock_requisition_items").insert(itemRows);
    if (itemsErr) return { ok: false, error: itemsErr.message ?? "items_insert_failed" };
  }

  return { ok: true, id: requisitionId };
}

export async function updateRequisitionStatusAction(params: {
  id: string;
  status: "draft" | "approved" | "issued" | "cancelled";
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("stock_requisitions")
    .update({ status: params.status, updated_at: new Date().toISOString() })
    .eq("id", params.id);
  if (error) return { ok: false, error: error.message ?? "update_failed" };
  return { ok: true };
}

// ---- Stock Returns ----

export type ReturnRow = {
  id: string;
  docNumber: string;
  docDate: string;
  requisitionId: string | null;
  notes: string | null;
  status: string;
  createdAt: string;
};

export async function listStockReturnsAction(params: { organizationId: string }): Promise<{ ok: true; rows: ReturnRow[] } | { ok: false; error: string }> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("stock_returns")
    .select("id,doc_number,doc_date,requisition_id,notes,status,created_at")
    .eq("organization_id", params.organizationId)
    .order("created_at", { ascending: false })
    .limit(500);
  if (error) return { ok: false, error: error.message ?? "query_failed" };
  const rows: ReturnRow[] = (data ?? []).map((r: any) => ({
    id: String(r.id),
    docNumber: String(r.doc_number),
    docDate: String(r.doc_date),
    requisitionId: r.requisition_id ? String(r.requisition_id) : null,
    notes: r.notes ? String(r.notes) : null,
    status: String(r.status),
    createdAt: String(r.created_at),
  }));
  return { ok: true, rows };
}

export async function createStockReturnAction(params: {
  organizationId: string;
  requisitionId?: string;
  docNumber: string;
  docDate: string;
  notes?: string;
  items: { inventoryItemId?: string; productName: string; qty: number; unit: string }[];
}): Promise<{ ok: true; id?: string } | { ok: false; error: string }> {
  const supabase = await createSupabaseServerClient();
  const { data: header, error: headerErr } = await supabase
    .from("stock_returns")
    .insert({
      organization_id: params.organizationId,
      requisition_id: params.requisitionId ?? null,
      doc_number: params.docNumber.trim(),
      doc_date: params.docDate,
      notes: params.notes?.trim() ?? null,
      status: "draft",
    })
    .select("id")
    .maybeSingle();
  if (headerErr) return { ok: false, error: headerErr.message ?? "insert_failed" };
  const returnId = String((header as any)?.id);

  if (params.items.length > 0) {
    const itemRows = params.items.map((item, idx) => ({
      return_id: returnId,
      inventory_item_id: item.inventoryItemId ?? null,
      product_name: item.productName,
      qty: item.qty,
      unit: item.unit || "EA",
      sort_order: idx,
    }));
    const { error: itemsErr } = await supabase.from("stock_return_items").insert(itemRows);
    if (itemsErr) return { ok: false, error: itemsErr.message ?? "items_insert_failed" };
  }

  return { ok: true, id: returnId };
}
