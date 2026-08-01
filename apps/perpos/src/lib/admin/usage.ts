/**
 * ต้นทุนต่อองค์กร (super admin) — ฐานข้อมูลสำหรับออกแบบราคาขาย
 *
 * ต้นทุนแปรผัน  = `usage_events` (Gemini / LINE / Recall / compute / storage) ผ่าน RPC 3 ตัว
 * ต้นทุนคงที่    = `usage_fixed_costs` ของเดือนที่คาบเกี่ยวช่วงที่เลือก → ปันส่วนเข้า org
 * ราคาที่ควรเก็บ = (ต้นทุนแปรผัน + ต้นทุนคงที่ที่ปันส่วน) × target_margin
 *
 * เรียกจาก Server Component `(hydrogen)/admin/usage/page.tsx` (SSR)
 * รับ admin client (service role) — auth/role check เป็นหน้าที่ของ caller
 *
 * ⚠️ ทุกยอดรวมมาจาก SQL aggregate (RPC) ไม่ใช่การ sum array ฝั่ง JS
 *    — PostgREST ตัด 1,000 แถวเงียบ ๆ ถ้าดึงแถวดิบมารวมเองยอดจะต่ำกว่าจริง
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export const USAGE_SERVICES = ["gemini", "line", "recall", "compute", "storage", "other"] as const;
export type UsageServiceKey = (typeof USAGE_SERVICES)[number];

export const SERVICE_LABEL: Record<UsageServiceKey, string> = {
  gemini: "AI (Gemini)",
  line: "LINE",
  recall: "บอทประชุม",
  compute: "ประมวลผล",
  storage: "พื้นที่เก็บไฟล์",
  other: "อื่น ๆ",
};

export type OrgUsageRow = {
  orgId: string | null;
  orgName: string;
  orgSlug: string;
  /** ต้นทุนแปรผัน */
  variableUsd: number;
  /** ต้นทุนคงที่ที่ปันส่วนมาให้ org นี้ */
  allocatedUsd: number;
  /** variable + allocated */
  totalUsd: number;
  events: number;
  inTokens: number;
  outTokens: number;
  byService: Partial<Record<UsageServiceKey, number>>;
};

export type FeatureUsageRow = {
  service: UsageServiceKey;
  feature: string;
  resource: string;
  unit: string;
  quantity: number;
  events: number;
  costUsd: number;
};

export type FixedCostRow = {
  id: string;
  month: string;
  label: string;
  amountUsd: number;
  allocation: "pro_rata" | "per_org" | "none";
  note: string | null;
};

export type UsageSettings = { usdThbRate: number; targetMargin: number };

export type UsageReport = {
  from: string;
  to: string;
  days: number;
  settings: UsageSettings;
  orgs: OrgUsageRow[];
  features: FeatureUsageRow[];
  daily: { day: string; costUsd: number; events: number }[];
  fixedCosts: FixedCostRow[];
  totals: {
    variableUsd: number;
    fixedUsd: number;
    totalUsd: number;
    events: number;
    orgsWithUsage: number;
    /** ต้นทุนที่ยังผูก org ไม่ได้ (โผล่เป็นแถว "ไม่ระบุองค์กร") */
    unattributedUsd: number;
  };
};

/** clamp days → 1..365 (default 30) */
export function normalizeUsageDays(input: unknown): number {
  const n = Number(input);
  return Number.isFinite(n) ? Math.min(365, Math.max(1, Math.round(n))) : 30;
}

/** เดือน (วันที่ 1) ที่คาบเกี่ยวช่วง from–to — ใช้ดึงต้นทุนคงที่ที่เกี่ยวข้อง */
function monthsInRange(from: Date, to: Date): string[] {
  const out: string[] = [];
  const cur = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), 1));
  const end = new Date(Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), 1));
  while (cur <= end) {
    out.push(cur.toISOString().slice(0, 10));
    cur.setUTCMonth(cur.getUTCMonth() + 1);
  }
  return out;
}

