import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getActiveOrganizationId } from "@/lib/accounting/queries";
import type { PurchaseDocType } from "@/components/purchase/documents/purchase-doc-type-config";
import type { PurchaseDocRow } from "@/components/purchase/documents/purchase-docs-table";

export async function fetchPurchaseDocRows(
  docType: PurchaseDocType,
): Promise<{ rows: PurchaseDocRow[]; error: string | null }> {
  const activeOrganizationId = await getActiveOrganizationId();
  if (!activeOrganizationId) return { rows: [], error: null };

  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from("purchase_documents")
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

  const rows: PurchaseDocRow[] = (data ?? []).map((r: any) => ({
    id:             String(r.id),
    organizationId: String(r.organization_id),
    docNumber:      r.doc_number  ? String(r.doc_number)  : null,
    issueDate:      String(r.issue_date),
    dueDate:        r.due_date    ? String(r.due_date)    : null,
    vendorName:     nameById.get(String(r.contact_id)) ?? "-",
    subTotal:       Number(r.sub_total    ?? 0),
    vatAmount:      Number(r.vat_amount   ?? 0),
    totalAmount:    Number(r.total_amount ?? 0),
    status:         String(r.status) as any,
  }));

  return { rows, error: null };
}

export async function fetchNewPurchaseDocPageData() {
  const activeOrganizationId = await getActiveOrganizationId();
  const supabase = await createSupabaseServerClient();

  let vendors:          Array<{ id: string; label: string }> = [];
  let inventoryOptions: Array<{ id: string; label: string }> = [];
  let refDocOptions:    Array<{ id: string; label: string }> = [];

  if (activeOrganizationId) {
    const { data: contacts } = await supabase
      .from("contacts")
      .select("id,name,contact_type,is_active")
      .eq("organization_id", activeOrganizationId)
      .eq("is_active", true)
      .in("contact_type", ["vendor", "both"])
      .order("name", { ascending: true });

    vendors = (contacts ?? []).map((c: any) => ({ id: String(c.id), label: String(c.name) }));

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

    const { data: pos } = await supabase
      .from("purchase_documents")
      .select("id,doc_number,issue_date,doc_type")
      .eq("organization_id", activeOrganizationId)
      .in("status", ["issued","approved"])
      .order("issue_date", { ascending: false })
      .limit(200);

    refDocOptions = (pos ?? []).map((d: any) => ({
      id:    String(d.id),
      label: `${String(d.doc_number ?? d.id)} (${String(d.issue_date)})`,
    }));
  }

  return { activeOrganizationId, vendors, inventoryOptions, refDocOptions };
}
