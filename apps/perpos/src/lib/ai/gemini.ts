import { createSupabaseAdminClient } from "../supabase/admin";

/**
 * Client accounting context used to prime the AI bookkeeping pipeline.
 *
 * NOTE: The heavy OCR / classification / journal-generation logic has moved to the
 * Cloud Run `ocr-worker` service (services/ocr-worker) so it does not hit Vercel's
 * Route Handler timeout. This module only exposes the read-only context loader,
 * which is still consumed by the `/api/acc-firm/ocr/client-context` route to
 * pre-populate the review workspace.
 */
export type ClientContext = {
  client_id: string;
  client_name: string;
  business_type: string;
  vat_registered: boolean;
  withholding_tax_required: boolean;
  accounting_method: string;
  chart_of_accounts: Array<{ id: string; code: string; name: string; type: string }>;
  posting_rules: unknown[];
  /** contacts — id included so UI can populate per-contact lookups */
  contacts: Array<{ id: string; name: string; tax_id: string | null; contact_type: string }>;
};

/**
 * Fetches client organization details, active Chart of Accounts, posting config,
 * and contacts to build the Client Context payload.
 */
export async function getClientContext(
  firmOrgId: string,
  clientOrgId: string,
): Promise<ClientContext> {
  const admin = createSupabaseAdminClient();

  // 1. Organization details
  const { data: org, error: orgError } = await admin
    .from("organizations")
    .select("id, name")
    .eq("id", clientOrgId)
    .single();
  if (orgError) throw new Error(`Failed to load client organization: ${orgError.message}`);

  // 2. Active Chart of Accounts (acc_accounts — column: account_type ไม่ใช่ type)
  const { data: accounts, error: accountsError } = await admin
    .from("acc_accounts")
    .select("id, code, name, account_type")
    .eq("org_id", clientOrgId)
    .eq("is_active", true);
  if (accountsError) throw new Error(`Failed to load client accounts: ${accountsError.message}`);

  // 3. Client configuration (acc_firm_client_configs)
  const { data: config, error: configError } = await admin
    .from("acc_firm_client_configs")
    .select("*")
    .eq("firm_org_id", firmOrgId)
    .eq("client_org_id", clientOrgId)
    .maybeSingle();
  if (configError) throw new Error(`Failed to load client configuration: ${configError.message}`);

  // 4. Contacts for context matching (acc_contacts — column: kind ไม่ใช่ contact_type, ไม่มี is_active)
  const { data: contacts } = await admin
    .from("acc_contacts")
    .select("id, name, tax_id, kind")
    .eq("org_id", clientOrgId)
    .limit(100);

  // map account_type → type เพื่อ ClientContext ที่ AI prompt ใช้
  const chartOfAccounts = (accounts ?? []).map((a) => ({
    id: a.id as string,
    code: a.code as string,
    name: a.name as string,
    type: a.account_type as string,
  }));

  // map kind → contact_type + include id สำหรับ UI dropdown
  const contactList = (contacts ?? []).map((c) => ({
    id: c.id as string,
    name: c.name as string,
    tax_id: (c.tax_id ?? null) as string | null,
    contact_type: c.kind as string,
  }));

  return {
    client_id: clientOrgId,
    client_name: org.name,
    business_type: "general",
    vat_registered: config ? config.vat_registered : true,
    withholding_tax_required: config ? config.withholding_tax_required : true,
    accounting_method: config ? config.accounting_method : "accrual",
    chart_of_accounts: chartOfAccounts,
    posting_rules: config?.custom_posting_rules ?? [],
    contacts: contactList,
  };
}
