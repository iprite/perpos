/**
 * price-book.ts — ราคามาตรฐาน + หมวดงาน + ค่าตั้งต้นบริษัท (fetch layer)
 * contract: .claude/feature-factory/specs/just-me-project-loop.md §4.2 / §6
 *
 * ⛔ ข้อมูลทั้งไฟล์นี้เป็น "ต้นทุน/กำไร" — caller ต้องกันด้วย cost-access ก่อนเรียกเสมอ
 * ⛔ ห้ามเขียนสูตรเงินที่นี่ — ใช้ `effectiveMaterialCost` / `resolveMargin` / `unitPrice` / `costDrift`
 *    จาก `project-metrics.ts` (มี unit test คุมอยู่)
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  costDrift,
  effectiveMaterialCost,
  resolveMargin,
  unitCostTotal,
  unitPrice,
} from "./project-metrics";
import type { JustMePriceBookRow, JustMeSettings, JustMeWorkCategory, MarginSource } from "./types";

/** ค่าตั้งต้นเมื่อ org ยังไม่มีแถวใน `just_me_settings` (ตรงกับ DEFAULT ของ migration) */
export const DEFAULT_SETTINGS: Omit<JustMeSettings, "org_id"> = {
  default_margin_pct: 20,
  default_overhead_pct: null,
  cost_alert_pct: 10,
  pr_approval_required: true,
  updated_at: null,
};

