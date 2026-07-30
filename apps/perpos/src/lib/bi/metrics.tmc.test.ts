/**
 * metrics.tmc.test.ts — invariant test ของ semantic layer ฝั่ง TMC
 *
 * ด่านนี้ = เงื่อนไขที่ contract บังคับก่อนเลื่อน metric เป็น status='verified'
 * (docs/BI_FEATURE.md §3.1 ข้อ 6)
 *
 * ⚠️ ขอบเขต (เหมือน metrics.golden.test.ts): รีโปนี้ไม่มี Postgres ให้ vitest ยิง
 *    → เทสนี้ **ไม่ได้รัน SQL จริง** แต่บังคับกฎที่ผิดแล้วรั่วข้อมูล/ตัวเลขเพี้ยน
 *    บนไฟล์ seed โดยตรง · การตรวจ "เลขตรงกับข้อมูลจริง" ทำผ่าน
 *    `supabase/migrations/_bi_metric_check_tmc.sql` (รันมือบน DB จริง)
 *    เทียบกับ computeTmcDashboard() ใน lib/tmc/dashboard.ts
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { MIGRATIONS_DIR, parseSeed, type SeedMetric } from "./seed-parse";

const SEED_FILE = path.join(MIGRATIONS_DIR, "20260725120000_bi_tmc_scope_and_metrics.sql");
const ACTIVATE_FILE = path.join(MIGRATIONS_DIR, "_bi_activate_tmc_metrics.sql");

const SEED_SQL = readFileSync(SEED_FILE, "utf8");
const METRICS = parseSeed(SEED_SQL);

/** ตารางข้อเท็จจริงที่ metric ฝั่ง TMC ยิงได้ — นอกลิสต์นี้ = ออกนอกโมดูล */
const ALLOWED_TABLES = [
  "tmc_finance_entries",
  "tmc_petty_cash_txns",
  "tmc_stays",
  "tmc_stock_items",
];

/** บัญชีเงินสดย่อยที่ dashboard.ts ตัดออก (PETTY_CASH_ACCOUNT) */
const PETTY_CASH_ACCOUNT = "2366c3f9-dcc5-4091-8ab0-c421b77e7fe7";

/** คำที่บ่งชี้ข้อมูลอ่อนไหว (กำไร/ต้นทุน/มาร์จิ้น) — ต้อง owner เท่านั้น */
const SENSITIVE_KEY = [/profit/i, /margin/i, /(^|[._])cost/i];
const SENSITIVE_LABEL = [/กำไร/, /ขาดทุน/, /ต้นทุน/];
const isSensitive = (m: SeedMetric) =>
  SENSITIVE_KEY.some((re) => re.test(m.key)) || SENSITIVE_LABEL.some((re) => re.test(m.label_th));

