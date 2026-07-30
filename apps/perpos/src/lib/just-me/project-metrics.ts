/**
 * just_me project loop — **สูตรเงินทั้งหมดของโมดูลอยู่ไฟล์นี้ไฟล์เดียว**
 * contract §8 · ห้ามหน้า/route/รายงานคำนวณเอง (บทเรียน mattii/nursing_home/bi: สูตรกระจาย → การ์ดขัดกัน)
 *
 * หลักที่ห้ามพัง:
 *  1. **ไม่มีข้อมูล = `null` ไม่ใช่ 0** — 0 แปลว่า "มีข้อมูลและเป็นศูนย์จริง"
 *  2. อัตราส่วนที่ตัวหารเป็น 0/null → คืน `null` (ห้ามคืน 100%)
 *  3. ตัวเลขประมาณการ (forecast*) ต้องถูกแสดงพร้อมป้าย ≈ ที่ฝั่ง UI
 *  4. KPI รวมข้ามโครงการตัด `cancelled`/`lost` ออกเสมอ
 *  5. ยอดเงินฝั่งขาย/รับเงินจริง อ่านจาก accounting เท่านั้น — ที่นี่คิดได้แค่ "ยอดที่วางบิลไปแล้ว" ตามงวดงาน
 */

import {
  ACTIVE_PROJECT_STATUSES,
  type JustMeBoqItem,
  type JustMeProject,
  type JustMeProjectBilling,
  type JustMeProjectCost,
  type JustMeProjectProgress,
  type JustMePrItem,
  type JustMePurchaseRequest,
  type JustMeProjectUsageRow,
  type MarginSource,
  type ProjectStatus,
} from "./types";

// ─── ตัวช่วยพื้นฐาน ──────────────────────────────────────────────────────────
const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

/** บวกเฉพาะค่าที่เป็นตัวเลข — ไม่มีค่าเลยคืน null (ไม่ใช่ 0) */
export function sumDefined(values: (number | null | undefined)[]): number | null {
  const nums = values.filter(isNum);
  if (nums.length === 0) return null;
  return nums.reduce((a, b) => a + b, 0);
}

/** ปัดทศนิยม 2 ตำแหน่งแบบกันลอยจุด (ใช้กับยอดเงินที่คำนวณต่อ) */
export function round2(v: number): number {
  return Math.round((v + Number.EPSILON) * 100) / 100;
}

// ─── margin 4 ชั้น ───────────────────────────────────────────────────────────
export interface MarginLayers {
  /** ตั้งมือบนบรรทัด BOQ */
  item?: number | null;
  /** จาก price book ของรายการนั้น */
  priceBook?: number | null;
  /** default ของหมวดงาน */
  category?: number | null;
  /** override ระดับโครงการ */
  project?: number | null;
  /** ค่าเริ่มต้นบริษัท (just_me_settings) */
  company?: number | null;
}

/**
 * resolve margin — **เฉพาะเจาะจงกว่าชนะ**: บรรทัด → รายการ(price book) → หมวดงาน → โครงการ → บริษัท
 * คืน `source` มาด้วยเสมอ เพื่อให้ UI บอกผู้ใช้ได้ว่าราคานี้มาจากกฎชั้นไหน
 */
export function resolveMargin(layers: MarginLayers): { pct: number; source: MarginSource } {
  if (isNum(layers.item)) return { pct: layers.item, source: "item" };
  if (isNum(layers.priceBook)) return { pct: layers.priceBook, source: "item" };
  if (isNum(layers.category)) return { pct: layers.category, source: "category" };
  if (isNum(layers.project)) return { pct: layers.project, source: "project" };
  if (isNum(layers.company)) return { pct: layers.company, source: "company" };
  return { pct: 0, source: "company" };
}

// ─── ราคาต่อหน่วยของบรรทัด BOQ ──────────────────────────────────────────────
export interface UnitCostParts {
  material: number;
  labor: number;
  overhead: number;
}

