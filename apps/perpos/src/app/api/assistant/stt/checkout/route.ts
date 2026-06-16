/**
 * POST /api/assistant/stt/checkout — สร้าง Stripe Checkout ซื้อแพ็กแกะเสียง (per-profile)
 *   body { planCode }  — code ใน stt_plans (subscription รายเดือน หรือ topup เติมนาที)
 * คืน { url } ให้ redirect ไป Stripe · webhook (stripe/webhook) เติมโควต้าหลังจ่ายสำเร็จ
 *
 * metadata ที่ตั้ง (ให้ webhook แยก STT จาก org): kind='stt', profile_id, plan_id
 * ถ้าแพ็กยังไม่มี stripe_price_id → สร้าง Stripe Price อัตโนมัติแล้วเก็บกลับ
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '../../../_lib/auth';
import { createAdminClient, createAuthedClient } from '../../../_lib/supabase';
import { getAppBaseUrl, getStripe } from '../../../_lib/stripe';

export const runtime = 'nodejs';

type Plan = { id: string; code: string; name: string; kind: 'subscription' | 'topup'; minutes: number; price: number; currency: string; stripe_price_id: string | null; is_active: boolean };

export async function POST(req: NextRequest) {
  const auth = await requireUser(req);
  if (!auth.ok) return auth.res;

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const planCode = String(body.planCode ?? '');
  if (!planCode) return NextResponse.json({ error: 'planCode required' }, { status: 400 });

  const admin = createAdminClient();
  const { data: planRow } = await admin
    .from('stt_plans')
    .select('id, code, name, kind, minutes, price, currency, stripe_price_id, is_active')
    .eq('code', planCode)
    .maybeSingle();
  const plan = planRow as Plan | null;
  if (!plan || !plan.is_active) return NextResponse.json({ error: 'plan_not_found' }, { status: 404 });
  if (String(plan.currency) !== 'THB') return NextResponse.json({ error: 'currency_not_supported' }, { status: 400 });

  const unitAmount = Math.round(Number(plan.price) * 100);
  if (!Number.isFinite(unitAmount) || unitAmount <= 0) return NextResponse.json({ error: 'pricing_not_set' }, { status: 400 });

  const stripe = getStripe();

  // กันสมัครซ้ำ (subscription ที่ยัง active)
  const { data: existingSub } = await admin
    .from('stt_subscriptions')
    .select('stripe_customer_id, stripe_subscription_id, status')
    .eq('profile_id', auth.userId)
    .maybeSingle();
  if (plan.kind === 'subscription' && existingSub?.stripe_subscription_id && existingSub.status && !['canceled', 'unpaid', 'incomplete_expired'].includes(String(existingSub.status))) {
    return NextResponse.json({ error: 'already_subscribed' }, { status: 400 });
  }

  // customer ต่อ profile (reuse จาก stt_subscriptions ถ้ามี)
  let customerId = existingSub?.stripe_customer_id ? String(existingSub.stripe_customer_id) : '';
  if (!customerId) {
    const rls = createAuthedClient(auth.token);
    const { data: { user } } = await rls.auth.getUser();
    const email = user?.email && !String(user.email).endsWith('@stt-line.perpos.io') ? user.email : undefined;
    const customer = await stripe.customers.create({ email, metadata: { kind: 'stt', profile_id: auth.userId } });
    customerId = customer.id;
    await admin.from('stt_subscriptions').upsert({ profile_id: auth.userId, stripe_customer_id: customerId, updated_at: new Date().toISOString() });
  }

  // price (สร้างถ้ายังไม่มี) — recurring สำหรับ sub, one-time สำหรับ topup
  let priceId = plan.stripe_price_id ?? '';
  if (priceId) {
    const existing = await stripe.prices.retrieve(priceId).catch(() => null);
    const okRecurring = plan.kind === 'subscription' ? !!existing?.recurring : !existing?.recurring;
    if (!existing || existing.currency !== 'thb' || existing.unit_amount !== unitAmount || !okRecurring) priceId = '';
  }
  if (!priceId) {
    const price = await stripe.prices.create({
      currency: 'thb',
      unit_amount: unitAmount,
      ...(plan.kind === 'subscription' ? { recurring: { interval: 'month' as const } } : {}),
      product_data: { name: `PERPOS Assistant | Voice — ${plan.name}` },
      metadata: { kind: 'stt', plan_id: plan.id, plan_code: plan.code },
    });
    priceId = price.id;
    await admin.from('stt_plans').update({ stripe_price_id: priceId, updated_at: new Date().toISOString() }).eq('id', plan.id);
  }

  const baseUrl = getAppBaseUrl().replace(/\/$/, '');
  const meta = { kind: 'stt', profile_id: auth.userId, plan_id: plan.id };
  const session = await stripe.checkout.sessions.create({
    mode: plan.kind === 'subscription' ? 'subscription' : 'payment',
    customer: customerId,
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${baseUrl}/assistant/billing?billing=success&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${baseUrl}/assistant/billing?billing=canceled`,
    metadata: meta,
    ...(plan.kind === 'subscription'
      ? { subscription_data: { metadata: meta } }
      : { payment_intent_data: { metadata: meta } }),
  });

  return NextResponse.json({ url: session.url });
}
