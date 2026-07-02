// ai-mocks.ts — canned AI responses (mock เท่านั้น ไม่เรียก API จริง — spec §5b RESOLVED)
// สถาปัตยกรรม: "rule คำนวณ signals ก่อน → AI narrate" — ตัวเลขทุกตัวตรงกับ orders.ts (ห้ามแต่งเลข)
//
// ที่มาตัวเลข (ยืนยันกับ orders.ts, today = 2026-07-01):
//   pipeline value (sum price_incl_vat, 27 orders) = 2,406,359 ฿
//   split: 89 Global Work = 1,879,696 ฿ (17 งาน) · P2P Supply = 526,663 ฿ (10 งาน)
//   by stage (count/value price_incl_vat):
//     quotation = 9 งาน (16,20,21,22,23,24,25,26,27) = 24000+24000+39436+52000+60000+54960+71700+39998+0 = 366,094
//     contracted = 1 งาน (17) = 581,400
//     procuring = 1 งาน (18) = 325,000
//     delivered = 4 งาน (5,8,13,14) = 226745+10920+44000+19000 = 300,665
//     paid = 11 งาน (1,2,3,4,6,7,9,10,11,12,15) = 27900+77400+10500+13000+11600+117600+18300+70500+161500+26400+23500 = 558,200
//     closed = 1 งาน (19) = 275,000
//   net_profit_89 รวม 27 งาน = 333,681.64 ฿ · realized (paid+closed) = 104,668.86 ฿ · pending (อื่น) = 229,012.78 ฿
//   เงินค้างรับ (stage=delivered, net_receivable): 4 งาน รวม 297,855.05 ฿ (records 5,8,13,14)
//     overdue (aging>30, SLA=30): 2 งาน — gp-013 (aging 43 วัน, 43,588.79 ฿) + gp-014 (aging 48 วัน, 18,822.43 ฿)
//     ไม่ overdue: gp-005 (aging 23 วัน) + gp-008 (aging 26 วัน)
//   top overdue: gp-014 (เครื่องตัดหญ้า, กองศึกษาฯ, P2P) aging 48 วัน · gp-013 (โทรศัพท์เคลื่อนที่, กองสาธารณสุข, 89) aging 43 วัน

import {
  deriveAgingDays,
  isOverdue,
  type GovProcureOrder,
  type GovProcureSettings,
} from "./types";
import { GOV_PROCURE_ORDERS } from "./orders";
import {
  pipelineValue,
  profitSplit,
  receivableSummary,
  pipelineByStage,
} from "../_components/money";
import { fmtMoney, fmtNum, TODAY_DATE } from "../_components/format";

// ---- AI-1: Executive Brief (spec §5b — สรุปพอร์ตภาษาคน) ----

export interface GovProcureAiBrief {
  narration: string;
  highlights: string[];
  focus: string[];
  generated_at: string;
  confidence: number;
}

/**
 * AI_BRIEF_MOCK = snapshot คงที่ (ค่า seed ตอนเริ่ม) — ใช้เป็น fallback/อ้างอิงสไตล์ข้อความ
 * หน้าจริง (dashboard) ใช้ buildLiveBrief(orders, sla) เพื่อให้ตัวเลข brief ตรง KPI สดหลัง mutation
 */
