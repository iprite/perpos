/**
 * lib/bi/metrics.ts — รายการ metric ที่ผู้ใช้คนนี้ "เห็นได้จริง"
 *
 * ใช้ทำ "คำถามตัวอย่าง" บนหน้าแชท และใช้เสนอทางเลือกเมื่อคำถาม match ไม่เจอ (§3.2)
 * กรองสองชั้นเหมือนชั้น retrieval: `status='verified'` + `module_scope` ที่ org เปิด
 * + `allowed_roles` ของผู้ถาม (RBAC ระดับ metric — §5)
 *
 * `bi_metrics` เป็นตารางกลาง RLS deny-all → เข้าถึงผ่าน service-role เท่านั้น (contract §10 O1)
 */

import type { createAdminClient } from "@/app/api/_lib/supabase";
import {
  isTimeGrain,
  METRIC_UNITS,
  type BiMetricSummary,
  type BiMetricSummaryDimension,
  type BiRole,
  type ChartType,
  type MetricStatus,
  type MetricUnit,
  type ModuleScope,
  type TimeGrain,
} from "./types";

type Admin = ReturnType<typeof createAdminClient>;

export interface ListVisibleMetricsInput {
  admin: Admin;
  scopes: ModuleScope[];
  role: BiRole;
  limit?: number;
}

const METRIC_SELECT =
  "key, label_th, definition_th, chart_hint, module_scope, allowed_roles, synonyms, unit, unit_decimals, dimensions, time_grains, time_basis, status";

/** metric + คำพ้อง (ใช้ค้นแบบ rule-based ภายในเซิร์ฟเวอร์ — ไม่ส่งออกทาง API) */
export interface BiMetricSearchRow extends BiMetricSummary {
  synonyms: string[];
}

/** metric ตามสถานะที่ระบุ + scope ที่ org เปิด + role นี้เห็นได้ (RBAC ระดับ metric เสมอ) */
async function queryMetrics(
  input: ListVisibleMetricsInput & { status: "verified" | "draft" },
): Promise<BiMetricSearchRow[]> {
  if (input.scopes.length === 0) return [];

  const { data, error } = await input.admin
    .from("bi_metrics")
    .select(METRIC_SELECT)
    .eq("status", input.status)
    .in("module_scope", input.scopes)
    .contains("allowed_roles", [input.role])
    .order("module_scope", { ascending: true })
    .order("key", { ascending: true })
    .limit(Math.min(Math.max(input.limit ?? 100, 1), 300));

  if (error) throw new Error(`queryMetrics(${input.status}): ${error.message}`);

  return (data ?? []).map((row) => {
    const r = row as Record<string, unknown>;
    return {
      key: String(r.key ?? ""),
      label_th: String(r.label_th ?? ""),
      definition_th: String(r.definition_th ?? ""),
      chart_hint: (r.chart_hint ?? null) as ChartType | null,
      module_scope: (r.module_scope ?? "core") as ModuleScope,
      unit: normalizeUnit(r.unit),
      unit_decimals: Number.isFinite(Number(r.unit_decimals)) ? Number(r.unit_decimals) : 0,
      dimensions: normalizeSummaryDimensions(r.dimensions),
      time_grains: normalizeTimeGrains(r.time_grains),
      time_basis: typeof r.time_basis === "string" && r.time_basis ? r.time_basis : null,
      status: (r.status ?? "verified") as MetricStatus,
      synonyms: Array.isArray(r.synonyms)
        ? r.synonyms.filter((s): s is string => typeof s === "string")
        : [],
    };
  });
}

/** metric ที่ verified + อยู่ใน scope ที่ org เปิด + role นี้เห็นได้ (payload ของ API) */
export async function listVisibleMetrics(
  input: ListVisibleMetricsInput,
): Promise<BiMetricSummary[]> {
  const rows = await queryMetrics({ ...input, status: "verified" });
  // ไม่ส่ง `synonyms` ออก API — เป็นคำค้นภายใน ไม่ใช่ข้อมูลที่ผู้ใช้ต้องเห็น
  return rows.map(({ synonyms: _s, ...summary }) => summary);
}

/**
 * metric ที่ **มีอยู่แต่ยังไม่ยืนยันนิยาม** (`status='draft'`)
 *
 * ใช้บอกผู้ใช้ว่า "เรื่องนี้ระบบมีตัวชี้วัดอยู่ แต่ยังตอบเป็นตัวเลขไม่ได้" ซึ่งต่างจาก
 * "ธุรกิจไม่มีข้อมูล" (§3.1 ข้อ 4) — **ห้ามรัน metric draft เด็ดขาด** แค่เปิดเผยว่ามีอยู่
 * ยังกรอง `allowed_roles` ตาม role ผู้ถามเสมอ (draft ที่ owner-only ต้องไม่โผล่ให้ viewer)
 */
