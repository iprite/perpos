/**
 * GET /api/assistant/quota — สรุปกระเป๋าเครดิต (token) ของผู้ใช้ที่ล็อกอิน
 *   unified prepaid pool (1 บาท = 100 token) · คืนยอด + มูลค่าบาท + วันหมดอายุ + remaining ต่อ service
 */

import { NextRequest } from "next/server";
import { requireAssistantUser } from "../../_lib/assistant-auth";
import { createAdminClient } from "../../_lib/supabase";
import { ok } from "../../_lib/response";
import { getTokenSummary } from "@/lib/assistant/token-balance";

export async function GET(req: NextRequest) {
  const auth = await requireAssistantUser(req);
  if (!auth.ok) return auth.res;

  const admin = createAdminClient();
  const summary = await getTokenSummary(admin, auth.userId);
  return ok(summary);
}