export const AI_BRIEF_MOCK: GovProcureAiBrief = {
  narration:
    "พอร์ตงานจัดซื้อภาครัฐตอนนี้มี 27 งาน มูลค่ารวม 2,406,359.00 ฿ แบ่งเป็น 89 Global Work 1,879,696.00 ฿ (17 งาน) และ P2P Supply 526,663.00 ฿ (10 งาน) กำไรสุทธิรับรู้แล้ว (รับเช็ค/ปิดงาน) 104,668.86 ฿ ยังรอรับรู้อีก 229,012.78 ฿ จาก 15 งานที่ยังไม่ปิด " +
    "จุดที่ต้องระวังที่สุดตอนนี้คือเงินค้างรับ 297,855.05 ฿ จาก 4 งานที่ส่งของแล้วแต่ยังไม่รับเช็ค โดย 2 งานเกินกำหนด SLA 30 วันแล้ว (รวม 62,411.21 ฿) ควรเร่งทวงกับเทศบาลเมืองบางแก้วก่อนเงินจมนานขึ้น " +
    "ฝั่ง pipeline ยังมีงานเสนอราคาค้างอยู่ 9 งาน (366,094.00 ฿) ที่ยังไม่เซ็นสัญญา ควรติดตามผลประมูล/เร่งเซ็นสัญญาต่อ",
  highlights: [
    "มูลค่าพอร์ตรวม 2,406,359.00 ฿ · 27 งาน (89: 1,879,696.00 ฿ · P2P: 526,663.00 ฿)",
    "กำไรสุทธิ realized 104,668.86 ฿ · pending 229,012.78 ฿ (15 งานยังไม่ปิด)",
    "เงินค้างรับ 297,855.05 ฿ (4 งาน) — เกิน SLA แล้ว 2 งาน รวม 62,411.21 ฿",
    "งานเสนอราคาค้างอยู่ 9 งาน มูลค่า 366,094.00 ฿ รอเซ็นสัญญา",
  ],
  focus: [
    "ทวงเงิน gp-014 (เครื่องตัดหญ้า 4 จังหวะ, กองศึกษาฯ) — เกินกำหนด 48 วัน มูลค่าค้างรับ 18,822.43 ฿",
    "ทวงเงิน gp-013 (โทรศัพท์เคลื่อนที่, กองสาธารณสุข) — เกินกำหนด 43 วัน มูลค่าค้างรับ 43,588.79 ฿",
    "ตรวจสอบงานกำไรต่ำ/ผิดปกติ 7 งาน (profit_pct ต่ำกว่า 3% หรือกำไรสุทธิ 0 ฿) — ดู AI-2 อธิบายรายละเอียด",
  ],
  generated_at: "2026-07-01T09:00:00Z",
  confidence: 0.9,
};

/**
 * buildLiveBrief — ประกอบ Executive Brief จาก orders สด (ตัวเลขจาก rule helper ใน money.ts)
 * ข้อความคงสไตล์เดิม แต่ทุกตัวเลข derive จาก orders ปัจจุบัน → หลัง user สร้าง/เลื่อน/ปรับ SLA
 * brief ไม่ drift ชน KPI สด · จำนวนงานผิดปกติใช้ count จริงจาก detectAnomalyOrderIds (ไม่ตายตัว)
 */
