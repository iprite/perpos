/**
 * close-check.ts — ผู้ช่วยปิดงวด anomaly sweep (F3)
 *
 * runCloseCheck (rule-based): ไล่ตรวจ 5 กฎต่อ (client, งวด) คืน Anomaly[] จัดลำดับ severity.
 *   เลขทุกตัวมาจาก rule เท่านั้น (deterministic) — read-only ไม่ mutate.
 * narrateAnomalies (AI): ส่ง summary signal JSON ตัวเลขล้วนเข้า aiChat ให้เรียง+อธิบายเป็นภาษาคน
 *   ไม่มี anomaly → ข้าม AI (return null) · AI fail → return null (graceful, หน้าโชว์ rule ล้วน).
 *
 * Pattern acc_firm: caller (route) เช็ค auth + IDOR (clientOrgId ∈ active engagement) แล้ว
 * ส่ง admin client (service-role) เข้ามา — firm member ไม่ได้เป็นสมาชิก client org.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { aiChat } from "@/lib/ai/client";
import { loadPrompt } from "@/lib/ai/load-prompt";

export type AnomalyRule =
  | "unbalanced"
  | "draft_pending"
  | "period_open"
  | "tax_missing"
  | "amount_swing";

export type Severity = "high" | "medium" | "low";

export type Anomaly = {
  rule: AnomalyRule;
  severity: Severity;
  count: number;
  detail: string;
  refs?: { id: string; label: string }[];
};

/** สัญญาณตัวเลขล้วนที่ส่งเข้า AI (ไม่ส่ง raw rows) */
export type CloseCheckSignals = {
  unbalanced: number;
  draftPending: number;
  periodOpen: boolean;
  taxMissing: string[];
  revDeltaPct: number | null;
  expDeltaPct: number | null;
};

export type CloseCheckResult = {
  anomalies: Anomaly[];
  signals: CloseCheckSignals;
};

export type Narration = {
  narration: string;
  priority: string[];
  meta: { model: string; inputTokens: number; outputTokens: number };
};

/** เกณฑ์ ±% ของ amount_swing (F3 decision) */
const SWING_THRESHOLD_PCT = 50;
const SEVERITY_ORDER: Record<Severity, number> = { high: 0, medium: 1, low: 2 };

/** ขอบเขตวันของเดือน (YYYY-MM-DD) */
function monthRange(year: number, month: number): { from: string; to: string } {
  const mm = String(month).padStart(2, "0");
  const from = `${year}-${mm}-01`;
  // วันสุดท้ายของเดือน: day 0 ของเดือนถัดไป
  const last = new Date(year, month, 0).getDate();
  const to = `${year}-${mm}-${String(last).padStart(2, "0")}`;
  return { from, to };
}

/** เดือนก่อนหน้า (รองรับข้ามปี) */
function prevMonth(year: number, month: number): { year: number; month: number } {
  return month === 1 ? { year: year - 1, month: 12 } : { year, month: month - 1 };
}

/**
 * รายรับ/รายจ่ายของช่วงงวด — posted lines × account_type
 * (สูตรเดียวกับ lib/accounting/reports.ts incomeStatement)
 */
async function periodRevExp(
  db: SupabaseClient,
  orgId: string,
  from: string,
  to: string,
): Promise<{ revenue: number; expense: number }> {
  const { data, error } = await db
    .from("acc_journal_lines")
    .select(
      "debit, credit, acc_accounts(account_type), acc_journal_entries!inner(status, entry_date, org_id)",
    )
    .eq("org_id", orgId)
    .eq("acc_journal_entries.status", "posted")
    .eq("acc_journal_entries.org_id", orgId)
    .gte("acc_journal_entries.entry_date", from)
    .lte("acc_journal_entries.entry_date", to);
  if (error) throw new Error(error.message);

  let revenue = 0;
  let expense = 0;
  for (const r of data ?? []) {
    const acc = (r as Record<string, unknown>).acc_accounts as { account_type?: string } | null;
    const debit = Number((r as Record<string, unknown>).debit) || 0;
    const credit = Number((r as Record<string, unknown>).credit) || 0;
    if (acc?.account_type === "income") revenue += credit - debit;
    else if (acc?.account_type === "expense") expense += debit - credit;
  }
  return { revenue, expense };
}

