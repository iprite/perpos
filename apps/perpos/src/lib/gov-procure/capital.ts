// lib/gov-procure/capital.ts — กองทุน/นักลงทุน: fetch + คำนวณยอด (pure, reuse SSR + API)
// โมเดล: ลงขัน → กองกลาง → กระจายทุนไปหัวบริษัท → บริษัททำกำไร → ปันผล/คืนเงินต้น
// **กำไรต่อบริษัทไม่เก็บใน ledger** — derive จาก gov_procure_orders (stage paid/closed) เสมอ
//   (กฎเดียวกับ duration_days: ห้ามมีตัวเลขกำไร 2 แหล่งที่ขัดกันได้)

import type { SupabaseClient } from "@supabase/supabase-js";
import { COMPANIES, type Company, type GovProcureOrder } from "./types";

// ---- types ----

export const CAPITAL_FLOW_TYPES = [
  "contribution",
  "allocation",
  "return_to_pool",
  "dividend",
  "repayment",
] as const;

export type CapitalFlowType = (typeof CAPITAL_FLOW_TYPES)[number];

export const FLOW_LABELS: Record<CapitalFlowType, string> = {
  contribution: "ลงขันเข้ากองกลาง",
  allocation: "กระจายทุนไปบริษัท",
  return_to_pool: "คืนทุนเข้ากองกลาง",
  dividend: "ปันผลให้นักลงทุน",
  repayment: "คืนเงินต้นให้นักลงทุน",
};

/** ทิศทางเงินสำหรับแสดงผล — in = เข้ากองกลาง/เข้ากระเป๋านักลงทุน */
export const FLOW_TONE: Record<CapitalFlowType, "positive" | "negative" | "neutral"> = {
  contribution: "positive",
  allocation: "neutral",
  return_to_pool: "positive",
  dividend: "negative",
  repayment: "negative",
};

export interface Investor {
  id: string;
  org_id: string;
  profile_id: string | null;
  name: string;
  share_pct: number;
  is_active: boolean;
  note: string | null;
  created_at: string;
  updated_at: string;
}

export interface CapitalFlow {
  id: string;
  org_id: string;
  created_by: string | null;
  flow_type: CapitalFlowType;
  amount: number;
  flow_date: string;
  investor_id: string | null;
  company: Company | null;
  order_id: string | null;
  note: string | null;
  created_at: string;
  updated_at: string;
}

/** ยอดต่อบริษัท — "เงินอยู่ที่บริษัทไหนเท่าไร + ดึงปันผลได้เท่าไร" */
export interface CompanyBalance {
  company: Company;
  /** ทุนที่ได้รับจากกองกลาง (สะสม) */
  allocated: number;
  /** ทุนที่คืนกลับกองกลางแล้ว */
  returned: number;
  /** ทุนที่ยังถืออยู่ = allocated − returned */
  capitalHeld: number;
  /** มูลค่างานรวมของบริษัทนี้ (Σ price_incl_vat) — เทียบกับทุนที่ลงไป */
  pipelineValue: number;
  /** กำไรสะสมจากงานที่รับเช็คแล้ว/ปิดงาน (derive จาก orders) */
  profitRealized: number;
  /** กำไรจากงานที่ยังไม่ถึงขั้นรับเช็ค (ยังดึงปันผลไม่ได้) */
  profitPending: number;
  /** ปันผลที่จ่ายออกจากบริษัทนี้แล้ว */
  dividendPaid: number;
  /** คืนเงินต้นที่จ่ายออกจากบริษัทนี้แล้ว */
  repaidPrincipal: number;
  /** กำไรที่พร้อมปันผล = profitRealized − dividendPaid (ไม่ติดลบ) */
  distributable: number;
  /** เงินสดโดยประมาณที่บริษัทถืออยู่ = capitalHeld + profitRealized − dividendPaid − repaidPrincipal */
  cashOnHand: number;
  orderCount: number;
}

/** ยอดต่อนักลงทุน — "ลงไปเท่าไร ได้คืนเท่าไร กำไรของตัวเองเท่าไร" */
export interface InvestorBalance {
  investor: Investor;
  /** เงินลงขันสะสม */
  contributed: number;
  /** เงินต้นที่ได้คืนแล้ว */
  repaid: number;
  /** เงินต้นค้างอยู่ในระบบ = contributed − repaid */
  outstanding: number;
  /** ปันผลที่รับแล้ว */
  dividendReceived: number;
  /** ส่วนแบ่งกำไรที่พร้อมรับ = share_pct × กำไรพร้อมปันผลรวม */
  dividendClaimable: number;
}

export interface CapitalSummary {
  /** เงินลงขันรวมทุกคน */
  totalContributed: number;
  /** กระจายไปบริษัทแล้วสุทธิ (allocation − return_to_pool) */
  totalDeployed: number;
  /** เงินคงเหลือในกองกลาง = contributed − deployed − repayment ที่จ่ายจากกองกลาง */
  poolBalance: number;
  /** มูลค่างานรวมทุกบริษัท (Σ price_incl_vat) — คู่กับเงินลงขันเพื่อดูว่าทุนพอไหม */
  totalPipelineValue: number;
  /** กำไรสะสมทุกบริษัท (รับเช็คแล้ว) */
  totalProfitRealized: number;
  /** กำไรที่ยังไม่ถึงจุดรับเช็ค */
  totalProfitPending: number;
  /** ปันผลจ่ายไปแล้วรวม */
  totalDividendPaid: number;
  /** กำไรที่พร้อมปันผลรวม */
  totalDistributable: number;
  /** เงินต้นค้างคืนรวม */
  totalOutstandingPrincipal: number;
  byCompany: CompanyBalance[];
  byInvestor: InvestorBalance[];
  /** รวม share_pct ≠ 100 → เตือนบนหน้าจอ */
  sharePctTotal: number;
}