export function buildLiveBrief(
  orders: GovProcureOrder[],
  slaThreshold: number,
): GovProcureAiBrief {
  const pipeline = pipelineValue(orders);
  const profit = profitSplit(orders);
  const recv = receivableSummary(orders, slaThreshold, TODAY_DATE);
  const byStage = pipelineByStage(orders);

  const co89 = orders.filter((o) => o.company === "89 Global Work");
  const coP2P = orders.filter((o) => o.company === "P2P Supply");
  const val89 = pipelineValue(co89);
  const valP2P = pipelineValue(coP2P);

  const pendingCount = orders.filter(
    (o) => o.stage !== "paid" && o.stage !== "closed",
  ).length;

  const quotation = byStage.find((s) => s.stage === "quotation");
  const quotationCount = quotation?.count ?? 0;
  const quotationValue = quotation?.value ?? 0;

  const anomalyCount = detectAnomalyOrderIds(orders).length;

  // top overdue (aging มาก→น้อย) — receivableSummary.list เรียง aging desc แล้ว
  const overdueList = recv.list.filter((r) => r.overdue);

  const narration =
    `พอร์ตงานจัดซื้อภาครัฐตอนนี้มี ${fmtNum(orders.length)} งาน มูลค่ารวม ${fmtMoney(pipeline)} ` +
    `แบ่งเป็น 89 Global Work ${fmtMoney(val89)} (${fmtNum(co89.length)} งาน) และ P2P Supply ${fmtMoney(valP2P)} (${fmtNum(coP2P.length)} งาน) ` +
    `กำไรสุทธิรับรู้แล้ว (รับเช็ค/ปิดงาน) ${fmtMoney(profit.realized)} ยังรอรับรู้อีก ${fmtMoney(profit.pending)} จาก ${fmtNum(pendingCount)} งานที่ยังไม่ปิด ` +
    (recv.list.length > 0
      ? `จุดที่ต้องระวังที่สุดตอนนี้คือเงินค้างรับ ${fmtMoney(recv.totalAmount)} จาก ${fmtNum(recv.list.length)} งานที่ส่งของแล้วแต่ยังไม่รับเช็ค` +
        (recv.overdueCount > 0
          ? ` โดย ${fmtNum(recv.overdueCount)} งานเกินกำหนด SLA ${fmtNum(slaThreshold)} วันแล้ว (รวม ${fmtMoney(recv.overdueAmount)}) ควรเร่งทวงก่อนเงินจมนานขึ้น `
          : ` แต่ยังอยู่ในกำหนด SLA ${fmtNum(slaThreshold)} วันทั้งหมด `)
      : `ตอนนี้ไม่มีงานที่ส่งของแล้วค้างรับเช็ค cashflow อยู่ในเกณฑ์ดี `) +
    (quotationCount > 0
      ? `ฝั่ง pipeline ยังมีงานเสนอราคาค้างอยู่ ${fmtNum(quotationCount)} งาน (${fmtMoney(quotationValue)}) ที่ยังไม่เซ็นสัญญา ควรติดตามผลประมูล/เร่งเซ็นสัญญาต่อ`
      : `ฝั่ง pipeline ไม่มีงานเสนอราคาค้างอยู่ในตอนนี้`);

  const highlights = [
    `มูลค่าพอร์ตรวม ${fmtMoney(pipeline)} · ${fmtNum(orders.length)} งาน (89: ${fmtMoney(val89)} · P2P: ${fmtMoney(valP2P)})`,
    `กำไรสุทธิ realized ${fmtMoney(profit.realized)} · pending ${fmtMoney(profit.pending)} (${fmtNum(pendingCount)} งานยังไม่ปิด)`,
    recv.list.length > 0
      ? `เงินค้างรับ ${fmtMoney(recv.totalAmount)} (${fmtNum(recv.list.length)} งาน) — เกิน SLA แล้ว ${fmtNum(recv.overdueCount)} งาน รวม ${fmtMoney(recv.overdueAmount)}`
      : `ไม่มีเงินค้างรับเกินกำหนด — งานส่งของแล้วรับเช็คครบ`,
    `งานเสนอราคาค้างอยู่ ${fmtNum(quotationCount)} งาน มูลค่า ${fmtMoney(quotationValue)} รอเซ็นสัญญา`,
  ];

  const focus: string[] = [];
  for (const r of overdueList.slice(0, 2)) {
    focus.push(
      `ทวงเงิน ${r.order.qt_reference ?? r.order.product_description ?? "งาน"} (${r.order.department ?? "ไม่ระบุกอง"}) — เกินกำหนด ${fmtNum(r.agingDays)} วัน มูลค่าค้างรับ ${fmtMoney(r.amount)}`,
    );
  }
  if (anomalyCount > 0) {
    focus.push(
      `ตรวจสอบงานกำไรต่ำ/ผิดปกติ ${fmtNum(anomalyCount)} งาน (กำไรบาง/ทุนสูงเกินราคาขาย) — ดู AI-2 อธิบายรายละเอียดรายงาน`,
    );
  }
  if (focus.length === 0) {
    focus.push("ยังไม่มีงานเร่งด่วนที่ต้องจัดการเป็นพิเศษในตอนนี้ — ติดตาม pipeline ตามปกติ");
  }

  return {
    narration,
    highlights,
    focus,
    generated_at: TODAY_DATE.toISOString(),
    confidence: 0.9,
  };
}

// ---- AI-2: Anomaly / Margin Guard (spec §5b — rule detect ก่อน, AI narrate) ----

export interface GovProcureAnomaly {
  order_id: string;
  severity: "low" | "medium" | "high";
  reason: string;
  checks: string[];
  confidence: number;
}

/**
 * rule detect (ทำได้ฟรีไม่ต้องเรียก AI): profit_pct < 3% หรือ net_profit_89 <= 0
 * หรือ total_cost_89/price_incl_vat > 0.9 — ใช้ตรวจ flag order ก่อนกด "อธิบายด้วย AI"
 */
export function detectAnomalyOrderIds(orders: GovProcureOrder[]): string[] {
  return orders
    .filter((o) => {
      if (o.price_incl_vat == null || o.total_cost_89 == null) return false;
      const lowMargin = (o.profit_pct ?? 0) < 3;
      const zeroOrNegative = (o.net_profit_89 ?? 0) <= 0;
      const costRatio = o.price_incl_vat > 0 ? o.total_cost_89 / o.price_incl_vat : 0;
      const costTooHigh = costRatio > 0.9;
      return lowMargin || zeroOrNegative || costTooHigh;
    })
    .map((o) => o.id);
}

