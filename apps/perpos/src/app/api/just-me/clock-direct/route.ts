import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '../../_lib/supabase';
import { verifyClockToken } from '../_lib';
import { computeTravelRoute, type LatLng } from '@/lib/just-me/travel-distance';

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const { token, latitude, longitude, address } = body as {
    token?: string;
    latitude?: number;
    longitude?: number;
    address?: string;
  };

  if (!token) return NextResponse.json({ error: 'missing token' }, { status: 400 });

  const payload = verifyClockToken(token);
  if (!payload) {
    return NextResponse.json(
      { error: 'ลิงก์หมดอายุ หรือข้อมูลไม่ถูกต้อง กรุณาพิมพ์คำสั่งใหม่ทาง LINE Bot' },
      { status: 400 },
    );
  }

  const { profileId, orgId, type, locationType, note } = payload;
  const admin = createAdminClient();

  if (type === 'depart') return handleDepart(admin, profileId, orgId, locationType, note, latitude, longitude, address);
  if (type === 'arrive') return handleArrive(admin, profileId, orgId, locationType, note, latitude, longitude, address);

  return NextResponse.json({ error: 'unknown token type' }, { status: 400 });
}

// ─── DEPART: leaving current location, set as origin for next hop ─────────────
async function handleDepart(
  admin: ReturnType<typeof createAdminClient>,
  profileId: string, orgId: string,
  locationType: 'home' | 'site' | null,
  note: string | null,
  latitude?: number, longitude?: number, address?: string,
) {
  if (latitude == null || longitude == null) return NextResponse.json({ error: 'ต้องการพิกัด GPS' }, { status: 400 });

  const now = new Date().toISOString();
  const workDate = new Date(now).toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' });
  const coords = `(${latitude.toFixed(6)}, ${longitude.toFixed(6)})`;
  const placeName = locationType === 'home' ? 'บ้าน' : (note || address || 'หน้างาน');
  const addr = `${placeName} ${coords}`;

  const { data: session } = await admin.from('just_me_clock_sessions').select('status, last_in_time, last_in_address').eq('profile_id', profileId).maybeSingle();

  const nextSeq = await getNextSeq(admin, profileId, orgId, workDate);

  await admin.from('just_me_travel_logs').insert({
    org_id: orgId, profile_id: profileId, work_date: workDate,
    sequence: nextSeq,
    stop_type: locationType === 'home' ? 'start' : 'site',
    location_type: locationType,
    timestamp: now, latitude, longitude,
    address: addr, note,
  });

  // If departing a site → record work_end_time in claim
  if (locationType === 'site' && session?.status === 'working' && session.last_in_time) {
    await updateClaimWorkEnd(admin, profileId, orgId, workDate, now);
  }

  await admin.from('just_me_clock_sessions').upsert({
    profile_id: profileId, org_id: orgId,
    status: 'traveling',
    last_depart_time: now,
    last_depart_latitude: latitude,
    last_depart_longitude: longitude,
    last_depart_address: addr,
    last_in_time: null, last_in_latitude: null, last_in_longitude: null, last_in_address: null,
    updated_at: now,
  }, { onConflict: 'profile_id' });

  const { data: p } = await admin.from('profiles').select('email, display_name').eq('id', profileId).maybeSingle();
  const name = p?.display_name || p?.email || 'พนักงาน';
  return NextResponse.json({ ok: true, message: `บันทึกการออกเดินทางสำเร็จ (${addr}) สำหรับคุณ ${name}` });
}

