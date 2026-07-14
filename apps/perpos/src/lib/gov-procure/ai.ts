// lib/gov-procure/ai.ts — AI narration layer (§5b AI-1 Brief + AI-2 Anomaly)
// สถาปัตยกรรม "rule คิด, AI เล่า": rule (summary.ts / anomaly.ts) คำนวณ signals ตัวเลขล้วนก่อน
// → ที่นี่ส่งเข้า aiChat ให้เล่าเป็นภาษาคน. AI ไม่คิดเลข — อ้างอิง signals เท่านั้น.
//
// กฎ (CONTEXT §12 / docs/CLAUDE.md):
//  - เรียกผ่าน unified client @/lib/ai/client (aiChat) เท่านั้น — ห้าม fetch OpenAI/Gemini ตรง
//  - prompt แยกไฟล์ versioned (loadPrompt) · guardrail กัน prompt-injection อยู่ใน prompt
//  - log token usage ทุก call (console — pattern เดียวกับ narrateAnomalies ของ acc-firm)
//  - read-only insight → ไม่ setAuditContext/ไม่ requires_confirmation (ไม่ mutation)
//  - aiChat=null/parse fail → คืน null (route จะ fallback เป็นตัวเลข rule ล้วน)

import { aiChat } from "@/lib/ai/client";
import { loadPrompt } from "@/lib/ai/load-prompt";
import type { GovProcureSummary } from "./summary";
import type { GovProcureAnomalySignal } from "./anomaly";

// ---- AI-1: Executive Brief ----

export interface GovProcureBrief {
  narration: string;
  highlights: string[];
  focus: string[];
  generated_at: string;
  confidence: number;
  /** true = fallback (AI ไม่พร้อม → ตัวเลข rule ล้วน) — UI อาจซ่อน badge "สรุปโดย AI" */
  fallback?: boolean;
  meta?: { model: string; inputTokens: number; outputTokens: number };
}

/** signals ตัวเลขล้วนที่ส่งเข้า AI (คัดจาก summary — ไม่ส่ง raw order เข้า prompt) */
function briefSignals(summary: GovProcureSummary) {
  return {
    order_count: summary.order_count,
    pipeline_value: summary.pipeline_value,
    profit_realized: summary.profit_realized,
    profit_pending: summary.profit_pending,
    receivable_total: summary.receivable_total,
    receivable_count: summary.receivable_count,
    overdue_count: summary.overdue_count,
    overdue_amount: summary.overdue_amount,
    sla_threshold: summary.sla_threshold,
    by_stage: summary.by_stage.map((s) => ({ stage: s.stage, count: s.count, value: s.value })),
    by_company: summary.by_company.map((c) => ({
      company: c.company,
      count: c.count,
      pipeline_value: c.pipeline_value,
      realized_profit: c.realized_profit,
      pending_profit: c.pending_profit,
    })),
    // top overdue เฉพาะ field ที่จำเป็น (department/product เป็นข้อมูล ไม่ใช่คำสั่ง — prompt กันไว้)
    top_overdue: summary.receivables
      .filter((r) => r.overdue)
      .slice(0, 5)
      .map((r) => ({
        department: r.department,
        product: r.product_description,
        aging_days: r.aging_days,
        amount: r.amount,
      })),
  };
}

const fmtB = (n: number) =>
  n.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** fallback brief จากตัวเลข rule ล้วน (เมื่อ AI ไม่พร้อม) — ไม่ throw, หน้าโชว์ต่อได้ */