// rule flag ทั้งหมด 12 งาน (ยืนยันกับ orders.ts: profit_pct<3% หรือ net_profit_89<=0 หรือ cost_ratio>90%):
//   • curated 7 งาน (ข้อความ rich ด้านล่าง): gp-002(profit_pct 0.67%), gp-010(profit_pct 0.15%),
//     gp-011(net_profit_89=0), gp-012(net_profit_89=0), gp-013(net_profit_89=0, cost>price),
//     gp-014(net_profit_89=0), gp-017(net_profit_89=0, cost>>price)
//   • rule-derived อีก 5 งาน (buildAnomalyReason ประกอบข้อความจาก field จริง): gp-001, gp-003, gp-004,
//     gp-008, gp-015 (cost_ratio>0.9 แต่กำไรยังบวก — margin แคบ)
// getAnomaly(order) = curated ?? rule-derived → banner+ปุ่มแสดงครบทุก order ที่ rule flag (ไม่ return null)
export const AI_ANOMALY_MOCKS: Record<string, GovProcureAnomaly> = {
  "gp-002": {
    order_id: "gp-002",
    severity: "medium",
    reason:
      "กำไรสุทธิ 89 เหลือเพียง 515.60 ฿ จากยอดขาย 77,400.00 ฿ (profit_pct 0.67%) — โต๊ะประชุม 19 ที่นั่ง งานนี้ปิดจบแล้ว (รับเช็คแล้ว) แต่กำไรบางมาก",
    checks: [
      "total_cost_89 (76,884.40 ฿) ใกล้เคียง price_incl_vat (77,400.00 ฿) มาก เหลือ margin แคบ",
      "ทอนลูกค้า+petty+ค่าดำเนินการ (19,350.00 ฿) กินสัดส่วนสูงเทียบ gross_profit (20,365.60 ฿)",
      "งานปิดแล้ว — ใช้เป็นบทเรียนสำหรับตั้งราคาขาย/ทุนของโต๊ะประชุมล็อตถัดไป",
    ],
    confidence: 0.72,
  },
  "gp-010": {
    order_id: "gp-010",
    severity: "medium",
    reason:
      "กำไรสุทธิ 89 เหลือเพียง 105.00 ฿ จากยอดขาย 70,500.00 ฿ (profit_pct 0.15%) — ต่ำกว่าค่ามัธยฐานของพอร์ตมาก",
    checks: [
      "total_cost_89 (70,395.00 ฿) ใกล้เคียง price_incl_vat (70,500.00 ฿) มาก — เหลือกำไรแทบไม่พอครอบคลุมความเสี่ยง",
      "ทอนลูกค้า+petty+ค่าดำเนินการ (17,625.00 ฿) กินสัดส่วนสูงเทียบ gross_profit (18,030.00 ฿)",
      "ควรทบทวนราคาทุน (cost_price 52,470.00 ฿) กับซัพพลายเออร์รอบถัดไป",
    ],
    confidence: 0.78,
  },
  "gp-011": {
    order_id: "gp-011",
    severity: "high",
    reason: "กำไรสุทธิ 89 = 0.00 ฿ พอดี จากยอดขาย 161,500.00 ฿ — ทุนรวม 89 เท่ากับยอดสุทธิรับพอดี ไม่เหลือกำไรเลย",
    checks: [
      "total_cost_89 (170,000.00 ฿) สูงกว่า net_receivable (159,990.65 ฿) — ขาดทุนจริงถ้านับ withholding tax",
      "security_deposit (8,075.00 ฿) ผูกเงินเพิ่มโดยไม่มีกำไรมารองรับ",
      "แนะนำตรวจสอบการคำนวณทอน/petty/operate ว่าคีย์ถูกต้องหรือไม่",
    ],
    confidence: 0.82,
  },
  "gp-012": {
    order_id: "gp-012",
    severity: "medium",
    reason: "กำไรสุทธิ 89 = 0.00 ฿ จากยอดขาย 26,400.00 ฿ — ต้นทุนสินค้าสูงเทียบราคาขาย (ตู้เหล็ก 2 บาน)",
    checks: [
      "cost_price (23,540.00 ฿) คิดเป็น ~89% ของ price_incl_vat — margin ต้นทางแคบตั้งแต่ต้น",
      "total_cost_89 (30,440.00 ฿) เกิน price_incl_vat (26,400.00 ฿) ไปแล้ว 4,040.00 ฿",
      "ควรเช็คว่าตั้งราคาขายต่ำไปหรือทุนซื้อสูงผิดปกติ",
    ],
    confidence: 0.75,
  },
  "gp-013": {
    order_id: "gp-013",
    severity: "high",
    reason:
      "กำไรสุทธิ 89 = 0.00 ฿ และ total_cost_89 (46,369.00 ฿) สูงกว่า price_incl_vat (44,000.00 ฿) แล้ว — ขาดทุนจริง งานนี้ยังค้างรับเช็คด้วย (เกิน SLA 43 วัน)",
    checks: [
      "cost_ratio = 105% ของยอดขาย — สูงกว่า threshold 90% ชัดเจน",
      "ซ้อนความเสี่ยง 2 ชั้น: ขาดทุน + เงินค้างรับเกินกำหนด — ควรจัดลำดับความสำคัญตรวจก่อน",
      "แนะนำตรวจใบสั่งซื้อ/ราคาทุนโทรศัพท์เคลื่อนที่ว่าคีย์ผิดหรือไม่",
    ],
    confidence: 0.88,
  },
  "gp-014": {
    order_id: "gp-014",
    severity: "medium",
    reason: "กำไรสุทธิ 89 = 0.00 ฿ จากยอดขาย 19,000.00 ฿ (เครื่องตัดหญ้า 4 จังหวะ) — งานนี้ยังค้างรับเช็คเกิน SLA 48 วันด้วย",
    checks: [
      "total_cost_89 (20,045.00 ฿) เกิน price_incl_vat (19,000.00 ฿) ไป 1,045.00 ฿",
      "เป็นงานที่ค้างรับนานที่สุดในพอร์ต (48 วัน) — ควรทวงเงินเป็นลำดับแรก",
    ],
    confidence: 0.8,
  },
  "gp-017": {
    order_id: "gp-017",
    severity: "high",
    reason:
      "กำไรสุทธิ 89 = 0.00 ฿ จากยอดขาย 581,400.00 ฿ (ครุภัณฑ์สำนักงาน 15 รายการ) — total_cost_89 (624,871.80 ฿) เกิน price_incl_vat ไปถึง 43,471.80 ฿ เป็นงานมูลค่าใหญ่ที่สุดในพอร์ตที่ยังขาดทุน",
    checks: [
      "cost_ratio = 107.5% ของยอดขาย — สูงสุดในพอร์ต ควรตรวจก่อนเซ็นสัญญาส่งของจริง (สถานะ contracted ยังไม่สั่งซื้อ)",
      "cost_price (479,521.80 ฿) เพียงอย่างเดียวก็เกือบเท่า price_excl_vat แล้ว — ทอน/petty/operate (119,750.00 ฿) ดันขาดทุนซ้ำ",
      "แนะนำเจรจาต้นทุนกับซัพพลายเออร์ใหม่ก่อนเดินหน้าสั่งซื้อ (ยังไม่สาย เพราะยังไม่ถึง stage procuring)",
    ],
    confidence: 0.85,
  },
};