export async function listDraftMetrics(
  input: ListVisibleMetricsInput,
): Promise<BiMetricSearchRow[]> {
  return queryMetrics({ ...input, status: "draft" });
}

/** จำนวน metric ที่ผู้ถามเห็นได้ + จำนวนที่ "ฝัง embedding แล้ว" (ใช้แยกสาเหตุ no_match) */
export interface BiIndexHealth {
  visible: number;
  embedded: number;
}

/**
 * ระบบ "ยังตั้งค่าไม่เสร็จ" จริงหรือไม่ — **ต้องตรวจจากฐานข้อมูล ห้ามเดา**
 *
 * ก่อนหน้านี้ ask.ts สรุปจาก "ไม่มี candidate กลับมา" ว่ายังไม่ได้ embed ซึ่งผิด:
 * คำถามนอกขอบเขต (เช่น "อากาศวันนี้") ก็ไม่มี candidate เหมือนกัน → ผู้ใช้เห็นข้อความ
 * "ระบบยังตั้งค่าไม่เสร็จ" ทั้งที่ระบบปกติดี (QA blocker 1)
 */
export async function checkIndexHealth(input: ListVisibleMetricsInput): Promise<BiIndexHealth> {
  if (input.scopes.length === 0) return { visible: 0, embedded: 0 };

  const base = () =>
    input.admin
      .from("bi_metrics")
      .select("key")
      .eq("status", "verified")
      .in("module_scope", input.scopes)
      .contains("allowed_roles", [input.role])
      .limit(300);

  const [all, indexed] = await Promise.all([base(), base().not("embedding", "is", null)]);
  if (all.error) throw new Error(`checkIndexHealth: ${all.error.message}`);
  if (indexed.error) throw new Error(`checkIndexHealth(embedded): ${indexed.error.message}`);

  return { visible: (all.data ?? []).length, embedded: (indexed.data ?? []).length };
}

/**
 * จับคู่คำถามกับ metric แบบ rule-based (ไม่เรียก AI — CONTEXT §12)
 * คืนตัวที่ "เกี่ยวข้องจริง" เท่านั้น: ต้องมีคำในคำถามไปตรงกับ ชื่อ/คำพ้อง/นิยาม
 */
export function matchByKeyword<
  T extends { label_th: string; definition_th: string; synonyms?: string[] },
>(question: string, metrics: T[], limit = 3): T[] {
  const qTokens = contentTokens(question);
  if (qTokens.size === 0) return [];

  const docs = metrics.map((m) => ({
    m,
    strong: contentTokens(`${m.label_th} ${(m.synonyms ?? []).join(" ")}`),
    weak: contentTokens(m.definition_th),
  }));

  // คำที่โผล่ในเกือบทุก metric (เช่น "งาน" "ยอด" "รวม") แทบไม่บอกอะไร → ลดน้ำหนัก
  const df = new Map<string, number>();
  for (const d of docs) d.strong.forEach((t) => df.set(t, (df.get(t) ?? 0) + 1));
  const commonAt = Math.max(2, Math.ceil(docs.length * 0.5));
  const weightOf = (t: string) => ((df.get(t) ?? 0) >= commonAt ? 0.5 : 2);

  const scored = docs.map((d) => {
    let score = 0;
    qTokens.forEach((t) => {
      if (d.strong.has(t)) score += weightOf(t);
      else if (d.weak.has(t)) score += 0.5;
    });
    return { m: d.m, score };
  });

  // ต้องมีคำที่ "มีน้ำหนักจริง" อย่างน้อยหนึ่งคำตรงกับชื่อ/คำพ้อง (score เต็ม 2)
  return scored
    .filter((s) => s.score >= 2)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((s) => s.m);
}

/**
 * ตัดคำไทยจริงด้วย `Intl.Segmenter` (Node 18+ มาพร้อม full ICU)
 *
 * **จำเป็น**: ภาษาไทยเขียนติดกันไม่มีช่องว่าง — การตัดด้วย whitespace ทำให้ "กำไรเดือนนี้เท่าไร"
 * เป็นก้อนเดียว จึงไม่มีวันตรงกับคำพ้อง "กำไร" (QA blocker: คำถามธรรมชาติหลุดเป็น no_match)
 * ถ้า runtime ไม่มี ICU ไทย → fallback เป็นการตัดด้วยช่องว่างแบบเดิม (ยังทำงานได้ แค่หยาบกว่า)
 */
let segmenter: Intl.Segmenter | null | undefined;
function getSegmenter(): Intl.Segmenter | null {
  if (segmenter === undefined) {
    try {
      segmenter = new Intl.Segmenter("th", { granularity: "word" });
    } catch {
      segmenter = null;
    }
  }
  return segmenter;
}