/**
 * % เปลี่ยนแปลงเทียบเดือนก่อน · null = ไม่มีข้อมูลทั้งสองเดือน
 * คืน "ผิดปกติ" เมื่อ |delta| > threshold หรือ เดือนนี้ 0 ทั้งที่เดือนก่อนมี
 */
function deltaPct(now: number, prev: number): { pct: number | null; abnormal: boolean } {
  if (prev === 0 && now === 0) return { pct: null, abnormal: false };
  if (prev === 0) return { pct: null, abnormal: false }; // เดือนก่อน 0 → คิด % ไม่ได้, ไม่ flag
  const pct = ((now - prev) / Math.abs(prev)) * 100;
  const abnormal = Math.abs(pct) > SWING_THRESHOLD_PCT || (now === 0 && prev !== 0);
  return { pct, abnormal };
}

/**
 * runCloseCheck — ไล่ตรวจ rule ทั้ง 5 ของ (client, งวด)
 * @param db admin client (service-role) — caller เช็ค auth + IDOR แล้ว
 */
export async function runCloseCheck(
  _firmOrgId: string,
  clientOrgId: string,
  year: number,
  month: number,
  db: SupabaseClient,
): Promise<CloseCheckResult> {
  const { from, to } = monthRange(year, month);
  const anomalies: Anomaly[] = [];

  // ── (1) unbalanced + (2) draft_pending — journal ของงวด ──
  const { data: entries, error: eErr } = await db
    .from("acc_journal_entries")
    .select("id, entry_number, status, total_debit, total_credit")
    .eq("org_id", clientOrgId)
    .gte("entry_date", from)
    .lte("entry_date", to);
  if (eErr) throw new Error(eErr.message);

  const unbalancedRefs: { id: string; label: string }[] = [];
  const draftRefs: { id: string; label: string }[] = [];
  for (const e of entries ?? []) {
    const dr = Number((e as Record<string, unknown>).total_debit) || 0;
    const cr = Number((e as Record<string, unknown>).total_credit) || 0;
    const num = String((e as Record<string, unknown>).entry_number ?? "");
    const id = String((e as Record<string, unknown>).id);
    // เทียบสมดุลด้วย epsilon (เลข numeric(14,2))
    if (Math.abs(dr - cr) > 0.005) unbalancedRefs.push({ id, label: num || id });
    if ((e as Record<string, unknown>).status === "draft") draftRefs.push({ id, label: num || id });
  }
  if (unbalancedRefs.length) {
    anomalies.push({
      rule: "unbalanced",
      severity: "high",
      count: unbalancedRefs.length,
      detail: `พบ ${unbalancedRefs.length} รายการที่ยอดเดบิตไม่เท่ากับเครดิต`,
      refs: unbalancedRefs.slice(0, 20),
    });
  }
  if (draftRefs.length) {
    anomalies.push({
      rule: "draft_pending",
      severity: "medium",
      count: draftRefs.length,
      detail: `มีรายการ journal ฉบับร่างค้าง ${draftRefs.length} รายการ`,
      refs: draftRefs.slice(0, 20),
    });
  }

  // ── (3) period_open ──
  const { data: period, error: pErr } = await db
    .from("acc_periods")
    .select("id, status")
    .eq("org_id", clientOrgId)
    .eq("year", year)
    .eq("month", month)
    .maybeSingle();
  if (pErr) throw new Error(pErr.message);
  const periodOpen = !period || (period as Record<string, unknown>).status === "open";
  if (periodOpen) {
    anomalies.push({
      rule: "period_open",
      severity: "low",
      count: 1,
      detail: period ? "งวดบัญชียังเปิดอยู่ (ยังไม่ปิดงวด)" : "ยังไม่มีการสร้างงวดบัญชีของเดือนนี้",
      refs: period
        ? [{ id: String((period as Record<string, unknown>).id), label: `${year}-${month}` }]
        : undefined,
    });
  }

  // ── (4) tax_missing — pp30/pnd1 ของงวดที่ยังไม่ยื่น + เลย due ──
  const today = new Date().toISOString().slice(0, 10);
  const { data: filings, error: tErr } = await db
    .from("acc_tax_filings")
    .select("id, tax_kind, status, due_date")
    .eq("org_id", clientOrgId)
    .eq("period_year", year)
    .eq("period_month", month)
    .in("tax_kind", ["pp30", "pnd1"]);
  if (tErr) throw new Error(tErr.message);

  const taxMissingRefs: { id: string; label: string }[] = [];
  const taxMissingKinds: string[] = [];
  for (const f of filings ?? []) {
    const status = (f as Record<string, unknown>).status;
    const due = String((f as Record<string, unknown>).due_date);
    if (status !== "filed" && due < today) {
      const kind = String((f as Record<string, unknown>).tax_kind);
      taxMissingKinds.push(kind);
      taxMissingRefs.push({ id: String((f as Record<string, unknown>).id), label: kind });
    }
  }
  if (taxMissingKinds.length) {
    anomalies.push({
      rule: "tax_missing",
      severity: "high",
      count: taxMissingKinds.length,
      detail: `แบบภาษี ${taxMissingKinds.join(", ")} ยังไม่ยื่นและเลยกำหนดแล้ว`,
      refs: taxMissingRefs,
    });
  }

  // ── (5) amount_swing — revenue/expense เทียบเดือนก่อน ──
  const prev = prevMonth(year, month);
  const prevRange = monthRange(prev.year, prev.month);
  const [cur, pre] = await Promise.all([
    periodRevExp(db, clientOrgId, from, to),
    periodRevExp(db, clientOrgId, prevRange.from, prevRange.to),
  ]);
  const rev = deltaPct(cur.revenue, pre.revenue);
  const exp = deltaPct(cur.expense, pre.expense);
  if (rev.abnormal || exp.abnormal) {
    const parts: string[] = [];
    if (rev.abnormal && rev.pct != null)
      parts.push(`รายรับเปลี่ยน ${rev.pct >= 0 ? "+" : "−"}${Math.abs(Math.round(rev.pct))}%`);
    if (exp.abnormal && exp.pct != null)
      parts.push(`รายจ่ายเปลี่ยน ${exp.pct >= 0 ? "+" : "−"}${Math.abs(Math.round(exp.pct))}%`);
    anomalies.push({
      rule: "amount_swing",
      severity: "medium",
      count: parts.length,
      detail: `ยอดผิดปกติเทียบเดือนก่อน: ${parts.join(", ")}`,
    });
  }

  anomalies.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);

  const signals: CloseCheckSignals = {
    unbalanced: unbalancedRefs.length,
    draftPending: draftRefs.length,
    periodOpen,
    taxMissing: taxMissingKinds,
    revDeltaPct: rev.abnormal ? (rev.pct != null ? Math.round(rev.pct) : null) : null,
    expDeltaPct: exp.abnormal ? (exp.pct != null ? Math.round(exp.pct) : null) : null,
  };

  return { anomalies, signals };
}

