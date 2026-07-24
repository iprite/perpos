/**
 * metrics.golden.test.ts — golden test ของ semantic layer `bi` (B6a)
 *
 * ด่านนี้ = เงื่อนไขที่ contract บังคับก่อนเลื่อน metric เป็น status='verified'
 * (specs/bi.md §3.1 ข้อ 6 + §8.2)
 *
 * ⚠️ ขอบเขตของไฟล์นี้ (สำคัญ — อย่าเข้าใจผิด):
 *   รีโปนี้ไม่มี Postgres ให้ vitest ยิง → เทสนี้ **ไม่ได้รัน SQL จริง**
 *   สิ่งที่เทสนี้ทำคือ "contract invariant test" — อ่านไฟล์ seed
 *   `supabase/migrations/20260724091000_bi_metrics_seed.sql` แล้วบังคับกฎที่
 *   **ผิดแล้วเสียเงิน / เสียความเชื่อถือ / รั่วข้อมูล** เพื่อกันคนแก้ seed ทีหลังแล้วพังเงียบ
 *
 *   การตรวจ "ตัวเลขตรงกับข้อมูลจริง" ทำผ่าน `supabase/migrations/_bi_metric_check.sql`
 *   (รันมือบน DB จริง) — ค่าที่ยืนยันแล้วถูก freeze ไว้ที่ `metrics.expected.ts`
 *   ส่วนเทสนี้ตรวจได้แค่ว่าตัวเลขชุดนั้น "สอดคล้องกันเอง"
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { BI_GOLDEN, BI_GOLDEN_ORG, VAT_RATE } from "./metrics.expected";

// ---------------------------------------------------------------------------
// 1) parser ของไฟล์ seed (อ่านอย่างเดียว — ห้ามแก้ seed เพื่อให้เทสผ่าน)
// ---------------------------------------------------------------------------

const MIGRATIONS_DIR = path.resolve(__dirname, "../../../../../supabase/migrations");
const SEED_FILE = path.join(MIGRATIONS_DIR, "20260724091000_bi_metrics_seed.sql");
const ACTIVATE_FILE = path.join(MIGRATIONS_DIR, "_bi_activate_metrics.sql");

type MetricDim = { key: string; label_th: string; column: string };
type MetricFilter = { key: string; label_th: string; column: string; type: string };

type SeedMetric = {
  key: string;
  label_th: string;
  definition_th: string;
  grain: string;
  unit: string;
  unit_decimals: number;
  /** null = snapshot (ไม่อิงช่วงเวลา) · undefined = ไม่ได้ประกาศเลย (ผิดกฎ) */
  time_basis: string | null | undefined;
  includes: string[];
  excludes: string[];
  synonyms: string[];
  sql_template: string;
  dimensions: MetricDim[];
  filters: MetricFilter[];
  time_grains: string[];
  comparisons: string[];
  default_view: Record<string, unknown>;
  chart_hint: string | null;
  module_scope: string;
  allowed_roles: string[];
  status: string;
  no_summarize: boolean;
  max_period_months: number;
};

/** ค่าที่ helper `_bi_seed_metric` ใส่ให้เมื่อไม่ได้ระบุ (ต้องตรงกับ DEFAULT ใน seed) */
const SEED_DEFAULTS = {
  unit_decimals: 2,
  includes: [] as string[],
  excludes: [] as string[],
  synonyms: [] as string[],
  dimensions: [] as MetricDim[],
  filters: [] as MetricFilter[],
  time_grains: [] as string[],
  comparisons: ["none", "prev_period"],
  default_view: {} as Record<string, unknown>,
  chart_hint: null,
  no_summarize: false,
  max_period_months: 36,
};

function stripLineComments(raw: string): string {
  return raw
    .split("\n")
    .map((line) => line.replace(/\s*--(?![^']*').*$/, ""))
    .join("\n")
    .trim();
}

function parseSqlArrayLiteral(raw: string): string[] {
  const items: string[] = [];
  const re = /'((?:[^']|'')*)'/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(raw)) !== null) items.push(m[1].replace(/''/g, "'"));
  return items;
}

