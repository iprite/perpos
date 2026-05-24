import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '../../../_lib/auth';
import { createAdminClient } from '../../../_lib/supabase';
import { getAppBaseUrl, getStripe } from '../../../_lib/stripe';

export const runtime = 'nodejs';

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

  const { data: orgStripe } = await admin
    .from('org_stripe')
    .select('stripe_customer_id')
    .eq('org_id', orgId)
    .maybeSingle();

  const customerId = orgStripe?.stripe_customer_id ? String(orgStripe.stripe_customer_id) : '';
  if (!customerId) return NextResponse.json({ error: 'stripe_customer_not_found' }, { status: 400 });

  const configuration = process.env.STRIPE_PORTAL_CONFIGURATION_ID ?? '';
  if (!configuration) {
    return NextResponse.json({ error: 'missing_STRIPE_PORTAL_CONFIGURATION_ID' }, { status: 500 });
  }

  const stripe = getStripe();
  const baseUrl = getAppBaseUrl().replace(/\/$/, '');

  const session = await stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: `${baseUrl}/billing`,
    configuration,
  });

  return NextResponse.json({ url: session.url });
}

