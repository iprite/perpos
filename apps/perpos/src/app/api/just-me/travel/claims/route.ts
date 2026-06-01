import { NextRequest, NextResponse } from 'next/server';
import { requireJustMeMember, canWrite } from '../../_lib';
import { createAdminClient } from '../../../_lib/supabase';

export async function GET(req: NextRequest) {
  const orgId = req.nextUrl.searchParams.get('orgId');
  if (!orgId) return NextResponse.json({ error: 'missing orgId' }, { status: 400 });

  const auth = await requireJustMeMember(req, orgId);
  if (!auth.ok) return auth.res;

  const { searchParams } = req.nextUrl;
  const month = searchParams.get('month'); // YYYY-MM
  const admin = createAdminClient();

  let query = admin
    .from('just_me_travel_claims')
    .select(`
      id, work_date, hops, total_distance_km, fuel_rate_per_km,
      total_amount, status, note, approved_at, created_at,
      profile:profiles!profile_id(id, display_name, email)
    `)
    .eq('org_id', orgId)
    .order('work_date', { ascending: false })
    .limit(90);

  // Non-admin sees only their own claims
  if (auth.role !== 'owner' && auth.role !== 'manager') {
    query = query.eq('profile_id', auth.userId);
  }

  if (month) {
    query = query
      .gte('work_date', `${month}-01`)
      .lte('work_date', `${month}-31`);
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ claims: data ?? [] });
}

// Manager/owner can update claim status (approve/reject/pay)
export async function PATCH(req: NextRequest) {
  const orgId = req.nextUrl.searchParams.get('orgId');
  if (!orgId) return NextResponse.json({ error: 'missing orgId' }, { status: 400 });

  const auth = await requireJustMeMember(req, orgId);
  if (!auth.ok) return auth.res;
  if (!canWrite(auth.role)) {
    return NextResponse.json({ error: 'ไม่มีสิทธิ์อนุมัติการเบิกจ่าย' }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const { claimId, status, note } = body as { claimId?: string; status?: string; note?: string };

  if (!claimId || !status) {
    return NextResponse.json({ error: 'missing claimId or status' }, { status: 400 });
  }
  if (!['approved', 'paid', 'rejected', 'pending'].includes(status)) {
    return NextResponse.json({ error: 'invalid status' }, { status: 400 });
  }

  const admin = createAdminClient();
  const now = new Date().toISOString();

  const { error } = await admin
    .from('just_me_travel_claims')
    .update({
      status,
      note: note ?? undefined,
      approved_by: ['approved', 'paid'].includes(status) ? auth.userId : null,
      approved_at: ['approved', 'paid'].includes(status) ? now : null,
      updated_at: now,
    })
    .eq('id', claimId)
    .eq('org_id', orgId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