/**
 * เฉลี่ยต้นทุนคงที่รายเดือนเข้าช่วงที่เลือก — คืน map(id → USD ที่ตกอยู่ในช่วงนี้)
 *
 * ต้นทุนคงที่บันทึกเป็นยอด "ทั้งเดือน" แต่ผู้ใช้เลือกดูเป็นช่วงวัน (7/30/90/365)
 * จึงต้องตัดตาม **วันที่ช่วงนั้นทับกับเดือนของรายการจริง** ทีละก้อน
 *
 * ห้ามใช้ `days/30` รวบเดียว — ช่วง 90 วันจะกวาดรายการของ 4 เดือนมาเต็มจำนวนทั้งที่ทับจริง 3 เดือน
 * และช่วงที่คร่อมสองเดือน (เคสปกติของ "30 วันล่าสุด") จะเพี้ยนเสมอ
 */
export function prorateFixedCosts(rows: FixedCostRow[], from: Date, to: Date): Map<string, number> {
  const out = new Map<string, number>();
  for (const f of rows) {
    const mStart = new Date(`${f.month.slice(0, 7)}-01T00:00:00Z`);
    const mEnd = new Date(Date.UTC(mStart.getUTCFullYear(), mStart.getUTCMonth() + 1, 1));
    const monthMs = mEnd.getTime() - mStart.getTime();
    const overlapMs = Math.max(
      0,
      Math.min(to.getTime(), mEnd.getTime()) - Math.max(from.getTime(), mStart.getTime()),
    );
    out.set(f.id, monthMs > 0 ? f.amountUsd * (overlapMs / monthMs) : 0);
  }
  return out;
}

