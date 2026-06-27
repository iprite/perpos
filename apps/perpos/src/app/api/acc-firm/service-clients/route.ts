/**
 * /api/acc-firm/service-clients?orgId=<firmOrgId>
 *
 * GET   — list all service clients for the firm
 * POST  — create new client record
 * PATCH — update client record
 */

import { NextRequest, NextResponse } from "next/server";
import { requireModuleMember } from "../../_lib/module-auth";
import { createAdminClient } from "../../_lib/supabase";

export type ServiceClient = {
  id: string;
  client_code: string;
  company_name: string;
  fee_2023: number | null;
  fee_2024: number | null;
  fee_2025: number | null;
  fee_2026: number | null;
  fee_yearly: number | null;
  billing_note: string | null;
  svc_invoice: boolean;
  svc_billing: boolean;
  svc_expense: boolean;
  svc_sso: boolean;
  svc_pp30: boolean;
  svc_pnd: boolean;
  svc_pnd51: boolean;
  svc_pnd50: boolean;
  svc_close_f: boolean;
  note: string | null;
  is_active: boolean;
  created_at: string;
};

export async function GET(req: NextRequest) {
  const firmOrgId = req.nextUrl.searchParams.get("orgId");
  if (!firmOrgId) return NextResponse.json({ error: "missing orgId" }, { status: 400 });

  const auth = await requireModuleMember(req, firmOrgId, "acc_firm");
  if (!auth.ok) return auth.res;

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("acc_firm_service_clients")
    .select("*")
    .eq("firm_org_id", firmOrgId)
    .order("client_code");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { orgId, ...rest } = body;
  if (!orgId) return NextResponse.json({ error: "missing orgId" }, { status: 400 });

  const auth = await requireModuleMember(req, orgId, "acc_firm");
  if (!auth.ok) return auth.res;

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("acc_firm_service_clients")
    .insert({ firm_org_id: orgId, ...sanitize(rest) })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}

export async function PATCH(req: NextRequest) {
  const body = await req.json();
  const { orgId, id, ...rest } = body;
  if (!orgId || !id) return NextResponse.json({ error: "missing orgId or id" }, { status: 400 });

  const auth = await requireModuleMember(req, orgId, "acc_firm");
  if (!auth.ok) return auth.res;

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("acc_firm_service_clients")
    .update(sanitize(rest))
    .eq("id", id)
    .eq("firm_org_id", orgId)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

function sanitize(body: Record<string, unknown>) {
  const numFields = ["fee_2023", "fee_2024", "fee_2025", "fee_2026", "fee_yearly"] as const;
  const out: Record<string, unknown> = { ...body };
  for (const f of numFields) {
    if (f in out) {
      const v = out[f];
      out[f] = v !== null && v !== "" ? Number(v) : null;
    }
  }
  return out;
}
