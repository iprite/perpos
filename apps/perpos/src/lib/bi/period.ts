/**
 * lib/bi/period.ts — แปลง "คำเวลา" เป็นช่วงวันที่จริง (deterministic, ไม่พึ่ง LLM)
 *
 * กติกา (contract §11 D2 🔒):
 *  - **ปฏิทินเป็นค่าตั้งต้น** (`year`/`quarter`/`month`/`week`/`day`) — "ปีนี้" = ม.ค.–ธ.ค.
 *  - `fiscal_year` (ต.ค.–ก.ย. ตามภาครัฐไทย) ใช้เมื่อผู้ใช้พูดว่า "ปีงบประมาณ" ชัดเจนเท่านั้น
 *  - **ทุกคำตอบต้องบอกช่วงวันที่ที่ใช้** → ทุกฟังก์ชันคืน `label_th` ที่แสดงให้ผู้ใช้เห็นได้เสมอ
 *  - รองรับเปรียบเทียบ `prev_period` / `yoy` (`target` ยังไม่ใช้ — ไม่มีที่เก็บเป้า, D5(e))
 *  - เพดานช่วงเวลาต่อ metric (`max_period_months`) — เกินแล้ว **ตัดให้พอดีเพดาน + แจ้งผู้ใช้**
 *
 * วันที่ทั้งหมดเป็น ISO `YYYY-MM-DD` (ค.ศ.) แบบ **inclusive ทั้งสองปลาย** และคิดบนปฏิทิน UTC
 * (เก็บ CE ใน DB · แสดง พ.ศ. ใน label ตาม DESIGN §14)
 */

import type { Comparison, TimeGrain } from "./types";

/** ช่วงเวลาที่ resolve แล้ว — พร้อมใช้ทั้งใน SQL และในคำตอบ */
export interface BiPeriod {
  grain: TimeGrain;
  /** ISO date (CE) inclusive */
  from: string;
  /** ISO date (CE) inclusive */
  to: string;
  /** ข้อความไทยที่แสดงให้ผู้ใช้เห็น (มีปี พ.ศ.) */
  label_th: string;
  /** true = ถูกตัดให้พอดีเพดาน `max_period_months` */
  capped: boolean;
  /** true = ผู้ใช้ระบุช่วงเอง (from/to) → ไม่ใช่ขอบของ grain · prev_period จะถอยเท่าความยาวช่วง */
  explicit?: boolean;
}

const THAI_MONTHS_ABBR = [
  "ม.ค.",
  "ก.พ.",
  "มี.ค.",
  "เม.ย.",
  "พ.ค.",
  "มิ.ย.",
  "ก.ค.",
  "ส.ค.",
  "ก.ย.",
  "ต.ค.",
  "พ.ย.",
  "ธ.ค.",
];

/** เดือนเริ่มปีงบประมาณไทย (0-based) = ตุลาคม */
export const FISCAL_YEAR_START_MONTH = 9;

// ─── helper วันที่ (UTC ล้วน — ไม่พึ่ง timezone ของเครื่อง) ──────────────────

function utc(y: number, m: number, d: number): Date {
  return new Date(Date.UTC(y, m, d));
}

function toIso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function parseIso(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return utc(y, (m ?? 1) - 1, d ?? 1);
}

function addDays(d: Date, n: number): Date {
  return new Date(d.getTime() + n * 86_400_000);
}

function endOfMonth(y: number, m: number): Date {
  return utc(y, m + 1, 0);
}

function normalizeToday(today?: Date | string): Date {
  if (!today) return parseIso(toIso(new Date()));
  if (typeof today === "string") return parseIso(today);
  return parseIso(toIso(today));
}

/** วันจันทร์ของสัปดาห์ที่วันนั้นอยู่ (ISO week) */
function startOfIsoWeek(d: Date): Date {
  const dow = d.getUTCDay(); // 0=อาทิตย์
  const diff = dow === 0 ? -6 : 1 - dow;
  return addDays(d, diff);
}

/** ปีงบประมาณ (พ.ศ.) ที่วันนั้นตกอยู่ — ต.ค. ปีนี้ = ปีงบฯ ถัดไป */
export function fiscalYearOf(d: Date): number {
  const y = d.getUTCFullYear();
  return d.getUTCMonth() >= FISCAL_YEAR_START_MONTH ? y + 1 : y;
}

function be(ceYear: number): number {
  return ceYear + 543;
}

function thaiDate(iso: string): string {
  const d = parseIso(iso);
  return `${d.getUTCDate()} ${THAI_MONTHS_ABBR[d.getUTCMonth()]} ${be(d.getUTCFullYear())}`;
}

