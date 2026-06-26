/**
 * /api/acc-firm/petty-cash?orgId=<firmOrgId>&page=1&pageSize=50&category=...&from=...&to=...
 *
 * GET    — paginated petty cash list + summary totals for the filter set
 * POST   — add new entry
 * PATCH  — edit entry
 * DELETE — delete entry (body: { orgId, id })
 */

import { NextRequest, NextResponse } from "next/server";
import { requireModuleMember } from "../../_lib/module-auth";
import { createAdminClient } from "../../_lib/supabase";

export type PettyCashEntry = {
  id: string;
  entry_date: string;
  description: string;
  company: string | null;
  category: string | null;
  payee: string | null;
  amount_out: number | null;
  amount_in: number | null;
  collected: number | null;
  note: string | null;
  created_at: string;
};

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const firmOrgId = searchParams.get("orgId");
  if (!firmOrgId) return NextResponse.json({ error: "missing orgId" }, { status: 400 });

  const auth = await requireModuleMember(req, firmOrgId, "acc_firm");
  if (!auth.ok) return auth.res;

  const admin = createAdminClient();
  const page = Math.max(1, Number(searchParams.get("page") || 1));
  const pageSize = Math.min(200, Math.max(10, Number(searchParams.get("pageSize") || 50)));
  const category = searchParams.get("category") || "";
  const from = searchParams.get("from") || "";
  const to = searchParams.get("to") || "";
  const search = searchParams.get("search") || "";

  // Paginated list
  let q = admin
    .from("acc_firm_petty_cash")
    .select("*", { count: "exact" })
    .eq("firm_org_id", firmOrgId);

  if (category) q = q.eq("category", category);
  if (from) q = q.gte("entry_date", from);
  if (to) q = q.lte("entry_date", to);
  if (search) q = q.ilike("description", `%${search}%`);

  q = q
    .order("entry_date", { ascending: false })
    .order("created_at", { ascending: false })
    .range((page - 1) * pageSize, page * pageSize - 1);

  const { data, error, count } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Summary totals across full filter set (no pagination)
  let totalsQ = admin
    .from("acc_firm_petty_cash")
    .select("amount_out, amount_in, collected")
    .eq("firm_org_id", firmOrgId);

  if (category) totalsQ = totalsQ.eq("category", category);
  if (from) totalsQ = totalsQ.gte("entry_date", from);
  if (to) totalsQ = totalsQ.lte("entry_date", to);
  if (search) totalsQ = totalsQ.ilike("description", `%${search}%`);

  const { data: allRows } = await totalsQ;

  const totals = (allRows ?? []).reduce(
    (acc, r) => ({
      total_out: acc.total_out + Number(r.amount_out ?? 0),
      total_in: acc.total_in + Number(r.amount_in ?? 0),
      total_collected: acc.total_collected + Number(r.collected ?? 0),
    }),
    { total_out: 0, total_in: 0, total_collected: 0 },
  );

  // Distinct categories for filter dropdown
  const { data: cats } = await admin
    .from("acc_firm_petty_cash")
    .select("category")
    .eq("firm_org_id", firmOrgId)
    .not("category", "is", null);

  const catMap: Record<string, true> = {};
  (cats ?? []).forEach((c) => {
    if (c.category) catMap[c.category] = true;
  });
  const categories = Object.keys(catMap).sort();

  return NextResponse.json({
    entries: data ?? [],
    total: count ?? 0,
    page,
    pageSize,
    totals,
    categories,
  });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const {
    orgId,
    entry_date,
    description,
    company,
    category,
    payee,
    amount_out,
    amount_in,
    collected,
    note,
  } = body;

  if (!orgId || !entry_date || !description)
    return NextResponse.json({ error: "missing required fields" }, { status: 400 });

  const auth = await requireModuleMember(req, orgId, "acc_firm");
  if (!auth.ok) return auth.res;
  if (auth.moduleRole === "viewer")
    return NextResponse.json({ error: "ไม่มีสิทธิ์เพิ่มรายการ" }, { status: 403 });

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("acc_firm_petty_cash")
    .insert({
      firm_org_id: orgId,
      entry_date,
      description,
      company: company || null,
      category: category || null,
      payee: payee || null,
      amount_out: amount_out != null && amount_out !== "" ? Number(amount_out) : null,
      amount_in: amount_in != null && amount_in !== "" ? Number(amount_in) : null,
      collected: collected != null && collected !== "" ? Number(collected) : null,
      note: note || null,
      created_by: auth.userId,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}

export async function PATCH(req: NextRequest) {
  const body = await req.json();
  const {
    orgId,
    id,
    entry_date,
    description,
    company,
    category,
    payee,
    amount_out,
    amount_in,
    collected,
    note,
  } = body;

  if (!orgId || !id) return NextResponse.json({ error: "missing orgId or id" }, { status: 400 });

  const auth = await requireModuleMember(req, orgId, "acc_firm");
  if (!auth.ok) return auth.res;
  if (auth.moduleRole === "viewer")
    return NextResponse.json({ error: "ไม่มีสิทธิ์แก้ไขรายการ" }, { status: 403 });

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("acc_firm_petty_cash")
    .update({
      entry_date,
      description,
      company: company || null,
      category: category || null,
      payee: payee || null,
      amount_out: amount_out != null && amount_out !== "" ? Number(amount_out) : null,
      amount_in: amount_in != null && amount_in !== "" ? Number(amount_in) : null,
      collected: collected != null && collected !== "" ? Number(collected) : null,
      note: note || null,
    })
    .eq("id", id)
    .eq("firm_org_id", orgId)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function DELETE(req: NextRequest) {
  const body = await req.json();
  const { orgId, id } = body;
  if (!orgId || !id) return NextResponse.json({ error: "missing orgId or id" }, { status: 400 });

  const auth = await requireModuleMember(req, orgId, "acc_firm");
  if (!auth.ok) return auth.res;
  if (auth.moduleRole === "viewer")
    return NextResponse.json({ error: "ไม่มีสิทธิ์ลบรายการ" }, { status: 403 });

  const admin = createAdminClient();
  const { error } = await admin
    .from("acc_firm_petty_cash")
    .delete()
    .eq("id", id)
    .eq("firm_org_id", orgId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
