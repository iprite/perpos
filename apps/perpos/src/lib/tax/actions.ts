"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";

// ─── Types ────────────────────────────────────────────────────────────────────

export type PP30Row = {
  id: string;
  organization_id: string;
  filing_number: string;
  period_year: number;
  period_month: number;
  status: "draft" | "submitted" | "paid" | "received";
  output_vat_total: number;
  input_vat_total: number;
  net_vat: number;
  payment_amount: number | null;
  payment_ref: string | null;
  receipt_ref: string | null;
  submitted_at: string | null;
  notes: string | null;
  created_at: string;
};

export type PNDRow = {
  id: string;
  organization_id: string;
  pnd_type: "1" | "2" | "3" | "53";
  filing_number: string;
  period_year: number;
  period_month: number;
  status: "draft" | "submitted" | "paid";
  total_base_amount: number;
  total_wht_amount: number;
  submitted_at: string | null;
  notes: string | null;
  created_at: string;
};

export type WHTCertRow = {
  id: string;
  organization_id: string;
  certificate_no: string | null;
  wht_date: string;
  status: string;
  payer_name: string;
  payer_tax_id: string | null;
  receiver_name: string;
  receiver_tax_id: string | null;
  wht_category: string;
  wht_rate: number;
  base_amount: number;
  wht_amount: number;
  notes: string | null;
};

export type VatDocRow = {
  id: string;
  doc_type: string;
  doc_number: string | null;
  issue_date: string;
  contact_name: string | null;
  sub_total: number;
  vat_amount: number;
  status: string;
};

// ─── PP30 Actions ─────────────────────────────────────────────────────────────

export async function listPP30({
  organizationId,
}: {
  organizationId: string;
}): Promise<{ ok: true; rows: PP30Row[] } | { ok: false; error: string }> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("tax_pp30_filings")
    .select("*")
    .eq("organization_id", organizationId)
    .order("period_year", { ascending: false })
    .order("period_month", { ascending: false });

  if (error) return { ok: false, error: error.message };
  const rows: PP30Row[] = (data ?? []).map((r: any) => ({
    id: String(r.id),
    organization_id: String(r.organization_id),
    filing_number: String(r.filing_number),
    period_year: Number(r.period_year),
    period_month: Number(r.period_month),
    status: r.status as PP30Row["status"],
    output_vat_total: Number(r.output_vat_total ?? 0),
    input_vat_total: Number(r.input_vat_total ?? 0),
    net_vat: Number(r.net_vat ?? 0),
    payment_amount: r.payment_amount != null ? Number(r.payment_amount) : null,
    payment_ref: r.payment_ref ? String(r.payment_ref) : null,
    receipt_ref: r.receipt_ref ? String(r.receipt_ref) : null,
    submitted_at: r.submitted_at ? String(r.submitted_at) : null,
    notes: r.notes ? String(r.notes) : null,
    created_at: String(r.created_at),
  }));
  return { ok: true, rows };
}

export async function getPP30({
  organizationId,
  id,
}: {
  organizationId: string;
  id: string;
}): Promise<{ ok: true; row: PP30Row } | { ok: false; error: string }> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("tax_pp30_filings")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("id", id)
    .maybeSingle();

  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: "not_found" };

  const row: PP30Row = {
    id: String(data.id),
    organization_id: String(data.organization_id),
    filing_number: String(data.filing_number),
    period_year: Number(data.period_year),
    period_month: Number(data.period_month),
    status: data.status as PP30Row["status"],
    output_vat_total: Number(data.output_vat_total ?? 0),
    input_vat_total: Number(data.input_vat_total ?? 0),
    net_vat: Number(data.net_vat ?? 0),
    payment_amount: data.payment_amount != null ? Number(data.payment_amount) : null,
    payment_ref: data.payment_ref ? String(data.payment_ref) : null,
    receipt_ref: data.receipt_ref ? String(data.receipt_ref) : null,
    submitted_at: data.submitted_at ? String(data.submitted_at) : null,
    notes: data.notes ? String(data.notes) : null,
    created_at: String(data.created_at),
  };
  return { ok: true, row };
}

