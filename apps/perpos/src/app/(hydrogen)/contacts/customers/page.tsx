import React from "react";

import { getActiveOrganizationId } from "@/lib/accounting/queries";
import { listContactsAction, type ContactRow } from "@/lib/contacts/actions";
import { ContactsClient } from "@/components/contacts/contacts-client";

export const dynamic = "force-dynamic";

export default async function CustomersPage() {
  const activeOrganizationId = await getActiveOrganizationId();

  let initialRows: ContactRow[] = [];

  if (activeOrganizationId) {
    const res = await listContactsAction({ organizationId: activeOrganizationId, contactType: "customer" });
    if (res.ok) initialRows = res.rows;
  }

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-6">
      <div className="mb-6">
        <div className="text-xl font-semibold text-slate-900">ลูกค้า</div>
        <div className="mt-1 text-sm text-slate-600">รายชื่อลูกค้าขององค์กร</div>
      </div>

      {activeOrganizationId ? (
        <ContactsClient
          organizationId={activeOrganizationId}
          contactType="customer"
          initialRows={initialRows}
        />
      ) : (
        <div className="rounded-lg border border-dashed border-slate-200 py-12 text-center text-sm text-slate-500">กรุณาเลือกองค์กร</div>
      )}
    </div>
  );
}
