import React from "react";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getActiveOrganizationId, getOrganizationsForCurrentUser } from "@/lib/accounting/queries";
import { OrgSwitcher } from "@/components/accounting/org-switcher";
import { InvoicesTable, type InvoiceRow } from "@/components/sales/invoices/invoices-table";

export const dynamic = "force-dynamic";

export default async function InvoicesListPage() {
  const organizations = await getOrganizationsForCurrentUser();
  const activeOrganizationId = await getActiveOrganizationId();
  const supabase = await createSupabaseServerClient();

  let rows: InvoiceRow[] = [];
  let error: string | null = null;

  if (activeOrganizationId) {
    const { data, error: e } = await supabase
      .from("invoices")
      .select("id,organization_id,invoice_number,issue_date,due_date,status,sub_total,vat_amount,total_amount,posted_journal_entry_id,cogs_journal_entry_id,contact_id")
      .eq("organization_id", activeOrganizationId)
      .order("issue_date", { ascending: false })
      .limit(200);

    if (e) {
      error = e.message;
    } else {
      const contactIds = Array.from(new Set((data ?? []).map((r: any) => String(r.contact_id))));
      const { data: contacts } = contactIds.length
        ? await supabase.from("contacts").select("id,name").in("id", contactIds)
        : { data: [] as any[] };
      const nameById = new Map<string, string>();
      for (const c of contacts ?? []) nameById.set(String((c as any).id), String((c as any).name));

      rows = (data ?? []).map((r: any) => ({
        id: String(r.id),
        organizationId: String(r.organization_id),
        invoiceNumber: r.invoice_number ? String(r.invoice_number) : null,
        issueDate: String(r.issue_date),
        dueDate: r.due_date ? String(r.due_date) : null,
        customerName: nameById.get(String(r.contact_id)) ?? "-",
        subTotal: Number(r.sub_total ?? 0),
        vatAmount: Number(r.vat_amount ?? 0),
        totalAmount: Number(r.total_amount ?? 0),
        status: String(r.status) as any,
        postedJournalEntryId: r.posted_journal_entry_id ? String(r.posted_journal_entry_id) : null,
        cogsJournalEntryId: r.cogs_journal_entry_id ? String(r.cogs_journal_entry_id) : null,
      }));
    }
  }

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-xl font-semibold text-slate-900">ใบแจ้งหนี้</div>
          <div className="mt-1 text-sm text-slate-600">รายการใบแจ้งหนี้/ใบกำกับภาษีขององค์กร</div>
        </div>
        <OrgSwitcher organizations={organizations} activeOrganizationId={activeOrganizationId} />
      </div>

      {error ? <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div> : null}

      <div className="mt-6">
        <InvoicesTable organizations={organizations} activeOrganizationId={activeOrganizationId} rows={rows} />
      </div>
    </div>
  );
}