export async function createPP30({
  organizationId,
  period_year,
  period_month,
  output_vat_total,
  input_vat_total,
  net_vat,
  notes,
}: {
  organizationId: string;
  period_year: number;
  period_month: number;
  output_vat_total: number;
  input_vat_total: number;
  net_vat: number;
  notes?: string;
}): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const supabase = await createSupabaseServerClient();

  // Generate sequential filing number PP30-YYYYMM-NNN
  const prefix = `PP30-${period_year}${String(period_month).padStart(2, "0")}`;
  const { count } = await supabase
    .from("tax_pp30_filings")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", organizationId)
    .like("filing_number", `${prefix}%`);

  const seq = String((count ?? 0) + 1).padStart(3, "0");
  const filing_number = `${prefix}-${seq}`;

  const { data, error } = await supabase
    .from("tax_pp30_filings")
    .insert({
      organization_id: organizationId,
      filing_number,
      period_year,
      period_month,
      output_vat_total,
      input_vat_total,
      net_vat,
      notes: notes ?? null,
      status: "draft",
    })
    .select("id")
    .single();

  if (error) return { ok: false, error: error.message };
  revalidatePath("/tax/pp30");
  return { ok: true, id: String(data.id) };
}

export async function updatePP30Status({
  organizationId,
  id,
  status,
  payment_amount,
  payment_ref,
  receipt_ref,
  submitted_at,
}: {
  organizationId: string;
  id: string;
  status: PP30Row["status"];
  payment_amount?: number;
  payment_ref?: string;
  receipt_ref?: string;
  submitted_at?: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await createSupabaseServerClient();

  const updates: Record<string, unknown> = {
    status,
    updated_at: new Date().toISOString(),
  };
  if (payment_amount != null) updates.payment_amount = payment_amount;
  if (payment_ref != null) updates.payment_ref = payment_ref;
  if (receipt_ref != null) updates.receipt_ref = receipt_ref;
  if (submitted_at != null) updates.submitted_at = submitted_at;

  const { error } = await supabase
    .from("tax_pp30_filings")
    .update(updates)
    .eq("organization_id", organizationId)
    .eq("id", id);

  if (error) return { ok: false, error: error.message };
  revalidatePath("/tax/pp30");
  return { ok: true };
}

// ─── WHT Certificate Actions ──────────────────────────────────────────────────

export async function listWHTCerts({
  organizationId,
}: {
  organizationId: string;
}): Promise<{ ok: true; rows: WHTCertRow[] } | { ok: false; error: string }> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("wht_certificates")
    .select(
      "id,organization_id,certificate_no,wht_date,status,payer_name,payer_tax_id,receiver_name,receiver_tax_id,wht_category,wht_rate,base_amount,wht_amount,notes"
    )
    .eq("organization_id", organizationId)
    .order("wht_date", { ascending: false })
    .limit(500);

  if (error) return { ok: false, error: error.message };
  const rows: WHTCertRow[] = (data ?? []).map((r: any) => ({
    id: String(r.id),
    organization_id: String(r.organization_id),
    certificate_no: r.certificate_no ? String(r.certificate_no) : null,
    wht_date: String(r.wht_date),
    status: String(r.status),
    payer_name: String(r.payer_name ?? ""),
    payer_tax_id: r.payer_tax_id ? String(r.payer_tax_id) : null,
    receiver_name: String(r.receiver_name ?? ""),
    receiver_tax_id: r.receiver_tax_id ? String(r.receiver_tax_id) : null,
    wht_category: String(r.wht_category ?? ""),
    wht_rate: Number(r.wht_rate ?? 0),
    base_amount: Number(r.base_amount ?? 0),
    wht_amount: Number(r.wht_amount ?? 0),
    notes: r.notes ? String(r.notes) : null,
  }));
  return { ok: true, rows };
}

export async function getWHTCert({
  organizationId,
  id,
}: {
  organizationId: string;
  id: string;
}): Promise<{ ok: true; row: WHTCertRow } | { ok: false; error: string }> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("wht_certificates")
    .select(
      "id,organization_id,certificate_no,wht_date,status,payer_name,payer_tax_id,receiver_name,receiver_tax_id,wht_category,wht_rate,base_amount,wht_amount,notes"
    )
    .eq("organization_id", organizationId)
    .eq("id", id)
    .maybeSingle();

  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: "not_found" };

  const row: WHTCertRow = {
    id: String(data.id),
    organization_id: String(data.organization_id),
    certificate_no: data.certificate_no ? String(data.certificate_no) : null,
    wht_date: String(data.wht_date),
    status: String(data.status),
    payer_name: String((data as any).payer_name ?? ""),
    payer_tax_id: (data as any).payer_tax_id ? String((data as any).payer_tax_id) : null,
    receiver_name: String((data as any).receiver_name ?? ""),
    receiver_tax_id: (data as any).receiver_tax_id ? String((data as any).receiver_tax_id) : null,
    wht_category: String((data as any).wht_category ?? ""),
    wht_rate: Number((data as any).wht_rate ?? 0),
    base_amount: Number((data as any).base_amount ?? 0),
    wht_amount: Number((data as any).wht_amount ?? 0),
    notes: (data as any).notes ? String((data as any).notes) : null,
  };
  return { ok: true, row };
}

