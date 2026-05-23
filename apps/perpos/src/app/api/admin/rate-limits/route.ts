/**
 * GET /api/admin/rate-limits?orgId=&includeViolations=1
 *   → list configs for org + optional recent violations
 *
 * POST /api/admin/rate-limits
 *   { orgId, routePattern, windowSeconds, maxRequests }
 *   → create limit
 *
 * PUT /api/admin/rate-limits
 *   { id, routePattern?, windowSeconds?, maxRequests?, isActive? }
 *   → update limit
 *
 * DELETE /api/admin/rate-limits?id=
 *   → delete limit
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '../../_lib/auth';
import { createAdminClient } from '../../_lib/supabase';

const ROUTE_PATTERN_RE = /^(\*|\/[a-zA-Z0-9/_*\-:]{0,199})$/;

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (!auth.ok) return auth.res;

  const p                = req.nextUrl.searchParams;
  const orgId            = p.get('orgId');
  const includeViolations = p.get('includeViolations') === '1';
  const admin            = createAdminClient();

  let q = admin
    .from('tenant_rate_limits')
    .select('*')
    .order('route_pattern');

  if (orgId) q = q.eq('org_id', orgId);

  const { data: limits, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Recent violations per limit id
  let violations: Record<string, unknown[]> = {};
  if (includeViolations && orgId) {
    const since = new Date(Date.now() - 24 * 3_600_000).toISOString();
    const { data: vRows } = await admin
      .from('rate_limit_violations')
      .select('org_id, route, window_start, request_count, limit_value, logged_at')
      .eq('org_id', orgId)
      .gte('logged_at', since)
      .order('logged_at', { ascending: false })
      .limit(200);

    // group by route
    for (const v of vRows ?? []) {
      const row = v as Record<string, unknown>;
      const key = String(row.route);
      if (!violations[key]) violations[key] = [];
      violations[key].push(v);
    }
  }

  return NextResponse.json({ limits: limits ?? [], violations });
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (!auth.ok) return auth.res;

  const body = await req.json() as Record<string, unknown>;
  const { orgId, routePattern = '*', windowSeconds = 60, maxRequests } = body;

  if (!orgId)       return NextResponse.json({ error: 'orgId required' },       { status: 400 });
  if (!maxRequests) return NextResponse.json({ error: 'maxRequests required' }, { status: 400 });
  if (!ROUTE_PATTERN_RE.test(String(routePattern)))
    return NextResponse.json({ error: 'Invalid routePattern' }, { status: 400 });

  const ws  = Number(windowSeconds);
  const max = Number(maxRequests);
  if (ws < 1 || ws > 86400) return NextResponse.json({ error: 'windowSeconds must be 1–86400' }, { status: 400 });
  if (max < 1)              return NextResponse.json({ error: 'maxRequests must be ≥ 1' },       { status: 400 });

  const admin = createAdminClient();
  const { data, error } = await admin
    .from('tenant_rate_limits')
    .insert({
      org_id:         orgId,
      route_pattern:  routePattern,
      window_seconds: ws,
      max_requests:   max,
      created_by:     auth.userId,
      updated_at:     new Date().toISOString(),
    })
    .select()
    .single();

  if (error) {
    if (error.code === '23505')
      return NextResponse.json({ error: 'A limit for this org + route already exists' }, { status: 409 });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ limit: data }, { status: 201 });
}

export async function PUT(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (!auth.ok) return auth.res;

  const body = await req.json() as Record<string, unknown>;
  const { id, routePattern, windowSeconds, maxRequests, isActive } = body;
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (routePattern !== undefined) {
    if (!ROUTE_PATTERN_RE.test(String(routePattern)))
      return NextResponse.json({ error: 'Invalid routePattern' }, { status: 400 });
    patch.route_pattern = routePattern;
  }
  if (windowSeconds !== undefined) {
    const ws = Number(windowSeconds);
    if (ws < 1 || ws > 86400) return NextResponse.json({ error: 'windowSeconds must be 1–86400' }, { status: 400 });
    patch.window_seconds = ws;
  }
  if (maxRequests !== undefined) {
    const max = Number(maxRequests);
    if (max < 1) return NextResponse.json({ error: 'maxRequests must be ≥ 1' }, { status: 400 });
    patch.max_requests = max;
  }
  if (isActive !== undefined) patch.is_active = Boolean(isActive);

  const admin = createAdminClient();
  const { data, error } = await admin
    .from('tenant_rate_limits')
    .update(patch)
    .eq('id', id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ limit: data });
}

export async function DELETE(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (!auth.ok) return auth.res;

  const id = req.nextUrl.searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  const admin = createAdminClient();
  const { error } = await admin.from('tenant_rate_limits').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
