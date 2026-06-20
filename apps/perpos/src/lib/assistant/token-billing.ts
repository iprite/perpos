import type Stripe from "stripe";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Token billing helpers (prepaid top-up + auto top-up)
 *   - ensureTokenCustomer: get-or-create Stripe customer ต่อ profile (เก็บใน token_autotopup)
 *   - ensurePackPrice: get-or-create Stripe Price (one-time) ของ token_pack
 * token_autotopup = per-profile billing record (มี row แม้ยังไม่เปิด auto — เก็บ customer/บัตร)
 */

export type TokenPack = {
  code: string;
  name: string;
  price: number;
  currency: string;
  tokens: number;
  bonus_tokens: number;
  stripe_price_id: string | null;
  is_active: boolean;
};

/** ดึง token_pack ที่เปิดขายตาม code */
export async function getActivePack(
  admin: SupabaseClient,
  code: string,
): Promise<TokenPack | null> {
  const { data } = await admin
    .from("token_packs")
    .select("code, name, price, currency, tokens, bonus_tokens, stripe_price_id, is_active")
    .eq("code", code)
    .maybeSingle();
  const p = data as TokenPack | null;
  return p && p.is_active ? p : null;
}

/** ensure แถว token_autotopup (per-profile billing record) + คืน stripe_customer_id (สร้างถ้ายังไม่มี) */
export async function ensureTokenCustomer(
  admin: SupabaseClient,
  stripe: Stripe,
  profileId: string,
  email?: string,
): Promise<string> {
  const { data: row } = await admin
    .from("token_autotopup")
    .select("stripe_customer_id")
    .eq("profile_id", profileId)
    .maybeSingle();
  const existing = (row as { stripe_customer_id?: string } | null)?.stripe_customer_id;
  if (existing) return String(existing);

  const customer = await stripe.customers.create({
    email: email && !email.endsWith("@stt-line.perpos.io") ? email : undefined,
    metadata: { kind: "token", profile_id: profileId },
  });
  await admin
    .from("token_autotopup")
    .upsert(
      {
        profile_id: profileId,
        stripe_customer_id: customer.id,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "profile_id" },
    );
  return customer.id;
}

/** get-or-create Stripe Price (one-time) ของ pack — เก็บ price id กลับ token_packs */
export async function ensurePackPrice(
  admin: SupabaseClient,
  stripe: Stripe,
  pack: TokenPack,
): Promise<string> {
  const unitAmount = Math.round(Number(pack.price) * 100);
  let priceId = pack.stripe_price_id ?? "";
  if (priceId) {
    const existing = await stripe.prices.retrieve(priceId).catch(() => null);
    if (
      !existing ||
      existing.currency !== "thb" ||
      existing.unit_amount !== unitAmount ||
      existing.recurring
    )
      priceId = "";
  }
  if (!priceId) {
    const price = await stripe.prices.create({
      currency: "thb",
      unit_amount: unitAmount,
      product_data: { name: `PERPOS Assistant | เครดิต — ${pack.name}` },
      metadata: { kind: "token_topup", pack_code: pack.code },
    });
    priceId = price.id;
    await admin
      .from("token_packs")
      .update({ stripe_price_id: priceId, updated_at: new Date().toISOString() })
      .eq("code", pack.code);
  }
  return priceId;
}