/** ต้นทุนรวมต่อหน่วย = วัสดุ + ค่าแรงติดตั้ง + ค่าดำเนินการ */
export function unitCostTotal(parts: UnitCostParts): number {
  return round2((parts.material ?? 0) + (parts.labor ?? 0) + (parts.overhead ?? 0));
}

/** ราคาขายต่อหน่วย = ต้นทุนรวม × (1 + margin%) */
export function unitPrice(parts: UnitCostParts, marginPct: number): number {
  return round2(unitCostTotal(parts) * (1 + (marginPct ?? 0) / 100));
}

/** คิดยอดของบรรทัด BOQ ให้ครบชุด (ต้นทุนรวม / ราคาขาย / ยอดขาย) */
export function boqLineTotals(qty: number, parts: UnitCostParts, marginPct: number) {
  const cost = unitCostTotal(parts);
  const price = unitPrice(parts, marginPct);
  return {
    unit_cost: cost,
    unit_price: price,
    cost_amount: round2(cost * qty),
    amount: round2(price * qty),
  };
}

/** ยอดรวมของทั้ง BOQ (ใช้ตอน approve → เขียน baseline ลงโครงการ) */
export function boqTotals(items: Pick<JustMeBoqItem, "amount" | "cost_amount">[]): {
  total_amount: number | null;
  total_cost: number | null;
  counted: number;
} {
  if (items.length === 0) return { total_amount: null, total_cost: null, counted: 0 };
  return {
    total_amount: round2(items.reduce((s, i) => s + (i.amount ?? 0), 0)),
    total_cost: round2(items.reduce((s, i) => s + (i.cost_amount ?? 0), 0)),
    counted: items.length,
  };
}

// ─── ต้นทุนจริง / ผูกพัน ────────────────────────────────────────────────────
/**
 * ต้นทุนจริง = มูลค่าวัสดุที่ **เบิกใช้** จากคลังเข้าโครงการ (movement `issue`)
 *              + ต้นทุนที่ไม่ผ่านคลัง (ค่าแรง/ผู้รับเหมาช่วง/ขนส่ง)
 * หมายเหตุ: `receive`/`transfer`/`return` ไม่นับ — ของยังอยู่ในคลัง ไม่ได้ลงหน้างาน
 * คืน `counted` เพื่อให้การ์ดบอกฐานที่นับได้ (§8 กฎ 6)
 */
export function actualCost(
  usage: Pick<JustMeProjectUsageRow, "movement_type" | "total_cost">[],
  otherCosts: Pick<JustMeProjectCost, "amount">[],
): { value: number; counted: number } {
  const issued = usage.filter((u) => u.movement_type === "issue");
  const material = issued.reduce((s, u) => s + (u.total_cost ?? 0), 0);
  const other = otherCosts.reduce((s, c) => s + (c.amount ?? 0), 0);
  return { value: round2(material + other), counted: issued.length + otherCosts.length };
}

const COMMITTED_PR_STATUSES = new Set(["approved", "ordered", "partially_received"]);

/**
 * ต้นทุนผูกพัน = ของที่อนุมัติ/สั่งซื้อแล้วแต่ยังไม่ได้รับ
 * = Σ (qty − received_qty) × (ราคาที่เลือก ?? ราคาประเมิน) ของ PR ที่ยัง live
 * ⚠️ ต้องนับ **แยกจากต้นทุนจริง** — ถ้าเอามารวมกันจะนับซ้ำตอนของเข้าคลังแล้วเบิกใช้
 */
