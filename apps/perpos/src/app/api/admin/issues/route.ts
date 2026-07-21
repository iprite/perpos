/**
 * Super admin: Issue Tracker — สร้าง issue เอง (admin filing)
 *   POST /api/admin/issues
 *     body { title, type, severity?, status?, area?[], symptom?, reproduce?,
 *            root_cause?, fix_summary?, branch?, reporter_note? }
 *     → คืนเลขอ้างอิง (next_issue_ref ตาม prefix ของ type) + เขียน event 'created'
 *
 * อ่านรายการ = SSR ผ่าน lib/admin/issues.ts (ไม่ต้องมี GET ที่นี่)
 */

import { NextRequest } from "next/server";
import { requireAdmin } from "../../_lib/auth";
import { createAdminClient } from "../../_lib/supabase";
import { created, Err } from "../../_lib/response";
import { logAdminAction } from "../../_lib/admin-audit";
import { TYPE_TO_PREFIX, ISSUE_AREAS } from "@/lib/admin/issues";

const TYPES = Object.keys(TYPE_TO_PREFIX);
const SEVERITIES = ["sev1", "sev2", "sev3"];

export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (!auth.ok) return auth.res;

  const body = await req.json().catch(() => null);
  if (!body) return Err.invalidFormat("body", "ต้องเป็น JSON");

  const title = typeof body.title === "string" ? body.title.trim() : "";
  const type = String(body.type ?? "");
  const severity = String(body.severity ?? "sev2");
  if (!title) return Err.missingField("title");
  if (!TYPES.includes(type)) return Err.invalidFormat("type", `รองรับ: ${TYPES.join(", ")}`);
  if (!SEVERITIES.includes(severity)) return Err.invalidFormat("severity");

  const area = Array.isArray(body.area)
    ? body.area.filter((a: unknown) => ISSUE_AREAS.includes(a as (typeof ISSUE_AREAS)[number]))
    : [];

  const admin = createAdminClient();

  // เลขอ้างอิงแบบ atomic ตาม prefix ของ type
  const prefix = TYPE_TO_PREFIX[type as keyof typeof TYPE_TO_PREFIX];
  const { data: refData, error: refErr } = await admin.rpc("next_issue_ref", { p_prefix: prefix });
  if (refErr) return Err.dbError(refErr);
  const ref = refData as unknown as string;

  const { data: row, error: insErr } = await admin
    .from("system_issues")
    .insert({
      ref,
      prefix,
      type,
      severity,
      status: "open",
      title,
      symptom: body.symptom ?? null,
      reproduce: body.reproduce ?? null,
      area,
      root_cause: body.root_cause ?? null,
      fix_summary: body.fix_summary ?? null,
      branch: body.branch ?? null,
      reporter_note: body.reporter_note ?? null,
      source: "admin",
      reported_by: auth.userId,
    })
    .select("id, ref")
    .single();
  if (insErr) return Err.dbError(insErr);

  await admin.from("system_issue_events").insert({
    issue_id: (row as { id: string }).id,
    actor: "admin",
    action: "created",
    to_status: "open",
    note: "สร้างโดยแอดมิน",
  });

  await logAdminAction(req, auth.userId, {
    action: "issue.create",
    targetType: "system_issue",
    targetId: ref,
    metadata: { type, severity },
  });

  return created({ ref });
}
