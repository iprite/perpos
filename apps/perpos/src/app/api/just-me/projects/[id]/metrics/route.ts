/**
 * /api/just-me/projects/[id]/metrics — ตัวเลขสรุปของโครงการ (contract §8)
 * GET = สมาชิกทุกคน · **viewer ได้เฉพาะฝั่งขาย** (สัญญา/วางบิล/ความคืบหน้า)
 *       ตัวเลขต้นทุน-กำไรทุกตัวถูกตัดออกด้วย `stripCost()` ที่เดียวกับทุก route
 *
 * ⛔ ทุกตัวเลขมาจาก `lib/just-me/project-metrics.ts` — route นี้ไม่คำนวณอะไรเอง
 */

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "../../../../_lib/supabase";
import { canSeeCost, guard, jmError, stripCost } from "../../../_lib";
import { loadProjectMetrics } from "@/lib/just-me/projects";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const g = await guard(req);
  if (!g.ok) return g.res;

  try {
    const metrics = await loadProjectMetrics(createAdminClient(), g.orgId, id);
    if (!metrics) return jmError("ไม่พบโครงการนี้", 404);

    return NextResponse.json({
      project: stripCost(metrics.project as unknown as Record<string, unknown>, g.auth.role),
      summary: stripCost(metrics.summary as unknown as Record<string, unknown>, g.auth.role),
      counts: metrics.counts,
      // viewer ไม่มีสิทธิ์รู้แม้แต่ว่า "งบเท่าไร/มีงบหรือยัง" → ซ่อนธงนี้ด้วย
      has_budget: canSeeCost(g.auth.role) ? metrics.has_budget : null,
      role: g.auth.role,
    });
  } catch (e) {
    return jmError(e instanceof Error ? e.message : "คำนวณตัวเลขโครงการไม่สำเร็จ", 500);
  }
}
