/**
 * Billing & Plan helpers (Phase 4b)
 *
 * Defines plan-tier defaults and provides a helper to resolve
 * effective limits for an org (DB overrides take precedence over tier defaults).
 */

export type PlanTier = 'free' | 'starter' | 'pro' | 'enterprise';

export interface PlanLimits {
  maxUsers:              number | null; // null = unlimited
  maxApiRequestsPerDay:  number | null;
  maxWebhooks:           number | null;
  maxCustomFields:       number | null;
}

// ── Tier defaults ─────────────────────────────────────────────────────────────

export const PLAN_DEFAULTS: Record<PlanTier, PlanLimits> = {
  free: {
    maxUsers:             3,
    maxApiRequestsPerDay: 1_000,
    maxWebhooks:          0,
    maxCustomFields:      5,
  },
  starter: {
    maxUsers:             10,
    maxApiRequestsPerDay: 10_000,
    maxWebhooks:          3,
    maxCustomFields:      20,
  },
  pro: {
    maxUsers:             50,
    maxApiRequestsPerDay: 100_000,
    maxWebhooks:          10,
    maxCustomFields:      100,
  },
  enterprise: {
    maxUsers:             null,
    maxApiRequestsPerDay: null,
    maxWebhooks:          null,
    maxCustomFields:      null,
  },
};

export const PLAN_LABELS: Record<PlanTier, string> = {
  free:       'Free',
  starter:    'Starter',
  pro:        'Pro',
  enterprise: 'Enterprise',
};

export const PLAN_COLORS: Record<PlanTier, string> = {
  free:       'bg-gray-100 text-gray-600',
  starter:    'bg-blue-100 text-blue-700',
  pro:        'bg-purple-100 text-purple-700',
  enterprise: 'bg-amber-100 text-amber-700',
};

// ── Effective limit resolver ──────────────────────────────────────────────────

export interface OrgBillingRow {
  plan_tier:                PlanTier;
  max_users?:               number | null;
  max_api_requests_per_day?: number | null;
  max_webhooks?:            number | null;
  max_custom_fields?:       number | null;
  trial_ends_at?:           string | null;
  plan_ends_at?:            string | null;
}

/**
 * Returns effective limits: DB overrides > tier defaults.
 */
export function resolveEffectiveLimits(row: OrgBillingRow): PlanLimits {
  const defaults = PLAN_DEFAULTS[row.plan_tier] ?? PLAN_DEFAULTS.free;
  return {
    maxUsers:             row.max_users             ?? defaults.maxUsers,
    maxApiRequestsPerDay: row.max_api_requests_per_day ?? defaults.maxApiRequestsPerDay,
    maxWebhooks:          row.max_webhooks           ?? defaults.maxWebhooks,
    maxCustomFields:      row.max_custom_fields      ?? defaults.maxCustomFields,
  };
}

/**
 * Returns true if the org's plan has expired or trial has ended.
 */
export function isPlanExpired(row: OrgBillingRow): boolean {
  const now = Date.now();
  if (row.plan_ends_at  && new Date(row.plan_ends_at).getTime()  < now) return true;
  if (row.trial_ends_at && new Date(row.trial_ends_at).getTime() < now) return true;
  return false;
}

/**
 * Days until trial ends (negative = already expired). null if no trial.
 */
export function trialDaysRemaining(row: OrgBillingRow): number | null {
  if (!row.trial_ends_at) return null;
  return Math.ceil((new Date(row.trial_ends_at).getTime() - Date.now()) / 86_400_000);
}
