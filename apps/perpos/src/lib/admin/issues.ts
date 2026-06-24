/**
 * System Issue Tracker — fetch logic (อ่านผ่าน admin client ตอน SSR)
 *
 * เรียกจาก Server Component (hydrogen)/admin/issues/* → fetch ตอน SSR
 * filter/page อยู่ใน URL searchParams (server re-render เมื่อเปลี่ยน → ใช้ loading.tsx)
 * รับ admin client (service role) — auth/role check เป็นหน้าที่ของ caller (requireSuperAdminPage)
 *
 * single source of truth ของระบบ tracking ปัญหา — ใช้ร่วมกับ Fix Factory (agent เขียนผ่าน MCP)
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export type IssueStatus =
  | "open"
  | "triaging"
  | "diagnosing"
  | "fixing"
  | "verifying"
  | "fixed"
  | "deployed"
  | "closed"
  | "blocked"
  | "wontfix"
  | "duplicate"
  | "handoff_feature";

export type IssueType = "bug" | "user_error" | "config_infra" | "feature_gap";
export type IssueSeverity = "sev1" | "sev2" | "sev3";
export type IssueSource = "admin" | "agent" | "line" | "signal";

export type IssueRow = {
  id: string;
  ref: string;
  prefix: string;
  type: IssueType;
  severity: IssueSeverity;
  status: IssueStatus;
  title: string;
  symptom: string | null;
  reproduce: string | null;
  area: string[];
  root_cause: string | null;
  fix_summary: string | null;
  branch: string | null;
  files_touched: string[];
  evidence: Record<string, unknown>;
  case_note_md: string | null;
  source: IssueSource;
  reported_by: string | null;
  reporter_note: string | null;
  parent_issue_id: string | null;
  dedup_key: string | null;
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
};

export type IssueEvent = {
  id: string;
  issue_id: string;
  at: string;
  actor: string | null;
  action: string;
  from_status: string | null;
  to_status: string | null;
  note: string | null;
};

const ISSUE_COLUMNS =
  "id, ref, prefix, type, severity, status, title, symptom, reproduce, area, root_cause, fix_summary, branch, files_touched, evidence, case_note_md, source, reported_by, reporter_note, parent_issue_id, dedup_key, created_at, updated_at, resolved_at";

// สถานะที่ถือว่า "ปิดงานแล้ว" (ใช้แยกการ์ดเปิด/ปิด)
export const CLOSED_STATUSES: IssueStatus[] = ["closed", "wontfix", "duplicate"];

// สถานะที่ถือว่าแก้เสร็จแล้ว → ตั้ง resolved_at (เข้าครั้งแรก)
export const RESOLVED_STATUSES: IssueStatus[] = ["fixed", "deployed", "closed"];

// สถานะที่ยัง "ค้าง/ต้องจัดการ" — ใช้นับ "เปิดค้าง" + ไฮไลต์แถวด่วน
// (ไม่รวม fixed/deployed = แก้แล้ว, closed/wontfix/duplicate = ปิด, handoff_feature = ส่งต่อแล้ว)
export const ACTIVE_STATUSES: IssueStatus[] = [
  "open",
  "triaging",
  "diagnosing",
  "fixing",
  "verifying",
  "blocked",
];
export const isActiveStatus = (s: IssueStatus) => ACTIVE_STATUSES.includes(s);

/** จำนวนวันที่ผ่านมาตั้งแต่ ISO timestamp (ปัดลง) — ใช้แสดง "ค้าง N วัน" */
export const daysSince = (iso: string) =>
  Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);

// map ประเภท → prefix ของเลขอ้างอิง (freeze ตอนสร้าง — ดู migration)
export const TYPE_TO_PREFIX: Record<IssueType, string> = {
  bug: "BUG",
  config_infra: "OPS",
  user_error: "UX",
  feature_gap: "FEAT",
};

export const ISSUE_AREAS = ["ui", "api", "lib", "db", "line", "worker", "external"] as const;

export type ListIssuesResult = {
  items: IssueRow[];
  total: number;
  page: number;
  limit: number;
};

