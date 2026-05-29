import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '../../_lib/supabase';
import { verifyClockToken } from '../_lib';

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const { token, latitude, longitude, address } = body as {
    token?: string;
    latitude?: number;
    longitude?: number;
    address?: string;
  };

  if (!token) {
    return NextResponse.json({ error: 'missing token' }, { status: 400 });
  }

  // 1. Verify the signed token
  const payload = verifyClockToken(token);
  if (!payload) {
    return NextResponse.json({ error: 'ลิงก์หมดอายุ หรือข้อมูลไม่ถูกต้อง กรุณาพิมพ์สั่งลงเวลาใหม่ทาง LINE Bot' }, { status: 400 });
  }

  const { profileId, orgId, type } = payload;
  const admin = createAdminClient();
  const now = new Date().toISOString();
  const addressName = address || 'พิกัด GPS';

  // 2. Fetch current clock session state for the user
  const { data: session } = await admin
    .from('just_me_clock_sessions')
    .select('*')
    .eq('profile_id', profileId)
    .eq('org_id', orgId)
    .maybeSingle();

  if (type === 'in') {
    if (session && session.status === 'clocked_in') {
      return NextResponse.json({ error: 'คุณกำลังเข้างานค้างไว้ กรุณาออกงานก่อน' }, { status: 400 });
    }

    // Insert Log In
    const { error: logErr } = await admin.from('just_me_clock_logs').insert({
      org_id:     orgId,
      profile_id: profileId,
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
        profile_id:        profileId,
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
      profile_id: profileId,
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
      .eq('profile_id', profileId);
    if (sessErr) return NextResponse.json({ error: sessErr.message }, { status: 500 });
  }

  // 3. Get profile/org names to return nice text
  const { data: profile } = await admin.from('profiles').select('email, display_name').eq('id', profileId).maybeSingle();
  const name = profile?.display_name || profile?.email || 'พนักงาน';

  return NextResponse.json({
    ok: true,
    message: `บันทึกเวลา${type === 'in' ? 'เข้างาน (Clock In)' : 'ออกงาน (Clock Out)'} สำเร็จสำหรับคุณ ${name}`,
  });
}
