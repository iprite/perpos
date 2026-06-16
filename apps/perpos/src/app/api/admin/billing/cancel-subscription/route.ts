import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '../../../_lib/auth';
import { createAdminClient } from '../../../_lib/supabase';
import { getStripe } from '../../../_lib/stripe';
import { logAdminAction } from '../../../_lib/admin-audit';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const adminAuth = await requireAdmin(req);
  if (!adminAuth.ok) return adminAuth.res;

  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  const orgId = String(body.orgId ?? '');
  if (!orgId) return NextResponse.json({ error: 'orgId required' }, { status: 400 });

  const admin = createAdminClient();
  const { data: orgStripe } = await admin
    .from('org_stripe')
    .select('stripe_subscription_id')
    .eq('org_id', orgId)
    .maybeSingle();

  const subscriptionId = orgStripe?.stripe_subscription_id ? String(orgStripe.stripe_subscription_id) : '';
  if (!subscriptionId) return NextResponse.json({ error: 'no_subscription' }, { status: 400 });

  const stripe = getStripe();
  const updated = await stripe.subscriptions.update(subscriptionId, { cancel_at_period_end: true });

  await admin.from('org_stripe').upsert({
    org_id: orgId,
    stripe_customer_id: String(updated.customer ?? '') || null,
    stripe_subscription_id: updated.id,
    subscription_status: updated.status,
    current_period_start: updated.current_period_start ? new Date(updated.current_period_start * 1000).toISOString() : null,
    current_period_end: updated.current_period_end ? new Date(updated.current_period_end * 1000).toISOString() : null,
    cancel_at_period_end: updated.cancel_at_period_end ?? false,
    updated_at: new Date().toISOString(),
  });

  await logAdminAction(req, adminAuth.userId, {
    action: 'billing.cancel_subscription',
    targetType: 'subscription',
    targetId: updated.id,
    metadata: { org_id: orgId, cancel_at_period_end: updated.cancel_at_period_end ?? false, status: updated.status },
  });

  return NextResponse.json({
    ok: true,
    org_id: orgId,
    subscription_id: updated.id,
    cancel_at_period_end: updated.cancel_at_period_end ?? false,
    current_period_end: updated.current_period_end ? new Date(updated.current_period_end * 1000).toISOString() : null,
    status: updated.status,
  });
}
