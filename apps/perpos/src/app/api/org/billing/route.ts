import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '../../_lib/auth';
import { createAdminClient } from '../../_lib/supabase';
import {
  resolveEffectiveLimits,
  isPlanExpired,
  trialDaysRemaining,
  type PlanTier,
} from '@/lib/billing';

/** GET ?orgId=  → billing summary for org owner/admin */
export async function GET(req: NextRequest) {
  const auth = await requireUser(req);
  if (!auth.ok) return auth.res;

  const orgId = req.nextUrl.searchParams.get('orgId') ?? '';
  if (!orgId) return NextResponse.json({ error: 'orgId required' }, { status: 400 });

  const admin = createAdminClient();

  // Verify caller is owner or admin of this org
  const { data: member } = await admin
    .from('organization_members')
    .select('role')
    .eq('organization_id', orgId)
    .eq('user_id', auth.userId)
    .maybeSingle();

  if (!member || !['owner', 'admin'].includes(String(member.role))) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const [{ data: org }, { data: billing }, { data: stripeRow }] = await Promise.all([
    admin.from('organizations').select('id, name, maintenance_mode').eq('id', orgId).single(),
    admin.from('org_billing').select('*').eq('org_id', orgId).maybeSingle(),
    admin.from('org_stripe').select('stripe_customer_id, stripe_subscription_id').eq('org_id', orgId).maybeSingle(),
  ]);

  if (!org) return NextResponse.json({ error: 'org not found' }, { status: 404 });

  const tier = (billing?.plan_tier as PlanTier) ?? 'free';
  const billingTyped = billing ? { plan_tier: tier, ...billing } : { plan_tier: 'free' as PlanTier };

  return NextResponse.json({
    org_id:               org.id,
    org_name:             org.name,
    maintenance_mode:     org.maintenance_mode ?? false,
    plan_tier:            tier,
    effective_limits:     resolveEffectiveLimits(billingTyped),
    is_expired:           isPlanExpired(billingTyped),
    trial_days_remaining: trialDaysRemaining(billingTyped),
    trial_ends_at:        billing?.trial_ends_at ?? null,
    plan_starts_at:       billing?.plan_starts_at ?? null,
    plan_ends_at:         billing?.plan_ends_at ?? null,
    monthly_price:        billing?.monthly_price ?? null,
    currency:             billing?.currency ?? 'THB',
    payment_status:       billing?.payment_status ?? 'active',
    has_stripe_customer:  Boolean(stripeRow?.stripe_customer_id),
    has_stripe_subscription: Boolean(stripeRow?.stripe_subscription_id),
    notes:                billing?.notes ?? null,
    updated_at:           billing?.updated_at ?? null,
  });
}