/** ข้อความช่วงวันที่แบบเต็ม เช่น "1 ม.ค. 2569 – 31 มี.ค. 2569" */
export function formatPeriodRange(from: string, to: string): string {
  return `${thaiDate(from)} – ${thaiDate(to)}`;
}

// ─── resolve ───────────────────────────────────────────────────────────────

export interface ResolvePeriodInput {
  grain: TimeGrain;
  /** 0 = ช่วงปัจจุบัน · -1 = ช่วงก่อนหน้า · -2 = ย้อนสองช่วง … */
  offset?: number;
  /** วันอ้างอิง (default = วันนี้) — ใส่เพื่อให้เทสคงที่ */
  today?: Date | string;
  /** เพดานช่วงเวลาของ metric (เดือน) — เกินแล้วตัด */
  maxPeriodMonths?: number;
}

/** แปลง grain + offset → ช่วงวันที่จริง (ปฏิทินเป็นค่าตั้งต้น, fiscal_year = ต.ค.–ก.ย.) */
export function resolvePeriod(input: ResolvePeriodInput): BiPeriod {
  const base = normalizeToday(input.today);
  const offset = Number.isFinite(input.offset) ? Math.trunc(input.offset as number) : 0;
  const raw = rawRange(input.grain, offset, base);
  return capPeriod(raw, input.maxPeriodMonths);
}

function rawRange(grain: TimeGrain, offset: number, base: Date): BiPeriod {
  const y = base.getUTCFullYear();
  const m = base.getUTCMonth();

  switch (grain) {
    case "day": {
      const d = addDays(base, offset);
      const iso = toIso(d);
      return { grain, from: iso, to: iso, label_th: `วันที่ ${thaiDate(iso)}`, capped: false };
    }
    case "week": {
      const start = addDays(startOfIsoWeek(base), offset * 7);
      const end = addDays(start, 6);
      return {
        grain,
        from: toIso(start),
        to: toIso(end),
        label_th: `สัปดาห์ ${formatPeriodRange(toIso(start), toIso(end))}`,
        capped: false,
      };
    }
    case "month": {
      const start = utc(y, m + offset, 1);
      const end = endOfMonth(start.getUTCFullYear(), start.getUTCMonth());
      return {
        grain,
        from: toIso(start),
        to: toIso(end),
        label_th: `เดือน ${THAI_MONTHS_ABBR[start.getUTCMonth()]} ${be(start.getUTCFullYear())}`,
        capped: false,
      };
    }
    case "quarter": {
      const qIndex = Math.floor(m / 3) + offset;
      const start = utc(y, qIndex * 3, 1);
      const end = endOfMonth(start.getUTCFullYear(), start.getUTCMonth() + 2);
      const q = Math.floor(start.getUTCMonth() / 3) + 1;
      return {
        grain,
        from: toIso(start),
        to: toIso(end),
        label_th: `ไตรมาส ${q}/${be(start.getUTCFullYear())} (ปีปฏิทิน)`,
        capped: false,
      };
    }
    case "year": {
      const yy = y + offset;
      return {
        grain,
        from: toIso(utc(yy, 0, 1)),
        to: toIso(utc(yy, 11, 31)),
        label_th: `ปี ${be(yy)} (ปีปฏิทิน)`,
        capped: false,
      };
    }
    case "fiscal_year": {
      const fy = fiscalYearOf(base) + offset; // fy = ปี ค.ศ. ที่ปีงบฯ สิ้นสุด
      const start = utc(fy - 1, FISCAL_YEAR_START_MONTH, 1);
      const end = utc(fy, FISCAL_YEAR_START_MONTH, 0); // วันสุดท้ายก่อน 1 ต.ค. = 30 ก.ย.
      return {
        grain,
        from: toIso(start),
        to: toIso(end),
        label_th: `ปีงบประมาณ ${be(fy)} (${formatPeriodRange(toIso(start), toIso(end))})`,
        capped: false,
      };
    }
  }
}

/** ช่วงที่ผู้ใช้ระบุเอง (from/to) — ยัง cap ตามเพดานเหมือนกัน */
export function resolveExplicitPeriod(
  from: string,
  to: string,
  maxPeriodMonths?: number,
  grain: TimeGrain = "day",
): BiPeriod {
  const a = parseIso(from);
  const b = parseIso(to);
  const [lo, hi] = a.getTime() <= b.getTime() ? [a, b] : [b, a];
  return capPeriod(
    {
      grain,
      from: toIso(lo),
      to: toIso(hi),
      label_th: formatPeriodRange(toIso(lo), toIso(hi)),
      capped: false,
      explicit: true,
    },
    maxPeriodMonths,
  );
}