export async function getUsageReport(
  admin: SupabaseClient,
  opts: { days: number; orgId?: string | null },
): Promise<UsageReport> {
  const to = new Date();
  const from = new Date(to.getTime() - opts.days * 86400000);
  const p = { p_from: from.toISOString(), p_to: to.toISOString() };

  const [settingsRes, orgRes, featureRes, dailyRes, fixedRes] = await Promise.all([
    admin.from("usage_settings").select("usd_thb_rate, target_margin").eq("id", true).maybeSingle(),
    admin.rpc("admin_usage_by_org", p),
    admin.rpc("admin_usage_by_feature", { ...p, p_org_id: opts.orgId ?? null }),
    admin.rpc("admin_usage_daily", { ...p, p_org_id: opts.orgId ?? null }),
    admin
      .from("usage_fixed_costs")
      .select("id, month, label, amount_usd, allocation, note")
      .in("month", monthsInRange(from, to))
      .order("month", { ascending: false }),
  ]);

  const settings: UsageSettings = {
    usdThbRate: Number(settingsRes.data?.usd_thb_rate ?? 35),
    targetMargin: Number(settingsRes.data?.target_margin ?? 2.5),
  };

  const orgsRaw = (orgRes.data ?? []) as {
    org_id: string | null;
    org_name: string;
    org_slug: string;
    cost_usd: number | string;
    events: number;
    in_tokens: number;
    out_tokens: number;
    by_service: Record<string, number | string>;
  }[];

  const fixedCosts: FixedCostRow[] = ((fixedRes.data ?? []) as Record<string, unknown>[]).map(
    (r) => ({
      id: String(r.id),
      month: String(r.month),
      label: String(r.label),
      amountUsd: Number(r.amount_usd ?? 0),
      allocation: r.allocation as FixedCostRow["allocation"],
      note: (r.note as string | null) ?? null,
    }),
  );

  // ── ปันส่วนต้นทุนคงที่ ─────────────────────────────────────────────────────
  //   pro_rata = ตามสัดส่วนต้นทุนแปรผันของ org (คนใช้เยอะแบกมาก)
  //   per_org  = หารเท่ากันทุก org ที่มีการใช้งาน
  //   none     = ไม่ปันส่วน (นับเป็นต้นทุนรวมของบริษัท แต่ไม่ผูก org)
  // ทั้งสองแบบคิดเฉพาะ org จริง — แถว "ไม่ระบุองค์กร" ไม่รับส่วนแบ่ง
  const realOrgs = orgsRaw.filter((o) => o.org_id);
  const variableTotalReal = realOrgs.reduce((s, o) => s + Number(o.cost_usd ?? 0), 0);

  const prorated = prorateFixedCosts(fixedCosts, from, to);
  const poolOf = (kind: FixedCostRow["allocation"]) =>
    fixedCosts
      .filter((f) => f.allocation === kind)
      .reduce((s, f) => s + (prorated.get(f.id) ?? 0), 0);

  const proRataPool = poolOf("pro_rata");
  const perOrgPool = poolOf("per_org");
  const perOrgShare = realOrgs.length ? perOrgPool / realOrgs.length : 0;

  const orgs: OrgUsageRow[] = orgsRaw.map((o) => {
    const variableUsd = Number(o.cost_usd ?? 0);
    const allocatedUsd = !o.org_id
      ? 0
      : (variableTotalReal > 0 ? (variableUsd / variableTotalReal) * proRataPool : 0) + perOrgShare;
    const byService: Partial<Record<UsageServiceKey, number>> = {};
    for (const [k, v] of Object.entries(o.by_service ?? {})) {
      if ((USAGE_SERVICES as readonly string[]).includes(k)) {
        byService[k as UsageServiceKey] = Number(v);
      }
    }
    return {
      orgId: o.org_id,
      orgName: o.org_name,
      orgSlug: o.org_slug,
      variableUsd,
      allocatedUsd,
      totalUsd: variableUsd + allocatedUsd,
      events: Number(o.events ?? 0),
      inTokens: Number(o.in_tokens ?? 0),
      outTokens: Number(o.out_tokens ?? 0),
      byService,
    };
  });
  orgs.sort((a, b) => b.totalUsd - a.totalUsd);

  const features: FeatureUsageRow[] = ((featureRes.data ?? []) as Record<string, unknown>[]).map(
    (r) => ({
      service: r.service as UsageServiceKey,
      feature: String(r.feature),
      resource: String(r.resource ?? "—"),
      unit: String(r.unit),
      quantity: Number(r.quantity ?? 0),
      events: Number(r.events ?? 0),
      costUsd: Number(r.cost_usd ?? 0),
    }),
  );

  const daily = ((dailyRes.data ?? []) as Record<string, unknown>[]).map((r) => ({
    day: String(r.day),
    costUsd: Number(r.cost_usd ?? 0),
    events: Number(r.events ?? 0),
  }));

  const variableUsd = orgs.reduce((s, o) => s + o.variableUsd, 0);
  const fixedUsd = fixedCosts.reduce((s, f) => s + (prorated.get(f.id) ?? 0), 0);

  return {
    from: from.toISOString(),
    to: to.toISOString(),
    days: opts.days,
    settings,
    orgs,
    features,
    daily,
    fixedCosts,
    totals: {
      variableUsd,
      fixedUsd,
      totalUsd: variableUsd + fixedUsd,
      events: orgs.reduce((s, o) => s + o.events, 0),
      orgsWithUsage: realOrgs.length,
      unattributedUsd: orgs.filter((o) => !o.orgId).reduce((s, o) => s + o.variableUsd, 0),
    },
  };
}

export type UsagePriceRow = {
  key: string;
  service: string;
  label: string;
  unit: string;
  unitCostUsd: number;
  isActive: boolean;
};

export async function listUsagePrices(admin: SupabaseClient): Promise<UsagePriceRow[]> {
  const { data } = await admin
    .from("usage_prices")
    .select("key, service, label, unit, unit_cost_usd, is_active")
    .order("service")
    .order("key");
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    key: String(r.key),
    service: String(r.service),
    label: String(r.label),
    unit: String(r.unit),
    unitCostUsd: Number(r.unit_cost_usd ?? 0),
    isActive: Boolean(r.is_active),
  }));
}
