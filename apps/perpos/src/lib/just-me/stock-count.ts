/**
 * stock-count.ts — ตรวจนับสต๊อกจริง + ปรับยอด (ของหาย/ของเกินที่ไซต์)
 *
 * กติกาที่ห้ามพัง:
 *   1. `system_qty` = ยอดตามระบบ ณ ตอนเปิดใบ (freeze) — ห้ามคำนวณใหม่ตอนลงบัญชี
 *      (ระหว่างเดินนับอาจมีการรับ/เบิกเข้ามา ถ้าคิดใหม่ผลต่างจะกลายเป็นตัวเลขที่ไม่มีใครนับ)
 *   2. `counted_qty = null` = **ยังไม่ได้เดินนับบรรทัดนี้** ≠ นับได้ 0 → ไม่ปรับยอด
 *   3. ผลต่าง ≠ 0 ต้องมีเหตุผล (ของหายต้องอธิบายได้)
 *   4. การปรับยอดเดินผ่าน `postStockMovement()` เท่านั้น (RPC atomic) — ห้ามแก้ยอดคงเหลือตรง ๆ
 *
 * สูตร/กฎที่คิดเป็นตัวเลขอยู่ในส่วน "กฎล้วน" ด้านล่าง (มี unit test คุม) — ห้ามคำนวณซ้ำในหน้า
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizePage, toPaged, type PageOpts, type Paged } from "@/lib/accounting/paging";

export type StockCountStatus = "draft" | "posted" | "cancelled";

export interface JustMeStockCount {
  id: string;
  org_id: string;
  warehouse_id: string;
  count_code: string;
  status: StockCountStatus;
  counted_date: string;
  note: string | null;
  posted_at: string | null;
  posted_by: string | null;
  created_at: string;
  created_by: string | null;
}

export interface JustMeStockCountItem {
  id: string;
  org_id: string;
  count_id: string;
  item_id: string;
  system_qty: number;
  counted_qty: number | null;
  /** เหตุผลของผลต่าง (บังคับเมื่อผลต่าง ≠ 0) */
  note: string | null;
}

// ─── กฎล้วน (unit test คุม — ผิดแล้วยอดคลัง/มูลค่าเพี้ยน) ────────────────────

/** ค่าที่ถือว่า "เท่ากัน" — กันเศษทศนิยมของ numeric ทำให้เกิดรายการปรับยอด 0.0000001 */
const EPSILON = 0.0001;

/** ผลต่าง = นับจริง − ตามระบบ · `null` เมื่อยังไม่ได้นับบรรทัดนี้ */
export function lineDiff(
  line: Pick<JustMeStockCountItem, "system_qty" | "counted_qty">,
): number | null {
  if (line.counted_qty === null || line.counted_qty === undefined) return null;
  const diff = Number(line.counted_qty) - Number(line.system_qty ?? 0);
  return Math.abs(diff) < EPSILON ? 0 : diff;
}

export interface StockCountSummary {
  /** บรรทัดทั้งหมดในใบ */
  totalLines: number;
  /** บรรทัดที่เดินนับแล้ว (กรอก counted_qty) */
  countedLines: number;
  /** บรรทัดที่ผลต่าง ≠ 0 (= จำนวนรายการที่จะถูกปรับยอด) */
  diffLines: number;
  /** ของเกิน (นับได้มากกว่าระบบ) รวมกี่หน่วย */
  surplusQty: number;
  /** ของขาด (นับได้น้อยกว่าระบบ) รวมกี่หน่วย — เป็นค่าบวก */
  shortageQty: number;
  /** มูลค่าผลต่างรวม (ใช้ต้นทุนเฉลี่ยต่อวัสดุ) — `null` เมื่อไม่มีต้นทุนของวัสดุที่ต่างเลย */
  diffValue: number | null;
}

/**
 * สรุปใบตรวจนับ — `avgCostByItem` = ต้นทุนเฉลี่ยต่อวัสดุ (`just_me_item_costs.avg_cost`)
 * วัสดุที่ไม่รู้ต้นทุน **ไม่ถูกนับเป็น 0** แต่ทำให้มูลค่ารวมยังคิดจากเท่าที่รู้ (ไม่มีข้อมูลเลย = null)
 */
export function summarizeStockCount(
  lines: Pick<JustMeStockCountItem, "item_id" | "system_qty" | "counted_qty">[],
  avgCostByItem?: Map<string, number | null>,
): StockCountSummary {
  let countedLines = 0;
  let diffLines = 0;
  let surplusQty = 0;
  let shortageQty = 0;
  let diffValue = 0;
  let hasValue = false;

  for (const line of lines) {
    const diff = lineDiff(line);
    if (diff === null) continue;
    countedLines += 1;
    if (diff === 0) continue;
    diffLines += 1;
    if (diff > 0) surplusQty += diff;
    else shortageQty += -diff;

    const cost = avgCostByItem?.get(line.item_id);
    if (cost !== null && cost !== undefined && Number.isFinite(Number(cost))) {
      diffValue += diff * Number(cost);
      hasValue = true;
    }
  }

  return {
    totalLines: lines.length,
    countedLines,
    diffLines,
    surplusQty: round2(surplusQty),
    shortageQty: round2(shortageQty),
    diffValue: hasValue ? round2(diffValue) : null,
  };
}