function parseValue(rawIn: string): unknown {
  const dollar = rawIn.match(/\$tpl\$([\s\S]*?)\$tpl\$/);
  if (dollar) return dollar[1];

  const raw = stripLineComments(rawIn).replace(/,\s*$/, "").trim();
  if (raw === "" || /^null$/i.test(raw)) return null;
  if (/^true$/i.test(raw)) return true;
  if (/^false$/i.test(raw)) return false;
  if (/^-?\d+(\.\d+)?$/.test(raw)) return Number(raw);

  const jsonb = raw.match(/^'([\s\S]*)'::jsonb$/);
  if (jsonb) return JSON.parse(jsonb[1].replace(/''/g, "'"));

  if (/^ARRAY\s*\[/i.test(raw)) return parseSqlArrayLiteral(raw);
  const emptyArr = raw.match(/^'\{\}'::text\[\]$/);
  if (emptyArr) return [];

  const str = raw.match(/^'([\s\S]*)'$/);
  if (str) return str[1].replace(/''/g, "'");

  throw new Error(`parseValue: ไม่รู้จักรูปแบบค่า → ${raw.slice(0, 120)}`);
}

function parseSeed(sql: string): SeedMetric[] {
  const calls = sql.split("SELECT public._bi_seed_metric(").slice(1);
  return calls.map((chunk, idx) => {
    const body = chunk.split(/\n\);/)[0];
    const args: Record<string, unknown> = {};
    const re = /\n?\s*p_([a-z_]+)\s*=>\s*/g;
    const marks: { name: string; markAt: number; valueAt: number }[] = [];
    let m: RegExpExecArray | null;
    while ((m = re.exec(body)) !== null) {
      marks.push({ name: m[1], markAt: m.index, valueAt: m.index + m[0].length });
    }
    for (let i = 0; i < marks.length; i++) {
      const end = i + 1 < marks.length ? marks[i + 1].markAt : body.length;
      args[marks[i].name] = parseValue(body.slice(marks[i].valueAt, end));
    }
    if (typeof args.key !== "string") {
      throw new Error(`parseSeed: metric ลำดับที่ ${idx + 1} ไม่มี p_key`);
    }
    return {
      ...SEED_DEFAULTS,
      ...args,
      time_basis: "time_basis" in args ? (args.time_basis as string | null) : undefined,
    } as SeedMetric;
  });
}

const SEED_SQL = readFileSync(SEED_FILE, "utf8");
const METRICS = parseSeed(SEED_SQL);

/** คำที่บ่งชี้ข้อมูลอ่อนไหวตาม D4 (กำไร/ต้นทุน/%กำไร/คอมมิชชั่น/กองทุน/ปันผล/นักลงทุน) */
const D4_KEY_PATTERNS = [
  /profit/i,
  /margin/i,
  /(^|[._])cost/i,
  /commission/i,
  /capital/i,
  /dividend/i,
  /investor/i,
];
const D4_LABEL_PATTERNS = [
  /กำไร/,
  /ต้นทุน/,
  /ทุน/,
  /คอมมิชชั่น/,
  /กองทุน/,
  /ปันผล/,
  /นักลงทุน/,
  /ลงขัน/,
];
const isSensitive = (m: SeedMetric) =>
  D4_KEY_PATTERNS.some((re) => re.test(m.key)) ||
  D4_LABEL_PATTERNS.some((re) => re.test(m.label_th));

