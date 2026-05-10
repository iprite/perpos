"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getActiveOrganizationId } from "@/lib/accounting/queries";

export type BranchType = "head_office" | "branch" | "unspecified";

export type ContactRow = {
  id: string;
  name: string;
  taxId: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  notes: string | null;
  contactType: "customer" | "vendor" | "both" | "other";
  branchType: BranchType;
  branchNumber: string | null;
  isActive: boolean;
};

export async function listContactsAction(params: {
  organizationId: string;
  contactType?: "customer" | "vendor" | "both" | "other";
}): Promise<{ ok: true; rows: ContactRow[] } | { ok: false; error: string }> {
  const supabase = await createSupabaseServerClient();
  let q = supabase
    .from("contacts")
    .select("id,name,tax_id,email,phone,address,notes,contact_type,branch_type,branch_number,is_active")
    .eq("organization_id", params.organizationId)
    .order("name", { ascending: true })
    .limit(500);

  if (params.contactType === "customer") {
    q = q.in("contact_type", ["customer", "both"]);
  } else if (params.contactType === "vendor") {
    q = q.in("contact_type", ["vendor", "both"]);
  } else if (params.contactType) {
    q = q.eq("contact_type", params.contactType);
  }

  const { data, error } = await q;
  if (error) return { ok: false, error: error.message ?? "query_failed" };

  const rows: ContactRow[] = (data ?? []).map((r: any) => ({
    id:           String(r.id),
    name:         String(r.name),
    taxId:        r.tax_id        ? String(r.tax_id)        : null,
    email:        r.email         ? String(r.email)         : null,
    phone:        r.phone         ? String(r.phone)         : null,
    address:      r.address       ? String(r.address)       : null,
    notes:        r.notes         ? String(r.notes)         : null,
    contactType:  String(r.contact_type)  as ContactRow["contactType"],
    branchType:   (r.branch_type  ?? "unspecified")         as ContactRow["branchType"],
    branchNumber: r.branch_number ? String(r.branch_number) : null,
    isActive:     Boolean(r.is_active),
  }));
  return { ok: true, rows };
}

export async function upsertContactAction(params: {
  organizationId: string;
  id?: string;
  name: string;
  contactType: "customer" | "vendor" | "both" | "other";
  taxId?: string;
  email?: string;
  phone?: string;
  address?: string;
  notes?: string;
  branchType?: BranchType;
  branchNumber?: string;
  isActive?: boolean;
}): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const supabase = await createSupabaseServerClient();
  const branchType   = params.branchType   ?? "unspecified";
  const branchNumber = branchType === "branch" ? (params.branchNumber?.trim() || null) : null;
  const payload: any = {
    organization_id: params.organizationId,
    name:            params.name.trim(),
    contact_type:    params.contactType,
    tax_id:          params.taxId?.trim()   || null,
    email:           params.email?.trim()   || null,
    phone:           params.phone?.trim()   || null,
    address:         params.address?.trim() || null,
    notes:           params.notes?.trim()   || null,
    branch_type:     branchType,
    branch_number:   branchNumber,
    is_active:       params.isActive ?? true,
  };
  if (params.id) payload.id = params.id;

  const { data, error } = await supabase
    .from("contacts")
    .upsert(payload)
    .select("id")
    .maybeSingle();

  if (error) return { ok: false, error: error.message ?? "save_failed" };
  return { ok: true, id: String((data as any)?.id ?? params.id) };
}

export async function toggleContactActiveAction(params: {
  organizationId: string;
  id: string;
  isActive: boolean;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("contacts")
    .update({ is_active: params.isActive })
    .eq("id", params.id)
    .eq("organization_id", params.organizationId);
  if (error) return { ok: false, error: error.message ?? "update_failed" };
  return { ok: true };
}
