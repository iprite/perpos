import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "../../../_lib/supabase";
import { setAuditContext } from "../../../_lib/audit";
import { guard, handleDelete, handleUpdate, p2pgError } from "../../_lib";
import { INTERCOMPANY_CONFIG } from "../../_configs";

type Ctx = { params: Promise<{ id: string }> };

/**
 * PATCH — แก้รายการ หรือ `action:"confirm"` = คู่สัญญายืนยันยอด (กระทบยอด)
 * การยืนยันเก็บ `confirmed_by`/`confirmed_at` เพื่อรู้ว่าใครรับรอง ไม่ใช่แค่ธงบูลีน
 */
export async function PATCH(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const body = (await req.clone().json().catch(() => ({}))) as { action?: string };

  if (body.action !== "confirm") return handleUpdate(req, id, INTERCOMPANY_CONFIG);

  const g = await guard(req, { write: true });
  if (!g.ok) return g.res;

  const admin = createAdminClient();
  await setAuditContext(req, g.auth.userId, g.auth.orgId);

  const { data, error } = await admin
    .from("p2pg_intercompany")
    .update({
      counterparty_confirmed: true,
      confirmed_at: new Date().toISOString(),
      confirmed_by: g.auth.userId,
    })
    .eq("id", id)
    .eq("org_id", g.auth.orgId)
    .select()
    .maybeSingle();

  if (error) return p2pgError(error.message, 500);
  if (!data) return p2pgError("ไม่พบรายการนี้", 404);
  return NextResponse.json({ row: data });
}

export async function DELETE(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  return handleDelete(req, id, INTERCOMPANY_CONFIG);
}
