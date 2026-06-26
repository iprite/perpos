import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "../../../_lib/supabase";
import { requireTmcMember, canWriteFinance } from "../../_lib";
import { recordMetric } from "@/lib/metrics";

type PurchaseItem = {
  name: string;
  unit: string;
  qty: number;
  unitCost: number;
};

/**
 * POST /api/tmc/stock/purchase
 * Atomically: insert tmc_finance_entries (expense) + tmc_stock_movements (in)
 * via tmc_purchase_stock RPC (B1 — single transaction, no partial-write risk).
 * New item names not in the stock catalogue are auto-created inside the RPC.
 */
export async function POST(req: NextRequest) {
  const t0 = Date.now();
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const { orgId, date, accountId, category, propertyCode, note, items } = body as {
    orgId: string;
    date: string;
    accountId: string;
    category: string;
    propertyCode: string;
    note?: string;
    items: PurchaseItem[];
  };

  if (!orgId || !date || !accountId || !Array.isArray(items) || items.length === 0) {
    return NextResponse.json({ error: "missing required fields" }, { status: 400 });
  }

  const auth = await requireTmcMember(req, orgId);
  if (!auth.ok) return auth.res;
  if (!canWriteFinance(auth.role)) {
    return NextResponse.json({ error: "ไม่มีสิทธิ์" }, { status: 403 });
  }

  const admin = createAdminClient();

  const { data, error } = await admin.rpc("tmc_purchase_stock", {
    p_org_id: orgId,
    p_account_id: accountId,
    p_date: date,
    p_category: category ?? "",
    p_property_code: propertyCode ?? "",
    p_note: note ?? null,
    p_created_by: auth.userId,
    p_items: items,
  });

  if (error) {
    void recordMetric({ orgId, route: "/api/tmc/stock/purchase", method: "POST", status: 500, t0 });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  void recordMetric({ orgId, route: "/api/tmc/stock/purchase", method: "POST", status: 201, t0 });
  return NextResponse.json({ ok: true, ...(data as Record<string, unknown>) }, { status: 201 });
}
