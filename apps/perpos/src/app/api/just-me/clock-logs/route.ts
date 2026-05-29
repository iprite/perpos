import { NextRequest, NextResponse } from 'next/server';
import { requireJustMeMember } from '../_lib';
import { createAdminClient } from '../../_lib/supabase';

export async function GET(req: NextRequest) {
  const orgId = req.nextUrl.searchParams.get('orgId');
  if (!orgId) return NextResponse.json({ error: 'missing orgId' }, { status: 400 });

  // 1. Authenticate user and verify module membership
  const auth = await requireJustMeMember(req, orgId);
  if (!auth.ok) return auth.res;

  const admin = createAdminClient();

  // 2. Fetch current clock session state for the user
  const { data: session } = await admin
    .from('just_me_clock_sessions')
    .select('*')
    .eq('profile_id', auth.userId)
    .eq('org_id', orgId)
    .maybeSingle();

  // 3. Fetch historical logs (sorted newest first)
  const { data: logs, error } = await admin
    .from('just_me_clock_logs')
    .select(`
      id,
      type,
      timestamp,
      latitude,
      longitude,
      address,
      profile:profiles(id, display_name, email)
    `)
    .eq('org_id', orgId)
    .eq('profile_id', auth.userId)
    .order('timestamp', { ascending: false })
    .limit(100);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    session: session ?? null,
    logs: logs ?? [],
  });
}

export async function POST(req: NextRequest) {
  const orgId = req.nextUrl.searchParams.get('orgId');
  if (!orgId) return NextResponse.json({ error: 'missing orgId' }, { status: 400 });

  // 1. Authenticate user and verify module membership
  const auth = await requireJustMeMember(req, orgId);
  if (!auth.ok) return auth.res;

  const body = await req.json().catch(() => ({}));
  const { type, latitude, longitude, address } = body as {
    type: 'in' | 'out';
    latitude?: number;
    longitude?: number;
    address?: string;
  };

  if (!type || !['in', 'out'].includes(type)) {
    return NextResponse.json({ error: 'invalid or missing type' }, { status: 400 });
  }

  const admin = createAdminClient();
  const now = new Date().toISOString();
  const addressName = address || 'พิกัด GPS';

  // 2. Fetch current clock session state for the user
  const { data: session } = await admin
    .from('just_me_clock_sessions')
    .select('*')
    .eq('profile_id', auth.userId)
    .eq('org_id', orgId)
    .maybeSingle();

  if (type === 'in') {
    if (session && session.status === 'clocked_in') {
      return NextResponse.json({ error: 'คุณกำลังเข้างานค้างไว้ กรุณาออกงานก่อน' }, { status: 400 });
    }

    // Insert Log In
    const { error: logErr } = await admin.from('just_me_clock_logs').insert({
      org_id:     orgId,
      profile_id: auth.userId,
      type:       'in',
      timestamp:  now,
      latitude:   latitude ?? null,
      longitude:  longitude ?? null,
      address:    addressName,
    });
    if (logErr) return NextResponse.json({ error: logErr.message }, { status: 500 });

    // Upsert session
    const { error: sessErr } = await admin.from('just_me_clock_sessions').upsert(
      {
        profile_id:        auth.userId,
        org_id:            orgId,
        status:            'clocked_in',
        last_in_time:      now,
        last_in_latitude:  latitude ?? null,
        last_in_longitude: longitude ?? null,
        last_in_address:   addressName,
        updated_at:        now,
      },
      { onConflict: 'profile_id' }
    );
    if (sessErr) return NextResponse.json({ error: sessErr.message }, { status: 500 });

  } else {
    // type === 'out'
    if (!session || session.status !== 'clocked_in') {
      return NextResponse.json({ error: 'คุณยังไม่ได้บันทึกเวลาเข้างาน' }, { status: 400 });
    }

    // Insert Log Out
    const { error: logErr } = await admin.from('just_me_clock_logs').insert({
      org_id:     orgId,
      profile_id: auth.userId,
      type:       'out',
      timestamp:  now,
      latitude:   latitude ?? null,
      longitude:  longitude ?? null,
      address:    addressName,
    });
    if (logErr) return NextResponse.json({ error: logErr.message }, { status: 500 });

    // Delete session
    const { error: sessErr } = await admin
      .from('just_me_clock_sessions')
      .delete()
      .eq('profile_id', auth.userId);
    if (sessErr) return NextResponse.json({ error: sessErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
