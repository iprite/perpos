import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '../../../_lib/auth';
import { createAdminClient, createAuthedClient } from '../../../_lib/supabase';
import { getAppBaseUrl, getStripe } from '../../../_lib/stripe';

export const runtime = 'nodejs';

function toUnitAmountTHB(v: unknown) {
  const n = typeof v === 'number' ? v : Number(v);
  const unitAmount = Math.round(n * 100);
  if (!Number.isFinite(unitAmount) || unitAmount <= 0) return null;
  return unitAmount;
}

export async function POST(req: NextRequest) {
  const auth = await requireUser(req);
  if (!auth.ok) return auth.res;

  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  const orgId = String(body.orgId ?? '');
  if (!orgId) return NextResponse.json({ error: 'orgId required' }, { status: 400 });

  const admin = createAdminClient();

  const { data: member } = await admin
    .from('organization_members')
    .select('role')
    .eq('organization_id', orgId)
    .eq('user_id', auth.userId)
    .maybeSingle();

  if (!member || !['owner', 'admin'].includes(String(member.role))) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const [{ data: org }, { data: billing }, { data: orgStripe }] = await Promise.all([
    admin.from('organizations').select('id, name').eq('id', orgId).maybeSingle(),
    admin.from('org_billing').select('monthly_price, currency, payment_status').eq('org_id', orgId).maybeSingle(),
    admin.from('org_stripe').select('*').eq('org_id', orgId).maybeSingle(),
  ]);

  if (!org) return NextResponse.json({ error: 'org not found' }, { status: 404 });

  const currency = String(billing?.currency ?? 'THB');
  if (currency !== 'THB') return NextResponse.json({ error: 'currency_not_supported' }, { status: 400 });

  const unitAmount = toUnitAmountTHB(billing?.monthly_price);
  if (!unitAmount) return NextResponse.json({ error: 'pricing_not_set' }, { status: 400 });

  const stripe = getStripe();

  let customerId = orgStripe?.stripe_customer_id ? String(orgStripe.stripe_customer_id) : '';
  if (!customerId) {
    const rls = createAuthedClient(auth.token);
    const { data: { user } } = await rls.auth.getUser();

    const customer = await stripe.customers.create({
      name: String(org.name ?? ''),
      email: user?.email ?? undefined,
      metadata: { org_id: orgId },
    });
    customerId = customer.id;

    await admin.from('org_stripe').upsert({
      org_id: orgId,
      stripe_customer_id: customerId,
      updated_at: new Date().toISOString(),
    });
  }

  let priceId = orgStripe?.stripe_price_id ? String(orgStripe.stripe_price_id) : '';
  if (priceId) {
    const existing = await stripe.prices.retrieve(priceId);
    if (existing.currency !== 'thb' || existing.unit_amount !== unitAmount || !existing.recurring) {
      priceId = '';
    }
  }

  if (!priceId) {
    const price = await stripe.prices.create({
      currency: 'thb',
      unit_amount: unitAmount,
      recurring: { interval: 'month' },
      product_data: { name: `PERPOS Subscription (${org.name ?? orgId})` },
      metadata: { org_id: orgId },
    });
    priceId = price.id;

    await admin.from('org_stripe').upsert({
      org_id: orgId,
      stripe_customer_id: customerId,
      stripe_price_id: priceId,
      updated_at: new Date().toISOString(),
    });
  }

  const baseUrl = getAppBaseUrl().replace(/\/$/, '');
  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    customer: customerId,
    client_reference_id: orgId,
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${baseUrl}/billing?success=1&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${baseUrl}/billing?canceled=1`,
    subscription_data: {
      metadata: { org_id: orgId },
    },
    metadata: { org_id: orgId },
  });

  return NextResponse.json({ url: session.url });
}

