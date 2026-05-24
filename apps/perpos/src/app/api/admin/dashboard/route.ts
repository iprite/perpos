/**
 * GET /api/admin/dashboard
 * System-wide stats for the super admin dashboard.
 * All queries run in parallel via Promise.all.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '../../_lib/auth';
import { createAdminClient } from '../../_lib/supabase';
import { isPlanExpired, trialDaysRemaining, type PlanTier, type OrgBillingRow } from '@/lib/billing';

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

  const admin = createAdminClient();
  const since24h = new Date(Date.now() - 24 * 3_600_000).toISOString();
  const since7d  = new Date(Date.now() -  7 * 86_400_000).toISOString();

  const [
    { data: orgs },
    { data: { users: authUsers } },
    { data: profiles },
    { data: billing },
    { data: metrics24h },
    { data: webhooks7d },
    { data: recentOrgs },
  ] = await Promise.all([
    admin.from('organizations').select('id, name, maintenance_mode, created_at'),
    admin.auth.admin.listUsers({ perPage: 1000 }),
    admin.from('profiles').select('id, role, is_active, line_user_id, created_at'),
    admin.from('org_billing').select('org_id, plan_tier, plan_ends_at, trial_ends_at, payment_status'),
    admin.from('api_request_metrics').select('org_id, status_code').gte('logged_at', since24h).limit(100_000),
    admin.from('webhook_delivery_logs').select('success').gte('delivered_at', since7d).limit(50_000),
    admin.from('organizations').select('id, name, created_at').order('created_at', { ascending: false }).limit(5),
  ]);

  // ── Users ─────────────────────────────────────────────────────────────────
  const totalUsers    = (profiles ?? []).length;
  const activeUsers   = (profiles ?? []).filter((p) => p.is_active).length;
  const lineLinked    = (profiles ?? []).filter((p) => !!p.line_user_id).length;
  const superAdmins   = (profiles ?? []).filter((p) => p.role === 'super_admin').length;

  // ── Orgs ──────────────────────────────────────────────────────────────────
  const totalOrgs       = (orgs ?? []).length;
  const maintenanceOrgs = (orgs ?? []).filter((o) => (o as { maintenance_mode: boolean }).maintenance_mode).length;

  // ── Billing ───────────────────────────────────────────────────────────────
  const billByOrg: Record<string, Record<string, unknown>> = {};
  for (const b of billing ?? []) {
    billByOrg[String(b.org_id)] = b as Record<string, unknown>;
  }

  const tierCounts: Record<string, number> = { free: 0, starter: 0, pro: 0, enterprise: 0 };
  let expiredCount = 0;
  let overdueCount = 0;

  for (const org of orgs ?? []) {
    const b = billByOrg[String((org as { id: string }).id)];
    const tier = (b?.plan_tier as PlanTier) ?? 'free';
    tierCounts[tier] = (tierCounts[tier] ?? 0) + 1;
    const row: OrgBillingRow = { plan_tier: tier, plan_ends_at: b?.plan_ends_at as string, trial_ends_at: b?.trial_ends_at as string };
    if (isPlanExpired(row)) expiredCount++;
    if (b?.payment_status === 'overdue') overdueCount++;
  }

  // ── API health (24h) ──────────────────────────────────────────────────────
  const totalRequests  = (metrics24h ?? []).length;
  const errorRequests  = (metrics24h ?? []).filter((m) => Number(m.status_code) >= 500).length;
  const errorRatePct   = totalRequests > 0 ? Math.round((errorRequests / totalRequests) * 100 * 10) / 10 : 0;

  // Requests by org (top 5)
  const reqByOrg: Record<string, number> = {};
  for (const m of metrics24h ?? []) {
    if (m.org_id) reqByOrg[m.org_id] = (reqByOrg[m.org_id] ?? 0) + 1;
  }

  // ── Webhooks (7d) ─────────────────────────────────────────────────────────
  const totalWebhooks   = (webhooks7d ?? []).length;
  const failedWebhooks  = (webhooks7d ?? []).filter((w) => !w.success).length;
  const webhookFailRate = totalWebhooks > 0 ? Math.round((failedWebhooks / totalWebhooks) * 100 * 10) / 10 : 0;

  // ── Health grade estimate per org (simplified) ────────────────────────────
  const gradeCounts: Record<string, number> = { A: 0, B: 0, C: 0, D: 0, F: 0 };
  for (const org of orgs ?? []) {
    const orgId = (org as { id: string }).id;
    const b = billByOrg[orgId];
    const tier: PlanTier = (b?.plan_tier as PlanTier) ?? 'free';
    const row: OrgBillingRow = { plan_tier: tier, plan_ends_at: b?.plan_ends_at as string, trial_ends_at: b?.trial_ends_at as string };

    let score = 100;
    // Billing factor
    if (isPlanExpired(row)) score -= 30;
    else if ((trialDaysRemaining(row) ?? Infinity) < 3) score -= 15;
    // API error factor (org-level)
    const orgReqs   = reqByOrg[orgId] ?? 0;
    const orgErrors = (metrics24h ?? []).filter((m) => m.org_id === orgId && Number(m.status_code) >= 500).length;
    const orgErrPct = orgReqs > 0 ? orgErrors / orgReqs : 0;
    if (orgErrPct > 0.1) score -= 20;
    else if (orgErrPct > 0.05) score -= 10;

    gradeCounts[grade(Math.max(0, score))]++;
  }

  // ── Orgs needing attention (expired or overdue) ───────────────────────────
  const attentionOrgs = (orgs ?? [])
    .map((org) => {
      const o = org as { id: string; name: string };
      const b = billByOrg[o.id];
      const tier: PlanTier = (b?.plan_tier as PlanTier) ?? 'free';
      const row: OrgBillingRow = { plan_tier: tier, plan_ends_at: b?.plan_ends_at as string, trial_ends_at: b?.trial_ends_at as string };
      const expired = isPlanExpired(row);
      const overdue = b?.payment_status === 'overdue';
      return { org_id: o.id, org_name: o.name, expired, overdue };
    })
    .filter((o) => o.expired || o.overdue)
    .slice(0, 10);

  return NextResponse.json({
    computed_at: new Date().toISOString(),
    users: { total: totalUsers, active: activeUsers, line_linked: lineLinked, super_admins: superAdmins },
    orgs:  { total: totalOrgs, maintenance: maintenanceOrgs },
    billing: { tier_counts: tierCounts, expired: expiredCount, overdue: overdueCount },
    api: { requests_24h: totalRequests, errors_24h: errorRequests, error_rate_pct: errorRatePct },
    webhooks: { deliveries_7d: totalWebhooks, failed_7d: failedWebhooks, fail_rate_pct: webhookFailRate },
    health_grades: gradeCounts,
    attention_orgs: attentionOrgs,
    recent_orgs: (recentOrgs ?? []).map((o) => ({ id: (o as { id: string }).id, name: (o as { name: string }).name, created_at: (o as { created_at: string }).created_at })),
  });
}
