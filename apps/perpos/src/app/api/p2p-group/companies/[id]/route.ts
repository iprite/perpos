import { NextRequest } from "next/server";
import { createAdminClient } from "../../../_lib/supabase";
import { guard, handleUpdate, p2pgError } from "../../_lib";
import { COMPANIES_CONFIG } from "../../_configs";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  return handleUpdate(req, id, COMPANIES_CONFIG);
}

/** ลบได้เฉพาะบริษัทที่ยังไม่มีข้อมูลอ้างอิง (กันงบ/รายการหาย) */
export async function DELETE(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const g = await guard(req, { write: true });
  if (!g.ok) return g.res;

  const admin = createAdminClient();
  const refs: { table: string; column: string; label: string }[] = [
    { table: "p2pg_financials", column: "company_id", label: "ตัวเลขรายเดือน" },
    { table: "p2pg_investments", column: "company_id", label: "เงินลงทุน" },
    { table: "p2pg_dividends", column: "company_id", label: "เงินปันผล" },
    { table: "p2pg_bank_accounts", column: "company_id", label: "บัญชีธนาคาร" },
    { table: "p2pg_intercompany", column: "from_company_id", label: "รายการระหว่างกัน" },
    { table: "p2pg_intercompany", column: "to_company_id", label: "รายการระหว่างกัน" },
    { table: "p2pg_loans", column: "lender_company_id", label: "สัญญาเงินกู้" },
    { table: "p2pg_loans", column: "borrower_company_id", label: "สัญญาเงินกู้" },
  ];

  const blocking: string[] = [];
  for (const r of refs) {
    const { count } = await admin
      .from(r.table)
      .select("id", { count: "exact", head: true })
      .eq("org_id", g.auth.orgId)
      .eq(r.column, id);
    if ((count ?? 0) > 0 && !blocking.includes(r.label)) blocking.push(r.label);
  }
  if (blocking.length > 0) {
    return p2pgError(
      `ลบไม่ได้ — ยังมีข้อมูลผูกอยู่ (${blocking.join(", ")}) · ถ้าเลิกกิจการแล้วให้เปลี่ยนสถานะเป็น "เลิกกิจการ" แทน`,
      409,
    );
  }

  const { error } = await admin
    .from("p2pg_companies")
    .delete()
    .eq("id", id)
    .eq("org_id", g.auth.orgId);
  if (error) return p2pgError(error.message, 500);
  return Response.json({ ok: true });
}
