#!/usr/bin/env node
/**
 * infra-cost-sync — ดึงการใช้งาน Cloud Run รายเดือนจาก Cloud Monitoring **ทุก GCP project**
 * (perpos + exapp) → เก็บลง `infra_costs` (source='monitoring')
 *
 * ⚠️ ตัวเลขจากที่นี่เป็น **ค่าประมาณ** (usage × เรตใน `usage_prices`) — ต้นทุนจริงทั้งใบ
 *    รวม Gemini/Storage/Network มาจาก `pnpm billing:sync` (BigQuery billing export)
 *
 *   pnpm infra:sync              # เดือนปัจจุบัน
 *   pnpm infra:sync 2026-07      # เดือนที่ระบุ
 *
 * ทำไมเป็นสคริปต์ ไม่ใช่ API route: แอปรันบน Vercel ไม่มี credential ของ GCP
 * สคริปต์นี้ยืม access token จาก `gcloud` ของเครื่องที่ login แล้ว (ท่าเดียวกับ `pnpm kb:embed`)
 *
 * เรตที่ใช้คิดเงินมาจากตาราง `usage_prices` (คีย์ compute:cloudrun_*) ซึ่ง calibrate จากบิลจริงแล้ว
 * — แก้ราคาที่ /admin/usage แล้ว sync ใหม่ ตัวเลขจะขยับตาม ไม่ต้องแก้สคริปต์
 */

import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/**
 * ทุก GCP project ที่ต้องกวาด — perpos เป็นจุดควบคุมกลางจึงต้องเห็นของทุกแอป
 * `defaultApp` ใช้เมื่อชื่อ service ไม่มี prefix บอกแอป (เช่น post-worker, drive-sync)
 * override ได้ด้วย env `GCP_PROJECTS="perpos:perpos,exworker-435807:exapp"`
 */
const PROJECTS = (
  process.env.GCP_PROJECTS ?? "perpos:perpos,exworker-435807:exapp"
)
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean)
  .map((s) => {
    const [id, defaultApp] = s.split(":");
    return { id, defaultApp: defaultApp || "unknown" };
  });

/** service_name → แอปเจ้าของ (prefix ชนะเสมอ ไม่งั้นตกที่แอปเจ้าของ project) */
function appOf(service, defaultApp) {
  if (service.startsWith("perpos-")) return "perpos";
  if (service.startsWith("exapp-")) return "exapp";
  if (service.startsWith("riekchang-")) return "riekchang";
  return defaultApp;
}

function loadEnv() {
  const env = {};
  for (const f of ["apps/perpos/.env.local", ".env.local"]) {
    try {
      for (const line of readFileSync(resolve(ROOT, f), "utf8").split("\n")) {
        const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
        if (m) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
      }
    } catch {
      /* ไฟล์ไม่มีก็ข้าม */
    }
  }
  return { ...env, ...process.env };
}

function monthRange(arg) {
  const now = new Date();
  const ym = arg && /^\d{4}-\d{2}$/.test(arg) ? arg : now.toISOString().slice(0, 7);
  const start = new Date(`${ym}-01T00:00:00Z`);
  const end = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1));
  return { ym, start, end };
}

async function timeSeries(token, project, metric, aligner, start, end) {
  const alignment = Math.ceil((end - start) / 1000);
  const p = new URLSearchParams({
    filter: `metric.type="run.googleapis.com/${metric}"`,
    "interval.startTime": start.toISOString(),
    "interval.endTime": end.toISOString(),
    "aggregation.alignmentPeriod": `${alignment}s`,
    "aggregation.perSeriesAligner": aligner,
    "aggregation.crossSeriesReducer": "REDUCE_SUM",
    "aggregation.groupByFields": "resource.label.service_name",
  });
  const res = await fetch(
    `https://monitoring.googleapis.com/v3/projects/${project}/timeSeries?${p}`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  const json = await res.json();
  if (json.error) throw new Error(`Monitoring (${project}): ${json.error.message}`);

  const out = new Map();
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

async function main() {
  const { ym, start, end } = monthRange(process.argv[2]);
  const env = loadEnv();
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("ต้องมี NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY");

  const token = execSync("gcloud auth print-access-token", { encoding: "utf8" }).trim();
  const admin = createClient(url, key, { auth: { persistSession: false } });

  const { data: prices } = await admin.from("usage_prices").select("key, unit_cost_usd");
  const rate = (k, fallback) => Number(prices?.find((p) => p.key === k)?.unit_cost_usd ?? fallback);
  // เรตสุทธิหลังส่วนลด spending-based ที่ถอดจากบิลจริง (ดู migration calibrate_from_real_bill)
  // ⚠️ ทั้งสองค่าต้องอ่านจาก usage_prices — เคยฮาร์ดโค้ดฝั่ง memory ไว้ ทำให้แก้ราคาในหน้าเว็บ
  // แล้วขยับแค่ครึ่งเดียว (memory เป็น ~10% ของค่า Cloud Run จึงเพี้ยนแบบเงียบ ๆ)
  const CPU = rate("compute:cloudrun_second", 0.000018814);
  const MEM = rate("compute:cloudrun_gib_second", 0.000001799);

  const rows = [];
  for (const proj of PROJECTS) {
    console.log(`⏳ ดึง Cloud Run usage ${ym} (project ${proj.id})…`);
    const [cpu, mem, req] = await Promise.all([
      timeSeries(token, proj.id, "container/cpu/allocation_time", "ALIGN_SUM", start, end),
      timeSeries(token, proj.id, "container/memory/allocation_time", "ALIGN_SUM", start, end),
      timeSeries(token, proj.id, "request_count", "ALIGN_SUM", start, end),
    ]);

    const services = new Set([...cpu.keys(), ...mem.keys(), ...req.keys()]);
    for (const svc of services) {
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

  if (!rows.length) {
    console.log("ไม่พบ service ที่มีการใช้งานในเดือนนี้");
    return;
  }

  const { error } = await admin.from("infra_costs").upsert(rows, {
    onConflict: "month,project,app,service,source,sku",
  });
  if (error) throw new Error(error.message);

  rows.sort((a, b) => b.cost_usd - a.cost_usd);
  const total = rows.reduce((s, r) => s + r.cost_usd, 0);
  console.log(`\n✅ บันทึก ${rows.length} service · รวม $${total.toFixed(4)}\n`);
  for (const r of rows) {
    const pct = total > 0 ? ((r.cost_usd / total) * 100).toFixed(1) : "0.0";
    console.log(
      `  ${r.app.padEnd(10)} ${r.project.padEnd(18)} ${r.service.padEnd(24)} $${r.cost_usd
        .toFixed(4)
        .padStart(9)}  (${pct}%)  ${r.requests} req`,
    );
  }
}

main().catch((e) => {
  console.error(`❌ ${e.message}`);
  process.exit(1);
});
