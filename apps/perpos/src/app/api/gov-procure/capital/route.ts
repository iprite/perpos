import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "../../_lib/supabase";
import { setAuditContext } from "../../_lib/audit";
import { requireGovProcureMember, canManageSettings, orgIdFromQuery, govError } from "../_lib";
import { listOrders } from "@/lib/gov-procure/orders";
import {
  listInvestors,
  listCapitalFlows,
  computeCapital,
  CAPITAL_FLOW_TYPES,
  type CapitalFlowType,
} from "@/lib/gov-procure/capital";
import { COMPANIES } from "@/lib/gov-procure/types";

// GET /api/gov-procure/capital?orgId=... → ledger + นักลงทุน + ยอดคำนวณ (member ทุก role อ่านได้)
export async function GET(req: NextRequest) {
  const orgId = orgIdFromQuery(req);
  if (!orgId) return govError("missing orgId");

  const auth = await requireGovProcureMember(req, orgId);
  if (!auth.ok) return auth.res;

  try {
    const admin = createAdminClient();
    const [orders, investors, flows] = await Promise.all([
      listOrders(admin, orgId),
      listInvestors(admin, orgId),
      listCapitalFlows(admin, orgId),
    ]);
    return NextResponse.json({
      investors,
      flows,
      summary: computeCapital(orders, investors, flows),
    });
  } catch (e) {
    return govError((e as Error).message, 500);
  }
}

/** ฟิลด์ที่ต้องมีตามชนิดรายการ — mirror CHECK `gov_procure_capital_flows_shape_chk` ที่ DB */
const SHAPE: Record<CapitalFlowType, { investor: boolean; company: boolean }> = {
  contribution: { investor: true, company: false },
  allocation: { investor: false, company: true },
  return_to_pool: { investor: false, company: true },
  dividend: { investor: true, company: true },
  repayment: { investor: true, company: true },
};

// POST /api/gov-procure/capital?orgId=... → บันทึกรายการเงินทุน (owner/manager)
export async function POST(req: NextRequest) {
  const orgId = orgIdFromQuery(req);
  if (!orgId) return govError("missing orgId");

  const auth = await requireGovProcureMember(req, orgId);
  if (!auth.ok) return auth.res;
  if (!canManageSettings(auth.role)) {
    return govError("ไม่มีสิทธิ์บันทึกรายการเงินทุน (เฉพาะเจ้าของ/ผู้จัดการ)", 403);
  }

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const flowType = body.flow_type as CapitalFlowType;
  if (!CAPITAL_FLOW_TYPES.includes(flowType)) return govError("ชนิดรายการไม่ถูกต้อง");

  const amount = Number(body.amount);
  if (!Number.isFinite(amount) || amount <= 0) return govError("จำนวนเงินต้องมากกว่า 0");

  const shape = SHAPE[flowType];
  const investorId = (body.investor_id as string) || null;
  const company = (body.company as string) || null;

  if (shape.investor && !investorId) return govError("กรุณาเลือกนักลงทุน");
  if (shape.company && !company) return govError("กรุณาเลือกบริษัท");
  if (company && !(COMPANIES as readonly string[]).includes(company)) {
    return govError("บริษัทไม่ถูกต้อง");
  }

  const admin = createAdminClient();

  // กัน cross-org: นักลงทุน/งานที่อ้างถึงต้องอยู่ org เดียวกัน
  if (investorId) {
    const { data } = await admin
      .from("gov_procure_investors")
      .select("id")
      .eq("id", investorId)
      .eq("org_id", orgId)
      .maybeSingle();
    if (!data) return govError("ไม่พบนักลงทุนในองค์กรนี้", 404);
  }
  const orderId = (body.order_id as string) || null;
  if (orderId) {
    const { data } = await admin
      .from("gov_procure_orders")
      .select("id")
      .eq("id", orderId)
      .eq("org_id", orgId)
      .maybeSingle();
    if (!data) return govError("ไม่พบงานในองค์กรนี้", 404);
  }

  await setAuditContext(req, auth.userId, orgId);

  const { data, error } = await admin
    .from("gov_procure_capital_flows")
    .insert({
      org_id: orgId,
      created_by: auth.userId,
      flow_type: flowType,
      amount,
      flow_date: (body.flow_date as string) || new Date().toISOString().slice(0, 10),
      investor_id: shape.investor ? investorId : null,
      company: shape.company ? company : null,
      order_id: orderId,
      note: ((body.note as string) || "").trim() || null,
    })
    .select()
    .single();

  if (error) return govError(error.message, 500);
  return NextResponse.json({ flow: data });
}
