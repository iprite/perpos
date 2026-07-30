/**
 * ai.ts — ผู้ช่วย AI ของโมดูล just_me (contract §6.1)
 *
 * ⛔ กฎเหล็ก 4 ข้อ (ห้ามฝ่าฝืน):
 *  1. เรียก AI ผ่าน `aiChat` เท่านั้น (provider/model/maxTokens ครบทุก call) — ห้าม fetch Gemini ตรง
 *  2. **ห้ามให้ AI คำนวณตัวเลข** — ตัวเลขทุกตัวคิดเสร็จแล้วจาก `project-metrics.ts` แล้วส่งไปให้ AI "เรียบเรียง"
 *  3. ผลลัพธ์เป็น "ความเห็นของ AI" เสมอ — คนตัดสิน (ห้าม auto-select ผู้ขาย / ห้ามเขียนอะไรลง DB จากที่นี่)
 *  4. AI ล่ม/ตอบไม่ได้ → คืนคำตอบ rule-based (`fallback: true`) ไม่ throw ให้หน้าจอพัง
 */

import { aiChat } from "@/lib/ai/client";
import { loadPrompt } from "@/lib/ai/load-prompt";
import type { ProjectMoneySummary, VendorQuoteComparison } from "./project-metrics";
import { PROJECT_STATUS_LABEL } from "./labels";
import type { ProjectStatus } from "./types";

/** คำตอบมาตรฐานของทุกจุด AI ในโมดูลนี้ — หน้าจอต้องติดป้าย "ความเห็น AI" เสมอ */
export interface JustMeAiOpinion {
  /** สรุปเป็นภาษาไทย 2–4 ประโยค */
  narration: string;
  /** ประเด็นย่อยที่ตรวจทานได้ทีละข้อ */
  points: string[];
  /** สิ่งที่ต้องให้ "คน" ตัดสิน (null = ไม่มีข้อควรตัดสินเพิ่ม) */
  decision_hint: string | null;
  /** true = ข้อความนี้มาจากกฎล้วน (AI ไม่พร้อม) ⇒ เชื่อถือได้ 100% แต่ไม่ได้เรียบเรียง */
  fallback: boolean;
  generated_at: string;
}

const MONEY = new Intl.NumberFormat("th-TH", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** ยอดเงินเป็นข้อความไทย — null = ยังไม่มีข้อมูล (ห้ามส่ง 0 ให้ AI แทน) */
function bahtText(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return "ไม่มีข้อมูล";
  return `${v < 0 ? "−" : ""}${MONEY.format(Math.abs(v))} บาท`;
}

function pctText(ratio: number | null | undefined): string {
  if (ratio == null || !Number.isFinite(ratio)) return "ไม่มีข้อมูล";
  return `${(ratio * 100).toFixed(1)}%`;
}

function opinion(
  narration: string,
  points: string[],
  decisionHint: string | null,
  fallback: boolean,
): JustMeAiOpinion {
  return {
    narration,
    points: points.filter((p) => p.trim().length > 0),
    decision_hint: decisionHint,
    fallback,
    generated_at: new Date().toISOString(),
  };
}

/** อ่านคำตอบ JSON ของ AI แบบไม่เชื่อใจ — ผิดรูป = ใช้ fallback */
function parseOpinion(
  raw: string,
): { narration: string; points: string[]; hint: string | null } | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;
  const obj = parsed as Record<string, unknown>;
  const narration = typeof obj.narration === "string" ? obj.narration.trim() : "";
  if (!narration) return null;
  const points = Array.isArray(obj.points)
    ? obj.points.filter((p): p is string => typeof p === "string")
    : [];
  const hint =
    typeof obj.decision_hint === "string" && obj.decision_hint.trim()
      ? obj.decision_hint.trim()
      : null;
  return { narration, points, hint };
}

/** เรียก AI ให้ "เรียบเรียง" สัญญาณที่คำนวณมาแล้ว — ล้มเหลวเมื่อไรก็คืน null */
async function narrate(
  promptName: string,
  signals: unknown,
  maxTokens: number,
  logTag: string,
): Promise<{ narration: string; points: string[]; hint: string | null } | null> {
  let systemPrompt: string;
  try {
    systemPrompt = await loadPrompt(promptName);
  } catch {
    return null;
  }

  const ai = await aiChat(
    [
      { role: "system", content: systemPrompt },
      { role: "user", content: JSON.stringify({ signals }) },
    ],
    {
      provider: "gemini",
      model: "gemini-2.5-flash",
      jsonMode: true,
      temperature: 0,
      maxTokens,
    },
  );
  if (!ai) return null;

  // log token usage (cost control — module-factory CONTEXT §12)
  console.info(
    `[just-me:${logTag}] model=${ai.model} in=${ai.inputTokens} out=${ai.outputTokens} latency=${ai.latencyMs}ms`,
  );
  return parseOpinion(ai.text);
}

