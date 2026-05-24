import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '../../../_lib/auth';
import { createAdminClient } from '../../../_lib/supabase';
import { getStripe } from '../../../_lib/stripe';

export const runtime = 'nodejs';

function asString(v: unknown) {
  return typeof v === 'string' ? v : '';
}

export async function GET(req: NextRequest) {
  const auth = await requireUser(req);
  if (!auth.ok) return auth.res;

  const orgId = req.nextUrl.searchParams.get('orgId') ?? '';
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

  const { data: row } = await admin
    .from('org_stripe')
    .select('stripe_customer_id, stripe_subscription_id, subscription_status, current_period_start, current_period_end, cancel_at_period_end, stripe_price_id, updated_at')
    .eq('org_id', orgId)
    .maybeSingle();

  const customerId = asString(row?.stripe_customer_id);
  const subscriptionId = asString(row?.stripe_subscription_id);

  if (!customerId) {
    return NextResponse.json({
      connected: false,
      customer_id: null,
      subscription_id: null,
      subscription_status: row?.subscription_status ?? null,
      current_period_start: row?.current_period_start ?? null,
      current_period_end: row?.current_period_end ?? null,
      cancel_at_period_end: row?.cancel_at_period_end ?? false,
      updated_at: row?.updated_at ?? null,
      invoices: [],
    });
  }

  const stripe = getStripe();

  let subscription: Awaited<ReturnType<typeof stripe.subscriptions.retrieve>> | null = null;
  if (subscriptionId) {
    try {
      subscription = await stripe.subscriptions.retrieve(subscriptionId);
    } catch {
      subscription = null;
    }
  }

  const inv = await stripe.invoices.list({ customer: customerId, limit: 10 });

  const invoices = (inv.data ?? []).map((i) => ({
    id: i.id,
    number: i.number ?? null,
    status: i.status ?? null,
    currency: i.currency ?? null,
    amount_due: i.amount_due ?? null,
    amount_paid: i.amount_paid ?? null,
    amount_remaining: i.amount_remaining ?? null,
    hosted_invoice_url: i.hosted_invoice_url ?? null,
    invoice_pdf: i.invoice_pdf ?? null,
    created_at: i.created ? new Date(i.created * 1000).toISOString() : null,
  }));

  return NextResponse.json({
    connected: true,
    customer_id: customerId,
    subscription_id: subscription?.id ?? subscriptionId ?? null,
    subscription_status: subscription?.status ?? row?.subscription_status ?? null,
    current_period_start: subscription?.current_period_start
      ? new Date(subscription.current_period_start * 1000).toISOString()
      : (row?.current_period_start ?? null),
    current_period_end: subscription?.current_period_end
      ? new Date(subscription.current_period_end * 1000).toISOString()
      : (row?.current_period_end ?? null),
    cancel_at_period_end: subscription?.cancel_at_period_end ?? row?.cancel_at_period_end ?? false,
    price_id: row?.stripe_price_id ?? null,
    updated_at: row?.updated_at ?? null,
    invoices,
  });
}