// ─── PND Filing Actions ───────────────────────────────────────────────────────

export async function listPNDFilings({
  organizationId,
  pnd_type,
}: {
  organizationId: string;
  pnd_type: string;
}): Promise<{ ok: true; rows: PNDRow[] } | { ok: false; error: string }> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("tax_pnd_filings")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("pnd_type", pnd_type)
    .order("period_year", { ascending: false })
    .order("period_month", { ascending: false });

  if (error) return { ok: false, error: error.message };
  const rows: PNDRow[] = (data ?? []).map((r: any) => ({
    id: String(r.id),
    organization_id: String(r.organization_id),
    pnd_type: r.pnd_type as PNDRow["pnd_type"],
    filing_number: String(r.filing_number),
    period_year: Number(r.period_year),
    period_month: Number(r.period_month),
    status: r.status as PNDRow["status"],
    total_base_amount: Number(r.total_base_amount ?? 0),
    total_wht_amount: Number(r.total_wht_amount ?? 0),
    submitted_at: r.submitted_at ? String(r.submitted_at) : null,
    notes: r.notes ? String(r.notes) : null,
    created_at: String(r.created_at),
  }));
  return { ok: true, rows };
}

// ─── VAT Document Actions ─────────────────────────────────────────────────────

export async function getVatSales({
  organizationId,
  year,
  month,
}: {
  organizationId: string;
  year: number;
  month: number;
}): Promise<{ ok: true; rows: VatDocRow[] } | { ok: false; error: string }> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("sale_documents")
    .select(
      "id,doc_type,doc_number,issue_date,sub_total,vat_amount,status,contacts!contact_id(name)"
    )
    .eq("organization_id", organizationId)
    .eq("doc_type", "tax_invoice")
    .gt("vat_amount", 0)
    .gte("issue_date", `${year}-${String(month).padStart(2, "0")}-01`)
    .lt(
      "issue_date",
      month === 12
        ? `${year + 1}-01-01`
        : `${year}-${String(month + 1).padStart(2, "0")}-01`
    )
    .order("issue_date", { ascending: false });

  if (error) return { ok: false, error: error.message };
  const rows: VatDocRow[] = (data ?? []).map((r: any) => ({
    id: String(r.id),
    doc_type: String(r.doc_type),
    doc_number: r.doc_number ? String(r.doc_number) : null,
    issue_date: String(r.issue_date),
    contact_name: r.contacts?.name ? String(r.contacts.name) : null,
    sub_total: Number(r.sub_total ?? 0),
    vat_amount: Number(r.vat_amount ?? 0),
    status: String(r.status),
  }));
  return { ok: true, rows };
}

export async function getVatPurchases({
  organizationId,
  year,
  month,
}: {
  organizationId: string;
  year: number;
  month: number;
}): Promise<{ ok: true; rows: VatDocRow[] } | { ok: false; error: string }> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("purchase_documents")
    .select(
      "id,doc_type,doc_number,issue_date,sub_total,vat_amount,status,contacts!contact_id(name)"
    )
    .eq("organization_id", organizationId)
    .eq("doc_type", "tax_invoice")
    .gt("vat_amount", 0)
    .gte("issue_date", `${year}-${String(month).padStart(2, "0")}-01`)
    .lt(
      "issue_date",
      month === 12
        ? `${year + 1}-01-01`
        : `${year}-${String(month + 1).padStart(2, "0")}-01`
    )
    .order("issue_date", { ascending: false });

  if (error) return { ok: false, error: error.message };
  const rows: VatDocRow[] = (data ?? []).map((r: any) => ({
    id: String(r.id),
    doc_type: String(r.doc_type),
    doc_number: r.doc_number ? String(r.doc_number) : null,
    issue_date: String(r.issue_date),
    contact_name: r.contacts?.name ? String(r.contacts.name) : null,
    sub_total: Number(r.sub_total ?? 0),
    vat_amount: Number(r.vat_amount ?? 0),
    status: String(r.status),
  }));
  return { ok: true, rows };
}
