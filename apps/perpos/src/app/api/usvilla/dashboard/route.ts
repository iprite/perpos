import { NextRequest, NextResponse } from 'next/server';
import { requireModuleMember } from '../../_lib/module-auth';
import { createAdminClient } from '../../_lib/supabase';

// GET /api/usvilla/dashboard?orgId=xxx&date=2026-05-29
export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const orgId = searchParams.get('orgId');
  const date  = searchParams.get('date') ?? new Date().toISOString().slice(0, 10);

  if (!orgId) return NextResponse.json({ error: 'missing orgId' }, { status: 400 });

  const auth = await requireModuleMember(req, orgId, 'usvilla');
  if (!auth.ok) return auth.res;

  const admin = createAdminClient();

  // Month boundaries
  const [year, month] = date.split('-').map(Number);
  const monthStart = `${year}-${String(month).padStart(2, '0')}-01`;
  const daysInMonth = new Date(year, month, 0).getDate();
  const daysElapsed = Number(date.slice(8, 10));

  // ── Query 1: Bookings overlapping the selected date ───────────────────────
  const { data: dailyBookings, error: dErr } = await admin
    .from('pms_bookings')
    .select('id, check_in_date, stay_type, pms_rooms!inner(room_type), pms_payments(method, amount, paid_at)')
    .eq('org_id', orgId)
    .not('status', 'in', '("cancelled")')
    .lte('check_in_date', date)
    .or(`check_out_date.is.null,check_out_date.gte.${date}`);

  if (dErr) return NextResponse.json({ error: dErr.message }, { status: 500 });

  // ── Query 2: All bookings with check_in_date within the month (or before) that overlap month ──
  const { data: monthBookings, error: mErr } = await admin
    .from('pms_bookings')
    .select('id, check_in_date, check_out_date, nights, pms_rooms!inner(room_type), pms_payments(method, amount, paid_at)')
    .eq('org_id', orgId)
    .not('status', 'in', '("cancelled")')
    .lte('check_in_date', date)
    .or(`check_out_date.is.null,check_out_date.gte.${monthStart}`);

  if (mErr) return NextResponse.json({ error: mErr.message }, { status: 500 });

  // ── Compute daily stats ───────────────────────────────────────────────────

  // Room count per type (occupying on this date)
  const dailyCount: Record<string, number> = {};
  // Revenue per type = payments collected TODAY for bookings active today
  const dailyRevByType: Record<string, number> = {};
  // Revenue per method = payments collected TODAY
  const dailyRevByMethod: Record<string, number> = {};
  // Source breakdown
  const dailySources: Record<string, number> = { direct: 0, trip: 0, agoda: 0, expedia: 0 };

  for (const b of dailyBookings ?? []) {
    const type = (b.pms_rooms as any).room_type as string;
    dailyCount[type] = (dailyCount[type] ?? 0) + 1;

    const payments = (b.pms_payments as any[]) ?? [];
    const todayPayments = payments.filter((p) => p.paid_at?.slice(0, 10) === date);

    let typeTotal = 0;
    for (const p of todayPayments) {
      const amt = Number(p.amount);
      dailyRevByType[type] = (dailyRevByType[type] ?? 0) + amt;
      dailyRevByMethod[p.method] = (dailyRevByMethod[p.method] ?? 0) + amt;
      typeTotal += amt;
    }

    // Source
    const allMethods = payments.map((p: any) => p.method);
    if (allMethods.includes('trip'))    dailySources.trip++;
    else if (allMethods.includes('agoda'))   dailySources.agoda++;
    else if (allMethods.includes('expedia')) dailySources.expedia++;
    else dailySources.direct++;
  }

  const dailyTotalCount   = Object.values(dailyCount).reduce((s, v) => s + v, 0);
  const dailyTotalRevenue = Object.values(dailyRevByType).reduce((s, v) => s + v, 0);

  // ── Compute monthly stats ─────────────────────────────────────────────────

  const monthRevByType:   Record<string, number> = {};
  const monthRevByMethod: Record<string, number> = {};
  let   monthRoomNights = 0;

  for (const b of monthBookings ?? []) {
    const type = (b.pms_rooms as any).room_type as string;

    // Room-nights contributed to this month up to selected date
    const inDate  = b.check_in_date > monthStart ? b.check_in_date : monthStart;
    const outDate = !b.check_out_date || b.check_out_date > date ? date : b.check_out_date;
    const nights  = Math.max(0, dateDiff(inDate, outDate) + (outDate === date && !b.check_out_date ? 0 : 1));
    monthRoomNights += nights;

    // Payments paid within this month up to selected date
    const payments = (b.pms_payments as any[]) ?? [];
    const monthPayments = payments.filter((p) => {
      const pDate = p.paid_at?.slice(0, 10);
      return pDate >= monthStart && pDate <= date;
    });

    for (const p of monthPayments) {
      const amt = Number(p.amount);
      monthRevByType[type]    = (monthRevByType[type] ?? 0) + amt;
      monthRevByMethod[p.method] = (monthRevByMethod[p.method] ?? 0) + amt;
    }
  }

  const monthTotalRevenue = Object.values(monthRevByType).reduce((s, v) => s + v, 0);
  const TOTAL_ROOMS = 45;

  // Occupancy
  const dailyOccupancyRate  = TOTAL_ROOMS > 0 ? dailyTotalCount / TOTAL_ROOMS : 0;
  const monthAvailable       = TOTAL_ROOMS * daysElapsed;
  const monthOccupancyRate   = monthAvailable > 0 ? monthRoomNights / monthAvailable : 0;

  // ADR (Average Daily Rate) = revenue / occupied rooms
  const dailyADR  = dailyTotalCount  > 0 ? dailyTotalRevenue  / dailyTotalCount  : 0;
  const monthADR  = monthRoomNights  > 0 ? monthTotalRevenue  / monthRoomNights  : 0;

  // RevPAR (Revenue Per Available Room)
  const dailyRevPAR = TOTAL_ROOMS > 0 ? dailyTotalRevenue  / TOTAL_ROOMS : 0;
  const monthRevPAR = monthAvailable > 0 ? monthTotalRevenue / monthAvailable : 0;

  return NextResponse.json({
    date,
    month_start:      monthStart,
    days_elapsed:     daysElapsed,
    total_rooms:      TOTAL_ROOMS,
    // Daily
    daily: {
      by_type:    dailyCount,
      rev_by_type:   dailyRevByType,
      rev_by_method: dailyRevByMethod,
      total_count:   dailyTotalCount,
      total_revenue: dailyTotalRevenue,
      sources:       dailySources,
      occupancy_rate: dailyOccupancyRate,
      adr:            dailyADR,
      revpar:         dailyRevPAR,
    },
    // Monthly
    monthly: {
      rev_by_type:    monthRevByType,
      rev_by_method:  monthRevByMethod,
      total_revenue:  monthTotalRevenue,
      room_nights:    monthRoomNights,
      available:      monthAvailable,
      occupancy_rate: monthOccupancyRate,
      adr:            monthADR,
      revpar:         monthRevPAR,
    },
  });
}

function dateDiff(a: string, b: string): number {
  return Math.round((new Date(b).getTime() - new Date(a).getTime()) / 86_400_000);
}
