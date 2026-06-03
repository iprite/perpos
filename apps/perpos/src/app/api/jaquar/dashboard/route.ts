import { NextRequest, NextResponse } from 'next/server';
import { requireModuleMember } from '../../_lib/module-auth';
import { createAdminClient } from '../../_lib/supabase';

export async function GET(req: NextRequest) {
  const orgId = req.nextUrl.searchParams.get('orgId');
  if (!orgId) return NextResponse.json({ error: 'missing orgId' }, { status: 400 });

  const auth = await requireModuleMember(req, orgId, 'jaquar');
  if (!auth.ok) return auth.res;

  const admin = createAdminClient();

  // 1. Fetch all inventory items for calculations
  const { data: items, error: itemsErr } = await admin
    .from('jaquar_inventory_items')
    .select('id, item_code, location, total_saleable')
    .eq('org_id', orgId);

  if (itemsErr) {
    return NextResponse.json({ error: itemsErr.message }, { status: 500 });
  }

  const list = items ?? [];
  const totalSkus = list.length;
  let totalQty = 0;
  let outOfStockCount = 0;
  let lowStockCount = 0;

  const locationsMap: Record<string, { skus: number; qty: number }> = {};

  for (const item of list) {
    const qty = Number(item.total_saleable || 0);
    totalQty += qty;

    if (qty === 0) {
      outOfStockCount++;
    } else if (qty < 5) {
      lowStockCount++;
    }

    const locs = item.location
      ? item.location.split(',').map((l: string) => l.trim()).filter(Boolean)
      : ['คลังไม่ระบุ'];

    for (const loc of locs) {
      if (!locationsMap[loc]) {
        locationsMap[loc] = { skus: 0, qty: 0 };
      }
      locationsMap[loc].skus += 1;
      locationsMap[loc].qty += qty / locs.length; // distribute quantity equally across its locations
    }
  }

  // Format locations list and sort by quantity descending
  const locations = Object.entries(locationsMap).map(([name, stats]) => ({
    name,
    skus: stats.skus,
    qty: Math.round(stats.qty),
  })).sort((a, b) => b.qty - a.qty).slice(0, 10); // top 10 locations

  // 2. Fetch movements to draw transaction trends
  // Get recent 30 movements dates
  const { data: movements, error: movErr } = await admin
    .from('jaquar_inventory_movements')
    .select('qty, movement_date, movement_type')
    .eq('org_id', orgId)
    .order('movement_date', { ascending: false })
    .limit(200);

  const trendMap: Record<string, { date: string; inQty: number; outQty: number; transactions: number }> = {};
  if (!movErr && movements) {
    for (const mov of movements) {
      const dateStr = mov.movement_date;
      if (!trendMap[dateStr]) {
        trendMap[dateStr] = { date: dateStr, inQty: 0, outQty: 0, transactions: 0 };
      }
      trendMap[dateStr].transactions += 1;
      if (mov.movement_type === 'in') {
        trendMap[dateStr].inQty += Number(mov.qty);
      } else {
        trendMap[dateStr].outQty += Number(mov.qty);
      }
    }
  }

  // Format and sort trends by date ascending
  const trends = Object.values(trendMap)
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-15); // last 15 active days

  return NextResponse.json({
    stats: {
      totalSkus,
      totalQty,
      outOfStockCount,
      lowStockCount,
    },
    locations,
    trends,
  });
}
