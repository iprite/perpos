/**
 * cost-sync — ดึงต้นทุน GCP เข้า `infra_costs` อัตโนมัติรายวัน (รันจาก scheduler tier t1440)
 *
 * port มาจากสคริปต์มือ 2 ตัว (ตรรกะ/รูปแถวเหมือนเดิมทุกอย่าง ต่างแค่วิธี auth):
 *   - scripts/billing-cost-sync.mjs → syncBillingExport()  (source='billing_export' บิลจริงจาก BigQuery)
 *   - scripts/infra-cost-sync.mjs   → syncCloudRunMonitoring() (source='monitoring' ค่าประมาณ Cloud Run)
 *   สคริปต์มือยังใช้ได้เหมือนเดิม (ยืม token จาก gcloud) — ตัวนี้มีไว้กัน "ลืมรัน"
 *   ซึ่งเกิดจริงมาแล้ว: billing_export เปิดไว้ตั้งแต่ 1 ส.ค. แต่ไม่เคยมีข้อมูลเข้า DB เลย
 *
 * auth: service account key (read-only) ใน env `GCP_SYNC_SA_KEY` (เนื้อไฟล์ key JSON ทั้งก้อน)
 *   → เซ็น JWT ด้วย node:crypto แลก access token เอง ไม่ต้องพึ่ง gcloud/ไลบรารีเพิ่ม
 *   สิทธิ์ที่ SA ต้องมี: BigQuery Job User + BigQuery Data Viewer (project perpos) ·
 *   Monitoring Viewer (ทุก project ใน GCP_PROJECTS) — ห้ามให้สิทธิ์เขียนใด ๆ
 */

import { createSign } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

const BQ_PROJECT = process.env.BQ_BILLING_PROJECT ?? "perpos";
const BQ_DATASET = process.env.BQ_BILLING_DATASET ?? "billing_export";

/** project id → แอปเจ้าของบิล (override ด้วย env `BILLING_PROJECT_APPS`) */
const PROJECT_APPS: Record<string, string> = Object.fromEntries(
  (
    process.env.BILLING_PROJECT_APPS ??
    "perpos:perpos,gen-lang-client-0874375942:perpos,exworker-435807:exapp,gen-lang-client-0897830354:exapp"
  )
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => s.split(":") as [string, string]),
);

/** GCP project ที่ต้องกวาด Cloud Run usage (override ด้วย env `GCP_PROJECTS`) */
const MONITORING_PROJECTS = (process.env.GCP_PROJECTS ?? "perpos:perpos,exworker-435807:exapp")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean)
  .map((s) => {
    const [id, defaultApp] = s.split(":");
    return { id, defaultApp: defaultApp || "unknown" };
  });

/** service_name → แอปเจ้าของ (prefix ชนะเสมอ ไม่งั้นตกที่แอปเจ้าของ project) */
function appOf(service: string, defaultApp: string): string {
  if (service.startsWith("perpos-")) return "perpos";
  if (service.startsWith("exapp-")) return "exapp";
  if (service.startsWith("riekchang-")) return "riekchang";
  return defaultApp;
}

// ── GCP auth: SA key → access token (JWT bearer grant, อายุ 1 ชม. — ใช้ครั้งเดียวต่อรอบ sync) ──

export function hasGcpSyncCredential(): boolean {
  return !!process.env.GCP_SYNC_SA_KEY;
}

async function gcpAccessToken(): Promise<string> {
  const raw = process.env.GCP_SYNC_SA_KEY;
  if (!raw) throw new Error("GCP_SYNC_SA_KEY not configured");
  const sa = JSON.parse(raw) as { client_email?: string; private_key?: string };
  if (!sa.client_email || !sa.private_key) {
    throw new Error(
      "GCP_SYNC_SA_KEY ไม่ใช่ service account key JSON (ต้องมี client_email + private_key)",
    );
  }

  const now = Math.floor(Date.now() / 1000);
  const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const unsigned = `${b64({ alg: "RS256", typ: "JWT" })}.${b64({
    iss: sa.client_email,
    scope:
      "https://www.googleapis.com/auth/bigquery.readonly https://www.googleapis.com/auth/monitoring.read",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  })}`;
  const signature = createSign("RSA-SHA256").update(unsigned).sign(sa.private_key, "base64url");

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: `${unsigned}.${signature}`,
    }),
    signal: AbortSignal.timeout(15_000),
  });
  const json = (await res.json().catch(() => null)) as {
    access_token?: string;
    error_description?: string;
  } | null;
  if (!res.ok || !json?.access_token) {
    throw new Error(`GCP token exchange failed: ${json?.error_description ?? res.status}`);
  }
  return json.access_token;
}