/**
 * buildAnomalyReason — ประกอบเหตุผล anomaly แบบ rule-derived จาก field จริงของ order
 * (สำหรับ order ที่ rule flag แต่ไม่มี curated entry — เช่น cost_ratio>0.9 แต่กำไรบวก)
 * ตัวเลขทุกตัวมาจาก order (ห้ามแต่ง) · severity ตาม signal ที่ trip:
 *   net_profit_89<=0 → high · profit_pct<3 → medium · cost_ratio-only (>0.9 แต่กำไรบวก) → low
 */
export function buildAnomalyReason(order: GovProcureOrder): GovProcureAnomaly {
  const price = order.price_incl_vat ?? 0;
  const cost89 = order.total_cost_89 ?? 0;
  const netProfit = order.net_profit_89 ?? 0;
  const profitPct = order.profit_pct ?? 0;
  const costRatio = price > 0 ? cost89 / price : 0;
  const costRatioPct = Math.round(costRatio * 100);

  const zeroOrNegative = netProfit <= 0;
  const lowMargin = profitPct < 3;

  const severity: GovProcureAnomaly["severity"] = zeroOrNegative
    ? "high"
    : lowMargin
      ? "medium"
      : "low";

  const checks: string[] = [];
  let reason: string;

  if (zeroOrNegative) {
    reason =
      `กำไรสุทธิ 89 = ${fmtMoney(netProfit)} จากยอดขาย ${fmtMoney(price)} — ` +
      `ทุนรวม 89 (${fmtMoney(cost89)}) ${cost89 > price ? "สูงกว่า" : "ใกล้เคียง"}ราคาขาย งานนี้แทบไม่เหลือกำไร`;
    checks.push(`cost_ratio = ${fmtNum(costRatioPct)}% ของยอดขาย — ${costRatioPct > 90 ? "สูงกว่า" : "ใกล้"} threshold 90%`);
    if (cost89 > price) {
      checks.push(`ทุนรวม 89 เกินราคาขายไป ${fmtMoney(cost89 - price)} — ควรตรวจการคีย์ทอน/petty/operate หรือราคาทุน`);
    } else {
      checks.push("ควรตรวจว่าตั้งราคาขายต่ำไปหรือทุนซื้อสูงผิดปกติก่อนเดินงานต่อ");
    }
  } else if (lowMargin) {
    reason =
      `กำไรสุทธิ 89 เหลือเพียง ${fmtMoney(netProfit)} จากยอดขาย ${fmtMoney(price)} (profit_pct ${profitPct.toFixed(2)}%) — ` +
      `margin บางกว่าค่ากลางของพอร์ต`;
    checks.push(`ทุนรวม 89 (${fmtMoney(cost89)}) คิดเป็น ${fmtNum(costRatioPct)}% ของราคาขาย — เหลือ margin แคบ`);
    checks.push("ควรทบทวนราคาทุนกับซัพพลายเออร์รอบถัดไป และเช็คว่าตั้งราคาขายเหมาะสม");
  } else {
    // cost_ratio-only: กำไรบวก แต่ต้นทุนกินสัดส่วนสูง (>90%)
    reason =
      `ต้นทุนกินสัดส่วนสูง — ทุนรวม 89 (${fmtMoney(cost89)}) คิดเป็น ${fmtNum(costRatioPct)}% ของยอดขาย ${fmtMoney(price)} ` +
      `แม้ยังมีกำไรสุทธิ 89 ${fmtMoney(netProfit)} แต่ margin บางกว่าปกติ ควรจับตา`;
    checks.push(`cost_ratio = ${fmtNum(costRatioPct)}% ของยอดขาย — สูงกว่า threshold 90%`);
    checks.push(`กำไรสุทธิ 89 (${fmtMoney(netProfit)}) ยังบวก แต่เหลือ buffer น้อยหากต้นทุนขยับ`);
  }

  const confidence = severity === "high" ? 0.85 : severity === "medium" ? 0.75 : 0.68;

  return { order_id: order.id, severity, reason, checks, confidence };
}

