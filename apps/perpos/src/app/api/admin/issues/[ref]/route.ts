/**
 * Super admin: Issue Tracker — อัปเดต issue (เปลี่ยนสถานะ / แก้ field / เพิ่มโน้ต)
 *   PATCH /api/admin/issues/[ref]
 *     body { status?, note?, fields?: { title?, severity?, type?, area?[], symptom?,
 *            reproduce?, root_cause?, fix_summary?, branch? } }
 *     → เปลี่ยนสถานะ (เขียน event status_change + จัดการ resolved_at) ·
 *       แก้ field (event 'edited') · โน้ตเปล่า (event 'note')
 *
 * หมายเหตุ: ref/prefix immutable — แม้แก้ type ก็ไม่เปลี่ยนเลขอ้างอิง
 */

import { NextRequest } from "next/server";
import { requireAdmin } from "../../../_lib/auth";
import { createAdminClient } from "../../../_lib/supabase";
import { ok, Err } from "../../../_lib/response";
import { logAdminAction } from "../../../_lib/admin-audit";
import { TYPE_TO_PREFIX, ISSUE_AREAS, RESOLVED_STATUSES } from "@/lib/admin/issues";
import { sendLineMessages } from "@/lib/line/send-messages";
import type { SupabaseClient } from "@supabase/supabase-js";

const NOTIFY_STATUSES = ["deployed", "closed"]; // ปิดจริงสำหรับผู้ใช้ → แจ้งผู้รายงาน

/** แจ้งผู้รายงาน (LINE) ว่าเรื่องถูกแก้/ปิดแล้ว — ครั้งเดียว (close-the-loop) */
async function notifyReporterIfLine(admin: SupabaseClient, issueId: string) {
  const { data: iss } = await admin
    .from("system_issues")
    .select("ref, title, source, reported_by, reporter_notified_at")
    .eq("id", issueId)
    .maybeSingle();
  if (!iss || iss.source !== "line" || iss.reported_by == null || iss.reporter_notified_at) return;

  const { data: prof } = await admin
    .from("profiles")
    .select("line_user_id")
    .eq("id", iss.reported_by)
    .maybeSingle();
  if (!prof?.line_user_id) return;

  await sendLineMessages({
    to: prof.line_user_id as string,
    messages: [
      {
        type: "text",
        text: `✅ ปัญหาที่คุณแจ้ง (${iss.ref}) ได้รับการแก้ไขแล้ว\n"${iss.title}"\nขอบคุณที่ช่วยรายงานครับ 🙏`,
      },
    ],
  }).catch(() => {});

  await admin
    .from("system_issues")
    .update({ reporter_notified_at: new Date().toISOString() })
    .eq("id", issueId);
}

const STATUSES = [
  "open",
  "triaging",
  "diagnosing",
  "fixing",
  "verifying",
  "fixed",
  "deployed",
  "closed",
  "blocked",
  "wontfix",
  "duplicate",
  "handoff_feature",
];
const SEVERITIES = ["sev1", "sev2", "sev3"];
const EDITABLE_TEXT = [
  "title",
  "symptom",
  "reproduce",
  "root_cause",
  "fix_summary",
  "branch",
] as const;

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ ref: string }> }) {
  const auth = await requireAdmin(req);
  if (!auth.ok) return auth.res;

  const { ref } = await ctx.params;
  const body = await req.json().catch(() => null);
  if (!body) return Err.invalidFormat("body", "ต้องเป็น JSON");

  const admin = createAdminClient();
  const { data: current, error: getErr } = await admin
    .from("system_issues")
    .select("id, status, resolved_at")
    .eq("ref", decodeURIComponent(ref))
    .maybeSingle();
  if (getErr) return Err.dbError(getErr);
  if (!current) return Err.invalidFormat("ref", "ไม่พบ issue นี้");

  const issueId = (current as { id: string }).id;
  const fromStatus = (current as { status: string }).status;
  const note = typeof body.note === "string" && body.note.trim() ? body.note.trim() : null;

  const patch: Record<string, unknown> = {};
  const events: {
    action: string;
    from_status?: string;
    to_status?: string;
    note: string | null;
  }[] = [];

  // ── เปลี่ยนสถานะ ──────────────────────────────────────────────
  const newStatus = body.status ? String(body.status) : null;
  if (newStatus && newStatus !== fromStatus) {
    if (!STATUSES.includes(newStatus)) return Err.invalidFormat("status");
    patch.status = newStatus;
    // resolved_at: ตั้งเมื่อเข้ากลุ่มแก้เสร็จ (ครั้งแรก) · เคลียร์เมื่อกลับมา active
    if (RESOLVED_STATUSES.includes(newStatus as never)) {
      if (!(current as { resolved_at: string | null }).resolved_at) {
        patch.resolved_at = new Date().toISOString();
      }
    } else {
      patch.resolved_at = null;
    }
    events.push({ action: "status_change", from_status: fromStatus, to_status: newStatus, note });
  }

  // ── แก้ field ────────────────────────────────────────────────
  const f = body.fields ?? {};
  for (const key of EDITABLE_TEXT) {
    if (typeof f[key] === "string") patch[key] = f[key];
  }
  if (f.severity != null) {
    if (!SEVERITIES.includes(String(f.severity))) return Err.invalidFormat("severity");
    patch.severity = f.severity;
  }
  if (f.type != null) {
    if (!Object.keys(TYPE_TO_PREFIX).includes(String(f.type))) return Err.invalidFormat("type");
    patch.type = f.type; // ref/prefix ไม่เปลี่ยน (immutable)
  }
  if (Array.isArray(f.area)) {
    patch.area = f.area.filter((a: unknown) =>
      ISSUE_AREAS.includes(a as (typeof ISSUE_AREAS)[number]),
    );
  }
  const editedFields = Object.keys(patch).filter((k) => k !== "status" && k !== "resolved_at");
  if (editedFields.length > 0) {
    events.push({ action: "edited", note: note ?? `แก้: ${editedFields.join(", ")}` });
  }

  // ── โน้ตเปล่า (ไม่มี status/field) ────────────────────────────
  if (Object.keys(patch).length === 0) {
    if (!note) return Err.invalidFormat("body", "ไม่มีการเปลี่ยนแปลง");
    events.push({ action: "note", note });
  }

  if (Object.keys(patch).length > 0) {
    const { error: upErr } = await admin.from("system_issues").update(patch).eq("id", issueId);
    if (upErr) return Err.dbError(upErr);
  }

  for (const e of events) {
    await admin.from("system_issue_events").insert({
      issue_id: issueId,
      actor: "admin",
      action: e.action,
      from_status: e.from_status ?? null,
      to_status: e.to_status ?? null,
      note: e.note,
    });
  }

  // close-the-loop: แจ้งผู้รายงาน LINE เมื่อปิดเรื่อง (deployed/closed) — ครั้งเดียว
  if (newStatus && NOTIFY_STATUSES.includes(newStatus)) {
    await notifyReporterIfLine(admin, issueId).catch(() => {});
  }

  await logAdminAction(req, auth.userId, {
    action: "issue.update",
    targetType: "system_issue",
    targetId: decodeURIComponent(ref),
    metadata: { from: fromStatus, to: newStatus, edited: editedFields },
  });

  return ok({ ref: decodeURIComponent(ref), status: patch.status ?? fromStatus });
}