// ── BigQuery billing export → infra_costs (source='billing_export') ──────────

type BqRow = Record<string, string | null>;

async function bq(token: string, sql: string): Promise<BqRow[]> {
  const res = await fetch(
    `https://bigquery.googleapis.com/bigquery/v2/projects/${BQ_PROJECT}/queries`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ query: sql, useLegacySql: false, timeoutMs: 40_000 }),
      signal: AbortSignal.timeout(50_000),
    },
  );
  const json = (await res.json()) as {
    error?: { message: string };
    schema?: { fields?: { name: string }[] };
    rows?: { f: { v: string | null }[] }[];
  };
  if (json.error) throw new Error(`BigQuery: ${json.error.message}`);
  const fields = (json.schema?.fields ?? []).map((f) => f.name);
  return (json.rows ?? []).map((r) =>
    Object.fromEntries(fields.map((name, i) => [name, r.f[i].v])),
  );
}

/** ดึงบิลจริงของเดือน ym (YYYY-MM) จาก BigQuery → ลบทั้งเดือนแล้วใส่ใหม่ (Google ปรับยอดย้อนหลังได้) */
export async function syncBillingExport(
  admin: SupabaseClient,
  ym: string,
  token?: string,
): Promise<{ rows: number; totalUsd: number }> {
  const t = token ?? (await gcpAccessToken());

  // ตาราง export ลงท้ายด้วย billing account id → ค้นเองเพื่อรองรับหลายบัญชี
  const tables = (
    await bq(
      t,
      `SELECT table_name FROM \`${BQ_PROJECT}.${BQ_DATASET}.INFORMATION_SCHEMA.TABLES\`
       WHERE table_name LIKE 'gcp_billing_export_v1_%'`,
    )
  ).map((r) => r.table_name as string);
  if (!tables.length) throw new Error(`ไม่พบตาราง billing export ใน ${BQ_PROJECT}.${BQ_DATASET}`);

  // ต้นทุนสุทธิ = cost + เครดิต (เครดิตเป็นค่าลบอยู่แล้ว) — ต้องตรงกับยอดในหน้า Billing
  // ⚠️ `cost` เป็น **สกุลเงินของ billing account** (ของเรา = THB) ไม่ใช่ USD — ต้องหารด้วย
  // currency_conversion_rate (จำนวนหน่วยสกุลนั้นต่อ 1 USD) ที่ Google ส่งมากับแถวนั้นเอง
  // จึงได้เรตเดียวกับที่ใช้ออกบิลเดือนนั้นจริง ไม่ต้องพึ่ง usd_thb_rate ที่เราตั้งเอง
  // (บัญชีที่เป็น USD อยู่แล้วจะมี rate = 1) — คอลัมน์ปลายทางชื่อ cost_usd จึงเป็น USD จริง
  const union = tables
    .map(
      (tb) => `SELECT
          billing_account_id,
          project.id            AS project_id,
          service.description   AS service,
          sku.description       AS sku,
          (SELECT l.value FROM UNNEST(labels) l WHERE l.key = 'app' LIMIT 1) AS app_label,
          (cost + (SELECT IFNULL(SUM(c.amount), 0) FROM UNNEST(credits) c))
            / IFNULL(NULLIF(currency_conversion_rate, 0), 1) AS net_usd,
          usage_start_time
        FROM \`${BQ_PROJECT}.${BQ_DATASET}.${tb}\``,
    )
    .join("\nUNION ALL\n");

  const rows = await bq(
    t,
    `SELECT billing_account_id, project_id, service, sku, app_label,
            ROUND(SUM(net_usd), 6) AS cost_usd
       FROM (${union})
      WHERE FORMAT_DATE('%Y-%m', DATE(usage_start_time)) = '${ym}'
      GROUP BY 1, 2, 3, 4, 5
     HAVING ABS(cost_usd) > 0.000001
      ORDER BY cost_usd DESC`,
  );
  // เดือนที่ export ยังไม่มีข้อมูล (เพิ่งเปิด/ต้นเดือน) — ไม่ใช่ error และห้ามไปลบของเดิมทิ้ง
  if (!rows.length) return { rows: 0, totalUsd: 0 };

  const syncedAt = new Date().toISOString();
  const payload = rows.map((r) => ({
    month: `${ym}-01`,
    project: r.project_id ?? "(ไม่ระบุ project)",
    // label `app` ที่ติดไว้บน Cloud Run service ชนะ mapping ตาม project เสมอ — จำเป็นเพราะ
    // GCP project `perpos` มี exapp-clip-renderer อยู่ด้วย (ดูตาม project อย่างเดียวจะนับเป็นของ perpos)
    // · แถวที่ไม่มี label (บริการที่ติดไม่ได้ / ข้อมูลก่อนวันติด label) ตกกลับไปใช้ mapping เดิม
    app: (r.app_label as string) || PROJECT_APPS[r.project_id ?? ""] || "unknown",
    service: r.service,
    sku: r.sku ?? "",
    billing_account: r.billing_account_id ?? "",
    cost_usd: Number(r.cost_usd),
    source: "billing_export",
    synced_at: syncedAt,
  }));

  // เดือนเดิมอาจมีแถวที่ตอนนี้ไม่มีในบิลแล้ว (Google ปรับย้อนหลัง) → ล้างก่อนเขียนทับ
  const { error: delErr } = await admin
    .from("infra_costs")
    .delete()
    .eq("month", `${ym}-01`)
    .eq("source", "billing_export");
  if (delErr) throw new Error(delErr.message);
  const { error } = await admin.from("infra_costs").insert(payload);
  if (error) throw new Error(error.message);

  return { rows: payload.length, totalUsd: payload.reduce((s, r) => s + r.cost_usd, 0) };
}