// ---- fetch ----

export async function listInvestors(client: SupabaseClient, orgId: string): Promise<Investor[]> {
  const { data, error } = await client
    .from("gov_procure_investors")
    .select("*")
    .eq("org_id", orgId)
    .order("share_pct", { ascending: false })
    .order("name", { ascending: true });

  if (error) throw new Error(error.message);
  return (data ?? []).map(normalizeInvestor);
}

export async function listCapitalFlows(
  client: SupabaseClient,
  orgId: string,
): Promise<CapitalFlow[]> {
  const { data, error } = await client
    .from("gov_procure_capital_flows")
    .select("*")
    .eq("org_id", orgId)
    .order("flow_date", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) throw new Error(error.message);
  return (data ?? []).map(normalizeFlow);
}

function normalizeInvestor(row: Record<string, unknown>): Investor {
  return { ...(row as unknown as Investor), share_pct: num(row.share_pct) };
}

function normalizeFlow(row: Record<string, unknown>): CapitalFlow {
  return { ...(row as unknown as CapitalFlow), amount: num(row.amount) };
}

function num(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

// ---- compute (pure) ----

/** งานที่ถือว่า "กำไรสุก" แล้ว — เก็บเงินเข้าบริษัทจริง (รับเช็ค/ปิดงาน) */
function isProfitRealized(o: GovProcureOrder): boolean {
  return o.stage === "paid" || o.stage === "closed";
}

/** กำไรของงาน — ใช้ net_profit_89 ถ้ามี (หักค่าดำเนินการแล้ว) ไม่งั้น fallback gross_profit */
export function orderProfit(o: GovProcureOrder): number {
  return o.net_profit_89 ?? o.gross_profit ?? 0;
}

/**
 * computeCapital — รวมทุกอย่างเป็นภาพเดียว (นักลงทุน 3 คนเห็นชุดเดียวกันทั้งหมด)
 * pure function: orders + investors + flows → ยอดทุกระดับ
 */
export function computeCapital(
  orders: GovProcureOrder[],
  investors: Investor[],
  flows: CapitalFlow[],
): CapitalSummary {
  // ---- ต่อบริษัท ----
  const byCompany: CompanyBalance[] = COMPANIES.map((company) => {
    const companyFlows = flows.filter((f) => f.company === company);
    const sum = (t: CapitalFlowType) =>
      companyFlows.filter((f) => f.flow_type === t).reduce((s, f) => s + f.amount, 0);

    const allocated = sum("allocation");
    const returned = sum("return_to_pool");
    const dividendPaid = sum("dividend");
    const repaidPrincipal = sum("repayment");

    const companyOrders = orders.filter((o) => o.company === company);
    const profitRealized = companyOrders
      .filter(isProfitRealized)
      .reduce((s, o) => s + orderProfit(o), 0);
    const profitPending = companyOrders
      .filter((o) => !isProfitRealized(o))
      .reduce((s, o) => s + orderProfit(o), 0);

    const capitalHeld = allocated - returned;
    return {
      company,
      pipelineValue: companyOrders.reduce((s, o) => s + (o.price_incl_vat ?? 0), 0),
      allocated,
      returned,
      capitalHeld,
      profitRealized,
      profitPending,
      dividendPaid,
      repaidPrincipal,
      distributable: Math.max(0, profitRealized - dividendPaid),
      cashOnHand: capitalHeld + profitRealized - dividendPaid - repaidPrincipal,
      orderCount: companyOrders.length,
    };
  });

  const totalProfitRealized = byCompany.reduce((s, c) => s + c.profitRealized, 0);
  const totalProfitPending = byCompany.reduce((s, c) => s + c.profitPending, 0);
  const totalDividendPaid = byCompany.reduce((s, c) => s + c.dividendPaid, 0);
  const totalDistributable = byCompany.reduce((s, c) => s + c.distributable, 0);

  // ---- ต่อนักลงทุน ----
  const byInvestor: InvestorBalance[] = investors.map((investor) => {
    const mine = flows.filter((f) => f.investor_id === investor.id);
    const sum = (t: CapitalFlowType) =>
      mine.filter((f) => f.flow_type === t).reduce((s, f) => s + f.amount, 0);

    const contributed = sum("contribution");
    const repaid = sum("repayment");
    const dividendReceived = sum("dividend");
    const share = investor.share_pct / 100;

    return {
      investor,
      contributed,
      repaid,
      outstanding: contributed - repaid,
      dividendReceived,
      // ส่วนแบ่งของกำไรที่ "ยังไม่ถูกปันผล" ตามสัดส่วนลงทุน
      dividendClaimable: totalDistributable * share,
    };
  });

  const totalContributed = byInvestor.reduce((s, i) => s + i.contributed, 0);
  const totalRepaid = byInvestor.reduce((s, i) => s + i.repaid, 0);
  const totalDeployed = byCompany.reduce((s, c) => s + c.capitalHeld, 0);

  return {
    totalContributed,
    totalDeployed,
    totalPipelineValue: byCompany.reduce((s, c) => s + c.pipelineValue, 0),
    // กองกลาง = เงินลงขันที่ยังไม่ถูกส่งออกไปบริษัท
    // (repayment/dividend จ่ายออกจากบริษัท ไม่ผ่านกองกลาง → ไม่หักซ้ำตรงนี้)
    poolBalance: totalContributed - totalDeployed,
    totalProfitRealized,
    totalProfitPending,
    totalDividendPaid,
    totalDistributable,
    totalOutstandingPrincipal: totalContributed - totalRepaid,
    byCompany,
    byInvestor,
    sharePctTotal: investors.reduce((s, i) => s + i.share_pct, 0),
  };
}