/**
 * คำทั่วไป/คำถาม/คำบอกเวลา ที่ไม่ช่วยแยกแยะ metric — ตัดทิ้งกัน false positive
 * (ถ้าไม่ตัด "กำไรเดือนนี้" จะไปตรงกับ metric ที่มีคำว่า "เดือน" ในชื่อได้)
 */
const STOPWORDS = new Set([
  // คำถาม/คำขอ
  "เท่าไร",
  "เท่าไหร่",
  "เท่า",
  "ไหร่",
  "กี่",
  "อะไร",
  "ไหน",
  "ยังไง",
  "ไง",
  "ขอ",
  "ดู",
  "ขอดู",
  "แสดง",
  "บอก",
  "หน่อย",
  "ครับ",
  "ค่ะ",
  "คะ",
  "how",
  "much",
  "many",
  "what",
  "show",
  // เวลา
  "วันนี้",
  "วัน",
  "เดือน",
  "ปี",
  "ไตรมาส",
  "สัปดาห์",
  "นี้",
  "นั้น",
  "ล่าสุด",
  "ที่แล้ว",
  "ผ่านมา",
  "ตอนนี้",
  "ปัจจุบัน",
  // คำเชื่อม/คำเติม
  "ของ",
  "ใน",
  "และ",
  "หรือ",
  "กับ",
  "ที่",
  "เป็น",
  "มี",
  "ได้",
  "แล้ว",
  "ทั้งหมด",
  "รวมทั้งหมด",
  "จาก",
  "ถึง",
  "ให้",
  "ต้อง",
  "ช่วย",
  "the",
  "and",
  "for",
  "with",
]);

/** token ที่ "มีความหมาย" ของข้อความหนึ่ง — ตัดคำ + ตัด stopword + ตัดคำสั้นเกิน */
function contentTokens(text: string): Set<string> {
  const lower = String(text ?? "").toLowerCase();
  const seg = getSegmenter();

  const raw = seg
    ? Array.from(seg.segment(lower))
        .filter((s) => s.isWordLike)
        .map((s) => s.segment)
    : lower.split(/[\s,·|/()"'“”?!.]+/);

  const out = new Set<string>();
  for (const t of raw) {
    const w = t.trim();
    if (w.length < 2 || STOPWORDS.has(w)) continue;
    // เลขล้วน/อักษรละตินสั้น ๆ ไม่ช่วยแยกแยะ
    if (/^\d+$/.test(w)) continue;
    if (/^[a-z]+$/.test(w) && w.length < 3) continue;
    out.add(w);
  }
  return out;
}

/** หน่วยที่ไม่รู้จัก → `count` (ปลอดภัยกว่าปล่อยค่าดิบไปให้ formatter ฝั่ง UI) */
function normalizeUnit(v: unknown): MetricUnit {
  return typeof v === "string" && (METRIC_UNITS as readonly string[]).includes(v)
    ? (v as MetricUnit)
    : "count";
}

/** เอาเฉพาะ `key`/`label_th` — ชื่อคอลัมน์จริงไม่ต้องหลุดไปหน้าเว็บ */
function normalizeSummaryDimensions(v: unknown): BiMetricSummaryDimension[] {
  if (!Array.isArray(v)) return [];
  const out: BiMetricSummaryDimension[] = [];
  for (const item of v) {
    if (!item || typeof item !== "object") continue;
    const d = item as Record<string, unknown>;
    const key = typeof d.key === "string" ? d.key : "";
    if (!key) continue;
    out.push({ key, label_th: typeof d.label_th === "string" && d.label_th ? d.label_th : key });
  }
  return out;
}

function normalizeTimeGrains(v: unknown): TimeGrain[] {
  return Array.isArray(v) ? v.filter(isTimeGrain) : [];
}

/**
 * เสนอ metric ที่ใกล้เคียงคำถาม เมื่อ retrieval หาไม่เจอ (§3.2 — "บอกตรง ๆ + เสนอสิ่งที่ตอบได้")
 * ใช้การจับคำแบบง่าย (ไม่เรียก AI — rule-based ทำได้ ต้องไม่เรียก AI · CONTEXT §12)
 *
 * ⚠️ **ไม่มีอะไรตรง = คืน `[]`** — ห้าม fallback เป็น "metric สามตัวแรก" เหมือนเดิม
 * (QA เจอ: ถาม "top หมวดครุภัณฑ์" แล้วถูกเสนอ "คืนเงินต้นต่อนักลงทุน" ซึ่งไม่เกี่ยวเลย)
 * ไม่เสนออะไร ดีกว่าเสนอมั่ว — ฝั่ง `ask.ts` จะชวนไปดู "ตัวชี้วัดทั้งหมด" แทน
 */
export function suggestMetrics(
  question: string,
  metrics: BiMetricSummary[],
  limit = 3,
): BiMetricSummary[] {
  return matchByKeyword(question, metrics, limit);
}
