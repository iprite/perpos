/**
 * metrics.expected.ts — ค่าคาดหวังของ semantic layer `bi` จาก "ข้อมูลจริง" (golden values)
 *
 * ⚠️ ไฟล์นี้ไม่ได้ยิง DB และไม่ควรยิง — เป็น "เอกสารที่รันได้"
 *    การยืนยันกับฐานข้อมูลจริงทำผ่าน `supabase/migrations/_bi_metric_check.sql`
 *    (สคริปต์มือ ไม่ใช่ migration) ซึ่งยิง `run_bi_metric(...)` เทียบกับ SQL อ้างอิงที่เขียน
 *    ด้วยกฎเดียวกับ `lib/gov-procure/summary.ts` (computeSummary/isOverdue/computeDuration)
 *
 * วิธีรันซ้ำเมื่อข้อมูลเปลี่ยน (บังคับก่อนเลื่อน metric ใด ๆ เป็น status='verified'):
 *   1) เปิด Supabase SQL editor ของโปรเจกต์ (zftnyipifpaiqzukiyzi)
 *   2) รัน `supabase/migrations/_bi_metric_check.sql` ทีละบล็อก
 *      — ทุกบล็อกต้องได้ค่าจาก run_bi_metric ตรงกับค่าอ้างอิงเป๊ะ
 *   3) ถ้าตัวเลขในไฟล์นี้ไม่ตรงกับผลที่ได้ = ข้อมูลจริงเปลี่ยน → อัปเดตค่าใน BI_GOLDEN
 *      พร้อมแก้ `snapshotDate` และ commit คู่กับเหตุผล (ห้ามแก้ค่าเพื่อให้เทสเขียวเฉย ๆ)
 *   4) แล้วจึงรัน `_bi_activate_metrics.sql` (ต้องผ่าน gate G4 ด้วย)
 *
 * เทสที่ใช้ค่าเหล่านี้: `metrics.golden.test.ts` — ตรวจ "ความสอดคล้องกันเอง" ของตัวเลข
 * (ผลรวมรายขั้นตอน = ผลรวมรายบริษัท = ยอดรวมทั้งพอร์ต ฯลฯ) จับเลขที่ขัดกันเองได้แม้ไม่มี DB
 */

/** org ที่ใช้ตรวจ (โมดูล gov_procure เปิดให้ org เดียวในเฟส 1) */
export const BI_GOLDEN_ORG = {
  slug: "p2p-x-89",
  orgId: "0386f64e-7c25-4bf6-aa4c-9565f3f9fbee",
  /** วันที่ดึง snapshot ข้อมูลจริง (ค่าทั้งไฟล์นี้อ้างอิงวันนี้) */
  snapshotDate: "2026-07-24",
} as const;

/** อัตรา VAT ที่ใช้ตรวจความสัมพันธ์ incl/excl (7% ตามประมวลรัษฎากรปัจจุบัน) */
export const VAT_RATE = 0.07;

