import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "../../_lib/supabase";
import { guard, handleCreate, p2pgError } from "../_lib";
import { FINANCIALS_CONFIG } from "../_configs";
import { canSeeSensitive, stripSensitiveFinancial, type P2pgFinancial } from "@/lib/p2p-group/types";

/** GET ?orgId=&period=YYYY-MM-01 (หรือ from/to) — viewer จะไม่ได้รับตัวเลขอ่อนไหว */
export async function GET(req: NextRequest) {
  const g = await guard(req);
  if (!g.ok) return g.res;

  const sp = req.nextUrl.searchParams;
  const admin = createAdminClient();
  let q = admin.from("p2pg_financials").select("*").eq("org_id", g.auth.orgId);

  const period = sp.get("period");
  if (period) q = q.eq("period_month", period);
  const from = sp.get("from");
  if (from) q = q.gte("period_month", from);
  const to = sp.get("to");
  if (to) q = q.lte("period_month", to);
  const companyId = sp.get("companyId");
  if (companyId) q = q.eq("company_id", companyId);

  const { data, error } = await q.order("period_month", { ascending: false });
  if (error) return p2pgError(error.message, 500);

  const rows = (data ?? []) as P2pgFinancial[];
  // strip ที่ server — ห้ามพึ่ง UI ซ่อน (contract §4)
  const safe = canSeeSensitive(g.auth.role) ? rows : rows.map(stripSensitiveFinancial);
  return NextResponse.json({ rows: safe, sensitiveVisible: canSeeSensitive(g.auth.role) });
}

/** POST = upsert งวดของบริษัท (กรอกมือ) */
export async function POST(req: NextRequest) {
  return handleCreate(req, FINANCIALS_CONFIG);
}