export async function listIssues(
  admin: SupabaseClient,
  opts: {
    status?: string;
    type?: string;
    severity?: string;
    page?: number;
    limit?: number;
  } = {},
): Promise<ListIssuesResult> {
  const page = Math.max(1, Number(opts.page ?? 1));
  const limit = Math.min(200, Math.max(1, Number(opts.limit ?? 50)));
  const from = (page - 1) * limit;
  const to = from + limit - 1;

  let q = admin
    .from("system_issues")
    .select(ISSUE_COLUMNS, { count: "exact" })
    .order("created_at", { ascending: false })
    .range(from, to);

  if (opts.status) q = q.eq("status", opts.status);
  if (opts.type) q = q.eq("type", opts.type);
  if (opts.severity) q = q.eq("severity", opts.severity);

  const { data, count } = await q;

  return {
    items: (data ?? []) as unknown as IssueRow[],
    total: count ?? 0,
    page,
    limit,
  };
}

export type IssueStats = {
  activeTotal: number; // ยังไม่ปิด (ไม่ใช่ closed/wontfix/duplicate)
  activeBySeverity: { sev1: number; sev2: number; sev3: number };
  bySource: { admin: number; agent: number; line: number; signal: number };
  mttrHours: number | null; // เวลาเฉลี่ยจากแจ้ง → resolved_at
  resolved7d: number; // ปิด/แก้ใน 7 วันล่าสุด
};

/** สถิติภาพรวมสำหรับ dashboard ของ Issue Tracker (1 query, คำนวณใน JS — ปริมาณ issue ต่ำ) */
export async function getIssueStats(admin: SupabaseClient): Promise<IssueStats> {
  const { data } = await admin
    .from("system_issues")
    .select("severity, source, status, created_at, resolved_at")
    .limit(5000);
  const rows = (data ?? []) as unknown as Pick<
    IssueRow,
    "severity" | "source" | "status" | "created_at" | "resolved_at"
  >[];

  const stats: IssueStats = {
    activeTotal: 0,
    activeBySeverity: { sev1: 0, sev2: 0, sev3: 0 },
    bySource: { admin: 0, agent: 0, line: 0, signal: 0 },
    mttrHours: null,
    resolved7d: 0,
  };

  const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  let resolveSumMs = 0;
  let resolveCount = 0;

  for (const r of rows) {
    stats.bySource[r.source] = (stats.bySource[r.source] ?? 0) + 1;
    if (isActiveStatus(r.status)) {
      stats.activeTotal++;
      stats.activeBySeverity[r.severity]++;
    }
    if (r.resolved_at) {
      const ms = new Date(r.resolved_at).getTime() - new Date(r.created_at).getTime();
      if (ms >= 0) {
        resolveSumMs += ms;
        resolveCount++;
      }
      if (new Date(r.resolved_at).getTime() >= sevenDaysAgo) stats.resolved7d++;
    }
  }

  stats.mttrHours = resolveCount > 0 ? resolveSumMs / resolveCount / 3_600_000 : null;
  return stats;
}

export type IssueReporter = {
  display_name: string | null;
  email: string | null;
  line_user_id: string | null;
};

export async function getIssueByRef(
  admin: SupabaseClient,
  ref: string,
): Promise<{ issue: IssueRow; events: IssueEvent[]; reporter: IssueReporter | null } | null> {
  const { data: issue } = await admin
    .from("system_issues")
    .select(ISSUE_COLUMNS)
    .eq("ref", ref)
    .maybeSingle();
  if (!issue) return null;
  const issueRow = issue as unknown as IssueRow;

  const { data: events } = await admin
    .from("system_issue_events")
    .select("id, issue_id, at, actor, action, from_status, to_status, note")
    .eq("issue_id", issueRow.id)
    .order("at", { ascending: false });

  // ผู้รายงาน (ถ้าผูก profile ไว้ — เช่น แจ้งผ่าน LINE) — ให้ admin ติดต่อกลับ/ถามเพิ่มได้
  let reporter: IssueReporter | null = null;
  if (issueRow.reported_by) {
    const { data: prof } = await admin
      .from("profiles")
      .select("display_name, email, line_user_id")
      .eq("id", issueRow.reported_by)
      .maybeSingle();
    if (prof) reporter = prof as unknown as IssueReporter;
  }

  return {
    issue: issueRow,
    events: (events ?? []) as unknown as IssueEvent[],
    reporter,
  };
}
