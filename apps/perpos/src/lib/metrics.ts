/**
 * API Request Metrics — fire-and-forget performance logger
 *
 * Call recordMetric() at the END of any API route handler.
 * It never throws and never blocks the response.
 *
 * Usage in a route handler:
 *   const t0 = Date.now();
 *   // ... handler logic ...
 *   const res = NextResponse.json({ ok: true });
 *   void recordMetric({ orgId, route: '/api/tmc/finance', method: req.method, status: 200, t0 });
 *   return res;
 *
 * Or use the wrapWithMetrics() helper for cleaner code.
 */

import { createAdminClient } from '@/app/api/_lib/supabase';

export interface MetricPayload {
  orgId:  string | null | undefined;
  route:  string;  // e.g. '/api/tmc/finance'
  method: string;  // 'GET', 'POST', ...
  status: number;  // HTTP status code
  t0:     number;  // Date.now() at request start
}

/**
 * Insert a single metric row asynchronously.
 * Safe to call with void — never throws.
 */
export async function recordMetric(payload: MetricPayload): Promise<void> {
  if (!payload.orgId) return; // skip unscoped requests
  const duration_ms = Date.now() - payload.t0;
  try {
    const admin = createAdminClient();
    await admin.from('api_request_metrics').insert({
      org_id:      payload.orgId,
      route:       payload.route,
      method:      payload.method.toUpperCase(),
      duration_ms,
      status_code: payload.status,
    });
  } catch {
    // Metrics must never affect the request — silently swallow errors
  }
}

/**
 * Batch-insert multiple metrics (useful for background jobs).
 */
export async function recordMetricsBatch(
  rows: MetricPayload[],
): Promise<void> {
  const admin = createAdminClient();
  const now = Date.now();
  try {
    await admin.from('api_request_metrics').insert(
      rows
        .filter((r) => r.orgId)
        .map((r) => ({
          org_id:      r.orgId,
          route:       r.route,
          method:      r.method.toUpperCase(),
          duration_ms: now - r.t0,
          status_code: r.status,
        })),
    );
  } catch { /* silent */ }
}
