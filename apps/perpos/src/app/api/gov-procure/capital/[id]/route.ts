import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "../../../_lib/supabase";
import { setAuditContext } from "../../../_lib/audit";
import { requireGovProcureMember, canManageSettings, orgIdFromQuery, govError } from "../../_lib";

// DELETE /api/gov-procure/capital/[id]?orgId=... → ลบรายการเงินทุน (owner/manager)
export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const orgId = orgIdFromQuery(req);
  if (!orgId) return govError("missing orgId");

  const auth = await requireGovProcureMember(req, orgId);
  if (!auth.ok) return auth.res;
  if (!canManageSettings(auth.role)) {
    return govError("ไม่มีสิทธิ์ลบรายการเงินทุน (เฉพาะเจ้าของ/ผู้จัดการ)", 403);
  }

  const { id } = await ctx.params;
  const admin = createAdminClient();
  await setAuditContext(req, auth.userId, orgId);

  const { error, count } = await admin
    .from("gov_procure_capital_flows")
    .delete({ count: "exact" })
    .eq("id", id)
    .eq("org_id", orgId);

  if (error) return govError(error.message, 500);
  if (!count) return govError("ไม่พบรายการนี้", 404);
  return NextResponse.json({ ok: true });
}
