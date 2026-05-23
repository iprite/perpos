/**
 * GET /api/admin/resources
 *
 * Aggregated API metrics per org for the resource monitor dashboard.
 *
 * Query params:
 *   window   '1h' | '6h' | '24h'  (default: '1h')
 *   orgId    optional — filter to single org
 *
 * Returns:
 *   {
 *     window: '1h',
 *     orgs: [
 *       {
 *         org_id, org_name,
 *         request_count, avg_latency_ms, p95_latency_ms,
 *         error_count, error_rate_pct,
 *         routes: [{ route, request_count, avg_latency_ms, error_count }]
 *       }
 *     ]
 *   }
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '../../_lib/auth';
import { createAdminClient } from '../../_lib/supabase';

const WINDOWS: Record<string, string> = {
  '1h':  '1 hour',
  '6h':  '6 hours',
  '24h': '24 hours',
  '7d':  '7 days',
};

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (!auth.ok) return auth.res;

  const p      = req.nextUrl.searchParams;
  const window = WINDOWS[p.get('window') ?? '1h'] ?? '1 hour';
  const orgId  = p.get('orgId') ?? null;

  const admin = createAdminClient();

  // ── Aggregated stats per org ───────────────────────────────────────────────
  let statsQuery = admin.rpc('get_org_metrics', {
    p_window: window,
    p_org_id: orgId,
  });

  // Fallback: raw SQL via execute_sql if RPC not available
  // We'll use a simpler approach with the Supabase client
  const since = new Date(Date.now() - parseDuration(window)).toISOString();

  let metricsQ = admin
    .from('api_request_metrics')
    .select('org_id, route, method, duration_ms, status_code, logged_at')
    .gte('logged_at', since);

  if (orgId) metricsQ = metricsQ.eq('org_id', orgId);

  const { data: rows, error } = await metricsQ
    .order('logged_at', { ascending: false })
    .limit(10000); // cap to avoid OOM

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // ── Aggregate in-process ──────────────────────────────────────────────────
  const orgStats = new Map<string, {
    request_count: number;
    latencies:     number[];
    error_count:   number;
    routes:        Map<string, { count: number; latencies: number[]; errors: number }>;
  }>();

  for (const row of rows ?? []) {
    const r = row as Record<string, unknown>;
    const oid = String(r.org_id);
    if (!orgStats.has(oid)) {
      orgStats.set(oid, { request_count: 0, latencies: [], error_count: 0, routes: new Map() });
    }
    const stat = orgStats.get(oid)!;
    stat.request_count++;
    stat.latencies.push(Number(r.duration_ms));
    const isError = Number(r.status_code) >= 500;
    if (isError) stat.error_count++;

    // Per-route breakdown
    const route = String(r.route);
    if (!stat.routes.has(route)) stat.routes.set(route, { count: 0, latencies: [], errors: 0 });
    const rs = stat.routes.get(route)!;
    rs.count++;
    rs.latencies.push(Number(r.duration_ms));
    if (isError) rs.errors++;
  }

  // Load org names
  const orgIds = Array.from(orgStats.keys());
  const { data: orgsData } = orgIds.length > 0
    ? await admin.from('organizations').select('id, name').in('id', orgIds)
    : { data: [] };
  const orgNameById: Record<string, string> = {};
  for (const o of orgsData ?? []) {
    const oo = o as Record<string, string>;
    orgNameById[oo.id] = oo.name;
  }

  // Format output
  const result = Array.from(orgStats.entries())
    .map(([oid, s]) => ({
      org_id:          oid,
      org_name:        orgNameById[oid] ?? oid,
      request_count:   s.request_count,
      avg_latency_ms:  avg(s.latencies),
      p95_latency_ms:  percentile(s.latencies, 95),
      error_count:     s.error_count,
      error_rate_pct:  s.request_count > 0
        ? Math.round((s.error_count / s.request_count) * 1000) / 10
        : 0,
      routes: Array.from(s.routes.entries())
        .map(([route, rs]) => ({
          route,
          request_count:  rs.count,
          avg_latency_ms: avg(rs.latencies),
          error_count:    rs.errors,
        }))
        .sort((a, b) => b.request_count - a.request_count)
        .slice(0, 10),
    }))
    .sort((a, b) => b.request_count - a.request_count);

  return NextResponse.json({ window: p.get('window') ?? '1h', orgs: result });
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function avg(nums: number[]): number {
  if (!nums.length) return 0;
  return Math.round(nums.reduce((s, n) => s + n, 0) / nums.length);
}

function percentile(nums: number[], p: number): number {
  if (!nums.length) return 0;
  const sorted = [...nums].sort((a, b) => a - b);
  const idx    = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)] ?? 0;
}

function parseDuration(window: string): number {
  const map: Record<string, number> = {
    '1 hour':   3_600_000,
    '6 hours':  6 * 3_600_000,
    '24 hours': 24 * 3_600_000,
    '7 days':   7 * 24 * 3_600_000,
  };
  return map[window] ?? 3_600_000;
}
