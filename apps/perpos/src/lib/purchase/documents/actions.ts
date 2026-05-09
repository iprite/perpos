"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { PurchaseDocType } from "@/components/purchase/documents/purchase-doc-type-config";

export type CreatePurchaseDocItemInput = {
  productName:      string;
  inventoryItemId?: string | null;
  quantity:         string;
  unitPrice:        string;
  vatType:          "include" | "exclude" | "none";
};

export type CreatePurchaseDocInput = {
  organizationId:  string;
  docType:         PurchaseDocType;
  contactId:       string;
  issueDate:       string;
  dueDate?:        string | null;
  status:          "draft" | "issued";
  withholdingTax?: string | null;
  notes?:          string | null;
  refDocId?:       string | null;
  items:           CreatePurchaseDocItemInput[];
};

export async function createPurchaseDocumentAction(input: CreatePurchaseDocInput) {
  const supabase = await createSupabaseServerClient();

  const items = (input.items ?? []).map((it) => ({
    product_name:      String(it.productName ?? "").trim(),
    inventory_item_id: it.inventoryItemId || null,
    quantity:          String(it.quantity  ?? "0"),
    unit_price:        String(it.unitPrice ?? "0"),
    vat_type:          it.vatType,
  }));

  const { data, error } = await supabase.rpc("create_purchase_document", {
    p_organization_id: input.organizationId,
    p_doc_type:        input.docType,
    p_contact_id:      input.contactId,
    p_issue_date:      input.issueDate,
    p_due_date:        input.dueDate         ?? null,
    p_status:          input.status,
    p_withholding_tax: input.withholdingTax ? Number(input.withholdingTax) : null,
    p_notes:           input.notes           ?? "",
    p_items:           items,
    p_ref_doc_id:      input.refDocId        ?? null,
  });

  if (error) return { ok: false as const, error: error.message ?? "create_failed" };
  return { ok: true as const, docId: String(data) };
}

export async function voidPurchaseDocumentAction(params: { docId: string; organizationId: string }) {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("update_purchase_document_status", {
    p_organization_id: params.organizationId,
    p_doc_id:          params.docId,
    p_status:          "voided",
  });
  if (error) return { ok: false as const, error: error.message ?? "void_failed" };
  return { ok: true as const };
}

export async function issuePurchaseDocumentAction(params: { docId: string; organizationId: string }) {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("update_purchase_document_status", {
    p_organization_id: params.organizationId,
    p_doc_id:          params.docId,
    p_status:          "issued",
  });
  if (error) return { ok: false as const, error: error.message ?? "issue_failed" };
  return { ok: true as const };
}

export async function approvePurchaseOrderAction(params: { docId: string; organizationId: string }) {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("update_purchase_document_status", {
    p_organization_id: params.organizationId,
    p_doc_id:          params.docId,
    p_status:          "approved",
  });
  if (error) return { ok: false as const, error: error.message ?? "approve_failed" };
  return { ok: true as const };
}

export async function receivePurchaseOrderAction(params: { docId: string; organizationId: string }) {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("update_purchase_document_status", {
    p_organization_id: params.organizationId,
    p_doc_id:          params.docId,
    p_status:          "received",
  });
  if (error) return { ok: false as const, error: error.message ?? "receive_failed" };
  return { ok: true as const };
}
