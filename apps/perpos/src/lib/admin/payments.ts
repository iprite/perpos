/**
 * computePaymentsMetrics — ภาพรวมรายได้รวม แยก 2 สาย (super admin)
 *   assistant (B2C, per-profile) + erp (B2B, per-org)
 *
 * MRR    = Σ recurring ของ subscription ที่ active (assistant → plan.price · erp → org_stripe.mrr_amount)
 * revenue = ยอดจ่ายสำเร็จจาก v_billing_payments (เดือนนี้ / total) แยก stream
 * ARPU    = MRR ÷ active subscribers · churn = subscription ที่จบใน 30 วัน (proxy)
 *
 * เรียกจาก Server Component (hydrogen)/admin/payments/page.tsx → fetch ตอน SSR
 * รับ admin client (service role, bypass RLS) — auth/role check เป็นหน้าที่ของ caller
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export type StreamMetrics = {
  mrr: number;
  arr: number;
  revenue_total: number;
  revenue_month: number;
  paying_subscribers: number;
  trialing: number;
  arpu: number;
  churned_30d: number;
};

export type PaymentsMetrics = {
  computed_at: string;
  combined: StreamMetrics;
  streams: { assistant: StreamMetrics; erp: StreamMetrics };
};

const BKK = "Asia/Bangkok";
const monthKey = (d: Date) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: BKK, year: "numeric", month: "2-digit" }).format(d);
// MRR/ARPU = เฉพาะ subscription ที่ "จ่ายเงินจริง" — ไม่รวม trialing (ยังไม่จ่าย)
const PAYING = ["active", "past_due"];
const TRIAL = ["trialing"];
const ENDED = ["canceled", "cancelled", "unpaid", "incomplete_expired"];
const r2 = (n: number) => Math.round(n * 100) / 100;

type Stream = "assistant" | "erp";
type LedgerRow = { stream: Stream; amount: number; status: string; created_at: string };

export async function computePaymentsMetrics(admin: SupabaseClient): Promise<PaymentsMetrics> {
  const thisMonth = monthKey(new Date());
  const since30d = new Date(Date.now() - 30 * 86400_000).toISOString();

  const [{ data: payments }, { data: sttSubs }, { data: plans }, { data: orgSubs }] =
    await Promise.all([
      admin.from("v_billing_payments").select("stream, amount, status, created_at").limit(50000),
      admin.from("stt_subscriptions").select("plan_id, status, updated_at").limit(20000),
      admin.from("stt_plans").select("id, price").limit(500),
      admin.from("org_stripe").select("mrr_amount, subscription_status, updated_at").limit(20000),
    ]);

  const payRows = (payments ?? []) as LedgerRow[];
  const priceByPlan = new Map((plans ?? []).map((p) => [String(p.id), Number(p.price ?? 0)]));

  // payingSubs = ฐานของ MRR/ARPU (active+past_due) · trialing = pipeline แยก
  function build(
    stream: Stream,
    mrr: number,
    payingSubs: number,
    trialing: number,
    churned30d: number,
  ): StreamMetrics {
    const succeeded = payRows.filter((p) => p.stream === stream && p.status === "succeeded");
    const revenueTotal = succeeded.reduce((s, p) => s + Number(p.amount || 0), 0);
    const revenueMonth = succeeded
      .filter((p) => monthKey(new Date(p.created_at)) === thisMonth)
      .reduce((s, p) => s + Number(p.amount || 0), 0);
    return {
      mrr: r2(mrr),
      arr: r2(mrr * 12),
      revenue_total: r2(revenueTotal),
      revenue_month: r2(revenueMonth),
      paying_subscribers: payingSubs,
      trialing,
      arpu: payingSubs > 0 ? r2(mrr / payingSubs) : 0,
      churned_30d: churned30d,
    };
  }

  // assistant (B2C) — MRR เฉพาะ paying, trial นับแยก
  const sttPaying = (sttSubs ?? []).filter((s) => s.status && PAYING.includes(String(s.status)));
  const sttTrial = (sttSubs ?? []).filter(
    (s) => s.status && TRIAL.includes(String(s.status)),
  ).length;
  const sttMrr = sttPaying.reduce((s, sub) => s + (priceByPlan.get(String(sub.plan_id)) ?? 0), 0);
  const sttChurn = (sttSubs ?? []).filter(
    (s) => ENDED.includes(String(s.status)) && s.updated_at && String(s.updated_at) >= since30d,
  ).length;
  const assistant = build("assistant", sttMrr, sttPaying.length, sttTrial, sttChurn);

  // erp (B2B)
  const orgPaying = (orgSubs ?? []).filter(
    (s) => s.subscription_status && PAYING.includes(String(s.subscription_status)),
  );
  const orgTrial = (orgSubs ?? []).filter(
    (s) => s.subscription_status && TRIAL.includes(String(s.subscription_status)),
  ).length;
  const orgMrr = orgPaying.reduce((s, sub) => s + Number(sub.mrr_amount ?? 0), 0);
  const orgChurn = (orgSubs ?? []).filter(
    (s) =>
      ENDED.includes(String(s.subscription_status)) &&
      s.updated_at &&
      String(s.updated_at) >= since30d,
  ).length;
  const erp = build("erp", orgMrr, orgPaying.length, orgTrial, orgChurn);

  // combined
  const mrr = assistant.mrr + erp.mrr;
  const paying = assistant.paying_subscribers + erp.paying_subscribers;
  const combined: StreamMetrics = {
    mrr: r2(mrr),
    arr: r2(mrr * 12),
    revenue_total: r2(assistant.revenue_total + erp.revenue_total),
    revenue_month: r2(assistant.revenue_month + erp.revenue_month),
    paying_subscribers: paying,
    trialing: assistant.trialing + erp.trialing,
    arpu: paying > 0 ? r2(mrr / paying) : 0,
    churned_30d: assistant.churned_30d + erp.churned_30d,
  };

  return { computed_at: new Date().toISOString(), combined, streams: { assistant, erp } };
}
