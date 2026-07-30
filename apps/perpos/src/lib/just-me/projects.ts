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
import {
  fetchAllRows,
  normalizePage,
  toPaged,
  type PageOpts,
  type Paged,
  type RowsPage,
} from "@/lib/accounting/paging";
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
  JustMePurchaseRequest,
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

/** ดึงทุกแถวที่ใช้คิดยอดรวม (กัน PostgREST ตัดเงียบ 1,000 แถว) แล้วคืนเฉพาะ rows */
async function allRows<T>(
  page: (from: number, to: number) => RowsPage<T>,
  maxRows = 20_000,
): Promise<T[]> {
  const { rows } = await fetchAllRows<T>(page, { maxRows });
  return rows;
}

/**
 * สรุปเงินของ **หลายโครงการพร้อมกัน** (ตารางโครงการ / การ์ด KPI)
 * — คิวรีคงที่ ~7 ครั้งไม่ว่าจะกี่โครงการ (ห้ามวนเรียก `loadProjectMetrics` ทีละใบ)
 * — ทุกตัวเลขยังมาจาก `summarizeProject()` ที่เดียวเหมือนเดิม (ไฟล์นี้แค่ประกอบข้อมูล)
 * ⛔ เป็นข้อมูลต้นทุน — caller ต้องผ่าน cost-access ก่อนเรียกเสมอ
 */
export async function loadProjectSummaries(
  db: SupabaseClient,
  orgId: string,
  projects: Pick<JustMeProject, "id" | "status" | "contract_amount" | "budget_cost">[],
): Promise<Map<string, ProjectMoneySummary>> {
  const out = new Map<string, ProjectMoneySummary>();
  const ids = projects.map((p) => p.id);
  if (ids.length === 0) return out;

  const [boqs, usage, otherCosts, prs, progress, billings] = await Promise.all([
    allRows<{ id: string; project_id: string }>((from, to) =>
      db
        .from("just_me_boqs")
        .select("id, project_id")
        .eq("org_id", orgId)
        .eq("status", "approved")
        .in("project_id", ids)
        .range(from, to),
    ),
    allRows<{ project_id: string; movement_type: string; total_cost: number | null }>((from, to) =>
      db
        .from("just_me_stock_movements")
        .select("project_id, movement_type, total_cost")
        .eq("org_id", orgId)
        .in("project_id", ids)
        .range(from, to),
    ),
    allRows<{ project_id: string; amount: number | null }>((from, to) =>
      db
        .from("just_me_project_costs")
        .select("project_id, amount")
        .eq("org_id", orgId)
        .in("project_id", ids)
        .range(from, to),
    ),
    allRows<{ id: string; project_id: string; status: string }>((from, to) =>
      db
        .from("just_me_purchase_requests")
        .select("id, project_id, status")
        .eq("org_id", orgId)
        .in("project_id", ids)
        .range(from, to),
    ),
    allRows<{
      project_id: string;
      boq_item_id: string | null;
      progress_date: string;
      done_qty: number | null;
      percent: number | null;
      created_at: string;
    }>((from, to) =>
      db
        .from("just_me_project_progress")
        .select("project_id, boq_item_id, progress_date, done_qty, percent, created_at")
        .eq("org_id", orgId)
        .in("project_id", ids)
        .range(from, to),
    ),
    allRows<{ project_id: string; amount: number | null; status: string }>((from, to) =>
      db
        .from("just_me_project_billings")
        .select("project_id, amount, status")
        .eq("org_id", orgId)
        .in("project_id", ids)
        .range(from, to),
    ),
  ]);

  const boqProject = new Map(boqs.map((b) => [b.id, b.project_id]));
  const [boqItems, prItems] = await Promise.all([
    boqs.length === 0
      ? Promise.resolve([])
      : allRows<{ id: string; boq_id: string; qty: number; amount: number }>((from, to) =>
          db
            .from("just_me_boq_items")
            .select("id, boq_id, qty, amount")
            .eq("org_id", orgId)
            .in(
              "boq_id",
              boqs.map((b) => b.id),
            )
            .range(from, to),
        ),
    prs.length === 0
      ? Promise.resolve([])
      : allRows<{
          pr_id: string;
          qty: number;
          received_qty: number;
          selected_unit_cost: number | null;
          estimated_unit_cost: number | null;
        }>((from, to) =>
          db
            .from("just_me_pr_items")
            .select("pr_id, qty, received_qty, selected_unit_cost, estimated_unit_cost")
            .eq("org_id", orgId)
            .in(
              "pr_id",
              prs.map((p) => p.id),
            )
            .range(from, to),
        ),
  ]);
  const prProject = new Map(prs.map((p) => [p.id, p.project_id]));

  const bucket = <T>(rows: T[], key: (row: T) => string | undefined) => {
    const map = new Map<string, T[]>();
    for (const row of rows) {
      const k = key(row);
      if (!k) continue;
      const list = map.get(k);
      if (list) list.push(row);
      else map.set(k, [row]);
    }
    return map;
  };

  const usageBy = bucket(usage, (r) => r.project_id);
  const costsBy = bucket(otherCosts, (r) => r.project_id);
  const prsBy = bucket(prs, (r) => r.project_id);
  const prItemsBy = bucket(prItems, (r) => prProject.get(r.pr_id));
  const boqItemsBy = bucket(boqItems, (r) => boqProject.get(r.boq_id));
  const progressBy = bucket(progress, (r) => r.project_id);
  const billingsBy = bucket(billings, (r) => r.project_id);

  for (const project of projects) {
    out.set(
      project.id,
      summarizeProject({
        project,
        usage: (usageBy.get(project.id) ?? []) as JustMeProjectUsageRow[],
        otherCosts: (costsBy.get(project.id) ?? []).map((c) => ({ amount: c.amount ?? 0 })),
        prs: (prsBy.get(project.id) ?? []) as JustMePurchaseRequest[],
        prItems: prItemsBy.get(project.id) ?? [],
        boqItems: boqItemsBy.get(project.id) ?? [],
        progress: (progressBy.get(project.id) ?? []) as JustMeProjectProgress[],
        billings: (billingsBy.get(project.id) ?? []) as JustMeProjectBilling[],
      }),
    );
  }
  return out;
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
