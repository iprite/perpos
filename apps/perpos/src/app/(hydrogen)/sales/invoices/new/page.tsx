import React from "react";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getActiveOrganizationId, getOrganizationsForCurrentUser } from "@/lib/accounting/queries";
import { OrgSwitcher } from "@/components/accounting/org-switcher";
import { InvoiceCreateForm, type CustomerOption, type InventoryOption } from "@/components/sales/invoices/invoice-create-form";

export const dynamic = "force-dynamic";

export default async function NewInvoicePage() {
  const organizations = await getOrganizationsForCurrentUser();
  const activeOrganizationId = await getActiveOrganizationId();
  const supabase = await createSupabaseServerClient();

  let customers: CustomerOption[] = [];
  let inventoryOptions: InventoryOption[] = [];
  if (activeOrganizationId) {
    const { data } = await supabase
      .from("contacts")
      .select("id,name,contact_type,is_active")
      .eq("organization_id", activeOrganizationId)
      .eq("is_active", true)
      .in("contact_type", ["customer", "both"])
      .order("name", { ascending: true });

    customers = (data ?? []).map((c: any) => ({ id: String(c.id), label: String(c.name) }));

    const { data: inv } = await supabase
      .from("inventory_items")
      .select("id,sku,name,status")
      .eq("organization_id", activeOrganizationId)
      .eq("status", "active")
      .order("sku", { ascending: true })
      .limit(500);
    inventoryOptions = (inv ?? []).map((it: any) => ({ id: String(it.id), label: `${String(it.sku)} ${String(it.name)}` }));
  }

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-xl font-semibold text-slate-900">สร้างใบแจ้งหนี้</div>
          <div className="mt-1 text-sm text-slate-600">คำนวณ VAT แบบเรียลไทม์ และโพสต์เข้าบัญชีอัตโนมัติ</div>
        </div>
        <OrgSwitcher organizations={organizations} activeOrganizationId={activeOrganizationId} />
      </div>

      <div className="mt-6">
        <InvoiceCreateForm
          organizations={organizations}
          activeOrganizationId={activeOrganizationId}
          customers={customers}
          inventoryOptions={inventoryOptions}
        />
      </div>
    </div>
  );
}
