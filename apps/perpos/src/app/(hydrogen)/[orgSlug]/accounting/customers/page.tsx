import React from "react";

import { getActiveOrganizationId } from "@/lib/accounting/queries";
import { listContactsAction, type ContactRow } from "@/lib/contacts/actions";
import { ContactsClient } from "@/components/contacts/contacts-client";
import { PageShell } from "@/components/ui/page-shell";

export const dynamic = "force-dynamic";

export default async function CustomersPage() {
  const activeOrganizationId = await getActiveOrganizationId();

  let initialRows: ContactRow[] = [];

  if (activeOrganizationId) {
    const res = await listContactsAction({ organizationId: activeOrganizationId, contactType: "customer" });
    if (res.ok) initialRows = res.rows;
  }

  return (
    <PageShell
      width="default"
      title="ลูกค้า"
      description={<>รายชื่อลูกค้าขององค์กร</>}
    >
      {activeOrganizationId ? (
        <ContactsClient
          organizationId={activeOrganizationId}
          contactType="customer"
          initialRows={initialRows}
        />
      ) : (
        <div className="rounded-lg border border-dashed border-slate-200 py-12 text-center text-sm text-slate-500">กรุณาเลือกองค์กร</div>
      )}
    </PageShell>
  );
}
