/**
 * Super admin: อัตราแปลงหน่วย → token (token_rates)
 *   GET /api/admin/token-rates
 *   PUT /api/admin/token-rates  body { service, tokensPerUnit }
 */

import { NextRequest } from "next/server";
import { requireAdmin } from "../../_lib/auth";
import { createAdminClient } from "../../_lib/supabase";
import { ok, Err } from "../../_lib/response";
import { logAdminAction } from "../../_lib/admin-audit";

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (!auth.ok) return auth.res;
  const admin = createAdminClient();
  const { data } = await admin
    .from("token_rates")
    .select("service, unit, tokens_per_unit, updated_at")
    .order("service");
  return ok({ rates: data ?? [] });
}

export async function PUT(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (!auth.ok) return auth.res;
  const body = await req.json().catch(() => null);
  const service = String(body?.service ?? "");
  const tokensPerUnit = Number(body?.tokensPerUnit);
  if (!["stt", "bot", "pdf"].includes(service)) return Err.invalidFormat("service", "stt|bot|pdf");
  if (!Number.isFinite(tokensPerUnit) || tokensPerUnit < 0)
    return Err.invalidFormat("tokensPerUnit", "ต้องเป็นจำนวน ≥ 0");

  const admin = createAdminClient();
  const { error } = await admin
    .from("token_rates")
    .update({
      tokens_per_unit: tokensPerUnit,
      updated_by: auth.userId,
      updated_at: new Date().toISOString(),
    })
    .eq("service", service);
  if (error) return Err.dbError(error);
  await logAdminAction(req, auth.userId, {
    action: "token.rate_set",
    targetType: "token_rate",
    targetId: service,
    metadata: { tokensPerUnit },
  });
  return ok({ service, tokensPerUnit });
}
