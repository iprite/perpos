/**
 * projects.ts — fetch layer ของโครงการ (ใช้ร่วม: SSR page + API route)
 * contract: .claude/feature-factory/specs/just-me-project-loop.md §4.1 / §6 / §8
 *
 * กติกา:
 *  - รับ supabase client เข้ามาเสมอ (page = RLS client · route = service-role + strip ที่ API)
 *  - list ที่ยาวได้ต้องผ่าน `normalizePage`/`toPaged` → คืน `total` + `truncated`
 *  - **ห้ามคำนวณเงินในไฟล์นี้** — เรียก `summarizeProject()` จาก `project-metrics.ts`
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizePage, toPaged, type PageOpts, type Paged } from "@/lib/accounting/paging";
import { listApprovedBoqItems } from "./boq";
import { summarizeProject, type ProjectMoneySummary } from "./project-metrics";
import { listPrItems, listProjectPurchaseRequests } from "./purchasing";
import type {
  JustMeProject,
  JustMeProjectBilling,
  JustMeProjectCost,
  JustMeProjectFile,
  JustMeProjectProgress,
  JustMeProjectUsageRow,
  ProjectStatus,
} from "./types";

export interface ProjectReadOpts {
  /** true = viewer path (อ่าน view ที่ไม่มีคอลัมน์ต้นทุน) */
  basic?: boolean;
}

export interface ListProjectsOpts extends PageOpts, ProjectReadOpts {
  status?: ProjectStatus | ProjectStatus[];
  managerId?: string;
  /** ค้นหาจากชื่อโครงการ / รหัส / ชื่อลูกค้า */
  q?: string;
  /** ปี ค.ศ. ของ `start_date` */
  year?: number;
}

