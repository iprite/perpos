/**
 * POST /api/just-me/ai/project-health — ให้ AI อธิบายสุขภาพโครงการเป็นภาษาคน
 * สิทธิ์: cost-access (owner/manager) — viewer เรียกไม่ได้ (403)
 *
 * ⛔ ตัวเลขทุกตัวมาจาก `loadProjectMetrics()` → `summarizeProject()` (project-metrics.ts)
 *    AI ได้รับ "ผลลัพธ์ที่คิดเสร็จแล้ว" เท่านั้น ห้ามให้ AI คำนวณ · route นี้ไม่เขียน DB
 */

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "../../../_lib/supabase";
import { guard, jmError } from "../../_lib";
import { summarizeProjectHealth } from "@/lib/just-me/ai";
import { loadProjectMetrics } from "@/lib/just-me/projects";

export async function POST(req: NextRequest) {
  const g = await guard(req, { cost: true });
  if (!g.ok) return g.res;

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const projectId = typeof body.project_id === "string" ? body.project_id : "";
  if (!projectId) return jmError("ไม่ได้ระบุโครงการ", 400);

  const admin = createAdminClient();
  try {
    const metrics = await loadProjectMetrics(admin, g.orgId, projectId);
    if (!metrics) return jmError("ไม่พบโครงการนี้", 404);

    const opinion = await summarizeProjectHealth({
      project_code: metrics.project.project_code,
      project_name: metrics.project.name,
      status: metrics.project.status,
      summary: metrics.summary,
      counts: {
        boq_items: metrics.counts.boq_items,
        usage_rows: metrics.counts.usage_rows,
        purchase_requests: metrics.counts.purchase_requests,
        progress_rows: metrics.counts.progress_rows,
      },
    });

    return NextResponse.json({ opinion, summary: metrics.summary });
  } catch (e) {
    return jmError(e instanceof Error ? e.message : "วิเคราะห์โครงการไม่สำเร็จ", 500);
  }
}