// ─── ARRIVE: reached destination, calculate hop distance ─────────────────────
async function handleArrive(
  admin: ReturnType<typeof createAdminClient>,
  profileId: string, orgId: string,
  locationType: 'home' | 'site' | null,
  note: string | null,
  latitude?: number, longitude?: number, address?: string,
) {
  if (latitude == null || longitude == null) return NextResponse.json({ error: 'ต้องการพิกัด GPS' }, { status: 400 });

  const now = new Date().toISOString();
  const workDate = new Date(now).toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' });
  const coords = `(${latitude.toFixed(6)}, ${longitude.toFixed(6)})`;
  const placeName = locationType === 'home' ? 'บ้าน' : (note || address || 'หน้างาน');
  const addr = `${placeName} ${coords}`;

  const { data: session } = await admin
    .from('just_me_clock_sessions')
    .select('status, last_depart_time, last_depart_latitude, last_depart_longitude, last_depart_address, last_in_time, last_in_latitude, last_in_longitude, last_in_address')
    .eq('profile_id', profileId)
    .maybeSingle();

  const sessionStatus = session?.status ?? 'idle';

  if (locationType === 'home' && sessionStatus === 'idle') {
    return NextResponse.json({ error: 'คุณยังไม่ได้เริ่มบันทึกการเดินทางของวันนี้' }, { status: 400 });
  }

  const nextSeq = await getNextSeq(admin, profileId, orgId, workDate);

  await admin.from('just_me_travel_logs').insert({
    org_id: orgId, profile_id: profileId, work_date: workDate,
    sequence: nextSeq,
    stop_type: locationType === 'home' ? 'end' : 'site',
    location_type: locationType,
    timestamp: now, latitude, longitude,
    address: addr, note,
  });

  // Calculate this hop's distance
  let hopResult: { distanceKm: number; fromAddress: string; toAddress: string } | null = null;
  
  // Decide where we departed from
  let departLat = session?.last_depart_latitude;
  let departLng = session?.last_depart_longitude;
  let departAddr = session?.last_depart_address;

  if (sessionStatus === 'working') {
    // If they skipped depart log, the previous point is the arrival point of the last site they worked at
    departLat = session?.last_in_latitude;
    departLng = session?.last_in_longitude;
    departAddr = session?.last_in_address;
  }

  if (departLat != null && departLng != null) {
    const waypoints: LatLng[] = [
      { lat: Number(departLat), lng: Number(departLng), address: departAddr || undefined },
      { lat: latitude, lng: longitude, address: addr },
    ];
    const route = await computeTravelRoute(waypoints);
    if (route?.hops.length) {
      hopResult = { distanceKm: route.hops[0].distanceKm, fromAddress: route.hops[0].fromAddress, toAddress: route.hops[0].toAddress };
    }
  }

  // Append hop to daily claim + set work_start if first site arrival
  await updateDailyClaim(admin, profileId, orgId, workDate, hopResult, locationType === 'site' ? now : null);

  // If arriving home → clear session (day done); else → set working at this site
  if (locationType === 'home') {
    const { data: claim } = await admin
      .from('just_me_travel_claims')
      .select('work_start_time, work_end_time')
      .eq('profile_id', profileId).eq('org_id', orgId).eq('work_date', workDate)
      .maybeSingle();

    if (claim && claim.work_start_time && !claim.work_end_time) {
      const endTime = now;
      const workMinutes = Math.round((new Date(endTime).getTime() - new Date(claim.work_start_time).getTime()) / 60000);
      await admin.from('just_me_travel_claims')
        .update({ work_end_time: endTime, work_minutes: workMinutes, updated_at: new Date().toISOString() })
        .eq('profile_id', profileId).eq('org_id', orgId).eq('work_date', workDate);
    }

    await admin.from('just_me_clock_sessions').delete().eq('profile_id', profileId);
  } else {
    await admin.from('just_me_clock_sessions').upsert({
      profile_id: profileId, org_id: orgId,
      status: 'working',
      last_in_time: now,
      last_in_latitude: latitude,
      last_in_longitude: longitude,
      last_in_address: addr,
      last_depart_time: null, last_depart_latitude: null, last_depart_longitude: null, last_depart_address: null,
      updated_at: now,
    }, { onConflict: 'profile_id' });
  }

  const { data: p } = await admin.from('profiles').select('email, display_name').eq('id', profileId).maybeSingle();
  const name = p?.display_name || p?.email || 'พนักงาน';
  const distMsg = hopResult ? ` ระยะทาง ${hopResult.distanceKm} km` : '';
  const doneMsg = locationType === 'home' ? ' 🏠 สิ้นสุดวันทำงาน — ดูสรุปค่าเดินทางใน app' : '';
  return NextResponse.json({
    ok: true,
    message: `บันทึกการมาถึงสำเร็จ${distMsg}${doneMsg} สำหรับคุณ ${name}`,
    hop: hopResult,
  });
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
async function getNextSeq(admin: ReturnType<typeof createAdminClient>, profileId: string, orgId: string, workDate: string) {
  const { data } = await admin
    .from('just_me_travel_logs')
    .select('sequence')
    .eq('profile_id', profileId).eq('org_id', orgId).eq('work_date', workDate)
    .order('sequence', { ascending: false })
    .limit(1).maybeSingle();
  return data ? (data.sequence as number) + 1 : 0;
}

async function updateClaimWorkEnd(
  admin: ReturnType<typeof createAdminClient>,
  profileId: string, orgId: string, workDate: string, endTime: string,
) {
  const { data: existing } = await admin
    .from('just_me_travel_claims')
    .select('work_start_time')
    .eq('profile_id', profileId).eq('org_id', orgId).eq('work_date', workDate)
    .maybeSingle();

  const workMinutes = existing?.work_start_time
    ? Math.round((new Date(endTime).getTime() - new Date(existing.work_start_time).getTime()) / 60000)
    : null;

  await admin.from('just_me_travel_claims')
    .update({ work_end_time: endTime, work_minutes: workMinutes, updated_at: new Date().toISOString() })
    .eq('profile_id', profileId).eq('org_id', orgId).eq('work_date', workDate);
}

async function updateDailyClaim(
  admin: ReturnType<typeof createAdminClient>,
  profileId: string, orgId: string, workDate: string,
  newHop: { distanceKm: number; fromAddress: string; toAddress: string } | null,
  siteArrivalTime: string | null,
) {
  const [{ data: settings }, { data: existing }] = await Promise.all([
    admin.from('just_me_travel_settings').select('fuel_rate_per_km').eq('org_id', orgId).maybeSingle(),
    admin.from('just_me_travel_claims').select('hops, total_distance_km, work_start_time, work_minutes').eq('profile_id', profileId).eq('org_id', orgId).eq('work_date', workDate).maybeSingle(),
  ]);

  const fuelRate = Number(settings?.fuel_rate_per_km ?? 4.0);
  const hops: Array<{ fromAddress: string; toAddress: string; distanceKm: number }> = existing?.hops ?? [];
  if (newHop) hops.push(newHop);

  const totalKm     = Math.round(hops.reduce((s, h) => s + h.distanceKm, 0) * 100) / 100;
  const totalAmount = Math.round(totalKm * fuelRate * 100) / 100;
  const now         = new Date().toISOString();

  // work_start = first site arrival (only set once, never overwritten)
  const workStart = existing?.work_start_time ?? siteArrivalTime ?? null;

  // Recalculate work_minutes if we now have both start and end
  let workMinutes: number | null = existing?.work_minutes ?? null;
  // (work_end is updated separately in updateClaimWorkEnd; we don't know it here)

  await admin.from('just_me_travel_claims').upsert(
    {
      org_id: orgId, profile_id: profileId, work_date: workDate,
      hops, total_distance_km: totalKm, fuel_rate_per_km: fuelRate,
      total_amount: totalAmount, status: 'pending',
      work_start_time: workStart,
      work_minutes: workMinutes,
      updated_at: now,
    },
    { onConflict: 'org_id,profile_id,work_date' },
  );
}
