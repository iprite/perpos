import React from "react";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getOrganizationsForCurrentUser, getActiveOrganizationId } from "@/lib/accounting/queries";
import { JournalEntryForm, type AccountOption, type ContactOption } from "@/components/accounting/journal-entry-form";
import { PageShell } from "@/components/ui/page-shell";

export const dynamic = "force-dynamic";

export default async function JournalPage() {
  const organizations        = await getOrganizationsForCurrentUser();
  const activeOrganizationId = await getActiveOrganizationId();
  const supabase = await createSupabaseServerClient();

  let accounts: AccountOption[] = [];
  let contacts: ContactOption[] = [];
  let error: string | null = null;

  if (activeOrganizationId) {
    const [{ data: a, error: ae }, { data: c, error: ce }] = await Promise.all([
      supabase
        .from("accounts")
        .select("id,code,name,type,is_active")
        .eq("organization_id", activeOrganizationId)
        .eq("is_active", true)
        .order("code", { ascending: true }),
      supabase
        .from("contacts")
        .select("id,name,contact_type,is_active")
        .eq("organization_id", activeOrganizationId)
        .eq("is_active", true)
        .order("name", { ascending: true }),
    ]);

    if (ae) error = ae.message;
    if (ce) error = error ? `${error}; ${ce.message}` : ce.message;

    accounts = (a ?? []).map((r: any) => ({
      id: String(r.id),
      label: `${r.code} ${r.name}`,
      type: r.type,
    }));
    contacts = (c ?? []).map((r: any) => ({
      id: String(r.id),
      label: String(r.name),
      type: r.contact_type,
    }));
  }

  return (
    <PageShell
      width="default"
      title="บันทึกสมุดรายวัน"
      description={<>สร้างรายการเดบิต/เครดิตแบบหลายบรรทัด</>}
    >
      {error ? <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div> : null}

      <div className="mt-6 rounded-xl border border-slate-200 bg-white p-5">
        <JournalEntryForm
          organizations={organizations}
          activeOrganizationId={activeOrganizationId}
          accounts={accounts}
          contacts={contacts}
        />
      </div>
    </PageShell>
  );
}
