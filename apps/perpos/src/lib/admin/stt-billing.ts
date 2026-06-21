/**
 * computeSttBilling — ภาพรวมรายได้/สมาชิกแกะเสียง (super admin)
 * อ่าน stt_payments + stt_subscriptions + stt_plans (ในแอป — แทนการเปิด Stripe Dashboard)
 * คืน: รายได้รวม/เดือนนี้, จำนวนสมาชิก active, MRR, payment ล่าสุด 50, แยกตามแพ็ก
 *
 * เรียกจาก Server Component (hydrogen)/admin/stt-billing/page.tsx → fetch ตอน SSR
 * รับ admin client (service role, bypass RLS) — auth/role check เป็นหน้าที่ของ caller
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export type SttBilling = {
  totals: {
    revenue_total: number;
    revenue_month: number;
    mrr: number;
    active_subscribers: number;
    payments_count: number;
  };
  by_plan: { name: string; count: number; revenue: number }[];
  recent: {
    id: string;
    name: string;
    plan: string | null;
    kind: string;
    amount: number;
    currency: string;
    status: string;
    created_at: string;
  }[];
};

const BKK = "Asia/Bangkok";
const monthKey = (d: Date) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: BKK, year: "numeric", month: "2-digit" }).format(d);
const ACTIVE_SUB = ["trialing", "active", "past_due"];

type Payment = {
  id: string;
  profile_id: string;
  plan_id: string | null;
  kind: string;
  amount: number;
  currency: string;
  status: string;
  created_at: string;
};

export async function computeSttBilling(admin: SupabaseClient): Promise<SttBilling> {
  const [{ data: pays }, { data: subs }, { data: plans }] = await Promise.all([
    admin
      .from("stt_payments")
      .select("id, profile_id, plan_id, kind, amount, currency, status, created_at")
      .order("created_at", { ascending: false })
      .limit(20000),
    admin
      .from("stt_subscriptions")
      .select("profile_id, plan_id, status, current_period_end")
      .limit(5000),
    admin.from("stt_plans").select("id, name, kind, price, minutes").limit(200),
  ]);

  const payRows = (pays ?? []) as Payment[];
  const planById = new Map(
    (plans ?? []).map((p) => [
      p.id as string,
      p as { name: string; price: number; kind: string; minutes: number },
    ]),
  );
  const succeeded = payRows.filter((p) => p.status === "succeeded");
  const thisMonth = monthKey(new Date());

  const revenueTotal = succeeded.reduce((s, p) => s + Number(p.amount || 0), 0);
  const revenueMonth = succeeded
    .filter((p) => monthKey(new Date(p.created_at)) === thisMonth)
    .reduce((s, p) => s + Number(p.amount || 0), 0);

  // MRR = ผลรวมราคาแผนของ subscription ที่ active
  const activeSubs = (subs ?? []).filter((s) => s.status && ACTIVE_SUB.includes(String(s.status)));
  const mrr = activeSubs.reduce(
    (s, sub) => s + Number(planById.get(String(sub.plan_id))?.price ?? 0),
    0,
  );

  // แยกตามแพ็ก (เฉพาะจ่ายสำเร็จ)
  const byPlan = new Map<string, { name: string; count: number; revenue: number }>();
  for (const p of succeeded) {
    const plan = planById.get(String(p.plan_id));
    const name = plan?.name ?? (p.kind === "topup" ? "เติมนาที" : "แพ็กเกจ");
    const e = byPlan.get(name) ?? { name, count: 0, revenue: 0 };
    e.count += 1;
    e.revenue += Number(p.amount || 0);
    byPlan.set(name, e);
  }

  // payment ล่าสุด 50 + ชื่อผู้ใช้
  const recent = payRows.slice(0, 50);
  const profIds = Array.from(new Set(recent.map((p) => p.profile_id)));
  const nameById = new Map<string, string>();
  if (profIds.length) {
    const { data: profs } = await admin
      .from("profiles")
      .select("id, display_name")
      .in("id", profIds);
    for (const pr of profs ?? [])
      nameById.set(pr.id as string, (pr.display_name as string) ?? "ผู้ใช้");
  }

  return {
    totals: {
      revenue_total: Math.round(revenueTotal * 100) / 100,
      revenue_month: Math.round(revenueMonth * 100) / 100,
      mrr: Math.round(mrr * 100) / 100,
      active_subscribers: activeSubs.length,
      payments_count: succeeded.length,
    },
    by_plan: Array.from(byPlan.values()).sort((a, b) => b.revenue - a.revenue),
    recent: recent.map((p) => ({
      id: p.id,
      name: nameById.get(p.profile_id) ?? "ผู้ใช้",
      plan: planById.get(String(p.plan_id))?.name ?? null,
      kind: p.kind,
      amount: Number(p.amount || 0),
      currency: p.currency,
      status: p.status,
      created_at: p.created_at,
    })),
  };
}