export function committedCost(
  prs: Pick<JustMePurchaseRequest, "id" | "status">[],
  items: Pick<
    JustMePrItem,
    "pr_id" | "qty" | "received_qty" | "selected_unit_cost" | "estimated_unit_cost"
  >[],
): { value: number; counted: number } {
  const liveIds = new Set(prs.filter((p) => COMMITTED_PR_STATUSES.has(p.status)).map((p) => p.id));
  let value = 0;
  let counted = 0;
  for (const it of items) {
    if (!liveIds.has(it.pr_id)) continue;
    const remaining = Math.max((it.qty ?? 0) - (it.received_qty ?? 0), 0);
    if (remaining <= 0) continue;
    const unit = isNum(it.selected_unit_cost)
      ? it.selected_unit_cost
      : isNum(it.estimated_unit_cost)
        ? it.estimated_unit_cost
        : null;
    if (unit === null) continue;
    value += remaining * unit;
    counted += 1;
  }
  return { value: round2(value), counted };
}

// ─── ความคืบหน้า ────────────────────────────────────────────────────────────
/**
 * %คืบหน้า ถ่วงน้ำหนักด้วย **ราคาขายของบรรทัด** (งานที่มูลค่าสูงมีน้ำหนักมากกว่า)
 * - บรรทัดที่บันทึกเป็นปริมาณ → min(done_qty, qty)/qty
 * - บรรทัดที่วัดปริมาณไม่ได้ → ใช้ percent/100
 * - **ยังไม่มีบันทึกเลย → null** (ห้ามคืน 0% — ผู้ใช้จะอ่านว่า "ยังไม่ได้เริ่ม" ทั้งที่แค่ยังไม่บันทึก)
 */
export function progressPct(
  items: Pick<JustMeBoqItem, "id" | "qty" | "amount">[],
  progress: Pick<
    JustMeProjectProgress,
    "boq_item_id" | "progress_date" | "done_qty" | "percent" | "created_at"
  >[],
): number | null {
  if (items.length === 0) return null;

  // เอาบันทึกล่าสุดต่อบรรทัด (progress_date ล่าสุด, tie-break ด้วย created_at)
  const latest = new Map<
    string,
    { done_qty: number | null; percent: number | null; key: string }
  >();
  for (const p of progress) {
    if (!p.boq_item_id) continue;
    const key = `${p.progress_date ?? ""}#${p.created_at ?? ""}`;
    const cur = latest.get(p.boq_item_id);
    if (!cur || key > cur.key) {
      latest.set(p.boq_item_id, { done_qty: p.done_qty, percent: p.percent, key });
    }
  }
  if (latest.size === 0) return null;

  const totalWeight = items.reduce((s, i) => s + (i.amount ?? 0), 0);
  if (totalWeight <= 0) return null;

  let done = 0;
  for (const item of items) {
    const rec = latest.get(item.id);
    if (!rec) continue;
    let ratio: number | null = null;
    if (isNum(rec.done_qty) && isNum(item.qty) && item.qty > 0) {
      ratio = Math.min(rec.done_qty / item.qty, 1);
    } else if (isNum(rec.percent)) {
      ratio = Math.min(Math.max(rec.percent, 0), 100) / 100;
    }
    if (ratio === null) continue;
    done += ratio * (item.amount ?? 0);
  }
  return Math.min(done / totalWeight, 1);
}

// ─── สรุปเงินของโครงการ ─────────────────────────────────────────────────────
export interface ProjectMoneySummary {
  contract_amount: number | null;
  budget_cost: number | null;
  actual_cost: number;
  actual_counted: number;
  committed_cost: number;
  progress_pct: number | null;
  /** ประมาณการต้นทุนทั้งโครงการ — ส่วนที่ยังไม่ทำตีด้วยงบ */
  forecast_cost: number | null;
  forecast_profit: number | null;
  forecast_margin_pct: number | null;
  /** ใช้เมื่อปิดงานแล้วเท่านั้น (completed/closed) */
  actual_profit: number | null;
  /** บวก = ใช้เกินงบ */
  cost_variance: number | null;
  billed_amount: number;
  unbilled_amount: number | null;
  over_budget: boolean;
}

