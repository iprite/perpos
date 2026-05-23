/**
 * GET /api/admin/health
 *
 * Computes a 0-100 health score for every org (or one if orgId= is given).
 * Factors:
 *   - API error rate (last 24 h) from api_request_metrics
 *   - Webhook failure rate (last 7 d) from webhook_delivery_logs
 *   - Last activity date
 *   - Billing plan expiry / trial status
 *   - Maintenance mode (informational, not penalised)
 *
 * Grade mapping: A ≥ 90 | B ≥ 75 | C ≥ 55 | D ≥ 35 | F < 35
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '../../_lib/auth';
import { createAdminClient } from '../../_lib/supabase';
import { isPlanExpired, trialDaysRemaining, type OrgBillingRow } from '@/lib/billing';

function grade(score: number): 'A' | 'B' | 'C' | 'D' | 'F' {
  if (score >= 90) return 'A';
  if (score >= 75) return 'B';
  if (score >= 55) return 'C';
  if (score >= 35) return 'D';
  return 'F';
}

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (!auth.ok) return auth.res;

  const orgId = req.nextUrl.searchParams.get('orgId');
  const admin = createAdminClient();

  // ── 1. Orgs ───────────────────────────────────────────────────────────────
  let orgsQ = admin.from('organizations').select('id, name, maintenance_mode');
  if (orgId) orgsQ = orgsQ.eq('id', orgId);
  const { data: orgs, error: orgsErr } = await orgsQ.order('name');
  if (orgsErr) return NextResponse.json({ error: orgsErr.message }, { status: 500 });
  const orgList = (orgs ?? []) as { id: string; name: string; maintenance_mode: boolean }[];
  const orgIds  = orgList.map((o) => o.id);
  if (!orgIds.length) return NextResponse.json({ orgs: [] });

  // ── 2. Parallel data fetch ────────────────────────────────────────────────
  const since24h = new Date(Date.now() - 24 * 3_600_000).toISOString();
  const since7d  = new Date(Date.now() -  7 * 86_400_000).toISOString();

  const [metricsRes, webhookRes, billingRes] = await Promise.all([
    // API metrics: all rows in last 24h for these orgs
    admin
      .from('api_request_metrics')
      .select('org_id, status_code, logged_at')
      .in('org_id', orgIds)
      .gte('logged_at', since24h)
      .limit(50_000),

    // Webhook deliveries: last 7d
    admin
      .from('webhook_delivery_logs')
      .select('webhook_id, success, delivered_at')
      .gte('delivered_at', since7d)
      .limit(20_000),

    // Billing
    admin
      .from('org_billing')
      .select('*')
      .in('org_id', orgIds),
  ]);

  // Need to join webhooks → org via tenant_webhooks
  const { data: webhookDefs } = await admin
    .from('tenant_webhooks')
    .select('id, org_id')
    .in('org_id', orgIds);

  const webhookOrgMap: Record<string, string> = {};
  for (const w of webhookDefs ?? []) {
    const ww = w as Record<string, string>;
    webhookOrgMap[ww.id] = ww.org_id;
  }

  // ── 3. Index by org ───────────────────────────────────────────────────────
  type MetricRow = { org_id: string; status_code: number; logged_at: string };
  const metricsByOrg: Record<string, MetricRow[]> = {};
  for (const m of (metricsRes.data ?? []) as MetricRow[]) {
    if (!metricsByOrg[m.org_id]) metricsByOrg[m.org_id] = [];
    metricsByOrg[m.org_id].push(m);
  }

  type WLogRow = { webhook_id: string; success: boolean; delivered_at: string };
  const wLogsByOrg: Record<string, WLogRow[]> = {};
  for (const wl of (webhookRes.data ?? []) as WLogRow[]) {
    const orgI = webhookOrgMap[wl.webhook_id];
    if (!orgI) continue;
    if (!wLogsByOrg[orgI]) wLogsByOrg[orgI] = [];
    wLogsByOrg[orgI].push(wl);
  }

  const billingByOrg: Record<string, OrgBillingRow> = {};
  for (const b of (billingRes.data ?? []) as (OrgBillingRow & { org_id: string })[]) {
    billingByOrg[b.org_id] = b;
  }

  // ── 4. Score each org ─────────────────────────────────────────────────────
  const result = orgList.map((org) => {
    const metrics  = metricsByOrg[org.id] ?? [];
    const wLogs    = wLogsByOrg[org.id]   ?? [];
    const billing  = billingByOrg[org.id] ?? { plan_tier: 'free' as const };

    let score = 100;
    const factors: Record<string, unknown> = {};

    // ── Factor: API error rate ──────────────────────────────────
    const totalReqs  = metrics.length;
    const errorReqs  = metrics.filter((m) => m.status_code >= 500).length;
    const errorRate  = totalReqs > 0 ? (errorReqs / totalReqs) * 100 : 0;
    let apiErrDeduct = 0;
    if      (errorRate > 10) apiErrDeduct = 25;
    else if (errorRate > 5)  apiErrDeduct = 15;
    else if (errorRate > 1)  apiErrDeduct = 5;
    score -= apiErrDeduct;
    factors.api = {
      request_count: totalReqs,
      error_count:   errorReqs,
      error_rate_pct: Math.round(errorRate * 10) / 10,
      deduction:     apiErrDeduct,
      status:        apiErrDeduct === 0 ? 'ok' : apiErrDeduct >= 15 ? 'critical' : 'warning',
    };

    // ── Factor: Webhook health ──────────────────────────────────
    const totalWH  = wLogs.length;
    const failedWH = wLogs.filter((w) => !w.success).length;
    const wFailRate = totalWH > 0 ? (failedWH / totalWH) * 100 : 0;
    let wDeduct = 0;
    if      (wFailRate > 50) wDeduct = 20;
    else if (wFailRate > 20) wDeduct = 10;
    else if (wFailRate > 5)  wDeduct = 5;
    score -= wDeduct;
    factors.webhooks = {
      delivery_count: totalWH,
      failure_count:  failedWH,
      failure_rate_pct: Math.round(wFailRate * 10) / 10,
      deduction:      wDeduct,
      status:         wDeduct === 0 ? 'ok' : wDeduct >= 15 ? 'critical' : 'warning',
    };

    // ── Factor: Activity ────────────────────────────────────────
    const lastSeen = metrics.length > 0
      ? metrics.reduce((a, b) => a.logged_at > b.logged_at ? a : b).logged_at
      : null;
    const daysSinceActive = lastSeen
      ? (Date.now() - new Date(lastSeen).getTime()) / 86_400_000
      : Infinity;
    let actDeduct = 0;
    if      (daysSinceActive > 30)  actDeduct = 20;
    else if (daysSinceActive > 7)   actDeduct = 10;
    else if (daysSinceActive === Infinity) actDeduct = 5;
    score -= actDeduct;
    factors.activity = {
      last_seen_at: lastSeen,
      days_since:   daysSinceActive === Infinity ? null : Math.round(daysSinceActive),
      deduction:    actDeduct,
      status:       actDeduct === 0 ? 'ok' : actDeduct >= 15 ? 'critical' : 'warning',
    };

    // ── Factor: Billing ─────────────────────────────────────────
    const expired  = isPlanExpired(billing);
    const trialDays = trialDaysRemaining(billing);
    let billDeduct = 0;
    if (expired)                                  billDeduct = 30;
    else if (trialDays !== null && trialDays < 3)  billDeduct = 15;
    else if (trialDays !== null && trialDays < 7)  billDeduct = 5;
    score -= billDeduct;
    factors.billing = {
      plan_tier:           billing.plan_tier,
      is_expired:          expired,
      trial_days_remaining: trialDays,
      deduction:           billDeduct,
      status:              billDeduct === 0 ? 'ok' : billDeduct >= 25 ? 'critical' : 'warning',
    };

    const finalScore = Math.max(0, Math.min(100, score));
    return {
      org_id:            org.id,
      org_name:          org.name,
      maintenance_mode:  org.maintenance_mode,
      health_score:      finalScore,
      grade:             grade(finalScore),
      factors,
      computed_at:       new Date().toISOString(),
    };
  });

  // Worst first
  result.sort((a, b) => a.health_score - b.health_score);

  return NextResponse.json({ orgs: result });
}
