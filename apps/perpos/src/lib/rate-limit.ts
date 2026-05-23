/**
 * Rate-limit helper (Phase 4a)
 *
 * Uses api_request_metrics (fire-and-forget) for sliding-window counting.
 * This is approximate — metrics have a small write lag — which is acceptable
 * for an ERP platform that needs protection against runaway integrations,
 * not sub-millisecond precision.
 *
 * Usage in a Route Handler:
 *   const result = await checkRateLimit(orgId, req.nextUrl.pathname);
 *   if (result && !result.allowed) {
 *     return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 });
 *   }
 */

import { createAdminClient } from '@/app/api/_lib/supabase';

export interface RateLimitResult {
  allowed:   boolean;
  limit:     number;
  current:   number;
  remaining: number;
  resetAt:   Date;
}

// ── Pattern matching ──────────────────────────────────────────────────────────

function matchesPattern(route: string, pattern: string): boolean {
  if (pattern === '*') return true;
  if (pattern.endsWith('/*')) return route.startsWith(pattern.slice(0, -1));
  return route === pattern;
}

// ── Core check ────────────────────────────────────────────────────────────────

/**
 * Returns null if no active limit is configured for this org/route.
 * Returns { allowed: false } if the limit is exceeded and the violation is logged.
 */
export async function checkRateLimit(
  orgId:  string,
  route:  string,
): Promise<RateLimitResult | null> {
  const admin = createAdminClient();

  // Load all active limits for this org (ordered: specific first via desc length)
  const { data: limits } = await admin
    .from('tenant_rate_limits')
    .select('id, route_pattern, window_seconds, max_requests')
    .eq('org_id', orgId)
    .eq('is_active', true);

  if (!limits?.length) return null;

  // Best-match: longest specific pattern wins, then '*' fallback
  const sorted = [...limits].sort(
    (a, b) => b.route_pattern.length - a.route_pattern.length,
  );
  const config =
    sorted.find((l) => l.route_pattern !== '*' && matchesPattern(route, l.route_pattern)) ??
    sorted.find((l) => l.route_pattern === '*');

  if (!config) return null;

  const windowMs    = config.window_seconds * 1000;
  const windowStart = new Date(Date.now() - windowMs);

  const { count } = await admin
    .from('api_request_metrics')
    .select('id', { count: 'exact', head: true })
    .eq('org_id', orgId)
    .gte('logged_at', windowStart.toISOString());

  const current = count ?? 0;
  const allowed = current < config.max_requests;
  const resetAt = new Date(Date.now() + windowMs);

  if (!allowed) {
    // Fire-and-forget violation log
    void admin.from('rate_limit_violations').insert({
      org_id:        orgId,
      route,
      window_start:  windowStart.toISOString(),
      request_count: current,
      limit_value:   config.max_requests,
    });
  }

  return {
    allowed,
    limit:     config.max_requests,
    current,
    remaining: Math.max(0, config.max_requests - current),
    resetAt,
  };
}
