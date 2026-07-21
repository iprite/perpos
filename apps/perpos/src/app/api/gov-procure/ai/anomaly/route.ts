// POST /api/gov-procure/ai/anomaly?orgId=&orderId=... — AI-2 Anomaly/Margin Guard (§5b)
// on-demand ต่อ order ("อธิบายด้วย AI"). rule (detectAnomaly) ตรวจก่อน — ไม่ผิดปกติ = severity none
// (ไม่เรียก AI, cost 0). ผิดปกติ → AI narrate. read-only (ไม่ mutation). AI ล่ม → fallback signal ล้วน.

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "../../../_lib/supabase";
import { requireGovProcureMember, orgIdFromQuery, govError } from "../../_lib";
import { listOrders, getOrder } from "@/lib/gov-procure/orders";
import { detectAnomaly } from "@/lib/gov-procure/anomaly";
import { narrateAnomaly } from "@/lib/gov-procure/ai";

export const maxDuration = 30;

export async function POST(req: NextRequest) {
  const orgId = orgIdFromQuery(req);
  if (!orgId) return govError("missing orgId");
  const orderId = req.nextUrl.searchParams.get("orderId");
  if (!orderId) return govError("missing orderId");

  const auth = await requireGovProcureMember(req, orgId);
  if (!auth.ok) return auth.res;

  try {
    const admin = createAdminClient();
    // ต้องการทั้ง order เป้าหมาย + ทั้งพอร์ต (median profit_pct เป็นฐาน relative-margin R1)
    const [order, allOrders] = await Promise.all([
      getOrder(admin, orgId, orderId),
      listOrders(admin, orgId),
    ]);
    if (!order) return govError("order not found", 404);

    const signal = detectAnomaly(order, allOrders);
    const result = await narrateAnomaly(signal);
    return NextResponse.json({ anomaly: result });
  } catch (e) {
    return govError((e as Error).message, 500);
  }
}