export interface StockCountAdjustment {
  lineId: string;
  itemId: string;
  diff: number;
  /** ผลต่าง + = รับเข้า (เจอของเกิน) · − = เบิกออก (ของหาย) */
  type: "receive" | "issue";
  qty: number;
  reason: string;
}

export type BuildAdjustmentsResult =
  | { ok: true; adjustments: StockCountAdjustment[] }
  | { ok: false; error: string };

/**
 * แปลงบรรทัดที่นับแล้วเป็นรายการปรับยอด — **ด่านเดียวที่บังคับ "ผลต่างต้องมีเหตุผล"**
 * `itemLabel` ใช้ทำข้อความ error ให้ผู้ใช้รู้ว่าบรรทัดไหนขาดเหตุผล
 */
export function buildAdjustments(
  lines: JustMeStockCountItem[],
  itemLabel?: (itemId: string) => string,
): BuildAdjustmentsResult {
  const adjustments: StockCountAdjustment[] = [];
  for (const line of lines) {
    const diff = lineDiff(line);
    if (diff === null || diff === 0) continue;
    const reason = (line.note ?? "").trim();
    if (!reason) {
      const name = itemLabel?.(line.item_id) ?? "รายการที่ยอดไม่ตรง";
      return { ok: false, error: `กรุณาระบุเหตุผลของผลต่างในรายการ "${name}" ก่อนลงบัญชี` };
    }
    adjustments.push({
      lineId: line.id,
      itemId: line.item_id,
      diff,
      type: diff > 0 ? "receive" : "issue",
      qty: Math.abs(diff),
      reason,
    });
  }
  if (adjustments.length === 0) {
    return { ok: false, error: "ไม่มีรายการที่ยอดไม่ตรง จึงไม่ต้องลงบัญชีปรับยอด" };
  }
  return { ok: true, adjustments };
}

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}

// ─── fetch layer (ใช้ร่วมทั้ง API route และหน้าเว็บ) ─────────────────────────

export interface ListStockCountOpts extends PageOpts {
  warehouseId?: string;
  status?: StockCountStatus | StockCountStatus[];
}

export async function listStockCounts(
  db: SupabaseClient,
  orgId: string,
  opts?: ListStockCountOpts,
): Promise<Paged<JustMeStockCount>> {
  const { limit, offset } = normalizePage(opts);
  let q = db.from("just_me_stock_counts").select("*", { count: "exact" }).eq("org_id", orgId);
  if (opts?.warehouseId) q = q.eq("warehouse_id", opts.warehouseId);
  if (opts?.status) {
    q = Array.isArray(opts.status) ? q.in("status", opts.status) : q.eq("status", opts.status);
  }
  const { data, error, count } = await q
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);
  if (error) throw new Error(error.message);
  return toPaged((data ?? []) as JustMeStockCount[], count, limit, offset);
}

export async function getStockCount(
  db: SupabaseClient,
  orgId: string,
  countId: string,
): Promise<JustMeStockCount | null> {
  const { data, error } = await db
    .from("just_me_stock_counts")
    .select("*")
    .eq("org_id", orgId)
    .eq("id", countId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data ?? null) as JustMeStockCount | null;
}

export async function listStockCountItems(
  db: SupabaseClient,
  orgId: string,
  countIds: string[],
): Promise<JustMeStockCountItem[]> {
  const ids = Array.from(new Set(countIds.filter(Boolean)));
  if (ids.length === 0) return [];
  const { data, error } = await db
    .from("just_me_stock_count_items")
    .select("*")
    .eq("org_id", orgId)
    .in("count_id", ids);
  if (error) throw new Error(error.message);
  return (data ?? []) as JustMeStockCountItem[];
}

/** ต้นทุนเฉลี่ยต่อวัสดุ (ข้อมูลต้นทุน — caller ต้องผ่านด่าน cost-access ก่อน) */
export async function loadAvgCosts(
  db: SupabaseClient,
  orgId: string,
): Promise<Map<string, number | null>> {
  const { data, error } = await db
    .from("just_me_item_costs")
    .select("item_id, avg_cost")
    .eq("org_id", orgId);
  if (error) throw new Error(error.message);
  const out = new Map<string, number | null>();
  for (const row of (data ?? []) as { item_id: string; avg_cost: number | null }[]) {
    out.set(row.item_id, row.avg_cost === null ? null : Number(row.avg_cost));
  }
  return out;
}

/** ยอดตามระบบของทุกวัสดุที่มีในคลังนั้น ณ ตอนเปิดใบ (freeze) */
export async function snapshotWarehouseBalances(
  db: SupabaseClient,
  orgId: string,
  warehouseId: string,
): Promise<{ item_id: string; quantity: number }[]> {
  const { data, error } = await db
    .from("just_me_stock_balances")
    .select("item_id, quantity")
    .eq("org_id", orgId)
    .eq("warehouse_id", warehouseId);
  if (error) throw new Error(error.message);
  return ((data ?? []) as { item_id: string; quantity: number | null }[])
    .map((r) => ({ item_id: r.item_id, quantity: Number(r.quantity ?? 0) }))
    .filter((r) => Math.abs(r.quantity) > EPSILON);
}
