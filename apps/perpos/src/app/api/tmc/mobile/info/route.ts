import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '../../../_lib/supabase';
import { requireMobileToken } from '../_lib';
import { recordMetric } from '@/lib/metrics';

const TMC_ORG_ID = '1f52618c-09c4-49c5-a929-ea5060f26e7d';

/** GET ?t=<token>  → { displayName, properties[], bookingChannels[] } */
export async function GET(req: NextRequest) {
  const t0   = Date.now();
  const auth = await requireMobileToken(req);
  if (!auth.ok) return auth.res;

  const admin = createAdminClient();

  const { data: props } = await admin
    .from('tmc_properties')
    .select('id, code, name')
    .eq('org_id', TMC_ORG_ID)
    .eq('is_active', true)
    .order('sort_order')
    .order('code');

  void recordMetric({ orgId: TMC_ORG_ID, route: '/api/tmc/mobile/info', method: req.method, status: 200, t0 });
  return NextResponse.json({
    displayName: auth.displayName,
    properties: props ?? [],
    bookingChannels: ['Line', 'Airbnb', 'Booking.com', 'Agoda', 'Walk-in', 'Other'],
    stayTypes: [
      { value: 'paid',       label: 'ชำระเงิน' },
      { value: 'free',       label: 'อยู่ฟรี' },
      { value: 'influencer', label: 'Influencer' },
    ],
  });
}
