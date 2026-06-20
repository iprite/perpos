/**
 * Super admin: ดู/เติมเครดิต (token) ของผู้ใช้
 *   GET  /api/admin/tokens?profileId=<uuid>  — ยอด + ledger ล่าสุด
 *   POST /api/admin/tokens  body { profileId, tokens, reason? } — เติมมือ (kind=adjust, ไม่กระทบ revenue)
 */

import { NextRequest } from "next/server";
import { requireAdmin } from "../../_lib/auth";
import { createAdminClient } from "../../_lib/supabase";
import { ok, Err } from "../../_lib/response";
import { logAdminAction } from "../../_lib/admin-audit";

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (!auth.ok) return auth.res;
  const profileId = req.nextUrl.searchParams.get("profileId") ?? "";
  if (!profileId) return Err.invalidFormat("profileId", "required");

  const admin = createAdminClient();
  const [{ data: acc }, { data: ledger }] = await Promise.all([
    admin
      .from("token_accounts")
      .select("balance_tokens, lifetime_granted, lifetime_spent")
      .eq("profile_id", profileId)
      .maybeSingle(),
    admin
      .from("token_ledger")
      .select("kind, service, tokens, balance_after, revenue_thb, reason, created_at")
      .eq("profile_id", profileId)
      .order("created_at", { ascending: false })
      .limit(50),
  ]);
  return ok({
    balance_tokens: Number((acc as { balance_tokens?: number } | null)?.balance_tokens ?? 0),
    lifetime_granted: Number((acc as { lifetime_granted?: number } | null)?.lifetime_granted ?? 0),
    lifetime_spent: Number((acc as { lifetime_spent?: number } | null)?.lifetime_spent ?? 0),
    ledger: ledger ?? [],
  });
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (!auth.ok) return auth.res;
  const body = await req.json().catch(() => null);
  const profileId = String(body?.profileId ?? "");
  const tokens = Number(body?.tokens);
  const reason = String(body?.reason ?? "admin_adjust");
  if (!profileId) return Err.invalidFormat("profileId", "required");
  if (!Number.isFinite(tokens) || tokens <= 0) return Err.invalidFormat("tokens", "ต้อง > 0");

  const admin = createAdminClient();
  const { data, error } = await admin.rpc("token_admin_grant", {
    p_profile_id: profileId,
    p_tokens: Math.round(tokens),
    p_reason: reason,
  });
  if (error) return Err.dbError(error);
  await logAdminAction(req, auth.userId, {
    action: "token.admin_grant",
    targetType: "profile",
    targetId: profileId,
    metadata: { tokens, reason },
  });
  return ok({ grant: data });
}