/**
 * getAnomaly — คืน anomaly ของ order: ใช้ curated (rich) ถ้ามี ไม่งั้น rule-derived จาก field จริง
 * ใช้ที่ detail-dialog AnomalyBox — order ที่ detectAnomalyOrderIds flag ทุกตัวได้ผลลัพธ์ (ไม่ null)
 */
export function getAnomaly(order: GovProcureOrder): GovProcureAnomaly {
  return AI_ANOMALY_MOCKS[order.id] ?? buildAnomalyReason(order);
}

// ---- AI-3: Cheque Date Forecast (spec §5b — rule-based, canned narration สั้น) ----

export interface GovProcureForecastNarration {
  department: string;
  narration: string;
  median_duration_days: number;
}

// rule: median(duration_days ต่อกอง) จากงานที่ paid แล้ว (มี contract_date+receipt_date ครบ)
// กองสาธารณสุข: gp-011(33วัน), gp-012(32วัน), gp-015(36วัน — คำนวณจาก contract 04-28→receipt 06-05=38วัน จริง)
// ใช้ตัวเลข canned สั้นตามที่ ai-strategist กำหนด (P1 rule-only)
export const AI_FORECAST_MOCKS: GovProcureForecastNarration[] = [
  {
    department: "กองการศึกษา",
    narration: "กองการศึกษามักใช้เวลาสัญญา→รับเช็ค เฉลี่ย ~40 วัน (จาก 3 งานที่ปิดแล้ว) — ใกล้เคียงค่ากลางพอร์ต ไม่มีความเสี่ยงพิเศษ",
    median_duration_days: 40,
  },
  {
    department: "กองสาธารณสุข",
    narration:
      "กองสาธารณสุขมักจ่ายช้ากว่าค่าเฉลี่ยพอร์ตประมาณ ~15 วัน (จากงานที่ปิดแล้ว 3 งาน + ยังค้างรับ 1 งานเกิน SLA) — ควรเผื่อเวลาติดตามเพิ่มสำหรับกองนี้",
    median_duration_days: 48,
  },
  {
    department: "กองการเจ้าหน้าที่",
    narration: "กองการเจ้าหน้าที่มีทั้งงานที่รับเช็คไวและงานที่ยังค้างส่งของ — ข้อมูลยังน้อยเกินสรุปแนวโน้มชัดเจน",
    median_duration_days: 36,
  },
];