const hasAggregate = (tpl: string) => /\b(sum|count|avg|min|max)\s*\(/i.test(tpl);
const touchesPeople = (m: SeedMetric) =>
  m.grain === "investor" || /gov_procure_investors/i.test(m.sql_template);

// ---------------------------------------------------------------------------
// 2) เทส
// ---------------------------------------------------------------------------

describe("bi seed — โครงสร้างไฟล์", () => {
  it("parse metric ได้ครบ 29 ตัว และ key ไม่ซ้ำ", () => {
    expect(METRICS.length).toBe(29);
    const keys = METRICS.map((m) => m.key);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe.each(METRICS.map((m) => [m.key, m] as const))("bi metric: %s", (_key, m) => {
  // §3.1 — ช่องบังคับ
  it("มีช่องบังคับครบ (definition/unit/grain/synonyms/allowed_roles/max_period_months)", () => {
    expect(m.definition_th.trim().length).toBeGreaterThan(20);
    expect(m.label_th.trim().length).toBeGreaterThan(0);
    expect(m.grain.trim().length).toBeGreaterThan(0);
    expect(["thb", "count", "days", "percent"]).toContain(m.unit);
    expect(m.synonyms.length).toBeGreaterThan(0);
    expect(m.allowed_roles.length).toBeGreaterThan(0);
    expect(m.max_period_months).toBeGreaterThan(0);
    expect(m.module_scope.length).toBeGreaterThan(0);
  });

  it("ประกาศ time_basis ชัดเจน (ชื่อคอลัมน์ หรือ NULL = snapshot — ห้ามปล่อยว่าง)", () => {
    expect(m.time_basis).not.toBeUndefined();
    if (m.time_basis !== null) expect(m.time_basis).toMatch(/^[a-z_]+$/);
  });

  it("metric แบบ snapshot (time_basis = NULL) ต้องไม่มี {{time_filter}} และไม่รับ time_grain", () => {
    if (m.time_basis !== null) return;
    expect(m.sql_template).not.toContain("{{time_filter}}");
    expect(m.time_grains).toEqual([]);
  });

  // D4 — RBAC
  it("D4: ข้อมูลอ่อนไหว (กำไร/ต้นทุน/คอม/กองทุน/ปันผล/นักลงทุน) = owner เท่านั้น", () => {
    if (!isSensitive(m)) return;
    expect(m.allowed_roles).toEqual(["owner"]);
  });

  it("allowed_roles อยู่ในชุดที่ schema อนุญาต", () => {
    for (const r of m.allowed_roles) expect(["owner", "analyst", "viewer"]).toContain(r);
  });

  // §5 — data boundary
  it("data boundary: รายการรายแถว หรือมิติเป็นบุคคล ต้อง no_summarize = true", () => {
    if (!hasAggregate(m.sql_template) || touchesPeople(m)) {
      expect(m.no_summarize).toBe(true);
    }
  });

  // Review Log B1
  it('ห้ามมี comparison "yoy" (ยังไม่มีข้อมูลปีก่อน)', () => {
    expect(m.comparisons).not.toContain("yoy");
    for (const c of m.comparisons) expect(["none", "prev_period", "target"]).toContain(c);
  });

  // org isolation + SELECT-only (ตรงกับ CHECK ใน schema)
  it("org isolation: template ต้อง bind o.org_id = __p.org_id", () => {
    expect(m.sql_template).toMatch(/o\.org_id\s*=\s*__p\.org_id/);
  });

  it('template เป็น SELECT เดี่ยว ไม่มี ";" และไม่ขึ้นต้นด้วย WITH', () => {
    expect(m.sql_template).not.toContain(";");
    expect(m.sql_template.trim().slice(0, 4).toUpperCase()).toBe("SELE");
    expect(m.sql_template).not.toMatch(
      /\b(insert|update|delete|drop|alter|create|truncate|grant|revoke|copy|merge|vacuum|call)\b/i,
    );
  });

  it("key naming = <module_scope>.<snake_case>", () => {
    expect(m.key).toMatch(/^[a-z_]+\.[a-z0-9_]+$/);
    expect(m.key.split(".")[0]).toBe(m.module_scope);
  });

  // N3 — มิติ/ช่วงเวลาที่ประกาศต้องมีรูใน template จริง
  it("N3: ถ้าประกาศ dimensions/time_grains ต้องมี {{dim_select}} + {{group_by}} ใน template", () => {
    if (m.dimensions.length === 0 && m.time_grains.length === 0) return;
    expect(m.sql_template).toContain("{{dim_select}}");
    expect(m.sql_template).toContain("{{group_by}}");
  });

  it("N3: ถ้าไม่มี {{dim_select}} ต้องไม่ประกาศ dimensions/time_grains (กันขอแยกแล้วได้ก้อนเดียว)", () => {
    if (m.sql_template.includes("{{dim_select}}")) return;
    expect(m.dimensions).toEqual([]);
    expect(m.time_grains).toEqual([]);
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

  // D1 — VAT
  it('D1: metric ที่แตกคู่ VAT ต้องระบุ "รวม VAT"/"ก่อน VAT" ใน label_th', () => {
    if (!/_incl_vat$|_excl_vat$/.test(m.key)) return;
    if (m.key.endsWith("_incl_vat")) expect(m.label_th).toMatch(/รวม VAT/);
    else expect(m.label_th).toMatch(/ก่อน VAT|ไม่รวม VAT/);
  });

  // §3.1 ข้อ 6 — seed ต้องเป็น draft เสมอ
  it("seed ต้องเป็น status = draft (เปิดใช้งานผ่าน _bi_activate_metrics.sql เท่านั้น)", () => {
    expect(m.status).toBe("draft");
  });
});

describe("bi seed — กฎข้ามทั้งชุด", () => {
  it("D1: metric มูลค่าต้องมาเป็นคู่ _incl_vat / _excl_vat", () => {
    const keys = METRICS.map((m) => m.key);
    const keySet = new Set(keys);
    for (const k of keys) {
      if (k.endsWith("_incl_vat")) expect(keySet).toContain(k.replace(/_incl_vat$/, "_excl_vat"));
      if (k.endsWith("_excl_vat")) expect(keySet).toContain(k.replace(/_excl_vat$/, "_incl_vat"));
    }
    // ต้องมีคู่จริงอย่างน้อย 5 คู่ (กันเทสผ่านเพราะไม่มี metric VAT เลย)
    expect(keys.filter((k) => k.endsWith("_incl_vat")).length).toBeGreaterThanOrEqual(5);
  });

  it("metric อ่อนไหวทุกตัวเป็น owner-only (สรุปรวม)", () => {
    const leaked = METRICS.filter((m) => isSensitive(m) && m.allowed_roles.join(",") !== "owner");
    expect(leaked.map((m) => m.key)).toEqual([]);
  });

  it("_bi_activate_metrics.sql อ้าง key ที่มีจริงใน seed ทุกตัว", () => {
    const activate = readFileSync(ACTIVATE_FILE, "utf8");
    const referenced = Array.from(activate.matchAll(/'(gov_procure\.[a-z0-9_]+)'/g)).map(
      (x) => x[1],
    );
    const keys = new Set(METRICS.map((m) => m.key));
    expect(referenced.length).toBeGreaterThan(0);
    for (const k of Array.from(new Set(referenced))) expect(keys).toContain(k);
  });

  it("ไฟล์ activate ไม่ได้ถูกแปลงเป็น migration (ยังขึ้นต้นด้วย _)", () => {
    expect(path.basename(ACTIVATE_FILE).startsWith("_")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 3) ค่าคาดหวังจากข้อมูลจริง — ตรวจความสอดคล้องกันเอง (ไม่ยิง DB)
// ---------------------------------------------------------------------------

describe("bi golden values (snapshot " + BI_GOLDEN_ORG.snapshotDate + ")", () => {
  const round2 = (n: number) => Math.round(n * 100) / 100;

  it("ผลรวมรายขั้นตอน = จำนวนใบงาน และ = มูลค่าพอร์ตรวม (incl VAT)", () => {
    const count = BI_GOLDEN.byStageInclVat.reduce((s, r) => s + r.count, 0);
    const value = BI_GOLDEN.byStageInclVat.reduce((s, r) => s + r.value, 0);
    expect(count).toBe(BI_GOLDEN.orderCount);
    expect(round2(value)).toBe(BI_GOLDEN.pipelineValueInclVat);
  });

  it("ผลรวมรายบริษัท = จำนวนใบงาน และ = มูลค่าพอร์ตรวม (incl VAT)", () => {
    const count = BI_GOLDEN.byCompanyInclVat.reduce((s, r) => s + r.count, 0);
    const value = BI_GOLDEN.byCompanyInclVat.reduce((s, r) => s + r.value, 0);
    expect(count).toBe(BI_GOLDEN.orderCount);
    expect(round2(value)).toBe(BI_GOLDEN.pipelineValueInclVat);
  });

  it("ผลรวมรายเดือน = จำนวนใบงาน", () => {
    const count = BI_GOLDEN.byMonth.reduce((s, r) => s + r.count, 0);
    expect(count).toBe(BI_GOLDEN.orderCount);
  });

  it("orders_detail คืนแถวเท่ากับ order_count", () => {
    expect(BI_GOLDEN.ordersDetailRows).toBe(BI_GOLDEN.orderCount);
  });

  it("priced_count ต้องไม่เกินจำนวนใบงานทั้งหมด", () => {
    expect(BI_GOLDEN.pipelineInclPricedCount).toBeLessThanOrEqual(BI_GOLDEN.orderCount);
    expect(BI_GOLDEN.pipelineExclPricedCount).toBeLessThanOrEqual(BI_GOLDEN.orderCount);
    expect(BI_GOLDEN.purchaseCostedCount).toBeLessThanOrEqual(BI_GOLDEN.orderCount);
  });

  it("ยอดก่อน VAT ต้องน้อยกว่ายอดรวม VAT และสอดคล้องกับอัตรา 7%", () => {
    expect(BI_GOLDEN.pipelineValueExclVat).toBeLessThan(BI_GOLDEN.pipelineValueInclVat);
    const derived = BI_GOLDEN.pipelineValueInclVat / (1 + VAT_RATE);
    // คลาดเคลื่อนได้จากการปัดเศษรายใบ (ต่างกันไม่ควรเกิน 1 บาท)
    expect(Math.abs(derived - BI_GOLDEN.pipelineValueExclVat)).toBeLessThan(1);
  });

  it("ต้นทุนซื้อของต้องไม่เกินมูลค่าพอร์ต (ก่อน VAT) — เจอเมื่อไรคือข้อมูลผิด", () => {
    expect(BI_GOLDEN.purchaseCostTotal).toBeLessThan(BI_GOLDEN.pipelineValueExclVat);
  });

  it("สมุดเงินทุน: ลงขัน = กระจายทุน (กองกลางคงเหลือ 0) ตามข้อมูล ณ snapshot", () => {
    const byType = Object.fromEntries(
      BI_GOLDEN.capitalFlowByType.map((f) => [f.flowType, f.amount]),
    );
    expect(byType.contribution).toBe(byType.allocation);
    const flowCount = BI_GOLDEN.capitalFlowByType.reduce((s, f) => s + f.flowCount, 0);
    expect(flowCount).toBe(4);
  });

  it("stage ที่มีข้อมูลจริงต้องตรงกับที่ประกาศไว้ใน dataGaps", () => {
    const nonZero = BI_GOLDEN.byStageInclVat.filter((r) => r.count > 0).map((r) => r.stage);
    expect(nonZero).toEqual([...BI_GOLDEN.dataGaps.stagesWithData]);
  });

  it("ยังไม่มีข้อมูลปีก่อน → ห้าม metric ไหนเปิด comparison yoy", () => {
    expect(BI_GOLDEN.dataGaps.hasPriorYearData).toBe(false);
    expect(METRICS.some((m) => m.comparisons.includes("yoy"))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 3) default_view.period — regression guard ของ BLOCKER-2 (§6.7)
//
//    ต้องอ่าน **seed 091000 + fix 094000 รวมกัน** ถึงจะเห็นสถานะจริงบน prod
//    (seed ชุดเดิม apply ไปแล้ว ห้ามแก้ไฟล์เดิม → ค่าที่ถูกต้องอยู่ในไฟล์ fix)
// ---------------------------------------------------------------------------

const FIX_FILE = path.join(MIGRATIONS_DIR, "20260724094000_bi_metrics_seed_fix.sql");

/** ค่าที่ contract §6.7 อนุญาตให้เป็น `default_view.period` */
const ALLOWED_PERIODS = [
  "all",
  "this_month",
  "last_month",
  "this_quarter",
  "this_year",
  "this_fiscal_year",
] as const;

type PeriodOverride = { period?: string; timeBasisNull?: boolean };

/** อ่านบล็อก UPDATE ในไฟล์ fix → map key → ค่าที่ถูกเขียนทับ */
function parseFixOverrides(sql: string): Map<string, PeriodOverride> {
  const out = new Map<string, PeriodOverride>();
  for (const block of sql.split("UPDATE public.bi_metrics").slice(1)) {
    const body = block.split(/;\s*$/m)[0];
    const period = body.match(/'\{period\}'\s*,\s*'"([a-z_]+)"'/)?.[1];
    const timeBasisNull = /\btime_basis\s*=\s*NULL/i.test(body.split("WHERE")[0]);
    if (!period && !timeBasisNull) continue;

    const where = body.slice(body.search(/\bWHERE\b/));
    const keys = Array.from(where.matchAll(/'([a-z_]+\.[a-z0-9_]+)'/g)).map((m) => m[1]);
    for (const key of keys) {
      out.set(key, {
        ...(out.get(key) ?? {}),
        ...(period ? { period } : {}),
        ...(timeBasisNull ? { timeBasisNull } : {}),
      });
    }
  }
  return out;
}

const FIX_OVERRIDES = parseFixOverrides(readFileSync(FIX_FILE, "utf8"));

/** สถานะจริงหลัง apply ครบทั้งสองไฟล์ */
const EFFECTIVE = METRICS.map((m) => {
  const fix = FIX_OVERRIDES.get(m.key);
  return {
    key: m.key,
    time_grains: m.time_grains,
    time_basis: fix?.timeBasisNull ? null : m.time_basis,
    period: fix?.period ?? (m.default_view.period as string | undefined) ?? undefined,
  };
});

describe("bi seed — default_view.period (§6.7, รวม fix 094000)", () => {
  it("ไฟล์ fix ถูกอ่านจริง (ถ้า parser พัง เทสข้างล่างจะผ่านแบบหลอก)", () => {
    expect(FIX_OVERRIDES.size).toBeGreaterThan(0);
    // ตัวอย่างที่ fix แก้จริง — ยืนยันว่า parser จับทั้ง period และ time_basis=NULL
    expect(FIX_OVERRIDES.get("gov_procure.receivable_outstanding")?.period).toBe("all");
    expect(FIX_OVERRIDES.get("gov_procure.pipeline_by_stage_incl_vat")?.period).toBe("this_year");
    expect(FIX_OVERRIDES.get("gov_procure.capital_pool_balance")).toEqual({
      period: "all",
      timeBasisNull: true,
    });
    // seed ดิบ (ก่อน fix) ต้องยังมีค่าที่ผิดอยู่ — ถ้าไม่มี แปลว่าเทสนี้ไม่ได้กันอะไรเลย
    const rawBad = METRICS.filter(
      (m) => !ALLOWED_PERIODS.includes(m.default_view.period as (typeof ALLOWED_PERIODS)[number]),
    );
    expect(rawBad.length).toBeGreaterThan(0);
  });

  it.each(EFFECTIVE.map((m) => [m.key, m] as const))(
    "%s: period อยู่ในชุดที่สัญญาอนุญาต",
    (_key, m) => {
      expect(m.period, `metric ${m.key} ไม่ได้ประกาศ default_view.period`).toBeDefined();
      expect(ALLOWED_PERIODS).toContain(m.period as (typeof ALLOWED_PERIODS)[number]);
    },
  );

  it.each(EFFECTIVE.map((m) => [m.key, m] as const))(
    "%s: time_basis IS NULL ⇒ period='all' + ไม่มี time_grains (snapshot จริง)",
    (_key, m) => {
      if (m.time_basis !== null) return;
      expect(m.period).toBe("all");
      expect(m.time_grains).toEqual([]);
    },
  );

  it.each(EFFECTIVE.map((m) => [m.key, m] as const))(
    "%s: metric ที่มี time_basis ต้องไม่เข้าเงื่อนไข snapshot ของ runner.isSnapshotMetric",
    (_key, m) => {
      if (m.time_basis === null) return;
      const looksSnapshot = m.time_grains.length === 0 && m.period === "all";
      expect(looksSnapshot, `metric ${m.key} มี time_basis แต่ถูกมองเป็น snapshot`).toBe(false);
    },
  );
});
