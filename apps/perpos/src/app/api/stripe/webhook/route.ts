import { NextRequest, NextResponse } from 'next/server';
import type Stripe from 'stripe';
import { createAdminClient } from '../../_lib/supabase';
import { getStripe } from '../../_lib/stripe';

export const runtime = 'nodejs';

function asString(v: unknown) {
  return typeof v === 'string' ? v : '';
}

async function findOrgIdByStripeIds(admin: ReturnType<typeof createAdminClient>, ids: {
  subscriptionId?: string;
  customerId?: string;
}) {
  if (ids.subscriptionId) {
    const { data } = await admin
      .from('org_stripe')
      .select('org_id')
      .eq('stripe_subscription_id', ids.subscriptionId)
      .maybeSingle();
    if (data?.org_id) return String(data.org_id);
  }

  if (ids.customerId) {
    const { data } = await admin
      .from('org_stripe')
      .select('org_id')
      .eq('stripe_customer_id', ids.customerId)
      .maybeSingle();
    if (data?.org_id) return String(data.org_id);
  }

  return null;
}

async function upsertStripeEvent(admin: ReturnType<typeof createAdminClient>, event: Stripe.Event, orgId: string | null) {
  const payload = event as unknown as Record<string, unknown>;
  const { error } = await admin
    .from('stripe_events')
    .insert({
      id: event.id,
      type: event.type,
      org_id: orgId,
      stripe_created_at: event.created ? new Date(event.created * 1000).toISOString() : null,
      payload,
    });

  if (!error) return { inserted: true };
  const code = (error as unknown as { code?: string }).code ?? '';
  if (code === '23505') return { inserted: false };
  return { inserted: false, error };
}

async function updateOrgBillingStatus(admin: ReturnType<typeof createAdminClient>, orgId: string, paymentStatus: 'active' | 'overdue' | 'cancelled' | 'pending') {
  await admin
    .from('org_billing')
    .update({
      payment_status: paymentStatus,
      updated_at: new Date().toISOString(),
    })
    .eq('org_id', orgId);
}

async function upsertOrgStripe(admin: ReturnType<typeof createAdminClient>, orgId: string, patch: Record<string, unknown>) {
  await admin
    .from('org_stripe')
    .upsert({
      org_id: orgId,
      ...patch,
      updated_at: new Date().toISOString(),
    });
}

async function handleCheckoutSessionCompleted(admin: ReturnType<typeof createAdminClient>, stripe: ReturnType<typeof getStripe>, session: Stripe.Checkout.Session) {
  const orgId =
    asString(session.metadata?.org_id) ||
    asString(session.client_reference_id) ||
    (await findOrgIdByStripeIds(admin, {
      subscriptionId: asString(session.subscription),
      customerId: asString(session.customer),
    }));

  if (!orgId) return null;

  const customerId = asString(session.customer);
  const subscriptionId = asString(session.subscription);

  let subscription: Stripe.Subscription | null = null;
  if (subscriptionId) {
    subscription = await stripe.subscriptions.retrieve(subscriptionId);
  }

  await upsertOrgStripe(admin, orgId, {
    stripe_customer_id: customerId || null,
    stripe_subscription_id: subscriptionId || null,
    subscription_status: subscription?.status ?? null,
    current_period_start: subscription?.current_period_start ? new Date(subscription.current_period_start * 1000).toISOString() : null,
    current_period_end: subscription?.current_period_end ? new Date(subscription.current_period_end * 1000).toISOString() : null,
    cancel_at_period_end: subscription?.cancel_at_period_end ?? false,
  });

  await updateOrgBillingStatus(admin, orgId, 'pending');
  return orgId;
}

async function handleInvoicePaymentSucceeded(admin: ReturnType<typeof createAdminClient>, stripe: ReturnType<typeof getStripe>, invoice: Stripe.Invoice) {
  const subscriptionId = asString(invoice.subscription);
  const customerId = asString(invoice.customer);

  let orgId =
    asString((invoice as unknown as { metadata?: Record<string, string> }).metadata?.org_id) ||
    (await findOrgIdByStripeIds(admin, { subscriptionId, customerId }));

  if (!orgId && subscriptionId) {
    const sub = await stripe.subscriptions.retrieve(subscriptionId);
    orgId = asString(sub.metadata?.org_id) || orgId;
  }

  if (!orgId) return null;

  if (subscriptionId) {
    const sub = await stripe.subscriptions.retrieve(subscriptionId);
    await upsertOrgStripe(admin, orgId, {
      stripe_customer_id: customerId || null,
      stripe_subscription_id: subscriptionId,
      subscription_status: sub.status,
      current_period_start: sub.current_period_start ? new Date(sub.current_period_start * 1000).toISOString() : null,
      current_period_end: sub.current_period_end ? new Date(sub.current_period_end * 1000).toISOString() : null,
      cancel_at_period_end: sub.cancel_at_period_end,
    });
  }

  await updateOrgBillingStatus(admin, orgId, 'active');
  return orgId;
}