export async function listProjects(
  db: SupabaseClient,
  orgId: string,
  opts?: ListProjectsOpts,
): Promise<Paged<JustMeProject>> {
  const { limit, offset } = normalizePage(opts);
  const source = opts?.basic ? "just_me_projects_basic" : "just_me_projects";

  let q = db.from(source).select("*", { count: "exact" }).eq("org_id", orgId);
  if (opts?.status) {
    q = Array.isArray(opts.status) ? q.in("status", opts.status) : q.eq("status", opts.status);
  }
  if (opts?.managerId) q = q.eq("manager_id", opts.managerId);
  if (opts?.year)
    q = q.gte("start_date", `${opts.year}-01-01`).lte("start_date", `${opts.year}-12-31`);
  if (opts?.q) {
    // ตัดอักขระที่มีความหมายกับไวยากรณ์ตัวกรองของ PostgREST ทิ้งก่อนเสมอ
    // (`,` `.` `(` `)` `:` `%` `*` `\` — ไม่งั้นคำค้นกลายเป็นเงื่อนไขเพิ่มได้)
    const term = opts.q.replace(/[%,.()\\:*"']/g, " ").trim();
    if (term) {
      q = q.or(`name.ilike.%${term}%,project_code.ilike.%${term}%,customer_name.ilike.%${term}%`);
    }
  }

  const { data, error, count } = await q
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);
  if (error) throw new Error(error.message);
  return toPaged((data ?? []) as JustMeProject[], count, limit, offset);
}

export async function getProject(
  db: SupabaseClient,
  orgId: string,
  projectId: string,
  opts?: ProjectReadOpts,
): Promise<JustMeProject | null> {
  const source = opts?.basic ? "just_me_projects_basic" : "just_me_projects";
  const { data, error } = await db
    .from(source)
    .select("*")
    .eq("org_id", orgId)
    .eq("id", projectId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data ?? null) as JustMeProject | null;
}

export async function listProjectFiles(
  db: SupabaseClient,
  orgId: string,
  projectId: string,
): Promise<JustMeProjectFile[]> {
  const { data, error } = await db
    .from("just_me_project_files")
    .select("*")
    .eq("org_id", orgId)
    .eq("project_id", projectId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as JustMeProjectFile[];
}

/** ต้นทุนที่ไม่ผ่านคลัง (ค่าแรง/ผู้รับเหมาช่วง/ขนส่ง) — ข้อมูลต้นทุน: viewer ห้ามเห็น */
export async function listProjectCosts(
  db: SupabaseClient,
  orgId: string,
  projectId: string,
): Promise<JustMeProjectCost[]> {
  const { data, error } = await db
    .from("just_me_project_costs")
    .select("*")
    .eq("org_id", orgId)
    .eq("project_id", projectId)
    .order("cost_date", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as JustMeProjectCost[];
}

/** การเบิก/รับของจากคลังที่ผูกโครงการนี้ (`just_me_stock_movements`) */
export async function listProjectUsage(
  db: SupabaseClient,
  orgId: string,
  projectId: string,
  opts?: ProjectReadOpts,
): Promise<JustMeProjectUsageRow[]> {
  const source = opts?.basic ? "just_me_stock_movements_basic" : "just_me_stock_movements";
  const { data, error } = await db
    .from(source)
    .select("*")
    .eq("org_id", orgId)
    .eq("project_id", projectId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as JustMeProjectUsageRow[];
}

export async function listProjectBillings(
  db: SupabaseClient,
  orgId: string,
  projectId: string,
): Promise<JustMeProjectBilling[]> {
  const { data, error } = await db
    .from("just_me_project_billings")
    .select("*")
    .eq("org_id", orgId)
    .eq("project_id", projectId)
    .order("seq", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as JustMeProjectBilling[];
}

export async function listProjectProgress(
  db: SupabaseClient,
  orgId: string,
  projectId: string,
): Promise<JustMeProjectProgress[]> {
  const { data, error } = await db
    .from("just_me_project_progress")
    .select("*")
    .eq("org_id", orgId)
    .eq("project_id", projectId)
    .order("progress_date", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as JustMeProjectProgress[];
}

export interface ProjectMetrics {
  project: JustMeProject;
  summary: ProjectMoneySummary;
  /** ฐานที่นับได้ของแต่ละก้อน — การ์ดตัวเลขต้องแสดงคู่กันเสมอ (§8 กฎ 6) */
  counts: {
    boq_items: number;
    usage_rows: number;
    other_costs: number;
    purchase_requests: number;
    progress_rows: number;
    billings: number;
  };
  /** true = ยังไม่มี BOQ ที่อนุมัติ ⇒ งบ/คาดการณ์เป็น null ตามกติกา "ไม่มีข้อมูล ≠ 0" */
  has_budget: boolean;
}

/**
 * ตัวเลขสรุปของโครงการหนึ่ง — **จุดเดียวที่ประกอบข้อมูลเข้าสูตร**
 * (หน้า/route/รายงาน ห้ามคิดเอง — LESSONS mattii/p2p_group)
 */
export async function loadProjectMetrics(
  db: SupabaseClient,
  orgId: string,
  projectId: string,
): Promise<ProjectMetrics | null> {
  const project = await getProject(db, orgId, projectId);
  if (!project) return null;

  const [boqItems, usage, otherCosts, prs, progress, billings] = await Promise.all([
    listApprovedBoqItems(db, orgId, projectId),
    listProjectUsage(db, orgId, projectId),
    listProjectCosts(db, orgId, projectId),
    listProjectPurchaseRequests(db, orgId, projectId),
    listProjectProgress(db, orgId, projectId),
    listProjectBillings(db, orgId, projectId),
  ]);
  const prItems = await listPrItems(
    db,
    orgId,
    prs.map((p) => p.id),
  );

  const summary = summarizeProject({
    project,
    usage,
    otherCosts,
    prs,
    prItems,
    boqItems,
    progress,
    billings,
  });

  return {
    project,
    summary,
    counts: {
      boq_items: boqItems.length,
      usage_rows: usage.length,
      other_costs: otherCosts.length,
      purchase_requests: prs.length,
      progress_rows: progress.length,
      billings: billings.length,
    },
    has_budget: project.budget_cost !== null,
  };
}
