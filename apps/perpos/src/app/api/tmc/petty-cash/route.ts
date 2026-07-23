import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "../../_lib/supabase";
import { requireTmcMember, canWriteFinance } from "../_lib";
import { recordMetric } from "@/lib/metrics";

/** GET /api/tmc/petty-cash?orgId=&fundId=&from=&to=&type= */
export async function GET(req: NextRequest) {
  const t0 = Date.now();
  const p = req.nextUrl.searchParams;
  const orgId = p.get("orgId") ?? "";
  if (!orgId) return NextResponse.json({ error: "missing orgId" }, { status: 400 });

  const auth = await requireTmcMember(req, orgId);
  if (!auth.ok) return auth.res;

  let q = auth.rls
    .from("tmc_petty_cash_txns")
    .select("*, tmc_petty_cash_funds(name)")
    .eq("org_id", orgId)
    .order("txn_date", { ascending: false })
    .order("created_at", { ascending: false });

  const fundIds = p.get("fundIds")
    ? p.get("fundIds")!.split(",").filter(Boolean)
    : p.get("fundId")
      ? [p.get("fundId")!]
      : [];
  if (fundIds.length === 1) q = q.eq("fund_id", fundIds[0]);
  else if (fundIds.length > 1) q = q.in("fund_id", fundIds);
  if (p.get("txnType")) q = q.eq("txn_type", p.get("txnType")!);
  const propCodes = p.get("propertyCodes")
    ? p.get("propertyCodes")!.split(",").filter(Boolean)
    : p.get("propertyCode")
      ? [p.get("propertyCode")!]
      : [];
  if (propCodes.length === 1) q = q.eq("property_code", propCodes[0]);
  else if (propCodes.length > 1) q = q.in("property_code", propCodes);
  const cats = p.get("categories") ? p.get("categories")!.split(",").filter(Boolean) : [];
  if (cats.length === 1) q = q.eq("category", cats[0]);
  else if (cats.length > 1) q = q.in("category", cats);
  if (p.get("from")) q = q.gte("txn_date", p.get("from")!);
  if (p.get("to")) q = q.lte("txn_date", p.get("to")!);

  // กัน PostgREST ตัดที่ 1,000 แถวเงียบ ๆ (ยอดรวม/สรุปรายเดือนต้องครบ)
  const { data, error } = await q.range(0, 9999);
  if (error) {
    void recordMetric({ orgId, route: "/api/tmc/petty-cash", method: req.method, status: 500, t0 });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const txns = data ?? [];
  const totalTopUp = txns
    .filter((t) => t.txn_type === "top_up")
    .reduce((s: number, t: Record<string, unknown>) => s + Number(t.amount), 0);
  const totalExpense = txns
    .filter((t) => t.txn_type === "expense")
    .reduce((s: number, t: Record<string, unknown>) => s + Number(t.amount), 0);

  void recordMetric({ orgId, route: "/api/tmc/petty-cash", method: req.method, status: 200, t0 });
  return NextResponse.json({ txns, totalTopUp, totalExpense, balance: totalTopUp - totalExpense });
}

/** POST /api/tmc/petty-cash  → add transaction */
export async function POST(req: NextRequest) {
  const t0 = Date.now();
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const { orgId, fundId, txnDate, txnType, amount, description, category, propertyCode, note } =
    body as Record<string, string>;

  if (!orgId || !fundId || !txnDate || !txnType || !amount || !description) {
    return NextResponse.json({ error: "missing required fields" }, { status: 400 });
  }
  if (!["top_up", "expense"].includes(txnType)) {
    return NextResponse.json({ error: "invalid txn_type" }, { status: 400 });
  }

  const auth = await requireTmcMember(req, orgId);
  if (!auth.ok) return auth.res;
  if (!canWriteFinance(auth.role)) {
    return NextResponse.json({ error: "ต้องการสิทธิ์ team_lead ขึ้นไป" }, { status: 403 });
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("tmc_petty_cash_txns")
    .insert({
      fund_id: fundId,
      org_id: orgId,
      txn_date: txnDate,
      txn_type: txnType,
      amount: Number(amount),
      description,
      category: category || null,
      property_code: propertyCode || null,
      note: note || null,
      created_by: auth.userId,
    })
    .select("*, tmc_petty_cash_funds(name)")
    .single();

  if (error) {
    void recordMetric({ orgId, route: "/api/tmc/petty-cash", method: req.method, status: 500, t0 });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  void recordMetric({ orgId, route: "/api/tmc/petty-cash", method: req.method, status: 201, t0 });
  return NextResponse.json(data, { status: 201 });
}

/** PUT /api/tmc/petty-cash  → edit transaction */
export async function PUT(req: NextRequest) {
  const t0 = Date.now();
  const body = (await req.json().catch(() => ({}))) as Record<string, string>;
  const { id, orgId, txnDate, txnType, amount, description, category, propertyCode, note } = body;
  if (!id || !orgId) return NextResponse.json({ error: "missing id or orgId" }, { status: 400 });

  const auth = await requireTmcMember(req, orgId);
  if (!auth.ok) return auth.res;
  if (!canWriteFinance(auth.role)) {
    return NextResponse.json({ error: "ต้องการสิทธิ์ team_lead ขึ้นไป" }, { status: 403 });
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("tmc_petty_cash_txns")
    .update({
      txn_date: txnDate,
      txn_type: txnType,
      amount: Number(amount),
      description,
      category: category || null,
      property_code: propertyCode || null,
      note: note || null,
    })
    .eq("id", id)
    .eq("org_id", orgId)
    .select("*, tmc_petty_cash_funds(name)")
    .single();

  if (error) {
    void recordMetric({ orgId, route: "/api/tmc/petty-cash", method: req.method, status: 500, t0 });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  void recordMetric({ orgId, route: "/api/tmc/petty-cash", method: req.method, status: 200, t0 });
  return NextResponse.json(data);
}

/** DELETE /api/tmc/petty-cash?id=&orgId= */
export async function DELETE(req: NextRequest) {
  const t0 = Date.now();
  const p = req.nextUrl.searchParams;
  const id = p.get("id") ?? "";
  const orgId = p.get("orgId") ?? "";
  if (!id || !orgId) return NextResponse.json({ error: "missing id or orgId" }, { status: 400 });

  const auth = await requireTmcMember(req, orgId);
  if (!auth.ok) return auth.res;
  if (!["owner", "admin", "team_lead"].includes(auth.role)) {
    return NextResponse.json({ error: "ต้องการสิทธิ์ team_lead ขึ้นไป" }, { status: 403 });
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("tmc_petty_cash_txns")
    .delete()
    .eq("id", id)
    .eq("org_id", orgId);

  if (error) {
    void recordMetric({ orgId, route: "/api/tmc/petty-cash", method: req.method, status: 500, t0 });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  void recordMetric({ orgId, route: "/api/tmc/petty-cash", method: req.method, status: 200, t0 });
  return NextResponse.json({ ok: true });
}