export function summarizeProject(input: {
  project: Pick<JustMeProject, "status" | "contract_amount" | "budget_cost">;
  usage: Pick<JustMeProjectUsageRow, "movement_type" | "total_cost">[];
  otherCosts: Pick<JustMeProjectCost, "amount">[];
  prs: Pick<JustMePurchaseRequest, "id" | "status">[];
  prItems: Pick<
    JustMePrItem,
    "pr_id" | "qty" | "received_qty" | "selected_unit_cost" | "estimated_unit_cost"
  >[];
  boqItems: Pick<JustMeBoqItem, "id" | "qty" | "amount">[];
  progress: Pick<
    JustMeProjectProgress,
    "boq_item_id" | "progress_date" | "done_qty" | "percent" | "created_at"
  >[];
  billings: Pick<JustMeProjectBilling, "amount" | "status">[];
}): ProjectMoneySummary {
  const { project } = input;
  const actual = actualCost(input.usage, input.otherCosts);
  const committed = committedCost(input.prs, input.prItems);
  const progress = progressPct(input.boqItems, input.progress);

  const budget = isNum(project.budget_cost) ? project.budget_cost : null;
  const contract = isNum(project.contract_amount) ? project.contract_amount : null;

  // งานส่วนที่ยังไม่ทำ ตีด้วยงบ (ถ้ายังไม่รู้ความคืบหน้า ถือว่ายังไม่ได้ทำ → ตีเต็มงบที่เหลือ)
  const remainingRatio = progress === null ? 1 : Math.max(1 - progress, 0);
  const forecastCost =
    budget === null ? null : round2(actual.value + committed.value + budget * remainingRatio);

  const forecastProfit =
    contract === null || forecastCost === null ? null : round2(contract - forecastCost);
  const forecastMargin =
    forecastProfit === null || contract === null || contract === 0
      ? null
      : forecastProfit / contract;

  const closed = project.status === "completed" || project.status === "closed";
  const actualProfit = closed && contract !== null ? round2(contract - actual.value) : null;

  const variance = budget === null ? null : round2(actual.value + committed.value - budget);

  const billed = round2(
    input.billings
      .filter((b) => b.status === "invoiced" || b.status === "paid")
      .reduce((s, b) => s + (b.amount ?? 0), 0),
  );

  return {
    contract_amount: contract,
    budget_cost: budget,
    actual_cost: actual.value,
    actual_counted: actual.counted,
    committed_cost: committed.value,
    progress_pct: progress,
    forecast_cost: forecastCost,
    forecast_profit: forecastProfit,
    forecast_margin_pct: forecastMargin,
    actual_profit: actualProfit,
    cost_variance: variance,
    billed_amount: billed,
    unbilled_amount: contract === null ? null : round2(contract - billed),
    over_budget: variance !== null && variance > 0,
  };
}

// ─── งวดงาน ─────────────────────────────────────────────────────────────────
/**
 * ยอดงวดงานที่วางแผนไว้รวม (ไม่นับที่ยกเลิก) — ใช้กันไม่ให้วางบิลเกินมูลค่าสัญญา
 * คืน `remaining` = สัญญา − ที่วางแผนไว้แล้ว (null ถ้ายังไม่มีสัญญา)
 */
export function billingPlanTotals(
  contractAmount: number | null,
  billings: Pick<JustMeProjectBilling, "amount" | "status">[],
): { planned: number; remaining: number | null; exceeds: boolean } {
  const planned = round2(
    billings.filter((b) => b.status !== "cancelled").reduce((s, b) => s + (b.amount ?? 0), 0),
  );
  if (!isNum(contractAmount)) return { planned, remaining: null, exceeds: false };
  const remaining = round2(contractAmount - planned);
  return { planned, remaining, exceeds: remaining < -0.005 };
}

