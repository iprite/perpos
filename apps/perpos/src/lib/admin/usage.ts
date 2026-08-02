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

/**
 * ต้นทุน Flow = per-profile — **หน่วยคือ "ผู้ใช้" ไม่ใช่ "องค์กร"**
 * (ผู้ช่วย AI ผูก org_id ตาม home org ไว้เก็บไฟล์เท่านั้น ไม่ใช่เจ้าของต้นทุน)
 */
export type UserUsageRow = {
  profileId: string | null;
  displayName: string;
  email: string;
  variableUsd: number;
  allocatedUsd: number;
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
  /** Suite (ERP) — เฉพาะ org จริง (แถวที่ระบุเจ้าของไม่ได้ถูกตัดออก เหลืออยู่ใน `totals`) */
  orgs: OrgUsageRow[];
  /** Flow (ผู้ช่วย AI per-profile) — เฉพาะผู้ใช้จริง */
  users: UserUsageRow[];
  features: FeatureUsageRow[];
  daily: { day: string; costUsd: number; events: number }[];
  fixedCosts: FixedCostRow[];
  totals: {
    variableUsd: number;
    fixedUsd: number;
    totalUsd: number;
    events: number;
    orgsWithUsage: number;
    usersWithUsage: number;
    /** ต้นทุนแปรผันฝั่ง Suite / Flow (แยกกันเพื่อดู unit economics คนละโมเดล) */
    suiteVariableUsd: number;
    flowVariableUsd: number;
    /** ต้นทุนที่ยังผูกเจ้าของไม่ได้ (แถว "ไม่ระบุองค์กร" / "ไม่ระบุผู้ใช้") */
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
  opts: { days: number; orgId?: string | null; profileId?: string | null },
): Promise<UsageReport> {
  const to = new Date();
  const from = new Date(to.getTime() - opts.days * 86400000);
  const p = { p_from: from.toISOString(), p_to: to.toISOString() };
  // เจาะดูทีละเจ้าของต้นทุน — org (Suite) หรือ ผู้ใช้ (Flow) อย่างใดอย่างหนึ่ง
  const drill = { p_org_id: opts.orgId ?? null, p_profile_id: opts.profileId ?? null };

  const [settingsRes, orgRes, userRes, featureRes, dailyRes, fixedRes] = await Promise.all([
    admin.from("usage_settings").select("usd_thb_rate, target_margin").eq("id", true).maybeSingle(),
    admin.rpc("admin_usage_by_org", p),
    admin.rpc("admin_usage_by_user", p),
    admin.rpc("admin_usage_by_feature", { ...p, ...drill }),
    admin.rpc("admin_usage_daily", { ...p, ...drill }),
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

  const usersRaw = (userRes.data ?? []) as {
    profile_id: string | null;
    display_name: string;
    email: string;
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
  //   pro_rata = ตามสัดส่วนต้นทุนแปรผัน **ของทั้ง Suite และ Flow** (คนใช้เยอะแบกมาก)
  //              — Vercel/Supabase/โดเมน รับใช้ทั้งสองฝั่ง ถ้าโยนให้ org อย่างเดียว
  //                องค์กรจะดูแพงเกินจริงเท่ากับส่วนที่ผู้ใช้ Flow ควรแบก
  //   per_org  = หารเท่ากันทุก org ที่มีการใช้งาน (นิยามผูกกับ "องค์กร" → ไม่แจกให้ผู้ใช้ Flow)
  //   none     = ไม่ปันส่วน (นับเป็นต้นทุนรวมของบริษัท แต่ไม่ผูกเจ้าของ)
  // แถวที่ระบุเจ้าของไม่ได้ ("ไม่ระบุองค์กร"/"ไม่ระบุผู้ใช้") ไม่รับส่วนแบ่ง
  const realOrgs = orgsRaw.filter((o) => o.org_id);
  const realUsers = usersRaw.filter((u) => u.profile_id);
  const variableTotalReal =
    realOrgs.reduce((s, o) => s + Number(o.cost_usd ?? 0), 0) +
    realUsers.reduce((s, u) => s + Number(u.cost_usd ?? 0), 0);

  const prorated = prorateFixedCosts(fixedCosts, from, to);
  const poolOf = (kind: FixedCostRow["allocation"]) =>
    fixedCosts
      .filter((f) => f.allocation === kind)
      .reduce((s, f) => s + (prorated.get(f.id) ?? 0), 0);

  const proRataPool = poolOf("pro_rata");
  const perOrgPool = poolOf("per_org");
  const perOrgShare = realOrgs.length ? perOrgPool / realOrgs.length : 0;
  const proRataShare = (variableUsd: number) =>
    variableTotalReal > 0 ? (variableUsd / variableTotalReal) * proRataPool : 0;

  const orgs: OrgUsageRow[] = orgsRaw.map((o) => {
    const variableUsd = Number(o.cost_usd ?? 0);
    const allocatedUsd = !o.org_id ? 0 : proRataShare(variableUsd) + perOrgShare;
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

  const users: UserUsageRow[] = usersRaw.map((u) => {
    const variableUsd = Number(u.cost_usd ?? 0);
    const allocatedUsd = !u.profile_id ? 0 : proRataShare(variableUsd);
    const byService: Partial<Record<UsageServiceKey, number>> = {};
    for (const [k, v] of Object.entries(u.by_service ?? {})) {
      if ((USAGE_SERVICES as readonly string[]).includes(k)) {
        byService[k as UsageServiceKey] = Number(v);
      }
    }
    return {
      profileId: u.profile_id,
      displayName: u.display_name,
      email: u.email,
      variableUsd,
      allocatedUsd,
      totalUsd: variableUsd + allocatedUsd,
      events: Number(u.events ?? 0),
      inTokens: Number(u.in_tokens ?? 0),
      outTokens: Number(u.out_tokens ?? 0),
      byService,
    };
  });
  users.sort((a, b) => b.totalUsd - a.totalUsd);

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

  const suiteVariableUsd = orgs.reduce((s, o) => s + o.variableUsd, 0);
  const flowVariableUsd = users.reduce((s, u) => s + u.variableUsd, 0);
  const variableUsd = suiteVariableUsd + flowVariableUsd;
  const fixedUsd = fixedCosts.reduce((s, f) => s + (prorated.get(f.id) ?? 0), 0);
  const eventsTotal =
    orgs.reduce((s, o) => s + o.events, 0) + users.reduce((s, u) => s + u.events, 0);
  const unattributedUsd =
    orgs.filter((o) => !o.orgId).reduce((s, o) => s + o.variableUsd, 0) +
    users.filter((u) => !u.profileId).reduce((s, u) => s + u.variableUsd, 0);

  return {
    from: from.toISOString(),
    to: to.toISOString(),
    days: opts.days,
    settings,
    // แถวที่ระบุเจ้าของไม่ได้ไม่ต้องรกตาราง — ยอดยังอยู่ครบใน totals (แถบเตือนด้านบนบอกจำนวน)
    orgs: orgs.filter((o) => o.orgId),
    users: users.filter((u) => u.profileId),
    features,
    daily,
    fixedCosts,
    totals: {
      variableUsd,
      fixedUsd,
      totalUsd: variableUsd + fixedUsd,
      events: eventsTotal,
      orgsWithUsage: realOrgs.length,
      usersWithUsage: realUsers.length,
      suiteVariableUsd,
      flowVariableUsd,
      unattributedUsd,
    },
  };
}

// ── ต้นทุนโครงสร้างพื้นฐาน (ระดับบัญชี GCP — หลายแอปใช้ project เดียวกัน) ──────

/** ที่มาของตัวเลข — `monitoring` = ประมาณจาก usage, `billing_export` = บิลจริงจาก BigQuery */
export type InfraSource = "monitoring" | "billing_export";

export type InfraRow = {
  month: string;
  project: string;
  app: string;
  service: string;
  sku: string;
  cpuSeconds: number;
  gibSeconds: number;
  requests: number;
  costUsd: number;
  syncedAt: string;
};

export type InfraReport = {
  months: string[];
  month: string;
  source: InfraSource;
  /** source ที่มีข้อมูลจริงของเดือนนี้ (ใช้เปิด/ปิดปุ่มสลับ) */
  availableSources: InfraSource[];
  rows: InfraRow[];
  byApp: { app: string; costUsd: number; requests: number; share: number }[];
  totalUsd: number;
  syncedAt: string | null;
};

/**
 * ต้นทุนโครงสร้างพื้นฐานรายเดือนแยกตามแอป — อ่านจาก snapshot ที่สคริปต์เขียนไว้
 * (แอปบน Vercel ไม่มี credential ของ GCP จึง query Cloud Monitoring / BigQuery สดไม่ได้)
 *
 * ⚠️ `monitoring` กับ `billing_export` เป็นตัวเลขคนละชุดของเดือนเดียวกัน — คืนทีละ source
 *    เสมอ ห้ามรวมกัน (จะนับ Cloud Run ซ้ำสองเท่า)
 */
export async function getInfraReport(
  admin: SupabaseClient,
  month?: string | null,
  source?: string | null,
): Promise<InfraReport> {
  const { data: monthRows } = await admin
    .from("infra_costs")
    .select("month, source")
    .order("month", { ascending: false });
  const all = (monthRows ?? []) as { month: string; source: string }[];
  const months = Array.from(new Set(all.map((r) => r.month)));
  const target = month && months.includes(month) ? month : (months[0] ?? "");

  const availableSources = (["billing_export", "monitoring"] as InfraSource[]).filter((s) =>
    all.some((r) => r.month === target && r.source === s),
  );
  const wanted = source === "monitoring" || source === "billing_export" ? source : null;
  const activeSource: InfraSource =
    (wanted && availableSources.includes(wanted) ? wanted : null) ??
    availableSources[0] ??
    "monitoring";

  const { data } = await admin
    .from("infra_costs")
    .select(
      "month, project, app, service, sku, cpu_seconds, gib_seconds, requests, cost_usd, synced_at",
    )
    .eq("month", target)
    .eq("source", activeSource)
    .order("cost_usd", { ascending: false });

  const rows: InfraRow[] = ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    month: String(r.month),
    project: String(r.project ?? ""),
    app: String(r.app),
    service: String(r.service),
    sku: String(r.sku ?? ""),
    cpuSeconds: Number(r.cpu_seconds ?? 0),
    gibSeconds: Number(r.gib_seconds ?? 0),
    requests: Number(r.requests ?? 0),
    costUsd: Number(r.cost_usd ?? 0),
    syncedAt: String(r.synced_at ?? ""),
  }));

  const totalUsd = rows.reduce((s, r) => s + r.costUsd, 0);
  const grouped = new Map<string, { costUsd: number; requests: number }>();
  for (const r of rows) {
    const g = grouped.get(r.app) ?? { costUsd: 0, requests: 0 };
    g.costUsd += r.costUsd;
    g.requests += r.requests;
    grouped.set(r.app, g);
  }

  return {
    months,
    month: target,
    source: activeSource,
    availableSources,
    rows,
    byApp: Array.from(grouped.entries())
      .map(([app, g]) => ({
        app,
        costUsd: g.costUsd,
        requests: g.requests,
        share: totalUsd > 0 ? g.costUsd / totalUsd : 0,
      }))
      .sort((a, b) => b.costUsd - a.costUsd),
    totalUsd,
    syncedAt: rows[0]?.syncedAt ?? null,
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