// ─── AI-1: สรุปเทียบราคาผู้ขาย ───────────────────────────────────────────────
/**
 * สรุปตารางเทียบราคาให้เป็นภาษาคน — **ไม่เลือกผู้ขายให้**
 * `comparison` ต้องมาจาก `compareVendorQuotes()` (project-metrics.ts) เท่านั้น
 */
export async function summarizeVendorQuotes(
  comparison: VendorQuoteComparison,
  ctx?: { prCode?: string | null; projectName?: string | null },
): Promise<JustMeAiOpinion> {
  if (comparison.vendors.length === 0) {
    return opinion(
      "ยังไม่มีใบเสนอราคาของผู้ขายในใบขอซื้อนี้ — บันทึกราคาอย่างน้อย 1 เจ้าก่อนจึงจะเทียบได้",
      [],
      null,
      true,
    );
  }

  const signals = {
    pr_code: ctx?.prCode ?? null,
    project_name: ctx?.projectName ?? null,
    vendors: comparison.vendors.map((v) => ({
      ผู้ขาย: v.vendor_name,
      ยอดรวม: bahtText(v.total_amount),
      ส่งของภายในกี่วัน: v.delivery_days ?? "ไม่ระบุ",
      เงื่อนไขชำระ: v.credit_terms ?? "ไม่ระบุ",
      เสนอราคาครบกี่รายการ: `${v.priced_lines}/${comparison.line_count}`,
      ชนะราคาต่ำสุดกี่รายการ: v.cheapest_lines,
      สถานะ: v.status,
    })),
    ถูกที่สุดภาพรวม: comparison.cheapest_vendor_name ?? "เทียบไม่ได้ (ราคายังไม่ครบ)",
    ส่วนต่างจากเจ้าที่แพงสุด: bahtText(comparison.total_spread),
    รายการที่ราคาต่างกันมากที่สุด: comparison.lines
      .filter((l) => l.spread !== null)
      .slice(0, 5)
      .map((l) => ({
        รายการ: l.name,
        จำนวน: `${l.qty} ${l.unit}`,
        ถูกสุด: `${l.cheapest_vendor_name ?? "—"} ${bahtText(l.cheapest_unit_cost)}`,
        ส่วนต่างต่อหน่วย: bahtText(l.spread),
      })),
    รายการที่ยังไม่มีใครเสนอราคา: comparison.unpriced_line_names.slice(0, 8),
  };

  const ai = await narrate("just-me-quote-summary", signals, 500, "ai-quote-summary");
  if (!ai) return fallbackQuoteOpinion(comparison);
  return opinion(ai.narration, ai.points, ai.hint ?? DECISION_HINT_VENDOR, false);
}

const DECISION_HINT_VENDOR =
  "AI ไม่เลือกผู้ขายให้ — กรุณาตรวจราคา เงื่อนไขส่งของ และเครดิต แล้วกด “เลือกเจ้านี้” ด้วยตัวเอง";

/** คำตอบ rule-based เมื่อ AI ไม่พร้อม — ตัวเลขทุกตัวมาจาก comparison ตรง ๆ */
export function fallbackQuoteOpinion(comparison: VendorQuoteComparison): JustMeAiOpinion {
  const points: string[] = comparison.vendors.map(
    (v) =>
      `${v.vendor_name}: ${bahtText(v.total_amount)} · เสนอราคา ${v.priced_lines}/${comparison.line_count} รายการ · ถูกสุด ${v.cheapest_lines} รายการ` +
      (v.delivery_days !== null ? ` · ส่งของใน ${v.delivery_days} วัน` : ""),
  );
  if (comparison.unpriced_line_names.length > 0) {
    points.push(
      `ยังไม่มีใครเสนอราคา ${comparison.unpriced_line_names.length} รายการ — ยอดรวมที่เทียบยังไม่ครบ`,
    );
  }
  const narration = comparison.cheapest_vendor_name
    ? `ยอดรวมต่ำสุดคือ ${comparison.cheapest_vendor_name} (${bahtText(comparison.cheapest_total)}) ต่างจากเจ้าที่แพงสุด ${bahtText(comparison.total_spread)}`
    : "ยังเทียบยอดรวมไม่ได้ — ราคาที่บันทึกไว้ยังไม่ครบทุกเจ้า";
  return opinion(narration, points, DECISION_HINT_VENDOR, true);
}

