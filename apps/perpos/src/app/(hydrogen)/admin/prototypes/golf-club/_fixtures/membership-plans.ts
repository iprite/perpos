// membership-plans.ts — golf_membership_plans (silver/gold/platinum) — [D3]
import type { GolfMembershipPlan } from "./types";

const now = "2026-01-05T02:00:00.000Z";

export const golfMembershipPlans: GolfMembershipPlan[] = [
  {
    id: "plan-silver",
    org_id: "org-golf-greenvalley",
    name: "สมาชิก Silver รายปี",
    tier: "silver",
    price_per_year: 15000,
    duration_months: 12,
    green_fee_discount_pct: 10,
    free_buckets_per_month: 2,
    points_multiplier: 1,
    perks: { advance_booking_days: 7, free_cart: false, free_caddie: false },
    is_active: true,
    created_at: now,
    updated_at: now,
  },
  {
    id: "plan-gold",
    org_id: "org-golf-greenvalley",
    name: "สมาชิก Gold รายปี",
    tier: "gold",
    price_per_year: 35000,
    duration_months: 12,
    green_fee_discount_pct: 15,
    free_buckets_per_month: 5,
    points_multiplier: 2,
    perks: { advance_booking_days: 14, free_cart: true, free_caddie: false },
    is_active: true,
    created_at: now,
    updated_at: now,
  },
  {
    id: "plan-platinum",
    org_id: "org-golf-greenvalley",
    name: "สมาชิก Platinum รายปี",
    tier: "platinum",
    price_per_year: 60000,
    duration_months: 12,
    green_fee_discount_pct: 20,
    free_buckets_per_month: 10,
    points_multiplier: 3,
    perks: { advance_booking_days: 30, free_cart: true, free_caddie: true },
    is_active: true,
    created_at: now,
    updated_at: now,
  },
];
