/**
 * GET /api/assistant/stats
 *   — สถิติการใช้แกะเสียงของผู้ใช้ที่ล็อกอิน (ตัวเอง)
 */

import { NextRequest } from "next/server";
import { requireAssistantUser } from "../../_lib/assistant-auth";
import { createAdminClient } from "../../_lib/supabase";
import { ok } from "../../_lib/response";
import { getAssistantStats } from "@/lib/assistant/stats";

export async function GET(req: NextRequest) {
  const auth = await requireAssistantUser(req);
  if (!auth.ok) return auth.res;

  const admin = createAdminClient();
  const stats = await getAssistantStats(admin, auth.userId);
  return ok(stats);
}