async function handleInvoicePaymentFailed(admin: ReturnType<typeof createAdminClient>, stripe: ReturnType<typeof getStripe>, invoice: Stripe.Invoice) {
  const subscriptionId = asString(invoice.subscription);
  const customerId = asString(invoice.customer);

  let orgId = await findOrgIdByStripeIds(admin, { subscriptionId, customerId });

  if (!orgId && subscriptionId) {
    const sub = await stripe.subscriptions.retrieve(subscriptionId);
    orgId = asString(sub.metadata?.org_id) || orgId;
  }

  if (!orgId) return null;

  if (subscriptionId) {
    const sub = await stripe.subscriptions.retrieve(subscriptionId);
    await upsertOrgStripe(admin, orgId, {
      stripe_customer_id: customerId || null,
      stripe_subscription_id: subscriptionId,
      subscription_status: sub.status,
      current_period_start: sub.current_period_start ? new Date(sub.current_period_start * 1000).toISOString() : null,
      current_period_end: sub.current_period_end ? new Date(sub.current_period_end * 1000).toISOString() : null,
      cancel_at_period_end: sub.cancel_at_period_end,
    });
  }

  await updateOrgBillingStatus(admin, orgId, 'overdue');
  return orgId;
}

async function handleSubscriptionUpdated(admin: ReturnType<typeof createAdminClient>, sub: Stripe.Subscription) {
  const subscriptionId = sub.id;
  const customerId = asString(sub.customer);
  const orgId = asString(sub.metadata?.org_id) || (await findOrgIdByStripeIds(admin, { subscriptionId, customerId }));
  if (!orgId) return null;

  await upsertOrgStripe(admin, orgId, {
    stripe_customer_id: customerId || null,
    stripe_subscription_id: subscriptionId,
    subscription_status: sub.status,
    current_period_start: sub.current_period_start ? new Date(sub.current_period_start * 1000).toISOString() : null,
    current_period_end: sub.current_period_end ? new Date(sub.current_period_end * 1000).toISOString() : null,
    cancel_at_period_end: sub.cancel_at_period_end,
  });

  if (sub.status === 'past_due' || sub.status === 'unpaid') {
    await updateOrgBillingStatus(admin, orgId, 'overdue');
  }

  if (sub.status === 'canceled') {
    await updateOrgBillingStatus(admin, orgId, 'cancelled');
  }

  return orgId;
}

async function handleSubscriptionDeleted(admin: ReturnType<typeof createAdminClient>, sub: Stripe.Subscription) {
  const subscriptionId = sub.id;
  const customerId = asString(sub.customer);
  const orgId = asString(sub.metadata?.org_id) || (await findOrgIdByStripeIds(admin, { subscriptionId, customerId }));
  if (!orgId) return null;

  await upsertOrgStripe(admin, orgId, {
    stripe_customer_id: customerId || null,
    stripe_subscription_id: subscriptionId,
    subscription_status: sub.status,
    current_period_start: sub.current_period_start ? new Date(sub.current_period_start * 1000).toISOString() : null,
    current_period_end: sub.current_period_end ? new Date(sub.current_period_end * 1000).toISOString() : null,
    cancel_at_period_end: sub.cancel_at_period_end,
  });

  await updateOrgBillingStatus(admin, orgId, 'cancelled');
  return orgId;
}

export async function POST(req: NextRequest) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET ?? '';
  if (!secret) return NextResponse.json({ error: 'missing_STRIPE_WEBHOOK_SECRET' }, { status: 500 });

  const signature = req.headers.get('stripe-signature') ?? '';
  if (!signature) return NextResponse.json({ error: 'missing_signature' }, { status: 400 });

  const rawBody = await req.text();
  const stripe = getStripe();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, secret);
  } catch {
    return NextResponse.json({ error: 'invalid_signature' }, { status: 400 });
  }

  const admin = createAdminClient();

  const orgIdHint = (() => {
    const obj = event.data.object as unknown as Record<string, unknown>;
    const md = (obj.metadata as Record<string, unknown> | undefined) ?? undefined;
    const fromMd = md ? asString(md.org_id) : '';
    return fromMd || null;
  })();

  const inserted = await upsertStripeEvent(admin, event, orgIdHint);
  if ('error' in inserted && inserted.error) {
    return NextResponse.json({ error: 'db_error' }, { status: 500 });
  }
  if (!inserted.inserted) return NextResponse.json({ ok: true });

  let resolvedOrgId: string | null = orgIdHint;

  try {
    if (event.type === 'checkout.session.completed') {
      resolvedOrgId = await handleCheckoutSessionCompleted(admin, stripe, event.data.object as Stripe.Checkout.Session);
    } else if (event.type === 'invoice.payment_succeeded') {
      resolvedOrgId = await handleInvoicePaymentSucceeded(admin, stripe, event.data.object as Stripe.Invoice);
    } else if (event.type === 'invoice.payment_failed') {
      resolvedOrgId = await handleInvoicePaymentFailed(admin, stripe, event.data.object as Stripe.Invoice);
    } else if (event.type === 'customer.subscription.updated') {
      resolvedOrgId = await handleSubscriptionUpdated(admin, event.data.object as Stripe.Subscription);
    } else if (event.type === 'customer.subscription.deleted') {
      resolvedOrgId = await handleSubscriptionDeleted(admin, event.data.object as Stripe.Subscription);
    }
  } catch {
    return NextResponse.json({ error: 'processing_error' }, { status: 500 });
  }

  if (resolvedOrgId && resolvedOrgId !== orgIdHint) {
    await admin.from('stripe_events').update({ org_id: resolvedOrgId }).eq('id', event.id);
  }

  return NextResponse.json({ ok: true });
}