// ── Cloud Monitoring → infra_costs (source='monitoring') ─────────────────────

async function timeSeries(
  token: string,
  project: string,
  metric: string,
  start: Date,
  end: Date,
): Promise<Map<string, number>> {
  const alignment = Math.ceil((end.getTime() - start.getTime()) / 1000);
  const p = new URLSearchParams({
    filter: `metric.type="run.googleapis.com/${metric}"`,
    "interval.startTime": start.toISOString(),
    "interval.endTime": end.toISOString(),
    "aggregation.alignmentPeriod": `${alignment}s`,
    "aggregation.perSeriesAligner": "ALIGN_SUM",
    "aggregation.crossSeriesReducer": "REDUCE_SUM",
    "aggregation.groupByFields": "resource.label.service_name",
  });
  const res = await fetch(
    `https://monitoring.googleapis.com/v3/projects/${project}/timeSeries?${p}`,
    {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(30_000),
    },
  );
  const json = (await res.json()) as {
    error?: { message: string };
    timeSeries?: {
      resource?: { labels?: { service_name?: string } };
      points?: { value: { doubleValue?: number; int64Value?: string } }[];
    }[];
  };
  if (json.error) throw new Error(`Monitoring (${project}): ${json.error.message}`);

  const out = new Map<string, number>();
  for (const ts of json.timeSeries ?? []) {
    const svc = ts.resource?.labels?.service_name;
    if (!svc) continue;
    const v = (ts.points ?? []).reduce(
      (s, pt) => s + Number(pt.value.doubleValue ?? pt.value.int64Value ?? 0),
      0,
    );
    out.set(svc, (out.get(svc) ?? 0) + v);
  }
  return out;
}

