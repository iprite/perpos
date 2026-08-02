#!/usr/bin/env node
/**
 * billing-cost-sync — ดึง **ต้นทุน GCP จริงทั้งใบ** จาก BigQuery billing export → `infra_costs`
 *
 *   pnpm billing:sync              # เดือนปัจจุบัน
 *   pnpm billing:sync 2026-07      # เดือนที่ระบุ
 *
 * ต่างจาก `pnpm infra:sync` ที่ประมาณค่า Cloud Run จาก Cloud Monitoring — ตัวนี้อ่านยอดที่
 * Google ออกบิลจริง (หักเครดิต/ส่วนลด spending-based แล้ว) ครบทุกบริการ: Cloud Run, Gemini,
 * Storage, Networking, Scheduler ฯลฯ แยกตาม project → แมปเป็นแอป (perpos / exapp / riekchang)
 *
 * เงื่อนไขก่อนใช้ (ทำครั้งเดียวในคอนโซล ไม่มีคำสั่ง gcloud):
 *   Billing → perpos → Billing export → BigQuery export → เปิด "Standard usage cost"
 *   → project `perpos` / dataset `billing_export`
 *   ⚠️ ทุก GCP project (perpos + exapp) ถูกย้ายมาผูกบัญชี `perpos` บัญชีเดียวแล้ว (2026-08-02)
 *      export ใบเดียวจึงครอบทุกแอป — **ถ้าวันหนึ่งแยกบัญชีอีก ต้องเปิด export ของบัญชีใหม่ด้วย**
 *      (ปลายทางเลือกได้เฉพาะ project ที่อยู่ใต้บัญชีนั้น → จะต้องอ่านหลาย dataset)
 *   ⚠️ export ไม่ backfill — เห็นเฉพาะข้อมูลหลังวันที่เปิด
 *
 * สคริปต์นี้ยืม access token จาก `gcloud` ของเครื่องที่ login แล้ว (ท่าเดียวกับ infra:sync)
 */

import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const BQ_PROJECT = process.env.BQ_BILLING_PROJECT ?? "perpos";
const BQ_DATASET = process.env.BQ_BILLING_DATASET ?? "billing_export";

/** project id → แอปเจ้าของ (override ด้วย env `BILLING_PROJECT_APPS`) */
const PROJECT_APPS = Object.fromEntries(
  (
    process.env.BILLING_PROJECT_APPS ??
    "perpos:perpos,gen-lang-client-0874375942:perpos,exworker-435807:exapp,gen-lang-client-0897830354:exapp"
  )
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => s.split(":")),
);

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

async function bq(token, sql) {
  const res = await fetch(
    `https://bigquery.googleapis.com/bigquery/v2/projects/${BQ_PROJECT}/queries`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ query: sql, useLegacySql: false, timeoutMs: 120000 }),
    },
  );
  const json = await res.json();
  if (json.error) throw new Error(`BigQuery: ${json.error.message}`);
  const fields = (json.schema?.fields ?? []).map((f) => f.name);
  return (json.rows ?? []).map((r) =>
    Object.fromEntries(fields.map((name, i) => [name, r.f[i].v])),
  );
}

async function main() {
  const arg = process.argv[2];
  const ym = arg && /^\d{4}-\d{2}$/.test(arg) ? arg : new Date().toISOString().slice(0, 7);
  const env = loadEnv();
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("ต้องมี NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY");

  const token = execSync("gcloud auth print-access-token", { encoding: "utf8" }).trim();
  const admin = createClient(url, key, { auth: { persistSession: false } });

  // ตาราง export มีชื่อลงท้ายด้วย billing account id → ค้นเองเพื่อรองรับหลายบัญชี
  const tables = (
    await bq(
      token,
      `SELECT table_name FROM \`${BQ_PROJECT}.${BQ_DATASET}.INFORMATION_SCHEMA.TABLES\`
       WHERE table_name LIKE 'gcp_billing_export_v1_%'`,
    )
  ).map((r) => r.table_name);

  if (!tables.length) {
    console.log(
      `ไม่พบตาราง billing export ใน ${BQ_PROJECT}.${BQ_DATASET}\n` +
        `→ เปิด BigQuery export (Standard usage cost) ของทุก billing account ให้ยิงเข้า dataset นี้ก่อน`,
    );
    return;
  }
  console.log(`⏳ อ่านบิล ${ym} จาก ${tables.length} ตาราง: ${tables.join(", ")}`);

  // ต้นทุนสุทธิ = cost + เครดิต (เครดิตเป็นค่าลบอยู่แล้ว) — ต้องตรงกับยอดในหน้า Billing
  const union = tables
    .map(
      (t) => `SELECT
          billing_account_id,
          project.id            AS project_id,
          service.description   AS service,
          sku.description       AS sku,
          cost,
          (SELECT IFNULL(SUM(c.amount), 0) FROM UNNEST(credits) c) AS credit,
          usage_start_time
        FROM \`${BQ_PROJECT}.${BQ_DATASET}.${t}\``,
    )
    .join("\nUNION ALL\n");

  const rows = await bq(
    token,
    `SELECT billing_account_id, project_id, service, sku,
            ROUND(SUM(cost + credit), 6) AS cost_usd
       FROM (${union})
      WHERE FORMAT_DATE('%Y-%m', DATE(usage_start_time)) = '${ym}'
      GROUP BY 1, 2, 3, 4
     HAVING ABS(cost_usd) > 0.000001
      ORDER BY cost_usd DESC`,
  );

  if (!rows.length) {
    console.log(
      `ไม่มีข้อมูลบิลของเดือน ${ym}\n` +
        `→ export เพิ่งเปิดจะยังว่าง (ข้อมูลเริ่มไหลใน ~24 ชม. และไม่ backfill ย้อนหลัง)`,
    );
    return;
  }

  const syncedAt = new Date().toISOString();
  const payload = rows.map((r) => ({
    month: `${ym}-01`,
    project: r.project_id ?? "(ไม่ระบุ project)",
    app: PROJECT_APPS[r.project_id] ?? "unknown",
    service: r.service,
    sku: r.sku ?? "",
    billing_account: r.billing_account_id ?? "",
    cost_usd: Number(r.cost_usd),
    source: "billing_export",
    synced_at: syncedAt,
  }));

  // เดือนเดิมอาจมีแถวที่ตอนนี้ไม่มีในบิลแล้ว (Google ปรับย้อนหลังได้) → ล้างก่อนเขียนทับ
  const { error: delErr } = await admin
    .from("infra_costs")
    .delete()
    .eq("month", `${ym}-01`)
    .eq("source", "billing_export");
  if (delErr) throw new Error(delErr.message);

  const { error } = await admin.from("infra_costs").insert(payload);
  if (error) throw new Error(error.message);

  const total = payload.reduce((s, r) => s + r.cost_usd, 0);
  const byApp = new Map();
  for (const r of payload) byApp.set(r.app, (byApp.get(r.app) ?? 0) + r.cost_usd);

  console.log(`\n✅ บันทึก ${payload.length} แถว · รวม $${total.toFixed(4)}\n`);
  for (const [app, cost] of [...byApp].sort((a, b) => b[1] - a[1])) {
    const pct = total > 0 ? ((cost / total) * 100).toFixed(1) : "0.0";
    console.log(`  ${app.padEnd(10)} $${cost.toFixed(4).padStart(9)}  (${pct}%)`);
  }
}

main().catch((e) => {
  console.error(`❌ ${e.message}`);
  process.exit(1);
});
