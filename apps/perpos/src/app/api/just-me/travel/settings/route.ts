import { NextRequest, NextResponse } from 'next/server';
import { requireJustMeMember, canWrite } from '../../_lib';
import { createAdminClient } from '../../../_lib/supabase';

export async function GET(req: NextRequest) {
  const orgId = req.nextUrl.searchParams.get('orgId');
  if (!orgId) return NextResponse.json({ error: 'missing orgId' }, { status: 400 });

  const auth = await requireJustMeMember(req, orgId);
  if (!auth.ok) return auth.res;

  const admin = createAdminClient();
  const { data, error } = await admin
    .from('just_me_travel_settings')
    .select('*')
    .eq('org_id', orgId)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ settings: data ?? null });
}

export async function PUT(req: NextRequest) {
  const orgId = req.nextUrl.searchParams.get('orgId');
  if (!orgId) return NextResponse.json({ error: 'missing orgId' }, { status: 400 });

  const auth = await requireJustMeMember(req, orgId);
  if (!auth.ok) return auth.res;
  if (!canWrite(auth.role)) {
    return NextResponse.json({ error: 'ไม่มีสิทธิ์แก้ไขการตั้งค่า' }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const { fuel_rate_per_km, home_latitude, home_longitude, home_address, include_return } = body as {
    fuel_rate_per_km?: number;
    home_latitude?: number | null;
    home_longitude?: number | null;
    home_address?: string | null;
    include_return?: boolean;
  };

  if (fuel_rate_per_km !== undefined && (typeof fuel_rate_per_km !== 'number' || fuel_rate_per_km <= 0)) {
    return NextResponse.json({ error: 'อัตราค่าน้ำมันต้องเป็นตัวเลขมากกว่า 0' }, { status: 400 });
  }

  const admin = createAdminClient();
  const now = new Date().toISOString();

  const { error } = await admin
    .from('just_me_travel_settings')
    .upsert(
      {
        org_id: orgId,
        fuel_rate_per_km: fuel_rate_per_km ?? 4.0,
        home_latitude: home_latitude ?? null,
        home_longitude: home_longitude ?? null,
        home_address: home_address ?? null,
        include_return: include_return ?? true,
        updated_at: now,
      },
      { onConflict: 'org_id' },
    );

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