/** ค่าประมาณ Cloud Run ของเดือน ym จาก Cloud Monitoring (usage × เรตใน usage_prices) */
export async function syncCloudRunMonitoring(
  admin: SupabaseClient,
  ym: string,
  token?: string,
): Promise<{ rows: number; totalUsd: number }> {
  const t = token ?? (await gcpAccessToken());
  const start = new Date(`${ym}-01T00:00:00Z`);
  const end = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1));

  const { data: prices } = await admin.from("usage_prices").select("key, unit_cost_usd");
  const rate = (k: string, fallback: number) =>
    Number(
      (prices as { key: string; unit_cost_usd: string }[] | null)?.find((p) => p.key === k)
        ?.unit_cost_usd ?? fallback,
    );
  // เรตสุทธิหลังส่วนลด spending-based — ทั้งสองค่าต้องอ่านจาก usage_prices (ห้ามฮาร์ดโค้ด)
  const CPU = rate("compute:cloudrun_second", 0.000018814);
  const MEM = rate("compute:cloudrun_gib_second", 0.000001799);

  const rows: Record<string, unknown>[] = [];
  for (const proj of MONITORING_PROJECTS) {
    const [cpu, mem, req] = await Promise.all([
      timeSeries(t, proj.id, "container/cpu/allocation_time", start, end),
      timeSeries(t, proj.id, "container/memory/allocation_time", start, end),
      timeSeries(t, proj.id, "request_count", start, end),
    ]);
    const services = new Set(
      Array.from(cpu.keys()).concat(Array.from(mem.keys()), Array.from(req.keys())),
    );
    for (const svc of Array.from(services)) {
      const c = cpu.get(svc) ?? 0;
      const m = mem.get(svc) ?? 0;
      rows.push({
        month: `${ym}-01`,
        project: proj.id,
        app: appOf(svc, proj.defaultApp),
        service: svc,
        cpu_seconds: Number(c.toFixed(3)),
        gib_seconds: Number(m.toFixed(3)),
        requests: Math.round(req.get(svc) ?? 0),
        cost_usd: Number((c * CPU + m * MEM).toFixed(6)),
        source: "monitoring",
        synced_at: new Date().toISOString(),
      });
    }
  }
  if (!rows.length) return { rows: 0, totalUsd: 0 };

  const { error } = await admin
    .from("infra_costs")
    .upsert(rows, { onConflict: "month,project,app,service,source,sku" });
  if (error) throw new Error(error.message);

  return {
    rows: rows.length,
    totalUsd: rows.reduce((s, r) => s + (r.cost_usd as number), 0),
  };
}

// ── Orchestrator สำหรับ scheduler (tier t1440 — วันละครั้ง) ──────────────────

export type DailyCostSyncResult = {
  billing: { month: string; rows: number; totalUsd: number; error?: string }[];
  monitoring: { month: string; rows: number; totalUsd: number; error?: string }[];
};

/**
 * sync เดือนปัจจุบันทั้ง 2 source · ช่วง 3 วันแรกของเดือน sync เดือนก่อนซ้ำด้วย
 * (billing export มี lag ~1 วัน + Google ปรับยอดย้อนหลังข้ามเดือนได้)
 * แต่ละ sub-task ล้มอิสระ — เก็บ error ไว้ในผลลัพธ์ ไม่โยนต่อ (scheduler ห้ามล้มเพราะงานนี้)
 */
export async function runDailyCostSync(admin: SupabaseClient): Promise<DailyCostSyncResult> {
  const now = new Date();
  const ym = now.toISOString().slice(0, 7);
  const months = [ym];
  if (now.getUTCDate() <= 3) {
    const prev = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
    months.push(prev.toISOString().slice(0, 7));
  }

  const result: DailyCostSyncResult = { billing: [], monitoring: [] };
  let token: string;
  try {
    token = await gcpAccessToken();
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    result.billing.push({ month: ym, rows: 0, totalUsd: 0, error });
    return result;
  }

  for (const m of months) {
    try {
      result.billing.push({ month: m, ...(await syncBillingExport(admin, m, token)) });
    } catch (e) {
      result.billing.push({
        month: m,
        rows: 0,
        totalUsd: 0,
        error: e instanceof Error ? e.message : String(e),
      });
    }
    try {
      result.monitoring.push({ month: m, ...(await syncCloudRunMonitoring(admin, m, token)) });
    } catch (e) {
      result.monitoring.push({
        month: m,
        rows: 0,
        totalUsd: 0,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }
  return result;
}