/**
 * เงินประกันผลงานของงวด = ยอดงวด × %ที่ตั้งไว้ต่อโครงการ
 * ไม่ได้ตั้ง % ไว้ (null) → **0** (โครงการที่ไม่มีเงินประกัน = ไม่หัก ไม่ใช่ "ไม่รู้")
 */
export function billingRetentionAmount(amount: number | null, retentionPct: number | null): number {
  if (!isNum(amount) || !isNum(retentionPct) || retentionPct <= 0) return 0;
  return round2((amount * retentionPct) / 100);
}

/** แปลง % ของสัญญา → จำนวนเงินงวด (null ถ้ายังไม่มีมูลค่าสัญญา) */
export function billingAmountFromPercent(
  contractAmount: number | null,
  percent: number | null,
): number | null {
  if (!isNum(contractAmount) || !isNum(percent)) return null;
  return round2((contractAmount * percent) / 100);
}

// ─── เตือนราคาซื้อขยับ (price book) ─────────────────────────────────────────
/**
 * ราคาซื้อจริงขยับจากฐานที่รับทราบไว้เกินเกณฑ์หรือยัง
 * - ไม่มีฐาน (`baseline`) → ยังไม่เคยรับทราบ ⇒ ไม่เตือน (ไม่ใช่ "ขยับ 100%")
 * - คืน `pct` เป็น % ที่เปลี่ยน (บวก = แพงขึ้น)
 */
export function costDrift(
  currentCost: number | null,
  baseline: number | null,
  alertPct: number,
): { pct: number | null; alert: boolean } {
  if (!isNum(currentCost) || !isNum(baseline) || baseline === 0) return { pct: null, alert: false };
  const pct = ((currentCost - baseline) / baseline) * 100;
  return { pct, alert: Math.abs(pct) >= (alertPct ?? 0) };
}

// ─── ต้นทุนวัสดุที่ใช้จริงของ price book (auto/manual) ──────────────────────
/**
 * ต้นทุนวัสดุต่อหน่วยที่จะใช้คิดราคา
 * - โหมด `manual` → ใช้ค่าที่ตั้งไว้
 * - โหมด `auto` → ใช้ต้นทุนเฉลี่ยถ่วงน้ำหนักจากคลัง (`just_me_item_costs.avg_cost`)
 *   ถ้าคลังยังไม่มีต้นทุน (ยังไม่เคยซื้อ) → **null** ไม่ใช่ 0 (ราคาขาย 0 คือราคาผิด)
 */
export function effectiveMaterialCost(row: {
  material_cost_mode: string;
  material_unit_cost_manual: number | null;
  avg_cost?: number | null;
}): number | null {
  if (row.material_cost_mode === "manual") {
    return isNum(row.material_unit_cost_manual) ? row.material_unit_cost_manual : null;
  }
  return isNum(row.avg_cost) ? row.avg_cost : null;
}

// ─── จัดซื้อ (ยอดบนใบขอซื้อ/ใบเสนอราคาผู้ขาย) ───────────────────────────────
/**
 * ยอดรวมของใบขอซื้อ — **ยอดทั้งสองช่องคำนวณที่นี่เท่านั้น ห้ามรับจาก body**
 * - `total_estimated_cost` = Σ qty × ราคาประเมิน · `total_selected_cost` = Σ qty × ราคาที่เลือก
 * - ไม่มีบรรทัดไหนมีราคาเลย → `null` (ไม่ใช่ 0 — 0 แปลว่า "ของฟรี")
 */
export function prTotals(
  items: Pick<JustMePrItem, "qty" | "estimated_unit_cost" | "selected_unit_cost">[],
): { total_estimated_cost: number | null; total_selected_cost: number | null } {
  const est = sumDefined(
    items.map((i) => (isNum(i.estimated_unit_cost) ? (i.qty ?? 0) * i.estimated_unit_cost : null)),
  );
  const sel = sumDefined(
    items.map((i) => (isNum(i.selected_unit_cost) ? (i.qty ?? 0) * i.selected_unit_cost : null)),
  );
  return {
    total_estimated_cost: est === null ? null : round2(est),
    total_selected_cost: sel === null ? null : round2(sel),
  };
}

