/**
 * getAutotopupConfig — สถานะเติมเครดิตอัตโนมัติ + บัตรที่บันทึก + แพ็กที่เปิดขาย (per-profile)
 *
 * ใช้ร่วมกัน:
 *   - API   GET /api/assistant/tokens/autotopup (client refresh หลัง mutation)
 *   - Page  /assistant/billing (SSR initial)
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export type TokenPack = {
  code: string;
  name: string;
  price: number;
  tokens: number;
  bonus_tokens: number;
  sort_order: number;
};

export type AutotopupConfig = {
  enabled: boolean;
  thresholdTokens: number;
  packCode: string | null;
  hasCard: boolean;
  card: { brand: string | null; last4: string | null } | null;
  status: string;
  lastChargedAt: string | null;
  lastError: string | null;
  packs: TokenPack[];
};

type AutoRow = {
  enabled: boolean;
  threshold_tokens: number;
  pack_code: string | null;
  stripe_payment_method_id: string | null;
  card_brand: string | null;
  card_last4: string | null;
  status: string;
  last_charged_at: string | null;
  last_error: string | null;
};

export async function getAutotopupConfig(
  admin: SupabaseClient,
  userId: string,
): Promise<AutotopupConfig> {
  const [{ data: row }, { data: packs }] = await Promise.all([
    admin
      .from("token_autotopup")
      .select(
        "enabled, threshold_tokens, pack_code, stripe_payment_method_id, card_brand, card_last4, status, last_charged_at, last_error",
      )
      .eq("profile_id", userId)
      .maybeSingle(),
    admin
      .from("token_packs")
      .select("code, name, price, tokens, bonus_tokens, sort_order")
      .eq("is_active", true)
      .order("sort_order"),
  ]);
  const r = row as AutoRow | null;

  return {
    enabled: r?.enabled ?? false,
    thresholdTokens: r?.threshold_tokens ?? 500,
    packCode: r?.pack_code ?? null,
    hasCard: !!r?.stripe_payment_method_id,
    card: r?.stripe_payment_method_id ? { brand: r.card_brand, last4: r.card_last4 } : null,
    status: r?.status ?? "idle",
    lastChargedAt: r?.last_charged_at ?? null,
    lastError: r?.last_error ?? null,
    packs: (packs ?? []) as TokenPack[],
  };
}
