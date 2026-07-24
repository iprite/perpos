/**
 * lib/bi/dashboards.ts — แดชบอร์ดส่วนตัวของผู้ใช้ (Phase 3 · P3-D1)
 *
 * ═══ กฎเหล็กของไฟล์นี้ (คลาสเดียวกับ BLOCKER-1 ที่เคยหลุด) ═════════════════
 * ตาราง `bi_dashboards` / `bi_dashboard_items` ถูก **REVOKE จาก `authenticated`**
 * ⇒ ทุก access วิ่งผ่าน service-role ⇒ **RLS ไม่ทำงาน ด่านจริงคือโค้ดไฟล์นี้**
 *   - `profileId` เป็นพารามิเตอร์ **บังคับ** ของทุกฟังก์ชัน (ห้าม optional / ห้าม default null)
 *   - `isDashboardOwnedBy()` เป็นด่านแรกเสมอ **ก่อนแตะ item ใด ๆ**
 *   - ไม่ใช่เจ้าของ / ไม่มีอยู่ = คืน `null`/`false` เหมือนกัน → caller ตอบ **404 ห้าม 403**
 * ═════════════════════════════════════════════════════════════════════════
 *
 * degrade: `bi_dashboard_items.updated_at` เป็นของใหม่ (migration Phase 3) — ถ้าฐานยังไม่มี
 * คอลัมน์นี้ ให้ถอยไป select ชุดเดิม (ท่าเดียวกับ `answer_meta` ใน `threads.ts`)
 */

import type { createAdminClient } from "@/app/api/_lib/supabase";
import {
  isChartType,
  DEFAULT_DASHBOARD_NAME,
  MAX_DASHBOARDS_PER_USER,
  MAX_ITEMS_PER_DASHBOARD,
  type BiDashboard,
  type BiDashboardItem,
  type BiDashboardWithItems,
  type BiMetricParams,
  type ChartType,
  type MoveDirection,
} from "./types";

type Admin = ReturnType<typeof createAdminClient>;

const DASHBOARD_COLS = "id, org_id, name, created_by, created_at, updated_at";
/** คอลัมน์ของ `bi_dashboard_items` ก่อนมี `updated_at` (Phase 1) */
const ITEM_COLS_LEGACY =
  "id, org_id, dashboard_id, title, metric_key, params, chart_type, position, created_at";
const ITEM_COLS = `${ITEM_COLS_LEGACY}, updated_at`;

/** true = ฐานยังไม่มีคอลัมน์ `updated_at` ของ `bi_dashboard_items` */
function isMissingItemUpdatedAt(message: string): boolean {
  return /updated_at/i.test(message) && /(column|does not exist|schema cache)/i.test(message);
}

const NAME_MAX = 80;
const TITLE_MAX = 120;

/** เพดานถูกชน — route แปลงเป็น 400 พร้อมข้อความไทยของ error นี้ */
export class BiDashboardLimitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BiDashboardLimitError";
  }
}

// ─── ownership ─────────────────────────────────────────────────────────────

/**
 * แดชบอร์ดใบนี้เป็นของ `profileId` จริงหรือไม่ (org เดียวกัน)
 * — ด่านแรกของทุก route ที่มี `[id]` **ก่อนนับโควตาและก่อนแตะ item**
 */
export async function isDashboardOwnedBy(
  admin: Admin,
  orgId: string,
  dashboardId: string,
  profileId: string,
): Promise<boolean> {
  if (!dashboardId || !profileId) return false;
  const { data, error } = await admin
    .from("bi_dashboards")
    .select("id")
    .eq("org_id", orgId)
    .eq("id", dashboardId)
    .eq("created_by", profileId)
    .maybeSingle();
  if (error) throw new Error(`isDashboardOwnedBy: ${error.message}`);
  return Boolean(data);
}

// ─── read ──────────────────────────────────────────────────────────────────

