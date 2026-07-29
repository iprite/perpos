import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "../../_lib/supabase";
import { canSeeSensitive } from "@/lib/p2p-group/types";
import { guard, handleCreate, p2pgError } from "../_lib";
import { INTERCOMPANY_CONFIG } from "../_configs";

/** GET ?orgId=&from=&to=&unconfirmed=1 */
export async function GET(req: NextRequest) {
  const g = await guard(req);
  if (!g.ok) return g.res;
  if (!canSeeSensitive(g.auth.role)) return p2pgError("ไม่มีสิทธิ์ดูข้อมูลส่วนนี้", 403);

  const sp = req.nextUrl.searchParams;
  const admin = createAdminClient();
  let q = admin.from("p2pg_intercompany").select("*").eq("org_id", g.auth.orgId);

  const from = sp.get("from");
  if (from) q = q.gte("txn_date", from);
  const to = sp.get("to");
  if (to) q = q.lte("txn_date", to);
  if (sp.get("unconfirmed") === "1")
    q = q.eq("counterparty_confirmed", false).neq("status", "cancelled");

  const { data, error } = await q.order("txn_date", { ascending: false });
  if (error) return p2pgError(error.message, 500);
  return NextResponse.json({ rows: data ?? [] });
}

export async function POST(req: NextRequest) {
  return handleCreate(req, INTERCOMPANY_CONFIG);
}