// ─── AI-2: สรุปสุขภาพโครงการ ────────────────────────────────────────────────
export interface ProjectHealthInput {
  project_code: string;
  project_name: string;
  status: ProjectStatus;
  summary: ProjectMoneySummary;
  counts: {
    boq_items: number;
    usage_rows: number;
    purchase_requests: number;
    progress_rows: number;
  };
}

/** อธิบายตัวเลขของโครงการเป็นภาษาคน + ชี้ความเสี่ยง — ไม่แตะข้อมูล ไม่สั่งงานแทนคน */
export async function summarizeProjectHealth(input: ProjectHealthInput): Promise<JustMeAiOpinion> {
  const s = input.summary;
  const signals = {
    โครงการ: `${input.project_code} ${input.project_name}`,
    สถานะ: PROJECT_STATUS_LABEL[input.status],
    มูลค่าสัญญา: bahtText(s.contract_amount),
    งบต้นทุน: bahtText(s.budget_cost),
    ต้นทุนจริงสะสม: bahtText(s.actual_cost),
    ต้นทุนผูกพันที่ยังไม่รับของ: bahtText(s.committed_cost),
    ต้นทุนเทียบงบ_บวกคือเกินงบ: bahtText(s.cost_variance),
    ความคืบหน้า: s.progress_pct === null ? "ยังไม่ได้บันทึกความคืบหน้า" : pctText(s.progress_pct),
    ต้นทุนคาดการณ์ทั้งโครงการ: bahtText(s.forecast_cost),
    กำไรคาดการณ์: bahtText(s.forecast_profit),
    อัตรากำไรคาดการณ์: pctText(s.forecast_margin_pct),
    กำไรจริงเมื่อปิดงาน: bahtText(s.actual_profit),
    วางบิลไปแล้ว: bahtText(s.billed_amount),
    ยังไม่ได้วางบิล: bahtText(s.unbilled_amount),
    ฐานข้อมูลที่นับได้: {
      บรรทัด_BOQ: input.counts.boq_items,
      รายการเบิกใช้: input.counts.usage_rows,
      ใบขอซื้อ: input.counts.purchase_requests,
      บันทึกความคืบหน้า: input.counts.progress_rows,
    },
  };

  const ai = await narrate("just-me-project-health", signals, 600, "ai-project-health");
  if (!ai) return fallbackHealthOpinion(input);
  return opinion(ai.narration, ai.points, ai.hint ?? DECISION_HINT_HEALTH, false);
}

const DECISION_HINT_HEALTH =
  "เป็นการประมาณการจากข้อมูลที่บันทึกไว้ — กรุณาตรวจกับหน้างานจริงก่อนตัดสินใจ";

export function fallbackHealthOpinion(input: ProjectHealthInput): JustMeAiOpinion {
  const s = input.summary;
  const points = [
    `ต้นทุนจริง ${bahtText(s.actual_cost)} · ผูกพันอีก ${bahtText(s.committed_cost)}`,
    s.budget_cost === null
      ? "ยังไม่มีงบต้นทุน (ยังไม่อนุมัติ BOQ) จึงเทียบงบไม่ได้"
      : `เทียบงบแล้ว ${s.over_budget ? "เกินงบ" : "ยังอยู่ในงบ"} ${bahtText(s.cost_variance)}`,
    s.progress_pct === null
      ? "ยังไม่ได้บันทึกความคืบหน้า — ตัวเลขคาดการณ์จึงตีว่างานยังไม่เดิน"
      : `ความคืบหน้า ${pctText(s.progress_pct)}`,
    `ยังไม่ได้วางบิล ${bahtText(s.unbilled_amount)}`,
  ];
  const narration = s.over_budget
    ? `โครงการนี้ต้นทุนจริงบวกผูกพันเกินงบแล้ว ${bahtText(s.cost_variance)} ควรทบทวนก่อนอนุมัติซื้อเพิ่ม`
    : "ตัวเลขสรุปตามข้อมูลที่บันทึกไว้ (ยังไม่ได้ผ่านการเรียบเรียงด้วย AI)";
  return opinion(narration, points, DECISION_HINT_HEALTH, true);
}
