/**
 * GET /api/admin/billing?orgId=
 *   → list all orgs with billing rows (or single org if orgId given)
 *   → includes resolved effective limits
 *
 * PUT /api/admin/billing
 *   { orgId, planTier?, maxUsers?, maxApiRequestsPerDay?,
 *     maxWebhooks?, maxCustomFields?, trialEndsAt?, planStartsAt?,
 *     planEndsAt?, notes? }
 *   → upsert billing row (create or update)
 *
 * POST /api/admin/billing/maintenance
 *   via body: { orgId, maintenanceMode: boolean, maintenanceMessage?: string }
 *   → toggle org maintenance mode
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '../../_lib/auth';
import { createAdminClient } from '../../_lib/supabase';
import {
  PLAN_DEFAULTS,
  resolveEffectiveLimits,
  isPlanExpired,
  trialDaysRemaining,
  type PlanTier,
} from '@/lib/billing';

const VALID_TIERS: PlanTier[] = ['free', 'starter', 'pro', 'enterprise'];

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (!auth.ok) return auth.res;

  const orgId = req.nextUrl.searchParams.get('orgId');
  const admin = createAdminClient();

  // Load all orgs
  let orgsQ = admin.from('organizations').select('id, name, maintenance_mode, maintenance_message');
  if (orgId) orgsQ = orgsQ.eq('id', orgId);
  const { data: orgs, error: orgsErr } = await orgsQ.order('name');
  if (orgsErr) return NextResponse.json({ error: orgsErr.message }, { status: 500 });

  // Load billing rows
  let billQ = admin.from('org_billing').select('*');
  if (orgId) billQ = billQ.eq('org_id', orgId);
  const { data: billingRows } = await billQ;

  const billByOrg: Record<string, Record<string, unknown>> = {};
  for (const b of billingRows ?? []) {
    const row = b as Record<string, unknown>;
    billByOrg[String(row.org_id)] = row;
  }

  const result = (orgs ?? []).map((o) => {
    const org = o as Record<string, unknown>;
    const billing = billByOrg[String(org.id)];
    const tier = (billing?.plan_tier as PlanTier) ?? 'free';
    const billingTyped = billing
      ? { plan_tier: tier, ...(billing as object) }
      : { plan_tier: 'free' as PlanTier };

    return {
      org_id:               org.id,
      org_name:             org.name,
      maintenance_mode:     org.maintenance_mode ?? false,
      maintenance_message:  org.maintenance_message ?? null,
      plan_tier:            tier,
      plan_defaults:        PLAN_DEFAULTS[tier],
      effective_limits:     resolveEffectiveLimits(billingTyped),
      is_expired:           isPlanExpired(billingTyped),
      trial_days_remaining: trialDaysRemaining(billingTyped),
      trial_ends_at:        billing?.trial_ends_at ?? null,
      plan_starts_at:       billing?.plan_starts_at ?? null,
      plan_ends_at:         billing?.plan_ends_at ?? null,
      notes:                billing?.notes ?? null,
      monthly_price:        billing?.monthly_price ?? null,
      currency:             (billing?.currency as string) ?? 'THB',
      payment_status:       (billing?.payment_status as string) ?? 'active',
      updated_at:           billing?.updated_at ?? null,
    };
  });

  return NextResponse.json({ orgs: result });
}

export async function PUT(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (!auth.ok) return auth.res;

  const body = await req.json() as Record<string, unknown>;
  const {
    orgId, planTier, maxUsers, maxApiRequestsPerDay,
    maxWebhooks, maxCustomFields, trialEndsAt,
    planStartsAt, planEndsAt, notes,
    maintenanceMode, maintenanceMessage,
    monthlyPrice, currency, paymentStatus,
  } = body;

  if (!orgId) return NextResponse.json({ error: 'orgId required' }, { status: 400 });
  if (planTier !== undefined && !VALID_TIERS.includes(planTier as PlanTier))
    return NextResponse.json({ error: 'Invalid planTier' }, { status: 400 });

  const admin = createAdminClient();

  // Handle maintenance mode update separately on organizations table
  if (maintenanceMode !== undefined) {
    const { error } = await admin
      .from('organizations')
      .update({
        maintenance_mode:    Boolean(maintenanceMode),
        maintenance_message: maintenanceMessage ?? null,
      })
      .eq('id', orgId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (planTier === undefined) return NextResponse.json({ ok: true });
  }

  // Upsert billing row
  const row: Record<string, unknown> = {
    org_id:     orgId,
    updated_by: auth.userId,
    updated_at: new Date().toISOString(),
  };
  if (planTier              !== undefined) row.plan_tier                 = planTier;
  if (maxUsers              !== undefined) row.max_users                 = maxUsers === '' ? null : Number(maxUsers);
  if (maxApiRequestsPerDay  !== undefined) row.max_api_requests_per_day  = maxApiRequestsPerDay === '' ? null : Number(maxApiRequestsPerDay);
  if (maxWebhooks           !== undefined) row.max_webhooks              = maxWebhooks === '' ? null : Number(maxWebhooks);
  if (maxCustomFields       !== undefined) row.max_custom_fields         = maxCustomFields === '' ? null : Number(maxCustomFields);
  if (trialEndsAt           !== undefined) row.trial_ends_at             = trialEndsAt  || null;
  if (planStartsAt          !== undefined) row.plan_starts_at            = planStartsAt || null;
  if (planEndsAt            !== undefined) row.plan_ends_at              = planEndsAt   || null;
  if (notes                 !== undefined) row.notes                     = notes        || null;
  if (monthlyPrice          !== undefined) row.monthly_price              = monthlyPrice === '' ? null : Number(monthlyPrice);
  if (currency              !== undefined) row.currency                   = currency     || 'THB';
  if (paymentStatus         !== undefined) row.payment_status             = paymentStatus || 'active';

  const { data, error } = await admin
    .from('org_billing')
    .upsert(row, { onConflict: 'org_id' })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ billing: data });
}
