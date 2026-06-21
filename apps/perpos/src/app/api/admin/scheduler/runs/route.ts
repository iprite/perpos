/**
 * Admin: Scheduler / Background Jobs monitor
 *   GET /api/admin/scheduler/runs — log การรัน cron scheduler ล่าสุด + สรุปสถานะ
 *
 * Logic จริงอยู่ใน lib/admin/scheduler.ts (ใช้ร่วมกับ server component หน้า /admin/scheduler)
 * route นี้คงไว้ให้ client view poll ทุก 60 วิ
 */

import { NextRequest } from "next/server";
import { requireAdmin } from "../../../_lib/auth";
import { createAdminClient } from "../../../_lib/supabase";
import { ok } from "../../../_lib/response";
import { computeSchedulerRuns } from "@/lib/admin/scheduler";

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (!auth.ok) return auth.res;

  const data = await computeSchedulerRuns(createAdminClient());
  return ok(data);
}