/** แดชบอร์ดทั้งหมด **ของผู้ใช้คนนี้** ใน org นี้ (พร้อมจำนวนการ์ด) */
export async function listDashboards(
  admin: Admin,
  orgId: string,
  profileId: string,
): Promise<BiDashboard[]> {
  if (!profileId) return [];

  const { data, error } = await admin
    .from("bi_dashboards")
    .select(DASHBOARD_COLS)
    .eq("org_id", orgId)
    .eq("created_by", profileId)
    .order("created_at", { ascending: true })
    .limit(MAX_DASHBOARDS_PER_USER);
  if (error) throw new Error(`listDashboards: ${error.message}`);

  const dashboards = (data ?? []).map(normalizeDashboard);
  if (dashboards.length === 0) return [];

  // นับการ์ดใน query เดียว (ห้าม N+1) — การ์ดเข้าถึงผ่าน dashboard ที่ผ่าน ownership แล้วเท่านั้น
  const counts = new Map<string, number>();
  const { data: items } = await admin
    .from("bi_dashboard_items")
    .select("dashboard_id")
    .eq("org_id", orgId)
    .in(
      "dashboard_id",
      dashboards.map((d) => d.id),
    );
  for (const row of (items ?? []) as Array<{ dashboard_id?: string }>) {
    const id = row.dashboard_id;
    if (id) counts.set(id, (counts.get(id) ?? 0) + 1);
  }

  return dashboards.map((d) => ({ ...d, item_count: counts.get(d.id) ?? 0 }));
}

/** แดชบอร์ด + การ์ด — เฉพาะของเจ้าของเท่านั้น · ไม่ใช่เจ้าของ/ไม่มี = `null` (404) */
export async function getDashboard(
  admin: Admin,
  orgId: string,
  dashboardId: string,
  profileId: string,
): Promise<BiDashboardWithItems | null> {
  if (!profileId) return null;

  const { data: dashboard, error } = await admin
    .from("bi_dashboards")
    .select(DASHBOARD_COLS)
    .eq("org_id", orgId)
    .eq("id", dashboardId)
    .eq("created_by", profileId)
    .maybeSingle();
  if (error) throw new Error(`getDashboard: ${error.message}`);
  if (!dashboard) return null;

  const items = await listItems(admin, orgId, dashboardId);
  return { dashboard: normalizeDashboard(dashboard), items };
}

/** การ์ดของแดชบอร์ดที่ **ผ่าน ownership แล้ว** (internal — ห้ามเรียกก่อนตรวจเจ้าของ) */
async function listItems(
  admin: Admin,
  orgId: string,
  dashboardId: string,
): Promise<BiDashboardItem[]> {
  const select = (cols: string) =>
    admin
      .from("bi_dashboard_items")
      .select(cols)
      .eq("org_id", orgId)
      .eq("dashboard_id", dashboardId)
      .order("position", { ascending: true })
      .order("created_at", { ascending: true })
      .limit(MAX_ITEMS_PER_DASHBOARD);

  let { data, error } = await select(ITEM_COLS);
  if (error && isMissingItemUpdatedAt(error.message)) {
    ({ data, error } = await select(ITEM_COLS_LEGACY));
  }
  if (error) throw new Error(`listItems: ${error.message}`);
  return (data ?? []).map(normalizeItem);
}

// ─── write: dashboard ──────────────────────────────────────────────────────

export interface CreateDashboardInput {
  orgId: string;
  profileId: string;
  name?: string | null;
}

export async function createDashboard(
  admin: Admin,
  input: CreateDashboardInput,
): Promise<BiDashboard> {
  const existing = await listDashboards(admin, input.orgId, input.profileId);
  if (existing.length >= MAX_DASHBOARDS_PER_USER) {
    throw new BiDashboardLimitError(
      `สร้างแดชบอร์ดได้สูงสุด ${MAX_DASHBOARDS_PER_USER} หน้า กรุณาลบของเดิมก่อน`,
    );
  }

  const { data, error } = await admin
    .from("bi_dashboards")
    .insert({
      org_id: input.orgId,
      created_by: input.profileId,
      name: cleanName(input.name) || DEFAULT_DASHBOARD_NAME,
    })
    .select(DASHBOARD_COLS)
    .single();
  if (error) throw new Error(`createDashboard: ${error.message}`);
  return normalizeDashboard(data);
}

/**
 * แดชบอร์ดตั้งต้นของผู้ใช้ (Q1 ข้อ ii) — ปักหมุดครั้งแรกไม่ต้องให้ตั้งชื่อก่อน
 * มีอยู่แล้ว = คืนใบแรก (เรียงตาม `created_at`) · ยังไม่มี = สร้าง "แดชบอร์ดของฉัน"
 */
export async function ensureDefaultDashboard(
  admin: Admin,
  orgId: string,
  profileId: string,
): Promise<BiDashboard> {
  const existing = await listDashboards(admin, orgId, profileId);
  if (existing.length > 0) return existing[0];
  return createDashboard(admin, { orgId, profileId, name: DEFAULT_DASHBOARD_NAME });
}