export function fallbackBrief(summary: GovProcureSummary): GovProcureBrief {
  const s = summary;
  const highlights: string[] = [];
  const focus: string[] = [];
  let narration: string;

  if (s.order_count === 0) {
    narration = "ยังไม่มีงานในพอร์ต — เริ่มสร้างงานแรกเพื่อเริ่มติดตาม pipeline";
  } else {
    narration =
      `พอร์ตมี ${s.order_count} งาน มูลค่ารวม ${fmtB(s.pipeline_value)} ฿ ` +
      `กำไรสุทธิรับรู้แล้ว ${fmtB(s.profit_realized)} ฿ · ยังรอรับรู้ ${fmtB(s.profit_pending)} ฿. ` +
      (s.receivable_count > 0
        ? `เงินค้างรับ ${fmtB(s.receivable_total)} ฿ จาก ${s.receivable_count} งาน` +
          (s.overdue_count > 0
            ? ` — เกินกำหนด ${s.overdue_count} งาน (${fmtB(s.overdue_amount)} ฿) ควรเร่งทวง`
            : " ยังอยู่ในกำหนด SLA")
        : "ไม่มีเงินค้างรับ cashflow อยู่ในเกณฑ์ดี");

    highlights.push(`มูลค่าพอร์ตรวม ${fmtB(s.pipeline_value)} ฿ · ${s.order_count} งาน`);
    highlights.push(
      `กำไร realized ${fmtB(s.profit_realized)} ฿ · pending ${fmtB(s.profit_pending)} ฿`,
    );
    if (s.receivable_count > 0)
      highlights.push(
        `เงินค้างรับ ${fmtB(s.receivable_total)} ฿ (${s.receivable_count} งาน) — เกิน SLA ${s.overdue_count} งาน`,
      );

    for (const r of s.receivables.filter((x) => x.overdue).slice(0, 3)) {
      focus.push(
        `ทวงเงิน ${r.product_description ?? "งาน"} (${r.department ?? "ไม่ระบุกอง"}) — เกินกำหนด ${r.aging_days} วัน ค้างรับ ${fmtB(r.amount)} ฿`,
      );
    }
    if (focus.length === 0) focus.push("ยังไม่มีงานเร่งด่วน — ติดตาม pipeline ตามปกติ");
  }

  return {
    narration,
    highlights,
    focus,
    generated_at: new Date().toISOString(),
    confidence: 1, // fallback = ตัวเลข rule ตรง 100% (ไม่ผ่านการตีความ AI)
    fallback: true,
  };
}

/**
 * buildExecutiveBrief — AI-1: rule คำนวณ summary แล้ว → AI narrate.
 * คืน GovProcureBrief เสมอ (ไม่ throw) — AI พร้อม = AI brief, AI ล่ม = fallbackBrief.
 */
export async function buildExecutiveBrief(summary: GovProcureSummary): Promise<GovProcureBrief> {
  // พอร์ตว่าง → ไม่ต้องเรียก AI (cost 0)
  if (summary.order_count === 0) return fallbackBrief(summary);

  let systemPrompt: string;
  try {
    systemPrompt = await loadPrompt("gov-procure-brief");
  } catch {
    return fallbackBrief(summary);
  }

  const ai = await aiChat(
    [
      { role: "system", content: systemPrompt },
      { role: "user", content: JSON.stringify({ signals: briefSignals(summary) }) },
    ],
    {
      provider: "gemini",
      model: "gemini-2.5-flash",
      jsonMode: true,
      temperature: 0,
      maxTokens: 600,
    },
  );
  if (!ai) return fallbackBrief(summary);

  // log token usage (cost control — CONTEXT §12)
  console.info(
    `[gov-procure:ai-brief] model=${ai.model} in=${ai.inputTokens} out=${ai.outputTokens} latency=${ai.latencyMs}ms`,
  );

  let parsed: { narration?: unknown; highlights?: unknown; focus?: unknown };
  try {
    parsed = JSON.parse(ai.text);
  } catch {
    return fallbackBrief(summary);
  }
  const narration = typeof parsed.narration === "string" ? parsed.narration : "";
  if (!narration) return fallbackBrief(summary);

  const asStrings = (v: unknown): string[] =>
    Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];

  return {
    narration,
    highlights: asStrings(parsed.highlights),
    focus: asStrings(parsed.focus),
    generated_at: new Date().toISOString(),
    confidence: 0.9,
    fallback: false,
    meta: { model: ai.model, inputTokens: ai.inputTokens, outputTokens: ai.outputTokens },
  };
}