/**
 * ยอดรวมของใบเสนอราคาผู้ขาย 1 ใบ (จากบรรทัดราคาที่ผู้ขายเสนอ)
 * บรรทัดที่ผู้ขายไม่ได้เสนอราคา (unit_cost = null) ไม่ถูกนับ · ไม่มีเลย → `null`
 */
export function quoteTotal(
  lines: { unit_cost: number | null; qty: number | null }[],
): number | null {
  const total = sumDefined(
    lines.map((l) => (isNum(l.unit_cost) && isNum(l.qty) ? l.unit_cost * l.qty : null)),
  );
  return total === null ? null : round2(total);
}

// ─── เทียบราคาผู้ขาย (ตารางเทียบ + สรุปให้ AI เรียบเรียง) ───────────────────
export interface VendorQuoteCompareVendor {
  quote_id: string;
  vendor_name: string;
  status: string;
  total_amount: number | null;
  delivery_days: number | null;
  credit_terms: string | null;
  /** เสนอราคามากี่บรรทัดจากทั้งหมด */
  priced_lines: number;
  /** ชนะราคาต่ำสุดกี่บรรทัด */
  cheapest_lines: number;
}

export interface VendorQuoteCompareLine {
  pr_item_id: string;
  name: string;
  unit: string;
  qty: number;
  cheapest_quote_id: string | null;
  cheapest_vendor_name: string | null;
  cheapest_unit_cost: number | null;
  /** ส่วนต่างต่อหน่วย แพงสุด − ถูกสุด · null = มีราคาน้อยกว่า 2 เจ้า (เทียบไม่ได้) */
  spread: number | null;
}

export interface VendorQuoteComparison {
  line_count: number;
  vendors: VendorQuoteCompareVendor[];
  /** เรียงจากส่วนต่างมากไปน้อย (บรรทัดที่ตัดสินใจแล้วประหยัดได้มากที่สุดอยู่บน) */
  lines: VendorQuoteCompareLine[];
  cheapest_quote_id: string | null;
  cheapest_vendor_name: string | null;
  cheapest_total: number | null;
  /** ยอดรวมแพงสุด − ถูกสุด · null = มีเจ้าที่เทียบได้น้อยกว่า 2 */
  total_spread: number | null;
  unpriced_line_names: string[];
}

/**
 * เทียบใบเสนอราคาหลายเจ้าของ PR หนึ่งใบ — **derive อย่างเดียว ไม่ตัดสินใจแทนคน**
 * กติกา "ไม่มีข้อมูล = null": เจ้าที่ไม่ได้เสนอราคาบรรทัดนั้นถูกข้าม ไม่ตีเป็น 0
 */
