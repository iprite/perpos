"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";

export type VatType = "include" | "exclude" | "none";

export type CreateInvoiceItemInput = {
  productName: string;
  inventoryItemId?: string | null;
  quantity: string;
  unitPrice: string;
  vatType: VatType;
};

export type CreateInvoiceInput = {
  organizationId: string;
  contactId: string;
  issueDate: string;
  dueDate?: string | null;
  status: "draft" | "sent";
  withholdingTax?: string | null;
  notes?: string | null;
  items: CreateInvoiceItemInput[];
};

export async function createInvoiceAction(input: CreateInvoiceInput) {
  const supabase = await createSupabaseServerClient();

  const items = (input.items ?? []).map((it) => ({
    product_name: String(it.productName ?? "").trim(),
    inventory_item_id: it.inventoryItemId ? String(it.inventoryItemId) : null,
    quantity: String(it.quantity ?? "0"),
    unit_price: String(it.unitPrice ?? "0"),
    vat_type: it.vatType,
  }));

  const withholding = input.withholdingTax ? Number(input.withholdingTax) : null;

  const { data, error } = await supabase.rpc("create_invoice_and_post", {
    p_organization_id: input.organizationId,
    p_contact_id: input.contactId,
    p_issue_date: input.issueDate,
    p_due_date: input.dueDate ?? null,
    p_status: input.status,
    p_withholding_tax: withholding,
    p_notes: input.notes ?? "",
    p_items: items,
  });

  if (error) {
    const msg = error.message ?? "invoice_create_failed";
    return { ok: false as const, error: msg };
  }

  return { ok: true as const, invoiceId: String(data) };
}

export async function markInvoicePaidAction(params: { invoiceId: string; organizationId: string }) {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("invoices")
    .update({ status: "paid" })
    .eq("id", params.invoiceId)
    .eq("organization_id", params.organizationId);

  if (error) return { ok: false as const, error: error.message ?? "update_failed" };
  return { ok: true as const };
}

export async function voidInvoiceAction(params: { invoiceId: string; organizationId: string }) {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("invoices")
    .update({ status: "void" })
    .eq("id", params.invoiceId)
    .eq("organization_id", params.organizationId);

  if (error) return { ok: false as const, error: error.message ?? "update_failed" };
  return { ok: true as const };
}