export async function getSettings(db: SupabaseClient, orgId: string): Promise<JustMeSettings> {
  const { data, error } = await db
    .from("just_me_settings")
    .select("*")
    .eq("org_id", orgId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return { org_id: orgId, ...DEFAULT_SETTINGS };
  return data as JustMeSettings;
}

export async function listWorkCategories(
  db: SupabaseClient,
  orgId: string,
  opts?: { includeInactive?: boolean },
): Promise<JustMeWorkCategory[]> {
  let q = db.from("just_me_work_categories").select("*").eq("org_id", orgId);
  if (!opts?.includeInactive) q = q.eq("is_active", true);
  const { data, error } = await q
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as JustMeWorkCategory[];
}

/** แถวราคามาตรฐานที่ "คิดราคาให้แล้ว" — สิ่งที่หน้าจอ/BOQ ใช้จริง */
export interface PriceBookComputed extends JustMePriceBookRow {
  /** ต้นทุนเฉลี่ยจากคลัง (โหมด auto) — null = ยังไม่เคยซื้อของชิ้นนี้ */
  avg_cost: number | null;
  /** ต้นทุนวัสดุที่ใช้จริง (auto → avg_cost · manual → ค่าที่ตั้งไว้) — null = ยังไม่มีข้อมูล */
  effective_material_cost: number | null;
  /** ต้นทุนรวมต่อหน่วย — null เมื่อยังไม่รู้ต้นทุนวัสดุ (ห้ามตีเป็น 0) */
  unit_cost_total: number | null;
  /** ราคาขายต่อหน่วยที่ระบบเสนอ — null เมื่อยังไม่รู้ต้นทุน */
  unit_price: number | null;
  /** % กำไรที่ใช้จริงหลัง resolve + ชั้นที่มันมาจาก */
  margin_used_pct: number;
  margin_used_source: MarginSource;
  /** ราคาซื้อขยับจากฐานที่รับทราบไว้กี่ % (null = ยังไม่เคยตั้งฐาน) */
  cost_drift_pct: number | null;
  cost_alert: boolean;
}

export interface PriceBookListOpts {
  includeInactive?: boolean;
  categoryId?: string;
  /** ค้นหาจากชื่อรายการ */
  q?: string;
}

/**
 * ราคามาตรฐานพร้อมต้นทุน/ราคาขายที่คิดแล้ว
 * - โหมด `auto` join `just_me_item_costs.avg_cost` ตอนอ่าน (ไม่ snapshot — ราคาต้องสดเสมอ)
 * - เตือนราคาขยับด้วย `costDrift()` เทียบ `baseline_material_cost` ที่ผู้ใช้กด "รับทราบ" ไว้
 */
export async function listPriceBook(
  db: SupabaseClient,
  orgId: string,
  opts?: PriceBookListOpts,
): Promise<PriceBookComputed[]> {
  let q = db.from("just_me_price_book").select("*").eq("org_id", orgId);
  if (!opts?.includeInactive) q = q.eq("is_active", true);
  if (opts?.categoryId) q = q.eq("category_id", opts.categoryId);
  if (opts?.q) q = q.ilike("name", `%${opts.q}%`);
  const { data, error } = await q.order("name", { ascending: true });
  if (error) throw new Error(error.message);

  const rows = (data ?? []) as JustMePriceBookRow[];
  const [settings, categories, costMap] = await Promise.all([
    getSettings(db, orgId),
    listWorkCategories(db, orgId, { includeInactive: true }),
    loadAvgCosts(
      db,
      orgId,
      rows.map((r) => r.item_id),
    ),
  ]);
  const categoryMargin = new Map(categories.map((c) => [c.id, c.default_margin_pct]));

  return rows.map((row) =>
    computePriceBookRow(row, {
      avgCost: row.item_id ? (costMap.get(row.item_id) ?? null) : null,
      categoryMarginPct: row.category_id ? (categoryMargin.get(row.category_id) ?? null) : null,
      companyMarginPct: settings.default_margin_pct,
      companyAlertPct: settings.cost_alert_pct,
    }),
  );
}

export interface PriceBookComputeCtx {
  avgCost: number | null;
  categoryMarginPct: number | null;
  companyMarginPct: number | null;
  companyAlertPct: number;
  /** override ระดับโครงการ (ใช้ตอนหยิบราคาเข้า BOQ ของโครงการหนึ่ง ๆ) */
  projectMarginPct?: number | null;
}

export function computePriceBookRow(
  row: JustMePriceBookRow,
  ctx: PriceBookComputeCtx,
): PriceBookComputed {
  const material = effectiveMaterialCost({
    material_cost_mode: row.material_cost_mode,
    material_unit_cost_manual: row.material_unit_cost_manual,
    avg_cost: ctx.avgCost,
  });
  const margin = resolveMargin({
    priceBook: row.margin_pct,
    category: ctx.categoryMarginPct,
    project: ctx.projectMarginPct ?? null,
    company: ctx.companyMarginPct,
  });
  const parts =
    material === null
      ? null
      : { material, labor: row.labor_unit_cost ?? 0, overhead: row.overhead_unit_cost ?? 0 };
  const drift = costDrift(
    material,
    row.baseline_material_cost,
    row.cost_alert_pct ?? ctx.companyAlertPct,
  );

  return {
    ...row,
    avg_cost: ctx.avgCost,
    effective_material_cost: material,
    unit_cost_total: parts ? unitCostTotal(parts) : null,
    unit_price: parts ? unitPrice(parts, margin.pct) : null,
    margin_used_pct: margin.pct,
    margin_used_source: margin.source,
    cost_drift_pct: drift.pct,
    cost_alert: drift.alert,
  };
}

/** ต้นทุนเฉลี่ยถ่วงน้ำหนักของวัสดุที่อ้างถึง (คลังเดิม — เขียนโดย trigger เท่านั้น) */
export async function loadAvgCosts(
  db: SupabaseClient,
  orgId: string,
  itemIds: (string | null)[],
): Promise<Map<string, number | null>> {
  const ids = Array.from(new Set(itemIds.filter((v): v is string => !!v)));
  if (ids.length === 0) return new Map();
  const { data, error } = await db
    .from("just_me_item_costs")
    .select("item_id, avg_cost")
    .eq("org_id", orgId)
    .in("item_id", ids);
  if (error) throw new Error(error.message);
  const map = new Map<string, number | null>();
  for (const row of (data ?? []) as { item_id: string; avg_cost: number | null }[]) {
    map.set(row.item_id, row.avg_cost);
  }
  return map;
}

export interface InventoryItemOption {
  id: string;
  code: string;
  name: string;
  unit: string;
  /** ต้นทุนเฉลี่ยถ่วงน้ำหนักจากคลัง — null = ยังไม่เคยซื้อเข้า (ห้ามตีเป็น 0) */
  avg_cost: number | null;
}

/**
 * วัสดุในคลังสำหรับผูกกับราคามาตรฐานโหมด `auto`
 * ต้องผูก `item_id` เท่านั้นระบบถึงจะดึง `avg_cost` มาให้ได้ — ไม่ผูก = ต้นทุนเป็น null ตลอด
 */
export async function listInventoryItemOptions(
  db: SupabaseClient,
  orgId: string,
): Promise<InventoryItemOption[]> {
  const { data, error } = await db
    .from("just_me_inventory_items")
    .select("id, code, name, unit")
    .eq("org_id", orgId)
    .order("name");
  if (error) throw new Error(error.message);
  const items = (data ?? []) as Omit<InventoryItemOption, "avg_cost">[];
  const avg = await loadAvgCosts(
    db,
    orgId,
    items.map((i) => i.id),
  );
  return items.map((i) => ({ ...i, avg_cost: avg.get(i.id) ?? null }));
}

/** ราคามาตรฐานรายตัว (ใช้ตอนหยิบเข้า BOQ — ต้องรู้ทั้งต้นทุนและ margin ของรายการนั้น) */
export async function getPriceBookRow(
  db: SupabaseClient,
  orgId: string,
  id: string,
): Promise<JustMePriceBookRow | null> {
  const { data, error } = await db
    .from("just_me_price_book")
    .select("*")
    .eq("org_id", orgId)
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data ?? null) as JustMePriceBookRow | null;
}
