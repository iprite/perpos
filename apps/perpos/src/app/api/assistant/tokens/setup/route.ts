/**
 * POST /api/assistant/tokens/setup — บันทึกบัตรไว้สำหรับ auto top-up (ไม่หักเงินตอนนี้)
 *   Stripe Checkout mode='setup' → ได้ SetupIntent → webhook เก็บ payment_method เข้า token_autotopup
 * คืน { url } ให้ redirect · metadata: kind='token_setup', profile_id
 */

import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "../../../_lib/auth";
import { createAdminClient, createAuthedClient } from "../../../_lib/supabase";
import { getAppBaseUrl, getStripe } from "../../../_lib/stripe";
import { ensureTokenCustomer } from "@/lib/assistant/token-billing";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const auth = await requireUser(req);
  if (!auth.ok) return auth.res;

  const admin = createAdminClient();
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

  const baseUrl = getAppBaseUrl().replace(/\/$/, "");
  const meta = { kind: "token_setup", profile_id: auth.userId };
  const session = await stripe.checkout.sessions.create({
    mode: "setup",
    customer: customerId,
    success_url: `${baseUrl}/assistant/billing?setup=success&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${baseUrl}/assistant/billing?setup=canceled`,
    metadata: meta,
    setup_intent_data: { metadata: meta },
  });

  return NextResponse.json({ url: session.url });
}