const hasAggregate = (tpl: string) => /\b(sum|count|avg|min|max)\s*\(/i.test(tpl);

/** สูตรจำนวนคืนราย stay (check_out − check_in, ไม่มี = 1 คืน) — ใช้กับ metric ราย stay */
const NIGHTS_EXPR =
  /CASE WHEN o\.check_out IS NULL THEN 1 ELSE GREATEST\(o\.check_out - o\.check_in, 0\) END/;

/** สูตรคืนตรงเดือน — แตก stay เป็นรายคืนตามวันที่พักจริง (ตรงกับ nightsPerMonth ใน dashboard.ts) */
const PER_NIGHT_EXPR =
  /generate_series\(s\.check_in, coalesce\(s\.check_out, s\.check_in \+ 1\) - 1, interval '1 day'\)/;

describe("bi seed (tmc) — โครงสร้างไฟล์", () => {
  it("parse metric ได้ครบ 12 ตัว และ key ไม่ซ้ำ", () => {
    expect(METRICS.length).toBe(12);
    const keys = METRICS.map((m) => m.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("migration ขยาย CHECK ของ module_scope ให้รับ 'tmc' จริง", () => {
    expect(SEED_SQL).toMatch(/bi_metrics_module_scope_chk/);
    expect(SEED_SQL).toMatch(/module_scope IN \([^)]*'tmc'[^)]*\)/);
  });

  it("helper _bi_seed_metric ถูก drop ท้ายไฟล์ (ไม่ทิ้งฟังก์ชันค้างใน public)", () => {
    expect(SEED_SQL).toMatch(/DROP FUNCTION IF EXISTS public\._bi_seed_metric/);
  });
});

describe.each(METRICS.map((m) => [m.key, m] as const))("bi metric (tmc): %s", (_key, m) => {
  it("มีช่องบังคับครบ (definition/unit/grain/synonyms/allowed_roles/max_period_months)", () => {
    expect(m.definition_th.trim().length).toBeGreaterThan(20);
    expect(m.label_th.trim().length).toBeGreaterThan(0);
    expect(m.grain.trim().length).toBeGreaterThan(0);
    expect(["thb", "count", "days", "percent"]).toContain(m.unit);
    expect(m.synonyms.length).toBeGreaterThan(0);
    expect(m.allowed_roles.length).toBeGreaterThan(0);
    expect(m.max_period_months).toBeGreaterThan(0);
    expect(m.module_scope).toBe("tmc");
  });

  it("key naming = tmc.<snake_case>", () => {
    expect(m.key).toMatch(/^tmc\.[a-z0-9_]+$/);
  });

  it("ประกาศ time_basis ชัดเจน และเป็นคอลัมน์วันที่ของตารางนั้นจริง", () => {
    expect(m.time_basis).not.toBeUndefined();
    // night_date = คอลัมน์ derived จาก generate_series (metric รายคืน) — ต้องมีในซับเควรีจริง
    expect(["entry_date", "txn_date", "check_in", "night_date"]).toContain(m.time_basis);
    if (m.time_basis === "night_date") {
      expect(m.sql_template).toContain("AS night_date");
      expect(m.sql_template).toMatch(PER_NIGHT_EXPR);
    }
  });

  it("org isolation: template ต้อง bind o.org_id = __p.org_id", () => {
    expect(m.sql_template).toMatch(/o\.org_id\s*=\s*__p\.org_id/);
  });

  it('template เป็น SELECT เดี่ยว ไม่มี ";" และไม่ขึ้นต้นด้วย WITH', () => {
    expect(m.sql_template).not.toContain(";");
    expect(m.sql_template.trim().slice(0, 6).toUpperCase()).toBe("SELECT");
    expect(m.sql_template).not.toMatch(
      /\b(insert|update|delete|drop|alter|create|truncate|grant|revoke|copy|merge|vacuum|call)\b/i,
    );
  });

  it("ยิงได้เฉพาะตารางของโมดูล tmc", () => {
    // รองรับทั้ง FROM <table> o ตรง ๆ และซับเควรีรายคืน (FROM <table> s ... ) o
    const tables = Array.from(m.sql_template.matchAll(/FROM\s+([a-z_]+)\s+(?:o|s)\b/gi)).map(
      (x) => x[1],
    );
    expect(tables.length).toBe(1);
    expect(ALLOWED_TABLES).toContain(tables[0]);
  });

  it("allowed_roles อยู่ในชุดที่ schema อนุญาต", () => {
    for (const r of m.allowed_roles) expect(["owner", "analyst", "viewer"]).toContain(r);
  });

  it("ข้อมูลอ่อนไหว (กำไร/ต้นทุน) = owner เท่านั้น", () => {
    if (!isSensitive(m)) return;
    expect(m.allowed_roles).toEqual(["owner"]);
  });

  it("data boundary: metric ที่ไม่ aggregate ต้อง no_summarize = true", () => {
    if (!hasAggregate(m.sql_template)) expect(m.no_summarize).toBe(true);
  });

  it('ห้ามมี comparison "yoy" (ข้อมูลเริ่ม 2026-02 ยังไม่มีปีก่อนให้เทียบ)', () => {
    expect(m.comparisons).not.toContain("yoy");
    for (const c of m.comparisons) expect(["none", "prev_period", "target"]).toContain(c);
  });

  it("N3: ถ้าประกาศ dimensions/time_grains ต้องมี {{dim_select}} + {{group_by}} ใน template", () => {
    if (m.dimensions.length === 0 && m.time_grains.length === 0) return;
    expect(m.sql_template).toContain("{{dim_select}}");
    expect(m.sql_template).toContain("{{group_by}}");
  });

  it("filters ที่ประกาศต้องมีรู {{filters}} ใน template", () => {
    if (m.filters.length === 0) return;
    expect(m.sql_template).toContain("{{filters}}");
  });

  it("มิติ/ฟิลเตอร์ที่ประกาศต้องมี key/label_th/column ครบ", () => {
    for (const d of m.dimensions) {
      expect(d.key?.length).toBeGreaterThan(0);
      expect(d.label_th?.length).toBeGreaterThan(0);
      expect(d.column?.length).toBeGreaterThan(0);
    }
    for (const f of m.filters) {
      expect(f.key?.length).toBeGreaterThan(0);
      expect(f.label_th?.length).toBeGreaterThan(0);
      expect(f.column?.length).toBeGreaterThan(0);
      expect(f.type?.length).toBeGreaterThan(0);
    }
  });

  it("seed ต้องเป็น status = draft (เปิดใช้งานผ่าน _bi_activate_tmc_metrics.sql เท่านั้น)", () => {
    expect(m.status).toBe("draft");
  });
});

// ---------------------------------------------------------------------------
// กฎข้ามทั้งชุด — จุดที่ "ตัวเลขบนแชท" ต้องตรงกับ "ตัวเลขบนหน้าจอ TMC"
// ---------------------------------------------------------------------------
describe("bi seed (tmc) — ต้องยึดสูตรเดียวกับ computeTmcDashboard", () => {
  const byKey = (k: string) => {
    const m = METRICS.find((x) => x.key === k);
    if (!m) throw new Error(`ไม่พบ metric ${k} ใน seed`);
    return m;
  };

  it("metric ฝั่งสมุดบัญชีหลักต้องตัดบัญชีเงินสดย่อยออกทุกตัว (กันนับซ้ำ)", () => {
    const finance = METRICS.filter((m) => /tmc_finance_entries/.test(m.sql_template));
    expect(finance.length).toBeGreaterThanOrEqual(3);
    for (const m of finance) {
      expect(m.sql_template).toContain(PETTY_CASH_ACCOUNT);
      expect(m.sql_template).toMatch(/o\.account_id IS DISTINCT FROM/);
    }
  });

  it("metric ที่รวมรายจ่ายบัญชีต้องตัดหมวด 'เงินสดย่อย' (เงินโยกไปเติมกอง — กันนับซ้ำ)", () => {
    for (const key of ["tmc.finance_expense", "tmc.finance_net_profit"]) {
      expect(byKey(key).sql_template).toMatch(/o\.category IS DISTINCT FROM 'เงินสดย่อย'/);
    }
  });

  it("metric เงินสดย่อยต้องระบุ txn_type ชัดเจน (top_up กับ expense ห้ามปนกัน)", () => {
    expect(byKey("tmc.petty_cash_expense").sql_template).toMatch(/o\.txn_type = 'expense'/);
    expect(byKey("tmc.petty_cash_top_up").sql_template).toMatch(/o\.txn_type = 'top_up'/);
  });

  it("metric รายคืน (nights/ADR) ต้องกระจายคืนตามวันที่พักจริง — สูตรเดียวกับ nightsPerMonth", () => {
    for (const key of ["tmc.stay_nights", "tmc.stay_adr"]) {
      const m = byKey(key);
      expect(m.time_basis).toBe("night_date");
      expect(m.sql_template).toMatch(PER_NIGHT_EXPR);
    }
  });

  it("คืนเฉลี่ยต่อการเข้าพัก (ราย stay) ยังใช้สูตรคืนก้อนเดียวกับ dashboard.ts", () => {
    expect(byKey("tmc.stay_avg_nights").sql_template).toMatch(NIGHTS_EXPR);
  });

  it("ตัวหารของค่าเฉลี่ยต้องกันหารศูนย์ด้วย NULLIF", () => {
    for (const key of ["tmc.stay_adr", "tmc.stay_avg_nights"]) {
      expect(byKey(key).sql_template).toMatch(/NULLIF\(/);
    }
  });

  it("รายได้ค่าห้องนับเฉพาะ room_rate · อาหารนับ 4 ช่องครบ (ห้ามปนกัน)", () => {
    const room = byKey("tmc.stay_room_revenue").sql_template;
    expect(room).toMatch(/o\.room_rate/);
    expect(room).not.toMatch(/food_amount|drink_amount|mookata_amount|bbq_amount/);

    const fnb = byKey("tmc.stay_fnb_revenue").sql_template;
    for (const col of ["food_amount", "drink_amount", "mookata_amount", "bbq_amount"]) {
      expect(fnb).toContain(col);
    }
    expect(fnb).not.toMatch(/o\.room_rate/);
  });

  it("เงินมัดจำต้องไม่ถูกจัดเป็นรายได้ (นิยามระบุชัด)", () => {
    const dep = byKey("tmc.stay_deposit_outstanding");
    expect(dep.definition_th).toMatch(/ไม่ใช่รายได้/);
    expect(dep.excludes.join(" ")).toMatch(/ค่าห้อง/);
  });

  it("metric อ่อนไหวทุกตัวเป็น owner-only (สรุปรวม)", () => {
    const leaked = METRICS.filter((m) => isSensitive(m) && m.allowed_roles.join(",") !== "owner");
    expect(leaked.map((m) => m.key)).toEqual([]);
  });

  it("_bi_activate_tmc_metrics.sql อ้าง key ที่มีจริงใน seed ทุกตัว", () => {
    const activate = readFileSync(ACTIVATE_FILE, "utf8");
    const referenced = Array.from(activate.matchAll(/'(tmc\.[a-z0-9_]+)'/g)).map((x) => x[1]);
    const keys = new Set(METRICS.map((m) => m.key));
    expect(referenced.length).toBeGreaterThan(0);
    for (const k of Array.from(new Set(referenced))) expect(keys).toContain(k);
  });

  it("ไฟล์ activate ไม่ได้ถูกแปลงเป็น migration (ยังขึ้นต้นด้วย _)", () => {
    expect(path.basename(ACTIVATE_FILE).startsWith("_")).toBe(true);
  });
});
