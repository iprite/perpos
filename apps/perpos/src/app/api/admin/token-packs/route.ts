/**
 * Super admin: แคตตาล็อกแพ็กเครดิต (token_packs)
 *   GET /api/admin/token-packs
 *   PUT /api/admin/token-packs  body { code, name?, price?, tokens?, bonusTokens?, isActive?, sortOrder? }
 *     code ใหม่ = สร้าง · code เดิม = อัปเดต (stripe_price_id จะถูกล้างเมื่อ price เปลี่ยน → สร้างใหม่ตอน checkout)
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
    .from("token_packs")
    .select("code, name, price, tokens, bonus_tokens, stripe_price_id, is_active, sort_order")
    .order("sort_order");
  return ok({ packs: data ?? [] });
}

export async function PUT(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (!auth.ok) return auth.res;
  const body = await req.json().catch(() => null);
  const code = String(body?.code ?? "").trim();
  if (!code) return Err.invalidFormat("code", "ต้องมี code");

  const admin = createAdminClient();
  const { data: existing } = await admin
    .from("token_packs")
    .select("code, price, stripe_price_id")
    .eq("code", code)
    .maybeSingle();

  const patch: Record<string, unknown> = { code, updated_at: new Date().toISOString() };
  if (body.name !== undefined) patch.name = String(body.name);
  if (body.price !== undefined) {
    const price = Number(body.price);
    if (!Number.isFinite(price) || price <= 0) return Err.invalidFormat("price", "ต้อง > 0");
    patch.price = price;
    // ราคาเปลี่ยน → ล้าง stripe_price_id เดิม (checkout จะสร้าง price ใหม่)
    if (existing && Number(existing.price) !== price) patch.stripe_price_id = null;
  }
  if (body.tokens !== undefined) {
    const tokens = Number(body.tokens);
    if (!Number.isFinite(tokens) || tokens <= 0) return Err.invalidFormat("tokens", "ต้อง > 0");
    patch.tokens = Math.round(tokens);
  }
  if (body.bonusTokens !== undefined)
    patch.bonus_tokens = Math.max(0, Math.round(Number(body.bonusTokens) || 0));
  if (body.isActive !== undefined) patch.is_active = !!body.isActive;
  if (body.sortOrder !== undefined) patch.sort_order = Math.round(Number(body.sortOrder) || 0);

  if (
    !existing &&
    (patch.name === undefined || patch.price === undefined || patch.tokens === undefined)
  ) {
    return Err.invalidFormat("pack", "แพ็กใหม่ต้องมี name, price, tokens");
  }

  const { error } = await admin.from("token_packs").upsert(patch, { onConflict: "code" });
  if (error) return Err.dbError(error);
  await logAdminAction(req, auth.userId, {
    action: existing ? "token.pack_update" : "token.pack_create",
    targetType: "token_pack",
    targetId: code,
    metadata: patch,
  });
  return ok({ code });
}