/**
 * narrateAnomalies — ส่ง summary signals เข้า AI ให้เรียง+อธิบายเป็นภาษาไทย
 * - input = signals JSON ตัวเลขล้วน (ไม่ส่ง raw rows) → กัน prompt-injection + input เล็ก
 * - ไม่มี anomaly → ข้าม AI (return null, cost 0)
 * - AI fail/parse error → return null (graceful)
 */
export async function narrateAnomalies(result: CloseCheckResult): Promise<Narration | null> {
  if (result.anomalies.length === 0) return null; // งวดสะอาด → ข้าม AI

  const systemPrompt = await loadPrompt("acc-close-check");
  const ai = await aiChat(
    [
      { role: "system", content: systemPrompt },
      { role: "user", content: JSON.stringify({ signals: result.signals }) },
    ],
    { model: "gpt-4o-mini", jsonMode: true, temperature: 0, maxTokens: 800 },
  );
  if (!ai) return null; // AI fail → rule-only

  let parsed: { narration?: unknown; priority?: unknown };
  try {
    parsed = JSON.parse(ai.text);
  } catch {
    return null;
  }
  const narration = typeof parsed.narration === "string" ? parsed.narration : "";
  if (!narration) return null;
  const priority = Array.isArray(parsed.priority)
    ? parsed.priority.filter((p): p is string => typeof p === "string")
    : [];

  return {
    narration,
    priority,
    meta: { model: ai.model, inputTokens: ai.inputTokens, outputTokens: ai.outputTokens },
  };
}