/**
 * ตัดช่วงให้ไม่เกินเพดาน `max_period_months` — ตัดจากปลายเก่า (ยึด `to` ไว้)
 * คืน `capped=true` + label ที่บอกผู้ใช้ว่าถูกตัด (ห้ามตัดเงียบ ๆ)
 */
export function capPeriod(period: BiPeriod, maxPeriodMonths?: number): BiPeriod {
  const max = Number(maxPeriodMonths);
  if (!Number.isFinite(max) || max <= 0) return period;

  const to = parseIso(period.to);
  const from = parseIso(period.from);
  // ขอบเขตที่อนุญาต = ย้อนจาก `to` ไป max เดือน แล้วบวก 1 วัน (inclusive ทั้งสองปลาย)
  const limit = addDays(utc(to.getUTCFullYear(), to.getUTCMonth() - max, to.getUTCDate()), 1);
  if (from.getTime() >= limit.getTime()) return period;

  const cappedFrom = toIso(limit);
  return {
    ...period,
    from: cappedFrom,
    capped: true,
    label_th: `${period.label_th} — ตัดเหลือ ${formatPeriodRange(cappedFrom, period.to)} (เพดาน ${max} เดือน)`,
  };
}

// ─── เปรียบเทียบ (prev_period / yoy) ────────────────────────────────────────

/**
 * ช่วงที่ใช้เปรียบเทียบ — คืน `null` เมื่อ `none`/`target` (target ยังไม่รองรับ, D5(e))
 * - `prev_period` = ถอยหลัง 1 ช่วงตาม grain (ช่วงกำหนดเองถอยหลังเท่าความยาวช่วงเดิม)
 * - `yoy` = ช่วงเดียวกันของปีก่อน (ปีงบประมาณถอย 1 ปีงบฯ)
 */
export function comparisonPeriod(period: BiPeriod, comparison: Comparison): BiPeriod | null {
  if (comparison === "none" || comparison === "target") return null;

  const from = parseIso(period.from);
  const to = parseIso(period.to);

  if (comparison === "yoy") {
    const shift = (d: Date) => utc(d.getUTCFullYear() - 1, d.getUTCMonth(), d.getUTCDate());
    const f = toIso(shift(from));
    const t = toIso(shift(to));
    return {
      grain: period.grain,
      from: f,
      to: t,
      label_th: `ปีก่อน (${formatPeriodRange(f, t)})`,
      capped: false,
    };
  }

  // prev_period — ช่วงตาม grain ใช้ offset -1 เพื่อให้ได้ขอบเดือน/ไตรมาสที่ถูกต้อง
  // (ช่วงกำหนดเอง/ช่วงที่ถูก cap ไม่ตรงขอบ grain → ใช้ท่าถอยตามความยาวช่วงด้านล่างแทน)
  const anchor = period.explicit || period.capped ? null : shiftAnchorBack(period.grain, from);
  if (anchor) {
    const prev = rawRange(period.grain, 0, anchor);
    return { ...prev, label_th: `ช่วงก่อนหน้า: ${prev.label_th}`, capped: false };
  }

  // ช่วงกำหนดเอง → ถอยหลังเท่าความยาวช่วงเดิม
  const lengthDays = Math.round((to.getTime() - from.getTime()) / 86_400_000) + 1;
  const t = addDays(from, -1);
  const f = addDays(t, -(lengthDays - 1));
  return {
    grain: period.grain,
    from: toIso(f),
    to: toIso(t),
    label_th: `ช่วงก่อนหน้า: ${formatPeriodRange(toIso(f), toIso(t))}`,
    capped: false,
  };
}

/** วันอ้างอิงของ "ช่วงก่อนหน้า" ตาม grain (null = ช่วงกำหนดเอง) */
function shiftAnchorBack(grain: TimeGrain, from: Date): Date | null {
  switch (grain) {
    case "day":
      return addDays(from, -1);
    case "week":
      return addDays(from, -7);
    case "month":
      return utc(from.getUTCFullYear(), from.getUTCMonth() - 1, 1);
    case "quarter":
      return utc(from.getUTCFullYear(), from.getUTCMonth() - 3, 1);
    case "year":
      return utc(from.getUTCFullYear() - 1, 0, 1);
    case "fiscal_year":
      return utc(from.getUTCFullYear() - 1, FISCAL_YEAR_START_MONTH, 1);
    default:
      return null;
  }
}

/** บรรทัด "ช่วงเวลา: …" ที่ต้องแนบทุกคำตอบ (§3.1 ข้อ 5) */
export function periodLine(period: BiPeriod, compare?: BiPeriod | null): string {
  const base = `ช่วงเวลา: ${period.label_th} (${formatPeriodRange(period.from, period.to)})`;
  return compare ? `${base} · เทียบกับ ${compare.label_th}` : base;
}
