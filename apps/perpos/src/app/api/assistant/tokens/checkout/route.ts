/**
 * POST /api/assistant/tokens/checkout — ซื้อแพ็กเครดิต (prepaid top-up, per-profile)
 *   body { packCode, saveCard? }  — code ใน token_packs · saveCard=true → บันทึกบัตรไว้ auto top-up
 * คืน { url } ให้ redirect ไป Stripe (mode=payment) · webhook เติม token หลังจ่ายสำเร็จ
 * metadata: kind='token_topup', profile_id, pack_code, save_card
 */

import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "../../../_lib/auth";
import { createAdminClient, createAuthedClient } from "../../../_lib/supabase";
import { getAppBaseUrl, getStripe } from "../../../_lib/stripe";
import { getActivePack, ensureTokenCustomer, ensurePackPrice } from "@/lib/assistant/token-billing";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const auth = await requireUser(req);
  if (!auth.ok) return auth.res;

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const packCode = String(body.packCode ?? "");
  const saveCard = body.saveCard === true;
  if (!packCode) return NextResponse.json({ error: "packCode required" }, { status: 400 });

  const admin = createAdminClient();
  const pack = await getActivePack(admin, packCode);
  if (!pack) return NextResponse.json({ error: "pack_not_found" }, { status: 404 });
  if (String(pack.currency) !== "THB")
    return NextResponse.json({ error: "currency_not_supported" }, { status: 400 });

  const stripe = getStripe();
  const {
    data: { user },
  } = await createAuthedClient(auth.token).auth.getUser();
  const customerId = await ensureTokenCustomer(
    admin,
    stripe,
    auth.userId,
    user?.email ?? undefined,
  );
  const priceId = await ensurePackPrice(admin, stripe, pack);

  const baseUrl = getAppBaseUrl().replace(/\/$/, "");
  const meta = {
    kind: "token_topup",
    profile_id: auth.userId,
    pack_code: pack.code,
    tokens: String(pack.tokens),
    save_card: saveCard ? "1" : "0",
  };
  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    customer: customerId,
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${baseUrl}/assistant/billing?billing=success&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${baseUrl}/assistant/billing?billing=canceled`,
    metadata: meta,
    payment_intent_data: {
      metadata: meta,
      // บันทึกบัตรไว้ใช้ auto top-up รอบหน้า (off-session)
      ...(saveCard ? { setup_future_usage: "off_session" as const } : {}),
    },
  });

  return NextResponse.json({ url: session.url });
}
