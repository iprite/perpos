/**
 * computeOrgHealth — คะแนนสุขภาพ 0-100 ต่อ org (super admin)
 * Factors: API error rate (24h) · webhook failure (7d) · last activity · billing expiry
 * Grade: A ≥ 90 | B ≥ 75 | C ≥ 55 | D ≥ 35 | F < 35
 *
 * ใช้ร่วม 2 ที่ (hybrid — หน้า health poll ทุก 60 วิ):
 *   - Server Component page.tsx       → initial data ตอน SSR
 *   - API route /api/admin/health     → client view poll ต่อ
 * รับ admin client (service role) — auth/role check เป็นหน้าที่ของ caller
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { isPlanExpired, trialDaysRemaining, type OrgBillingRow } from "@/lib/billing";

export type FactorStatus = "ok" | "warning" | "critical";
export type Grade = "A" | "B" | "C" | "D" | "F";

export interface Factor {
  deduction: number;
  status: FactorStatus;
  [key: string]: unknown;
}

export interface OrgHealth {
  org_id: string;
  org_name: string;
  maintenance_mode: boolean;
  health_score: number;
  grade: Grade;
  factors: {
    api: Factor & { request_count: number; error_count: number; error_rate_pct: number };
    webhooks: Factor & { delivery_count: number; failure_count: number; failure_rate_pct: number };
    activity: Factor & { last_seen_at: string | null; days_since: number | null };
    billing: Factor & {
      plan_tier: string;
      is_expired: boolean;
      trial_days_remaining: number | null;
    };
  };
  computed_at: string;
}

function grade(score: number): Grade {
  if (score >= 90) return "A";
  if (score >= 75) return "B";
  if (score >= 55) return "C";
  if (score >= 35) return "D";
  return "F";
}

export async function computeOrgHealth(admin: SupabaseClient): Promise<OrgHealth[]> {
  const { data: orgs } = await admin
    .from("organizations")
    .select("id, name, maintenance_mode")
    .order("name");
  const orgList = (orgs ?? []) as { id: string; name: string; maintenance_mode: boolean }[];
  const orgIds = orgList.map((o) => o.id);
  if (!orgIds.length) return [];

  const since24h = new Date(Date.now() - 24 * 3_600_000).toISOString();
  const since7d = new Date(Date.now() - 7 * 86_400_000).toISOString();

  const [metricsRes, webhookRes, billingRes] = await Promise.all([
    admin
      .from("api_request_metrics")
      .select("org_id, status_code, logged_at")
      .in("org_id", orgIds)
      .gte("logged_at", since24h)
      .limit(50_000),
    admin
      .from("webhook_delivery_logs")
      .select("webhook_id, success, delivered_at")
      .gte("delivered_at", since7d)
      .limit(20_000),
    admin.from("org_billing").select("*").in("org_id", orgIds),
  ]);

  const { data: webhookDefs } = await admin
    .from("tenant_webhooks")
    .select("id, org_id")
    .in("org_id", orgIds);
  const webhookOrgMap: Record<string, string> = {};
  for (const w of webhookDefs ?? []) {
    const ww = w as Record<string, string>;
    webhookOrgMap[ww.id] = ww.org_id;
  }

  type MetricRow = { org_id: string; status_code: number; logged_at: string };
  const metricsByOrg: Record<string, MetricRow[]> = {};
  for (const m of (metricsRes.data ?? []) as MetricRow[]) {
    (metricsByOrg[m.org_id] ??= []).push(m);
  }

  type WLogRow = { webhook_id: string; success: boolean; delivered_at: string };
  const wLogsByOrg: Record<string, WLogRow[]> = {};
  for (const wl of (webhookRes.data ?? []) as WLogRow[]) {
    const orgI = webhookOrgMap[wl.webhook_id];
    if (!orgI) continue;
    (wLogsByOrg[orgI] ??= []).push(wl);
  }

  const billingByOrg: Record<string, OrgBillingRow> = {};
  for (const b of (billingRes.data ?? []) as (OrgBillingRow & { org_id: string })[]) {
    billingByOrg[b.org_id] = b;
  }

  const result = orgList.map((org) => {
    const metrics = metricsByOrg[org.id] ?? [];
    const wLogs = wLogsByOrg[org.id] ?? [];
    const billing = billingByOrg[org.id] ?? ({ plan_tier: "free" } as OrgBillingRow);

    let score = 100;
    const factors: Record<string, unknown> = {};

    const totalReqs = metrics.length;
    const errorReqs = metrics.filter((m) => m.status_code >= 500).length;
    const errorRate = totalReqs > 0 ? (errorReqs / totalReqs) * 100 : 0;
    let apiErrDeduct = 0;
    if (errorRate > 10) apiErrDeduct = 25;
    else if (errorRate > 5) apiErrDeduct = 15;
    else if (errorRate > 1) apiErrDeduct = 5;
    score -= apiErrDeduct;
    factors.api = {
      request_count: totalReqs,
      error_count: errorReqs,
      error_rate_pct: Math.round(errorRate * 10) / 10,
      deduction: apiErrDeduct,
      status: apiErrDeduct === 0 ? "ok" : apiErrDeduct >= 15 ? "critical" : "warning",
    };

    const totalWH = wLogs.length;
    const failedWH = wLogs.filter((w) => !w.success).length;
    const wFailRate = totalWH > 0 ? (failedWH / totalWH) * 100 : 0;
    let wDeduct = 0;
    if (wFailRate > 50) wDeduct = 20;
    else if (wFailRate > 20) wDeduct = 10;
    else if (wFailRate > 5) wDeduct = 5;
    score -= wDeduct;
    factors.webhooks = {
      delivery_count: totalWH,
      failure_count: failedWH,
      failure_rate_pct: Math.round(wFailRate * 10) / 10,
      deduction: wDeduct,
      status: wDeduct === 0 ? "ok" : wDeduct >= 15 ? "critical" : "warning",
    };

    const lastSeen =
      metrics.length > 0
        ? metrics.reduce((a, b) => (a.logged_at > b.logged_at ? a : b)).logged_at
        : null;
    const daysSinceActive = lastSeen
      ? (Date.now() - new Date(lastSeen).getTime()) / 86_400_000
      : Infinity;
    let actDeduct = 0;
    if (daysSinceActive > 30) actDeduct = 20;
    else if (daysSinceActive > 7) actDeduct = 10;
    else if (daysSinceActive === Infinity) actDeduct = 5;
    score -= actDeduct;
    factors.activity = {
      last_seen_at: lastSeen,
      days_since: daysSinceActive === Infinity ? null : Math.round(daysSinceActive),
      deduction: actDeduct,
      status: actDeduct === 0 ? "ok" : actDeduct >= 15 ? "critical" : "warning",
    };

    const expired = isPlanExpired(billing);
    const trialDays = trialDaysRemaining(billing);
    let billDeduct = 0;
    if (expired) billDeduct = 30;
    else if (trialDays !== null && trialDays < 3) billDeduct = 15;
    else if (trialDays !== null && trialDays < 7) billDeduct = 5;
    score -= billDeduct;
    factors.billing = {
      plan_tier: billing.plan_tier,
      is_expired: expired,
      trial_days_remaining: trialDays,
      deduction: billDeduct,
      status: billDeduct === 0 ? "ok" : billDeduct >= 25 ? "critical" : "warning",
    };

    const finalScore = Math.max(0, Math.min(100, score));
    return {
      org_id: org.id,
      org_name: org.name,
      maintenance_mode: org.maintenance_mode,
      health_score: finalScore,
      grade: grade(finalScore),
      factors: factors as OrgHealth["factors"],
      computed_at: new Date().toISOString(),
    };
  });

  result.sort((a, b) => a.health_score - b.health_score);
  return result;
}
