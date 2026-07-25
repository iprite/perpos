/**
 * seed-parse.ts — parser ของไฟล์ seed `bi_metrics` (ใช้เฉพาะฝั่งเทส)
 *
 * แยกออกมาจาก `metrics.golden.test.ts` เพื่อให้ seed ของทุก module scope
 * (gov_procure / tmc / …) ตรวจด้วย parser ตัวเดียวกัน — parser เพี้ยนที่เดียว
 * เทสของทุก scope จะแดงพร้อมกัน ไม่ใช่ผ่านแบบหลอกเพราะ copy กันไปคนละชุด
 *
 * ⚠️ อ่านไฟล์ .sql อย่างเดียว ห้ามแก้ seed เพื่อให้เทสผ่าน
 */
import { readFileSync } from "node:fs";
import path from "node:path";

export const MIGRATIONS_DIR = path.resolve(__dirname, "../../../../../supabase/migrations");

export type MetricDim = { key: string; label_th: string; column: string };
export type MetricFilter = { key: string; label_th: string; column: string; type: string };

export type SeedMetric = {
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
export const SEED_DEFAULTS = {
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

export function stripLineComments(raw: string): string {
  return raw
    .split("\n")
    .map((line) => line.replace(/\s*--(?![^']*').*$/, ""))
    .join("\n")
    .trim();
}

export function parseSqlArrayLiteral(raw: string): string[] {
  const items: string[] = [];
  const re = /'((?:[^']|'')*)'/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(raw)) !== null) items.push(m[1].replace(/''/g, "'"));
  return items;
}

export function parseValue(rawIn: string): unknown {
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

export function parseSeed(sql: string): SeedMetric[] {
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

/** อ่าน + parse ไฟล์ seed จากชื่อไฟล์ใน supabase/migrations */
export function parseSeedFile(fileName: string): SeedMetric[] {
  return parseSeed(readFileSync(path.join(MIGRATIONS_DIR, fileName), "utf8"));
}
