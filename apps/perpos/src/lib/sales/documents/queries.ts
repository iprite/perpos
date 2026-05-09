import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getActiveOrganizationId } from "@/lib/accounting/queries";
import type { SaleDocType } from "@/components/sales/documents/doc-type-config";
import type { SaleDocRow } from "@/components/sales/documents/sale-docs-table";

export async function fetchSaleDocRows(docType: SaleDocType): Promise<{ rows: SaleDocRow[]; error: string | null }> {
  const activeOrganizationId = await getActiveOrganizationId();
  if (!activeOrganizationId) return { rows: [], error: null };

  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from("sale_documents")
    .select("id,organization_id,doc_number,issue_date,due_date,status,sub_total,vat_amount,total_amount,contact_id")
    .eq("organization_id", activeOrganizationId)
    .eq("doc_type", docType)
    .order("issue_date", { ascending: false })
    .limit(200);

  if (error) return { rows: [], error: error.message };

  const contactIds = Array.from(new Set((data ?? []).map((r: any) => String(r.contact_id))));
  const { data: contacts } = contactIds.length
    ? await supabase.from("contacts").select("id,name").in("id", contactIds)
    : { data: [] as any[] };

  const nameById = new Map<string, string>();
  for (const c of contacts ?? []) nameById.set(String((c as any).id), String((c as any).name));

  const rows: SaleDocRow[] = (data ?? []).map((r: any) => ({
    id:             String(r.id),
    organizationId: String(r.organization_id),
    docNumber:      r.doc_number  ? String(r.doc_number)  : null,
    issueDate:      String(r.issue_date),
    dueDate:        r.due_date    ? String(r.due_date)    : null,
    customerName:   nameById.get(String(r.contact_id)) ?? "-",
    subTotal:       Number(r.sub_total    ?? 0),
    vatAmount:      Number(r.vat_amount   ?? 0),
    totalAmount:    Number(r.total_amount ?? 0),
    status:         String(r.status) as any,
  }));

  return { rows, error: null };
}

export async function fetchNewDocPageData() {
  const activeOrganizationId = await getActiveOrganizationId();
  const supabase = await createSupabaseServerClient();

  let customers:       Array<{ id: string; label: string }> = [];
  let inventoryOptions: Array<{ id: string; label: string }> = [];
  let invoiceOptions:   Array<{ id: string; label: string }> = [];

  if (activeOrganizationId) {
    const { data: contacts } = await supabase
      .from("contacts")
      .select("id,name,contact_type,is_active")
      .eq("organization_id", activeOrganizationId)
      .eq("is_active", true)
      .in("contact_type", ["customer", "both"])
      .order("name", { ascending: true });

    customers = (contacts ?? []).map((c: any) => ({ id: String(c.id), label: String(c.name) }));

    const { data: inv } = await supabase
      .from("inventory_items")
      .select("id,sku,name,status")
      .eq("organization_id", activeOrganizationId)
      .eq("status", "active")
      .order("sku", { ascending: true })
      .limit(500);

    inventoryOptions = (inv ?? []).map((it: any) => ({
      id:    String(it.id),
      label: `${String(it.sku)} ${String(it.name)}`,
    }));

    const { data: invoices } = await supabase
      .from("invoices")
      .select("id,invoice_number,issue_date")
      .eq("organization_id", activeOrganizationId)
      .in("status", ["sent","paid","overdue"])
      .order("issue_date", { ascending: false })
      .limit(200);

    invoiceOptions = (invoices ?? []).map((iv: any) => ({
      id:    String(iv.id),
      label: `${String(iv.invoice_number ?? iv.id)} (${String(iv.issue_date)})`,
    }));
  }

  return { activeOrganizationId, customers, inventoryOptions, invoiceOptions };
}
