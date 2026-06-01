import { NextRequest, NextResponse } from 'next/server';
import { requireJustMeMember } from '../../_lib';
import { createAdminClient } from '../../../_lib/supabase';

export async function GET(req: NextRequest) {
  const orgId = req.nextUrl.searchParams.get('orgId');
  if (!orgId) return NextResponse.json({ error: 'missing orgId' }, { status: 400 });

  const auth = await requireJustMeMember(req, orgId);
  if (!auth.ok) return auth.res;

  const admin = createAdminClient();
  const workDate = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' });

  const { data: stops, error } = await admin
    .from('just_me_travel_logs')
    .select('id, sequence, stop_type, timestamp, latitude, longitude, address, note')
    .eq('profile_id', auth.userId)
    .eq('org_id', orgId)
    .eq('work_date', workDate)
    .order('sequence', { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const { data: claim } = await admin
    .from('just_me_travel_claims')
    .select('*')
    .eq('profile_id', auth.userId)
    .eq('org_id', orgId)
    .eq('work_date', workDate)
    .maybeSingle();

  const { data: settings } = await admin
    .from('just_me_travel_settings')
    .select('fuel_rate_per_km, home_latitude, home_longitude, home_address, include_return')
    .eq('org_id', orgId)
    .maybeSingle();

  return NextResponse.json({
    workDate,
    stops: stops ?? [],
    claim: claim ?? null,
    settings: settings ?? null,
  });
}
