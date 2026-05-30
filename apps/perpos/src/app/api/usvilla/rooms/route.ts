import { NextRequest, NextResponse } from 'next/server';
import { requireModuleMember } from '../../_lib/module-auth';
import { createAdminClient } from '../../_lib/supabase';

// GET /api/usvilla/rooms?orgId=xxx
// Returns all rooms with current active booking (if any)
export async function GET(req: NextRequest) {
  const orgId = req.nextUrl.searchParams.get('orgId');
  if (!orgId) return NextResponse.json({ error: 'missing orgId' }, { status: 400 });

  const auth = await requireModuleMember(req, orgId, 'usvilla');
  if (!auth.ok) return auth.res;

  const admin = createAdminClient();

  // Auto-init rooms on first visit
  const { count } = await admin
    .from('pms_rooms')
    .select('id', { count: 'exact', head: true })
    .eq('org_id', orgId);

  if ((count ?? 0) === 0) {
    await admin.rpc('init_pms_rooms', { p_org_id: orgId });
  }

  // Rooms + current active booking
  const today = new Date().toISOString().slice(0, 10);

  const { data: rooms, error } = await admin
    .from('pms_rooms')
    .select(`
      id, room_number, room_type, base_price, status, sort_order,
      pms_bookings!left(
        id, guest_name, nationality, stay_type,
        check_in_date, check_in_time, check_out_date, check_out_time,
        nights, status,
        pms_payments(method, amount)
      )
    `)
    .eq('org_id', orgId)
    .eq('pms_bookings.org_id', orgId)
    .in('pms_bookings.status', ['checked_in', 'reserved'])
    .lte('pms_bookings.check_in_date', today)
    .or(`check_out_date.is.null,check_out_date.gte.${today}`, { foreignTable: 'pms_bookings' })
    .order('sort_order');

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Flatten: each room gets at most one active booking
  const result = (rooms ?? []).map((r) => {
    const bookings = (r.pms_bookings as any[]) ?? [];
    const activeBooking = bookings[0] ?? null;
    return { ...r, pms_bookings: undefined, booking: activeBooking };
  });

  return NextResponse.json({ rooms: result });
}