export async function renameDashboard(
  admin: Admin,
  orgId: string,
  dashboardId: string,
  profileId: string,
  name: string,
): Promise<BiDashboard | null> {
  if (!profileId) return null;
  const clean = cleanName(name);
  if (!clean) throw new BiDashboardLimitError("กรุณาตั้งชื่อแดชบอร์ด");

  const { data, error } = await admin
    .from("bi_dashboards")
    .update({ name: clean })
    .eq("org_id", orgId)
    .eq("id", dashboardId)
    .eq("created_by", profileId)
    .select(DASHBOARD_COLS)
    .maybeSingle();
  if (error) throw new Error(`renameDashboard: ${error.message}`);
  return data ? normalizeDashboard(data) : null;
}

/** ลบแดชบอร์ด (การ์ดถูกลบตาม FK CASCADE) — คืน `false` เมื่อไม่ใช่เจ้าของ/ไม่มี */
export async function deleteDashboard(
  admin: Admin,
  orgId: string,
  dashboardId: string,
  profileId: string,
): Promise<boolean> {
  if (!profileId) return false;
  const { data, error } = await admin
    .from("bi_dashboards")
    .delete()
    .eq("org_id", orgId)
    .eq("id", dashboardId)
    .eq("created_by", profileId)
    .select("id");
  if (error) throw new Error(`deleteDashboard: ${error.message}`);
  return (data ?? []).length > 0;
}

// ─── write: item ───────────────────────────────────────────────────────────

export interface PinItemInput {
  orgId: string;
  dashboardId: string;
  profileId: string;
  metricKey: string;
  params?: BiMetricParams | null;
  chartType?: ChartType | string | null;
  title?: string | null;
}

/**
 * ปักหมุดคำตอบเป็นการ์ดใหม่ (ต่อท้ายเสมอ)
 * — ตรวจเจ้าของก่อนแตะ item · ไม่ใช่เจ้าของ = `null` (404)
 * — **ผู้เรียกต้องตรวจก่อนแล้วว่า `metricKey` เป็น metric ที่ role นี้เห็นได้จริง**
 */
export async function pinItem(admin: Admin, input: PinItemInput): Promise<BiDashboardItem | null> {
  if (!(await isDashboardOwnedBy(admin, input.orgId, input.dashboardId, input.profileId))) {
    return null;
  }

  const items = await listItems(admin, input.orgId, input.dashboardId);
  if (items.length >= MAX_ITEMS_PER_DASHBOARD) {
    throw new BiDashboardLimitError(
      `ปักหมุดได้สูงสุด ${MAX_ITEMS_PER_DASHBOARD} การ์ดต่อแดชบอร์ด กรุณาลบการ์ดเดิมก่อน`,
    );
  }

  const nextPosition = items.reduce((max, it) => Math.max(max, it.position), -1) + 1;
  const { data, error } = await admin
    .from("bi_dashboard_items")
    .insert({
      org_id: input.orgId,
      dashboard_id: input.dashboardId,
      title: cleanTitle(input.title),
      metric_key: input.metricKey,
      params: input.params ?? {},
      chart_type: isChartType(input.chartType) ? input.chartType : null,
      position: nextPosition,
    })
    .select(ITEM_COLS_LEGACY)
    .single();
  if (error) throw new Error(`pinItem: ${error.message}`);
  return normalizeItem(data);
}

export interface UpdateItemPatch {
  title?: string | null;
  params?: BiMetricParams | null;
  chartType?: ChartType | string | null;
}

/** แก้ชื่อ/ช่วงเวลา-ฟิลเตอร์/ชนิดกราฟของการ์ด — ไม่ใช่เจ้าของ = `null` */
export async function updateItem(
  admin: Admin,
  orgId: string,
  dashboardId: string,
  itemId: string,
  profileId: string,
  patch: UpdateItemPatch,
): Promise<BiDashboardItem | null> {
  if (!(await isDashboardOwnedBy(admin, orgId, dashboardId, profileId))) return null;

  const payload: Record<string, unknown> = {};
  if (patch.title !== undefined) payload.title = cleanTitle(patch.title);
  if (patch.params !== undefined && patch.params !== null) payload.params = patch.params;
  if (patch.chartType !== undefined) {
    payload.chart_type = isChartType(patch.chartType) ? patch.chartType : null;
  }
  if (Object.keys(payload).length === 0) {
    const items = await listItems(admin, orgId, dashboardId);
    return items.find((i) => i.id === itemId) ?? null;
  }

  const { data, error } = await admin
    .from("bi_dashboard_items")
    .update(payload)
    .eq("org_id", orgId)
    .eq("dashboard_id", dashboardId)
    .eq("id", itemId)
    .select(ITEM_COLS_LEGACY)
    .maybeSingle();
  if (error) throw new Error(`updateItem: ${error.message}`);
  return data ? normalizeItem(data) : null;
}