export const BI_GOLDEN = {
  /** gov_procure.order_count — นับทุกใบงานทุกขั้นตอน */
  orderCount: 17,

  /**
   * gov_procure.pipeline_value_incl_vat
   * ใบที่กรอก price_incl_vat จริง = 13 จาก 17 (ที่เหลือถือเป็น 0)
   */
  pipelineValueInclVat: 1_095_277.35,
  pipelineInclPricedCount: 13,

  /**
   * gov_procure.pipeline_value_excl_vat
   * ใบที่กรอก price_excl_vat จริง = 17 จาก 17
   * ⚠️ denominator ไม่เท่ากับฝั่ง incl (13 ใบ) — ดูหมายเหตุ D1 ท้ายไฟล์
   */
  pipelineValueExclVat: 1_023_623.71,
  pipelineExclPricedCount: 17,

  /** gov_procure.purchase_cost_total (owner-only) — กรอก cost_price จริง 12 จาก 17 ใบ */
  purchaseCostTotal: 618_112.0,
  purchaseCostedCount: 12,

  /**
   * gov_procure.pipeline_by_stage_incl_vat — คืนครบ 6 stage เสมอ (stage ที่ไม่มีงาน = 0)
   * ข้อมูลจริงมีเฉพาะ quotation / contracted
   */
  byStageInclVat: [
    { stage: "quotation", count: 13, value: 904_619.35 },
    { stage: "contracted", count: 4, value: 190_658.0 },
    { stage: "procuring", count: 0, value: 0 },
    { stage: "delivered", count: 0, value: 0 },
    { stage: "paid", count: 0, value: 0 },
    { stage: "closed", count: 0, value: 0 },
  ],

  /** gov_procure.by_company_incl_vat — 4 บริษัทรับงาน (2 บริษัทยังไม่มีใบที่กรอกราคา) */
  byCompanyInclVat: [
    { company: "P2P Supply", count: 7, value: 606_981.35 },
    { company: "89 Global Work", count: 6, value: 488_296.0 },
    { company: "ALPHA", count: 3, value: 0 },
    { company: "MAGISTATS", count: 1, value: 0 },
  ],

  /** จำนวนใบงานต่อเดือน (time_basis = start_date, time_grain = month) */
  byMonth: [
    { month: "2026-06", count: 8 },
    { month: "2026-07", count: 9 },
  ],

  /** gov_procure.capital_flow_by_type — สมุดเงินทุน 4 แถว */
  capitalFlowByType: [
    { flowType: "allocation", amount: 105_000, flowCount: 2 },
    { flowType: "contribution", amount: 105_000, flowCount: 2 },
  ],

  /** gov_procure.orders_detail — จำนวนแถวที่คืน (ต้องเท่ากับ order_count) */
  ordersDetailRows: 17,

  /**
   * ข้อเท็จจริงของข้อมูล ณ snapshot ที่ทำให้ metric หลายตัว "ยังเปิดไม่ได้"
   * (ตรงกับตารางเหตุผลใน `_bi_activate_metrics.sql` ชุดที่ 2)
   */
  dataGaps: {
    /** ไม่มีใบงาน stage delivered/paid/closed → เงินค้างรับ/เงินรับจริง/aging = 0 แถว */
    stagesWithData: ["quotation", "contracted"],
    /** milestone dates ว่างทั้งหมด (contract/payment_order/delivery/receipt) */
    milestoneDatesFilled: 0,
    /** net_profit_89 และ commission_net_payable = 0 ทุกใบ */
    netProfitFilled: 0,
    /** หน่วยงานผู้ซื้อ distinct = 1 → มิติ customer_name ยังแยกแยะไม่ได้ */
    distinctCustomers: 1,
    /** ไม่มีข้อมูลปีก่อน → comparison 'yoy' ใช้ไม่ได้ทั้งชุด */
    hasPriorYearData: false,
  },
} as const;

/**
 * หมายเหตุ D1 (คู่ incl/excl VAT) — ประเด็นที่ต้องบอกผู้ใช้เสมอ:
 * `pipeline_value_incl_vat` คิดจาก 13 ใบที่กรอกราคา ส่วน `pipeline_value_excl_vat` คิดจาก 17 ใบ
 * → สองตัวเลขนี้ "ไม่ใช่จำนวนเดียวกันหักภาษี" แม้ต่างกันเพียง ~0.02 บาทโดยบังเอิญ
 * (4 ใบที่ไม่มี price_incl_vat มี price_excl_vat ใกล้ 0)
 * definition_th ของทั้งคู่จึงต้องระบุ priced_count และ UI ต้องแสดงจำนวนใบที่มีราคาเสมอ
 */
export const PIPELINE_PAIR_NOTE =
  "incl_vat นับจาก 13 ใบที่กรอกราคา · excl_vat นับจาก 17 ใบ — คนละฐาน ต้องแสดง priced_count คู่กันเสมอ";
