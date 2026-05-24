import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '../../../_lib/auth';
import { createAdminClient } from '../../../_lib/supabase';
import { getStripe } from '../../../_lib/stripe';

export const runtime = 'nodejs';

function toUnitAmountTHB(v: unknown) {
  const n = typeof v === 'number' ? v : Number(v);
  const unitAmount = Math.round(n * 100);
  if (!Number.isFinite(unitAmount) || unitAmount <= 0) return null;
  return unitAmount;
}

async function ensurePriceId(params: {
  stripe: ReturnType<typeof getStripe>;
  orgId: string;
  orgName: string;
  unitAmount: number;
  existingPriceId: string | null;
}) {
  const { stripe, orgId, orgName, unitAmount, existingPriceId } = params;

  if (existingPriceId) {
    const existing = await stripe.prices.retrieve(existingPriceId);
    if (
      existing.currency === 'thb' &&
      existing.unit_amount === unitAmount &&
      existing.recurring?.interval === 'month'
    ) {
      return existing.id;
    }
  }

  const productId = process.env.STRIPE_PRODUCT_ID ?? '';
  const price = await stripe.prices.create({
    currency: 'thb',
    unit_amount: unitAmount,
    recurring: { interval: 'month' },
    ...(productId
      ? { product: productId }
      : { product_data: { name: `PERPOS Subscription (${orgName || orgId})` } }),
    metadata: { org_id: orgId },
  });
  return price.id;
}

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (!auth.ok) return auth.res;

  const orgId = req.nextUrl.searchParams.get('orgId') ?? '';
  if (!orgId) return NextResponse.json({ error: 'orgId required' }, { status: 400 });

  const admin = createAdminClient();
  const [{ data: org }, { data: billing }, { data: orgStripe }] = await Promise.all([
    admin.from('organizations').select('id, name').eq('id', orgId).maybeSingle(),
    admin.from('org_billing').select('monthly_price, currency, payment_status').eq('org_id', orgId).maybeSingle(),
    admin.from('org_stripe').select('*').eq('org_id', orgId).maybeSingle(),
  ]);

  if (!org) return NextResponse.json({ error: 'org not found' }, { status: 404 });

  return NextResponse.json({
    org: { id: org.id, name: org.name },
    billing,
    org_stripe: orgStripe,
  });
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (!auth.ok) return auth.res;

  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  const orgId = String(body.orgId ?? '');
  const dryRun = Boolean(body.dryRun ?? false);
  if (!orgId) return NextResponse.json({ error: 'orgId required' }, { status: 400 });

  const admin = createAdminClient();
  const [{ data: org }, { data: billing }, { data: orgStripe }] = await Promise.all([
    admin.from('organizations').select('id, name').eq('id', orgId).maybeSingle(),
    admin.from('org_billing').select('monthly_price, currency').eq('org_id', orgId).maybeSingle(),
    admin.from('org_stripe').select('*').eq('org_id', orgId).maybeSingle(),
  ]);

  if (!org) return NextResponse.json({ error: 'org not found' }, { status: 404 });

  const currency = String(billing?.currency ?? 'THB');
  if (currency !== 'THB') return NextResponse.json({ error: 'currency_not_supported' }, { status: 400 });

  const unitAmount = toUnitAmountTHB(billing?.monthly_price);
  if (!unitAmount) return NextResponse.json({ error: 'pricing_not_set' }, { status: 400 });

  const stripe = getStripe();

  const subscriptionId = orgStripe?.stripe_subscription_id ? String(orgStripe.stripe_subscription_id) : '';
  if (!subscriptionId) return NextResponse.json({ error: 'no_subscription' }, { status: 400 });

  const subscription = await stripe.subscriptions.retrieve(subscriptionId);
  const item = subscription.items.data[0];
  if (!item?.id) return NextResponse.json({ error: 'subscription_item_not_found' }, { status: 500 });

  const previousPriceId = item.price?.id ?? null;
  const priceId = await ensurePriceId({
    stripe,
    orgId,
    orgName: String(org.name ?? ''),
    unitAmount,
    existingPriceId: orgStripe?.stripe_price_id ? String(orgStripe.stripe_price_id) : null,
  });

  if (!dryRun) {
    const updated = await stripe.subscriptions.update(subscriptionId, {
      items: [{ id: item.id, price: priceId }],
      proration_behavior: 'none',
    });

    await admin.from('org_stripe').upsert({
      org_id: orgId,
      stripe_customer_id: String(updated.customer ?? '') || null,
      stripe_subscription_id: updated.id,
      stripe_price_id: priceId,
      subscription_status: updated.status,
      current_period_start: updated.current_period_start ? new Date(updated.current_period_start * 1000).toISOString() : null,
      current_period_end: updated.current_period_end ? new Date(updated.current_period_end * 1000).toISOString() : null,
      cancel_at_period_end: updated.cancel_at_period_end ?? false,
      updated_at: new Date().toISOString(),
    });
  }

  return NextResponse.json({
    ok: true,
    org_id: orgId,
    subscription_id: subscriptionId,
    previous_price_id: previousPriceId,
    price_id: priceId,
    dry_run: dryRun,
    effective_next_cycle: true,
    proration: 'none',
  });
}

