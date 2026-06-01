import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '../../../_lib/supabase';
import { verifyClockToken } from '../../_lib';

// Public endpoint — authenticated by signed token (no session cookie required).
// Called from the public /just-me-clock page when user taps the GPS button for /arrive.
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
  if (typeof latitude !== 'number' || typeof longitude !== 'number') {
    return NextResponse.json({ error: 'missing coordinates' }, { status: 400 });
  }

  const payload = verifyClockToken(token);
  if (!payload) {
    return NextResponse.json({ error: 'ลิงก์หมดอายุ หรือข้อมูลไม่ถูกต้อง กรุณาพิมพ์ /arrive ใหม่ทาง LINE Bot' }, { status: 400 });
  }
  if (payload.type !== 'arrive') {
    return NextResponse.json({ error: 'token type mismatch' }, { status: 400 });
  }

  const { profileId, orgId, note } = payload;
  const admin = createAdminClient();
  const now = new Date().toISOString();

  // Determine Bangkok work date
  const workDate = new Date(now).toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' });

  // Find current sequence number for today
  const { data: existingStops } = await admin
    .from('just_me_travel_logs')
    .select('sequence')
    .eq('profile_id', profileId)
    .eq('org_id', orgId)
    .eq('work_date', workDate)
    .order('sequence', { ascending: false })
    .limit(1);

  const nextSeq = existingStops && existingStops.length > 0 ? (existingStops[0].sequence as number) + 1 : 0;

  const { error } = await admin.from('just_me_travel_logs').insert({
    org_id:     orgId,
    profile_id: profileId,
    work_date:  workDate,
    sequence:   nextSeq,
    stop_type:  'site',
    timestamp:  now,
    latitude,
    longitude,
    address:    address || `พิกัด GPS (${latitude.toFixed(6)}, ${longitude.toFixed(6)})`,
    note:       note || null,
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const { data: profile } = await admin
    .from('profiles')
    .select('display_name, email')
    .eq('id', profileId)
    .maybeSingle();
  const name = profile?.display_name || profile?.email || 'พนักงาน';
  const stopLabel = note ? ` — ${note}` : '';

  return NextResponse.json({
    ok: true,
    message: `บันทึกการมาถึง${stopLabel} สำเร็จสำหรับคุณ ${name}`,
  });
}