export function compareVendorQuotes(input: {
  items: { id: string; name: string; unit: string; qty: number }[];
  quotes: {
    id: string;
    vendor_name: string;
    status: string;
    total_amount: number | null;
    delivery_days: number | null;
    credit_terms: string | null;
  }[];
  quoteItems: { quote_id: string; pr_item_id: string; unit_cost: number | null }[];
}): VendorQuoteComparison {
  const priceOf = new Map<string, number>();
  for (const line of input.quoteItems) {
    if (isNum(line.unit_cost)) priceOf.set(`${line.quote_id}#${line.pr_item_id}`, line.unit_cost);
  }

  const pricedCount = new Map<string, number>();
  const winCount = new Map<string, number>();
  const unpriced: string[] = [];

  const lines: VendorQuoteCompareLine[] = input.items.map((item) => {
    const offers = input.quotes
      .map((q) => ({ quote: q, cost: priceOf.get(`${q.id}#${item.id}`) }))
      .filter((o): o is { quote: (typeof input.quotes)[number]; cost: number } => isNum(o.cost));

    for (const o of offers) pricedCount.set(o.quote.id, (pricedCount.get(o.quote.id) ?? 0) + 1);
    if (offers.length === 0) {
      unpriced.push(item.name);
      return {
        pr_item_id: item.id,
        name: item.name,
        unit: item.unit,
        qty: item.qty,
        cheapest_quote_id: null,
        cheapest_vendor_name: null,
        cheapest_unit_cost: null,
        spread: null,
      };
    }

    const costs = offers.map((o) => o.cost);
    const min = Math.min(...costs);
    const max = Math.max(...costs);
    const winner = offers.find((o) => o.cost === min)!;
    winCount.set(winner.quote.id, (winCount.get(winner.quote.id) ?? 0) + 1);

    return {
      pr_item_id: item.id,
      name: item.name,
      unit: item.unit,
      qty: item.qty,
      cheapest_quote_id: winner.quote.id,
      cheapest_vendor_name: winner.quote.vendor_name,
      cheapest_unit_cost: round2(min),
      spread: offers.length >= 2 ? round2(max - min) : null,
    };
  });

  const vendors: VendorQuoteCompareVendor[] = input.quotes.map((q) => ({
    quote_id: q.id,
    vendor_name: q.vendor_name,
    status: q.status,
    total_amount: isNum(q.total_amount) ? q.total_amount : null,
    delivery_days: isNum(q.delivery_days) ? q.delivery_days : null,
    credit_terms: q.credit_terms,
    priced_lines: pricedCount.get(q.id) ?? 0,
    cheapest_lines: winCount.get(q.id) ?? 0,
  }));

  const comparable = vendors.filter((v) => v.total_amount !== null);
  const totals = comparable.map((v) => v.total_amount as number);
  const cheapest =
    totals.length > 0 ? comparable.find((v) => v.total_amount === Math.min(...totals))! : null;

  return {
    line_count: input.items.length,
    vendors,
    lines: [...lines].sort((a, b) => (b.spread ?? -1) - (a.spread ?? -1)),
    cheapest_quote_id: cheapest?.quote_id ?? null,
    cheapest_vendor_name: cheapest?.vendor_name ?? null,
    cheapest_total: cheapest?.total_amount ?? null,
    total_spread: totals.length >= 2 ? round2(Math.max(...totals) - Math.min(...totals)) : null,
    unpriced_line_names: unpriced,
  };
}

// ─── รวมข้ามโครงการ (หน้ารายงาน) ────────────────────────────────────────────
export interface PortfolioSummary {
  projects_counted: number;
  contract_total: number | null;
  budget_total: number | null;
  actual_total: number;
  committed_total: number;
  over_budget_count: number;
  unbilled_total: number | null;
}

/** ตัด cancelled/lost ออกเสมอ (§8 กฎ 4) */
export function isCountedProject(status: ProjectStatus): boolean {
  return ACTIVE_PROJECT_STATUSES.includes(status);
}

export function summarizePortfolio(
  rows: { status: ProjectStatus; summary: ProjectMoneySummary }[],
): PortfolioSummary {
  const counted = rows.filter((r) => isCountedProject(r.status));
  const contract = sumDefined(counted.map((r) => r.summary.contract_amount));
  const budget = sumDefined(counted.map((r) => r.summary.budget_cost));
  const unbilled = sumDefined(counted.map((r) => r.summary.unbilled_amount));
  return {
    projects_counted: counted.length,
    contract_total: contract === null ? null : round2(contract),
    budget_total: budget === null ? null : round2(budget),
    actual_total: round2(counted.reduce((s, r) => s + r.summary.actual_cost, 0)),
    committed_total: round2(counted.reduce((s, r) => s + r.summary.committed_cost, 0)),
    over_budget_count: counted.filter((r) => r.summary.over_budget).length,
    unbilled_total: unbilled === null ? null : round2(unbilled),
  };
}
