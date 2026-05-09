"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { SaleDocType } from "@/components/sales/documents/doc-type-config";

export type CreateSaleDocItemInput = {
  productName:     string;
  inventoryItemId?: string | null;
  quantity:        string;
  unitPrice:       string;
  vatType:         "include" | "exclude" | "none";
};

export type CreateSaleDocInput = {
  organizationId:  string;
  docType:         SaleDocType;
  contactId:       string;
  issueDate:       string;
  dueDate?:        string | null;
  status:          "draft" | "issued";
  withholdingTax?: string | null;
  notes?:          string | null;
  refInvoiceId?:   string | null;
  items:           CreateSaleDocItemInput[];
};

export async function createSaleDocumentAction(input: CreateSaleDocInput) {
  const supabase = await createSupabaseServerClient();

  const items = (input.items ?? []).map((it) => ({
    product_name:      String(it.productName ?? "").trim(),
    inventory_item_id: it.inventoryItemId || null,
    quantity:          String(it.quantity ?? "0"),
    unit_price:        String(it.unitPrice ?? "0"),
    vat_type:          it.vatType,
  }));

  const { data, error } = await supabase.rpc("create_sale_document", {
    p_organization_id: input.organizationId,
    p_doc_type:        input.docType,
    p_contact_id:      input.contactId,
    p_issue_date:      input.issueDate,
    p_due_date:        input.dueDate   ?? null,
    p_status:          input.status,
    p_withholding_tax: input.withholdingTax ? Number(input.withholdingTax) : null,
    p_notes:           input.notes         ?? "",
    p_items:           items,
    p_ref_invoice_id:  input.refInvoiceId  ?? null,
  });

  if (error) return { ok: false as const, error: error.message ?? "create_failed" };
  return { ok: true as const, docId: String(data) };
}

export async function voidSaleDocumentAction(params: { docId: string; organizationId: string }) {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("update_sale_document_status", {
    p_organization_id: params.organizationId,
    p_doc_id:          params.docId,
    p_status:          "voided",
  });
  if (error) return { ok: false as const, error: error.message ?? "void_failed" };
  return { ok: true as const };
}

export async function issueSaleDocumentAction(params: { docId: string; organizationId: string }) {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("update_sale_document_status", {
    p_organization_id: params.organizationId,
    p_doc_id:          params.docId,
    p_status:          "issued",
  });
  if (error) return { ok: false as const, error: error.message ?? "issue_failed" };
  return { ok: true as const };
}

export async function updateQuotationStatusAction(params: {
  docId:          string;
  organizationId: string;
  status:         "accepted" | "rejected" | "expired";
}) {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("update_sale_document_status", {
    p_organization_id: params.organizationId,
    p_doc_id:          params.docId,
    p_status:          params.status,
  });
  if (error) return { ok: false as const, error: error.message ?? "update_failed" };
  return { ok: true as const };
}