/**
 * ย้ายลำดับการ์ดขึ้น/ลงหนึ่งขั้น (P3-D6 — ไม่มี drag/drop)
 * เซิร์ฟเวอร์คำนวณ `position` ใหม่ทั้งแดชบอร์ด (0..n-1) แล้วสลับคู่ที่ติดกัน
 */
export async function moveItem(
  admin: Admin,
  orgId: string,
  dashboardId: string,
  itemId: string,
  profileId: string,
  direction: MoveDirection,
): Promise<BiDashboardItem | null> {
  if (!(await isDashboardOwnedBy(admin, orgId, dashboardId, profileId))) return null;

  const items = await listItems(admin, orgId, dashboardId);
  const index = items.findIndex((i) => i.id === itemId);
  if (index < 0) return null;

  const target = direction === "up" ? index - 1 : index + 1;
  const ordered = [...items];
  if (target >= 0 && target < ordered.length) {
    [ordered[index], ordered[target]] = [ordered[target], ordered[index]];
  }

  // เขียน position ใหม่ให้ทุกใบ (ทำให้ลำดับเป็น 0..n-1 เสมอ แม้ของเดิมจะเพี้ยน)
  for (let i = 0; i < ordered.length; i++) {
    if (ordered[i].position === i) continue;
    const { error } = await admin
      .from("bi_dashboard_items")
      .update({ position: i })
      .eq("org_id", orgId)
      .eq("dashboard_id", dashboardId)
      .eq("id", ordered[i].id);
    if (error) throw new Error(`moveItem: ${error.message}`);
    ordered[i] = { ...ordered[i], position: i };
  }

  return ordered.find((i) => i.id === itemId) ?? null;
}

export async function deleteItem(
  admin: Admin,
  orgId: string,
  dashboardId: string,
  itemId: string,
  profileId: string,
): Promise<boolean> {
  if (!(await isDashboardOwnedBy(admin, orgId, dashboardId, profileId))) return false;

  const { data, error } = await admin
    .from("bi_dashboard_items")
    .delete()
    .eq("org_id", orgId)
    .eq("dashboard_id", dashboardId)
    .eq("id", itemId)
    .select("id");
  if (error) throw new Error(`deleteItem: ${error.message}`);
  return (data ?? []).length > 0;
}

// ─── normalizers ───────────────────────────────────────────────────────────

function cleanName(name?: string | null): string {
  return String(name ?? "")
    .trim()
    .slice(0, NAME_MAX);
}

function cleanTitle(title?: string | null): string | null {
  const t = String(title ?? "")
    .trim()
    .slice(0, TITLE_MAX);
  return t ? t : null;
}

function normalizeDashboard(row: unknown): BiDashboard {
  const r = (row ?? {}) as Record<string, unknown>;
  return {
    id: String(r.id ?? ""),
    org_id: String(r.org_id ?? ""),
    name: String(r.name ?? DEFAULT_DASHBOARD_NAME),
    created_by: String(r.created_by ?? ""),
    created_at: String(r.created_at ?? ""),
    updated_at: String(r.updated_at ?? ""),
  };
}

function normalizeItem(row: unknown): BiDashboardItem {
  const r = (row ?? {}) as Record<string, unknown>;
  return {
    id: String(r.id ?? ""),
    org_id: String(r.org_id ?? ""),
    dashboard_id: String(r.dashboard_id ?? ""),
    title: typeof r.title === "string" && r.title.trim() ? r.title : null,
    metric_key: String(r.metric_key ?? ""),
    params: (r.params ?? {}) as BiMetricParams,
    chart_type: isChartType(r.chart_type) ? r.chart_type : null,
    position: Number.isFinite(Number(r.position)) ? Number(r.position) : 0,
    created_at: String(r.created_at ?? ""),
    updated_at: typeof r.updated_at === "string" ? r.updated_at : null,
  };
}
