/**
 * _actions.ts — server action ของหน้ารายละเอียดโครงการ
 * ใช้ตอนผู้ใช้กดสลับแท็บ: โหลดข้อมูลของแท็บนั้น "ตอนกด" ไม่ใช่ตอนเปิดหน้า
 *
 * 🔴 ด่านสิทธิ์ต้องอยู่ในนี้เสมอ (`requireJustMePage`) — action เรียกจาก client ได้ตรง ๆ
 */
"use server";

import { getProject } from "@/lib/just-me/projects";
import { requireJustMePage } from "../../_components/guard";
import { loadProjectTabData } from "./_tab-data";
import type { ProjectTabData, TabKey } from "./_types";

export async function loadProjectTabAction(
  orgSlug: string,
  projectId: string,
  tab: TabKey,
): Promise<ProjectTabData> {
  const ctx = await requireJustMePage(orgSlug);
  const project = await getProject(ctx.rls, ctx.orgId, projectId, { basic: !ctx.canSeeCost });
  if (!project) throw new Error("ไม่พบโครงการนี้");
  return loadProjectTabData(ctx, project, tab);
}