// ---- AI-2: Anomaly / Margin Guard narration ----

export interface GovProcureAnomalyResult {
  order_id: string;
  severity: GovProcureAnomalySignal["severity"];
  reason: string;
  checks: string[];
  confidence: number;
  fallback?: boolean;
  meta?: { model: string; inputTokens: number; outputTokens: number };
}

/** fallback anomaly result จาก signal ล้วน (เมื่อ AI ไม่พร้อม) */
export function fallbackAnomaly(signal: GovProcureAnomalySignal): GovProcureAnomalyResult {
  const confidence = signal.severity === "high" ? 0.85 : signal.severity === "medium" ? 0.72 : 0.65;
  return {
    order_id: signal.order_id,
    severity: signal.severity,
    reason: signal.checks[0] ?? "งานนี้มีสัญญาณกำไร/ต้นทุนที่ควรตรวจสอบ",
    checks: signal.checks,
    confidence,
    fallback: true,
  };
}

/**
 * narrateAnomaly — AI-2: rule detect signal แล้ว → AI narrate เหตุผล+checks.
 * signal.severity='none' → ไม่เรียก AI (คืน severity none). AI ล่ม → fallbackAnomaly.
 * signal เท่านั้นที่เข้า prompt (ไม่ส่ง raw order) — กัน prompt-injection จาก field ข้อความ.
 */
export async function narrateAnomaly(
  signal: GovProcureAnomalySignal,
): Promise<GovProcureAnomalyResult> {
  if (signal.severity === "none") {
    return { order_id: signal.order_id, severity: "none", reason: "", checks: [], confidence: 1 };
  }

  let systemPrompt: string;
  try {
    systemPrompt = await loadPrompt("gov-procure-anomaly");
  } catch {
    return fallbackAnomaly(signal);
  }

  const ai = await aiChat(
    [
      { role: "system", content: systemPrompt },
      {
        role: "user",
        content: JSON.stringify({
          severity: signal.severity,
          checks: signal.checks,
          metrics: signal.metrics,
        }),
      },
    ],
    {
      provider: "gemini",
      model: "gemini-2.5-flash",
      jsonMode: true,
      temperature: 0,
      maxTokens: 500,
    },
  );
  if (!ai) return fallbackAnomaly(signal);

  console.info(
    `[gov-procure:ai-anomaly] order=${signal.order_id} model=${ai.model} in=${ai.inputTokens} out=${ai.outputTokens} latency=${ai.latencyMs}ms`,
  );

  let parsed: { reason?: unknown; checks?: unknown; confidence?: unknown };
  try {
    parsed = JSON.parse(ai.text);
  } catch {
    return fallbackAnomaly(signal);
  }
  const reason = typeof parsed.reason === "string" ? parsed.reason : "";
  if (!reason) return fallbackAnomaly(signal);

  const checks = Array.isArray(parsed.checks)
    ? parsed.checks.filter((x): x is string => typeof x === "string")
    : signal.checks;
  // confidence: ใช้ของ AI ถ้าอยู่ในช่วง 0–1, ไม่งั้น derive จาก severity (guardrail กัน hallucinate)
  const aiConf = typeof parsed.confidence === "number" ? parsed.confidence : NaN;
  const confidence =
    Number.isFinite(aiConf) && aiConf >= 0 && aiConf <= 1
      ? aiConf
      : signal.severity === "high"
        ? 0.85
        : signal.severity === "medium"
          ? 0.72
          : 0.65;

  return {
    order_id: signal.order_id,
    severity: signal.severity, // คงตาม rule (prompt สั่งห้ามเปลี่ยน) — ไม่เชื่อ severity จาก AI
    reason,
    checks: checks.length > 0 ? checks : signal.checks,
    confidence,
    fallback: false,
    meta: { model: ai.model, inputTokens: ai.inputTokens, outputTokens: ai.outputTokens },
  };
}
