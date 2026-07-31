/**
 * purchasing.ts — จัดซื้อทั้งเส้น (PR + เทียบราคาผู้ขาย + รับของเข้าคลัง)
 * contract: .claude/feature-factory/specs/just-me-project-loop.md §4.4 / §7 ข้อ 5–7 / §8
 *
 * ⛔ ทั้งไฟล์เป็นข้อมูลต้นทุน — caller ต้องผ่าน cost-access ก่อน (viewer ห้ามเห็น)
 * ⛔ ยอดเงินทุกช่องคิดจาก `project-metrics.ts` เท่านั้น (`prTotals`/`quoteTotal`)
 * ⛔ **รับของมีทางเดียว** = `receivePurchaseRequest()` — สถานะ PR คิดจากข้อมูลใน DB หลังอัปเดตเสมอ
 *    ห้าม UI ส่งสถานะ/`received_qty` สะสมมาเอง
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizePage, toPaged, type PageOpts, type Paged } from "@/lib/accounting/paging";
import { prTotals, quoteTotal } from "./project-metrics";
import { lineToken, postStockMovement } from "./stock-movements";
import type {
  JustMePrItem,
  JustMePurchaseRequest,
  JustMeVendor,
  JustMeVendorQuote,
  JustMeVendorQuoteItem,
  PurchaseRequestStatus,
} from "./types";

/** สถานะที่ยังแก้บรรทัดได้ (ตรงกับ trigger `just_me_pr_item_freeze` ที่ DB) */
export const PR_EDITABLE_STATUSES: PurchaseRequestStatus[] = ["draft", "submitted"];
/** สถานะที่ "รับของ" ได้ */
export const PR_RECEIVABLE_STATUSES: PurchaseRequestStatus[] = [
  "approved",
  "ordered",
  "partially_received",
];

/** PR ของโครงการหนึ่ง (ไม่รวมใบที่ยกเลิก ถ้าไม่ระบุ) */
export async function listProjectPurchaseRequests(
  db: SupabaseClient,
  orgId: string,
  projectId: string,
  opts?: { includeCancelled?: boolean },
): Promise<JustMePurchaseRequest[]> {
  let q = db
    .from("just_me_purchase_requests")
    .select("*")
    .eq("org_id", orgId)
    .eq("project_id", projectId);
  if (!opts?.includeCancelled) q = q.neq("status", "cancelled");
  const { data, error } = await q.order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as JustMePurchaseRequest[];
}

export async function listPrItems(
  db: SupabaseClient,
  orgId: string,
  prIds: string[],
  opts?: { basic?: boolean },
): Promise<JustMePrItem[]> {
  if (prIds.length === 0) return [];
  const source = opts?.basic ? "just_me_pr_items_basic" : "just_me_pr_items";
  const { data, error } = await db.from(source).select("*").eq("org_id", orgId).in("pr_id", prIds);
  if (error) throw new Error(error.message);
  return (data ?? []) as JustMePrItem[];
}

/**
 * ยอดที่สั่งซื้อสะสมต่อบรรทัด BOQ (ใช้กันสั่งเกินปริมาณใน BOQ — contract §4.4 invariant 2)
 * นับเฉพาะ PR ที่ยังไม่ `cancelled`
 */
export async function sumPrQtyByBoqItem(
  db: SupabaseClient,
  orgId: string,
  boqItemIds: string[],
  opts?: { excludePrId?: string },
): Promise<Map<string, number>> {
  const ids = Array.from(new Set(boqItemIds.filter(Boolean)));
  if (ids.length === 0) return new Map();

  const { data, error } = await db
    .from("just_me_pr_items")
    .select("pr_id, boq_item_id, qty, pr:just_me_purchase_requests!inner(status)")
    .eq("org_id", orgId)
    .in("boq_item_id", ids);
  if (error) throw new Error(error.message);

  const out = new Map<string, number>();
  for (const raw of (data ?? []) as unknown as {
    pr_id: string;
    boq_item_id: string | null;
    qty: number | null;
    pr: { status: string } | { status: string }[] | null;
  }[]) {
    const pr = Array.isArray(raw.pr) ? raw.pr[0] : raw.pr;
    if (!raw.boq_item_id || !pr || pr.status === "cancelled") continue;
    // แก้ใบเดิม: บรรทัดชุดเก่าของใบนี้จะถูกแทนที่ จึงไม่นับซ้ำ
    if (opts?.excludePrId && raw.pr_id === opts.excludePrId) continue;
    out.set(raw.boq_item_id, (out.get(raw.boq_item_id) ?? 0) + (raw.qty ?? 0));
  }
  return out;
}

// ─── กฎล้วน (มี unit test คุม — ผิดแล้วสั่งของเกิน/สถานะเพี้ยน) ──────────────

export interface PrItemInput {
  boq_item_id?: string | null;
  item_id?: string | null;
  name?: string | null;
  unit?: string | null;
  qty: number | string;
  estimated_unit_cost?: number | string | null;
  sort_order?: number | null;
}

/** แปลง input 1 บรรทัด → แถวที่พร้อมเขียน (ยอดเงินรวมไม่คิดที่นี่ — `prTotals` คิดให้) */
export function buildPrItemRow(
  input: PrItemInput,
): { ok: true; row: Record<string, unknown> } | { ok: false; error: string } {
  const name = typeof input.name === "string" ? input.name.trim() : "";
  const unit = typeof input.unit === "string" ? input.unit.trim() : "";
  const qty = Number(input.qty);

  if (!name) return { ok: false, error: "กรุณาระบุชื่อรายการที่จะสั่งซื้อ" };
  if (!unit) return { ok: false, error: `รายการ "${name}" ยังไม่ได้ระบุหน่วยนับ` };
  if (!Number.isFinite(qty) || qty <= 0) {
    return { ok: false, error: `ปริมาณของรายการ "${name}" ต้องมากกว่า 0` };
  }

  let est: number | null = null;
  if (input.estimated_unit_cost !== null && input.estimated_unit_cost !== undefined) {
    if (input.estimated_unit_cost !== "") {
      const n = Number(input.estimated_unit_cost);
      if (!Number.isFinite(n) || n < 0) {
        return { ok: false, error: `ราคาประเมินของรายการ "${name}" ไม่ถูกต้อง` };
      }
      est = n;
    }
  }

  return {
    ok: true,
    row: {
      boq_item_id: input.boq_item_id || null,
      item_id: input.item_id || null,
      name,
      unit,
      qty,
      estimated_unit_cost: est,
      sort_order: Number.isFinite(Number(input.sort_order)) ? Number(input.sort_order) : 0,
    },
  };
}

export interface BoqOverage {
  boq_item_id: string;
  name: string;
  boq_qty: number;
  /** ยอดที่ PR ใบอื่น (ที่ยังไม่ยกเลิก) สั่งไปแล้ว */
  ordered_qty: number;
  /** ยอดของใบนี้ */
  requested_qty: number;
  over_qty: number;
}

/**
 * ยอดสั่งซื้อสะสมต่อบรรทัด BOQ เกินปริมาณที่ถอดไว้หรือไม่ (contract §4.4 invariant 2)
 * — **ไม่บล็อกตาย**: ผู้เรียกตัดสินว่าจะให้ผ่านเมื่อ owner ใส่เหตุผลมาด้วย
 * — บรรทัดที่ไม่ได้ผูก BOQ (ซื้อเข้าคลังกลาง) ไม่อยู่ในกฎนี้
 */
export function findBoqOverages(
  lines: { boq_item_id?: string | null; qty: number }[],
  boqItems: Map<string, { qty: number; name: string }>,
  orderedByBoqItem: Map<string, number>,
): BoqOverage[] {
  const requested = new Map<string, number>();
  for (const l of lines) {
    if (!l.boq_item_id) continue;
    const qty = Number(l.qty);
    if (!Number.isFinite(qty) || qty <= 0) continue;
    requested.set(l.boq_item_id, (requested.get(l.boq_item_id) ?? 0) + qty);
  }

  const out: BoqOverage[] = [];
  for (const [boqItemId, requestedQty] of Array.from(requested.entries())) {
    const boq = boqItems.get(boqItemId);
    if (!boq) continue; // ไม่รู้จักบรรทัด BOQ → ด่าน assertOrgRefs จัดการก่อนหน้านี้แล้ว
    const ordered = orderedByBoqItem.get(boqItemId) ?? 0;
    const over = ordered + requestedQty - boq.qty;
    if (over > 0.0001) {
      out.push({
        boq_item_id: boqItemId,
        name: boq.name,
        boq_qty: boq.qty,
        ordered_qty: ordered,
        requested_qty: requestedQty,
        over_qty: over,
      });
    }
  }
  return out;
}

/** ข้อความไทยที่ผู้ใช้อ่านรู้เรื่องเมื่อสั่งเกิน BOQ */
export function overageMessage(overages: BoqOverage[]): string {
  const detail = overages
    .map(
      (o) =>
        `${o.name} (BOQ ${o.boq_qty} · สั่งไปแล้ว ${o.ordered_qty} · ใบนี้ ${o.requested_qty} → เกิน ${round(o.over_qty)})`,
    )
    .join(" · ");
  return `ยอดสั่งซื้อเกินปริมาณที่ถอดไว้ใน BOQ: ${detail} — ถ้าจำเป็นต้องสั่งเกิน ให้เจ้าของระบุเหตุผลกำกับ`;
}

/**
 * สถานะ PR หลังรับของ — **คิดจากบรรทัดใน DB เท่านั้น** (ห้ามให้ UI ส่งมา)
 * ครบทุกบรรทัด → `received` · ได้ของบางส่วน → `partially_received` · ยังไม่ได้อะไรเลย → `null` (คงสถานะเดิม)
 */
export function receiveStatus(
  items: Pick<JustMePrItem, "qty" | "received_qty">[],
): "received" | "partially_received" | null {
  if (items.length === 0) return null;
  const anyReceived = items.some((i) => (i.received_qty ?? 0) > 0);
  if (!anyReceived) return null;
  const allDone = items.every((i) => (i.received_qty ?? 0) + 0.0001 >= (i.qty ?? 0));
  return allDone ? "received" : "partially_received";
}

function round(v: number): number {
  return Math.round(v * 100) / 100;
}

// ─── fetch layer (ใช้ร่วม SSR page + API route) ──────────────────────────────

export async function listVendors(
  db: SupabaseClient,
  orgId: string,
  opts?: { includeInactive?: boolean; q?: string },
): Promise<JustMeVendor[]> {
  let q = db.from("just_me_vendors").select("*").eq("org_id", orgId);
  if (!opts?.includeInactive) q = q.eq("is_active", true);
  if (opts?.q) {
    const term = opts.q.replace(/[%,.()\\:*"']/g, " ").trim();
    if (term) q = q.or(`name.ilike.%${term}%,contact_name.ilike.%${term}%,phone.ilike.%${term}%`);
  }
  const { data, error } = await q.order("name", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as JustMeVendor[];
}

/** จำนวนครั้งที่ผู้ขายแต่ละเจ้าถูกเลือก (ไม่ใช่ข้อมูลต้นทุน — โชว์ได้ทุกบทบาท) */
export async function countVendorWins(
  db: SupabaseClient,
  orgId: string,
): Promise<Map<string, number>> {
  const { data, error } = await db
    .from("just_me_purchase_requests")
    .select("selected_vendor_id")
    .eq("org_id", orgId)
    .not("selected_vendor_id", "is", null)
    .neq("status", "cancelled");
  if (error) throw new Error(error.message);
  const out = new Map<string, number>();
  for (const row of (data ?? []) as { selected_vendor_id: string | null }[]) {
    if (!row.selected_vendor_id) continue;
    out.set(row.selected_vendor_id, (out.get(row.selected_vendor_id) ?? 0) + 1);
  }
  return out;
}

export interface ListPrOpts extends PageOpts {
  projectId?: string;
  status?: PurchaseRequestStatus | PurchaseRequestStatus[];
  q?: string;
}

export async function listPurchaseRequests(
  db: SupabaseClient,
  orgId: string,
  opts?: ListPrOpts,
): Promise<Paged<JustMePurchaseRequest>> {
  const { limit, offset } = normalizePage(opts);
  let q = db.from("just_me_purchase_requests").select("*", { count: "exact" }).eq("org_id", orgId);
  if (opts?.projectId) q = q.eq("project_id", opts.projectId);
  if (opts?.status) {
    q = Array.isArray(opts.status) ? q.in("status", opts.status) : q.eq("status", opts.status);
  }
  if (opts?.q) {
    const term = opts.q.replace(/[%,.()\\:*"']/g, " ").trim();
    if (term) q = q.or(`pr_code.ilike.%${term}%,note.ilike.%${term}%`);
  }
  const { data, error, count } = await q
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);
  if (error) throw new Error(error.message);
  return toPaged((data ?? []) as JustMePurchaseRequest[], count, limit, offset);
}

export async function getPurchaseRequest(
  db: SupabaseClient,
  orgId: string,
  prId: string,
): Promise<JustMePurchaseRequest | null> {
  const { data, error } = await db
    .from("just_me_purchase_requests")
    .select("*")
    .eq("org_id", orgId)
    .eq("id", prId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data ?? null) as JustMePurchaseRequest | null;
}

/** บรรทัดของใบเดียว (เรียงตามลำดับที่ผู้ใช้จัดไว้) */
export async function listPurchaseRequestItems(
  db: SupabaseClient,
  orgId: string,
  prId: string,
): Promise<JustMePrItem[]> {
  const { data, error } = await db
    .from("just_me_pr_items")
    .select("*")
    .eq("org_id", orgId)
    .eq("pr_id", prId)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as JustMePrItem[];
}

export async function listVendorQuotes(
  db: SupabaseClient,
  orgId: string,
  prId: string,
): Promise<JustMeVendorQuote[]> {
  const { data, error } = await db
    .from("just_me_vendor_quotes")
    .select("*")
    .eq("org_id", orgId)
    .eq("pr_id", prId)
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as JustMeVendorQuote[];
}

export async function listVendorQuoteItems(
  db: SupabaseClient,
  orgId: string,
  quoteIds: string[],
): Promise<JustMeVendorQuoteItem[]> {
  if (quoteIds.length === 0) return [];
  const { data, error } = await db
    .from("just_me_vendor_quote_items")
    .select("*")
    .eq("org_id", orgId)
    .in("quote_id", quoteIds);
  if (error) throw new Error(error.message);
  return (data ?? []) as JustMeVendorQuoteItem[];
}

export interface BoqCompareRow {
  boq_item_id: string;
  name: string;
  unit: string;
  boq_qty: number;
  /** ยอดที่ PR ทุกใบ (ยังไม่ยกเลิก) สั่งไปแล้ว รวมใบนี้ */
  ordered_qty: number;
  /** สั่งไปแล้วกี่ % ของที่ถอดไว้ — null เมื่อ BOQ qty ≤ 0 */
  ordered_ratio: number | null;
}

/** ยอดสั่งซื้อเทียบ BOQ ของบรรทัดที่ใบนี้อ้างถึง (หน้ารายละเอียด PR) */
export async function loadBoqCompare(
  db: SupabaseClient,
  orgId: string,
  items: Pick<JustMePrItem, "boq_item_id">[],
): Promise<BoqCompareRow[]> {
  const ids = Array.from(new Set(items.map((i) => i.boq_item_id).filter((v): v is string => !!v)));
  if (ids.length === 0) return [];

  const [{ data, error }, ordered] = await Promise.all([
    db.from("just_me_boq_items").select("id, name, unit, qty").eq("org_id", orgId).in("id", ids),
    sumPrQtyByBoqItem(db, orgId, ids),
  ]);
  if (error) throw new Error(error.message);

  return ((data ?? []) as { id: string; name: string; unit: string; qty: number }[]).map((b) => {
    const orderedQty = ordered.get(b.id) ?? 0;
    return {
      boq_item_id: b.id,
      name: b.name,
      unit: b.unit,
      boq_qty: b.qty,
      ordered_qty: orderedQty,
      ordered_ratio: b.qty > 0 ? orderedQty / b.qty : null,
    };
  });
}

// ─── mutation (จุดเดียวของแต่ละกฎ) ──────────────────────────────────────────

export type PurchasingFail = { ok: false; error: string; status: number };

/** ยอดหัวใบ = คำนวณจากบรรทัดจริงเสมอ (ห้ามรับจาก body) */
export async function refreshPrTotals(
  db: SupabaseClient,
  orgId: string,
  prId: string,
): Promise<{ total_estimated_cost: number | null; total_selected_cost: number | null }> {
  const items = await listPurchaseRequestItems(db, orgId, prId);
  const totals = prTotals(items);
  await db.from("just_me_purchase_requests").update(totals).eq("org_id", orgId).eq("id", prId);
  return totals;
}

/**
 * เขียนบรรทัดของใบขอซื้อ (แทนที่ทั้งชุด) — ด่านเดียวที่คุม "สั่งเกิน BOQ"
 * - แก้ได้เฉพาะใบที่ยัง `draft`/`submitted` (ตรงกับ trigger ที่ DB)
 * - เกิน BOQ ได้ **เฉพาะเมื่อ owner ส่งเหตุผลมาด้วย** → บันทึกลง `over_budget_reason`
 */
export async function applyPrItems(
  db: SupabaseClient,
  args: {
    orgId: string;
    pr: JustMePurchaseRequest;
    inputs: PrItemInput[];
    userId: string;
    isOwner: boolean;
    overBudgetReason?: string | null;
  },
): Promise<{ ok: true; items: JustMePrItem[]; overages: BoqOverage[] } | PurchasingFail> {
  const { pr, orgId } = args;
  if (!PR_EDITABLE_STATUSES.includes(pr.status)) {
    return {
      ok: false,
      error: "ใบขอซื้อที่อนุมัติแล้วแก้บรรทัดไม่ได้ — ให้ยกเลิกแล้วออกใบใหม่",
      status: 409,
    };
  }

  const rows: Record<string, unknown>[] = [];
  for (const input of args.inputs) {
    const built = buildPrItemRow(input);
    if (!built.ok) return { ok: false, error: built.error, status: 400 };
    rows.push(built.row);
  }

  // บรรทัด BOQ ที่อ้างถึงต้องเป็นขององค์กรนี้จริง (FK เป็นคอลัมน์เดียว → DB ไม่ผูก org ให้)
  const boqItemIds = Array.from(
    new Set(rows.map((r) => r.boq_item_id).filter((v): v is string => typeof v === "string")),
  );
  const boqItems = new Map<string, { qty: number; name: string }>();
  if (boqItemIds.length > 0) {
    const { data, error } = await db
      .from("just_me_boq_items")
      .select("id, name, qty")
      .eq("org_id", orgId)
      .in("id", boqItemIds);
    if (error) return { ok: false, error: error.message, status: 500 };
    for (const b of (data ?? []) as { id: string; name: string; qty: number }[]) {
      boqItems.set(b.id, { qty: b.qty, name: b.name });
    }
    if (boqItems.size !== boqItemIds.length) {
      return { ok: false, error: "มีบรรทัด BOQ ที่ไม่อยู่ในองค์กรนี้", status: 400 };
    }
  }

  const ordered = await sumPrQtyByBoqItem(db, orgId, boqItemIds, { excludePrId: pr.id });
  const overages = findBoqOverages(
    rows.map((r) => ({ boq_item_id: r.boq_item_id as string | null, qty: Number(r.qty) })),
    boqItems,
    ordered,
  );
  const reason = typeof args.overBudgetReason === "string" ? args.overBudgetReason.trim() : "";
  if (overages.length > 0) {
    if (!reason) return { ok: false, error: overageMessage(overages), status: 409 };
    if (!args.isOwner) {
      return {
        ok: false,
        error: `${overageMessage(overages)} — เฉพาะเจ้าของเท่านั้นที่อนุมัติให้สั่งเกินได้`,
        status: 403,
      };
    }
  }

  const { error: delErr } = await db
    .from("just_me_pr_items")
    .delete()
    .eq("org_id", orgId)
    .eq("pr_id", pr.id);
  if (delErr) return { ok: false, error: delErr.message, status: 500 };

  if (rows.length > 0) {
    const { error: insErr } = await db.from("just_me_pr_items").insert(
      rows.map((r, i) => ({
        ...r,
        sort_order: Number(r.sort_order) || i,
        org_id: orgId,
        pr_id: pr.id,
        created_by: args.userId,
      })),
    );
    if (insErr) return { ok: false, error: insErr.message, status: 500 };
  }

  await db
    .from("just_me_purchase_requests")
    .update({ over_budget_reason: overages.length > 0 ? reason : null })
    .eq("org_id", orgId)
    .eq("id", pr.id);
  await refreshPrTotals(db, orgId, pr.id);

  return { ok: true, items: await listPurchaseRequestItems(db, orgId, pr.id), overages };
}

/**
 * เลือกผู้ขาย — ใบเสนอราคาที่เลือกได้มีได้เจ้าเดียวต่อ PR (partial unique index ที่ DB เป็นด่านจริง)
 * ผลลัพธ์: quote ที่เลือก = `selected` · เจ้าอื่น = `rejected` · คัดราคาลง `pr_items.selected_unit_cost`
 * · PR → `ordered`
 */
export async function selectVendorForPr(
  db: SupabaseClient,
  args: { orgId: string; prId: string; quoteId: string },
): Promise<{ ok: true; pr: JustMePurchaseRequest } | PurchasingFail> {
  const pr = await getPurchaseRequest(db, args.orgId, args.prId);
  if (!pr) return { ok: false, error: "ไม่พบใบขอซื้อนี้", status: 404 };
  if (pr.status !== "approved" && pr.status !== "ordered") {
    return {
      ok: false,
      error: "เลือกผู้ขายได้เฉพาะใบที่อนุมัติแล้วและยังไม่ได้รับของ",
      status: 409,
    };
  }

  const quotes = await listVendorQuotes(db, args.orgId, args.prId);
  const chosen = quotes.find((q) => q.id === args.quoteId);
  if (!chosen)
    return { ok: false, error: "ไม่พบใบเสนอราคาของผู้ขายรายนี้ในใบขอซื้อนี้", status: 404 };

  const quoteItems = (await listVendorQuoteItems(db, args.orgId, [chosen.id])).filter(
    (l) => l.unit_cost !== null,
  );
  if (quoteItems.length === 0) {
    return {
      ok: false,
      error: "ใบเสนอราคาของเจ้านี้ยังไม่ได้กรอกราคา จึงเลือกไม่ได้",
      status: 400,
    };
  }

  // ปลดของเดิมก่อนเสมอ — ไม่งั้นชนกับ unique index แล้วผู้ใช้เห็น error ดิบจาก DB
  const { error: clearErr } = await db
    .from("just_me_vendor_quotes")
    .update({ status: "rejected" })
    .eq("org_id", args.orgId)
    .eq("pr_id", args.prId)
    .neq("id", chosen.id);
  if (clearErr) return { ok: false, error: clearErr.message, status: 500 };

  const { error: selErr } = await db
    .from("just_me_vendor_quotes")
    .update({ status: "selected" })
    .eq("org_id", args.orgId)
    .eq("id", chosen.id);
  if (selErr) {
    return {
      ok: false,
      error:
        selErr.code === "23505"
          ? "ใบขอซื้อนี้มีผู้ขายที่ถูกเลือกอยู่แล้ว กรุณาโหลดหน้าใหม่"
          : selErr.message,
      status: selErr.code === "23505" ? 409 : 500,
    };
  }

  for (const line of quoteItems) {
    await db
      .from("just_me_pr_items")
      .update({ selected_unit_cost: line.unit_cost })
      .eq("org_id", args.orgId)
      .eq("id", line.pr_item_id);
  }

  const totals = await refreshPrTotals(db, args.orgId, args.prId);
  const { data, error } = await db
    .from("just_me_purchase_requests")
    .update({
      selected_vendor_id: chosen.vendor_id,
      status: "ordered",
      total_selected_cost: totals.total_selected_cost,
    })
    .eq("org_id", args.orgId)
    .eq("id", args.prId)
    .select("*")
    .single();
  if (error) return { ok: false, error: error.message, status: 500 };
  return { ok: true, pr: data as JustMePurchaseRequest };
}

/**
 * บันทึก/แก้ใบเสนอราคาผู้ขาย 1 ใบ + บรรทัดราคา
 * — `total_amount` คิดจากบรรทัดด้วย `quoteTotal()` เสมอ (ห้ามรับยอดจาก body)
 * — มีราคาอย่างน้อย 1 บรรทัด → สถานะ `received` (ได้ราคาแล้ว) · ยังไม่มี → คงเป็น `pending`
 * — ใบที่ถูกเลือกไปแล้ว (`selected`) ห้ามแก้ราคา (ราคาถูกคัดลงบรรทัด PR ไปแล้ว)
 */
export async function saveVendorQuote(
  db: SupabaseClient,
  args: {
    orgId: string;
    prId: string;
    userId: string;
    quoteId?: string | null;
    vendorId?: string | null;
    head: Record<string, unknown>;
    lines?: { pr_item_id: string; unit_cost?: number | null; qty?: number | null; note?: string }[];
  },
): Promise<{ ok: true; quote: JustMeVendorQuote } | PurchasingFail> {
  const prItems = await listPurchaseRequestItems(db, args.orgId, args.prId);
  const itemById = new Map(prItems.map((i) => [i.id, i]));

  let quoteId = args.quoteId ?? null;
  if (quoteId) {
    const existing = (await listVendorQuotes(db, args.orgId, args.prId)).find(
      (q) => q.id === quoteId,
    );
    if (!existing) return { ok: false, error: "ไม่พบใบเสนอราคานี้", status: 404 };
    if (existing.status === "selected") {
      return { ok: false, error: "ใบเสนอราคาที่ถูกเลือกแล้วแก้ไม่ได้", status: 409 };
    }
    const { error } = await db
      .from("just_me_vendor_quotes")
      .update(args.head)
      .eq("org_id", args.orgId)
      .eq("id", quoteId);
    if (error) return { ok: false, error: error.message, status: 500 };
  } else {
    if (!args.vendorId) return { ok: false, error: "กรุณาเลือกผู้ขาย", status: 400 };
    const { data, error } = await db
      .from("just_me_vendor_quotes")
      .insert({
        ...args.head,
        org_id: args.orgId,
        pr_id: args.prId,
        vendor_id: args.vendorId,
        status: "pending",
        created_by: args.userId,
      })
      .select("id")
      .single();
    if (error) {
      return {
        ok: false,
        error: error.code === "23505" ? "ผู้ขายรายนี้มีใบเสนอราคาในใบขอซื้อนี้แล้ว" : error.message,
        status: error.code === "23505" ? 409 : 500,
      };
    }
    quoteId = (data as { id: string }).id;
  }

  if (args.lines) {
    for (const line of args.lines) {
      const prItem = itemById.get(line.pr_item_id);
      if (!prItem) {
        return { ok: false, error: "มีบรรทัดราคาที่ไม่ตรงกับรายการในใบขอซื้อนี้", status: 400 };
      }
      const unitCost =
        line.unit_cost === null || line.unit_cost === undefined || Number.isNaN(line.unit_cost)
          ? null
          : Number(line.unit_cost);
      if (unitCost !== null && (!Number.isFinite(unitCost) || unitCost < 0)) {
        return { ok: false, error: `ราคาของรายการ "${prItem.name}" ไม่ถูกต้อง`, status: 400 };
      }
      const qty = line.qty === null || line.qty === undefined ? prItem.qty : Number(line.qty);
      if (!Number.isFinite(qty) || qty <= 0) {
        return { ok: false, error: `ปริมาณของรายการ "${prItem.name}" ไม่ถูกต้อง`, status: 400 };
      }
      const { error } = await db.from("just_me_vendor_quote_items").upsert(
        {
          org_id: args.orgId,
          quote_id: quoteId,
          pr_item_id: line.pr_item_id,
          unit_cost: unitCost,
          qty,
          note: line.note ?? null,
          created_by: args.userId,
        },
        { onConflict: "quote_id,pr_item_id" },
      );
      if (error) return { ok: false, error: error.message, status: 500 };
    }
  }

  const savedLines = await listVendorQuoteItems(db, args.orgId, [quoteId!]);
  const total = quoteTotal(savedLines.map((l) => ({ unit_cost: l.unit_cost, qty: l.qty })));
  const { data, error } = await db
    .from("just_me_vendor_quotes")
    .update({ total_amount: total, status: total === null ? "pending" : "received" })
    .eq("org_id", args.orgId)
    .eq("id", quoteId!)
    .select("*")
    .single();
  if (error) return { ok: false, error: error.message, status: 500 };
  return { ok: true, quote: data as JustMeVendorQuote };
}

export interface ReceiveLineInput {
  pr_item_id: string;
  qty: number | string;
}

export interface ReceiveResult {
  pr: JustMePurchaseRequest;
  items: JustMePrItem[];
  movement_ids: string[];
  status_changed_to: PurchaseRequestStatus | null;
}

/**
 * **รับของเข้าคลัง — ฟังก์ชันเดียวของทั้งระบบ** (contract §4.4 invariant 4)
 * ลำดับที่ห้ามสลับ:
 *   1. ตรวจสถานะ PR + ปริมาณคงเหลือของแต่ละบรรทัด (รับเกินที่สั่ง = บล็อก พร้อมบอกยอดคงเหลือ)
 *   2. `postStockMovement()` type `receive` (ผูก PR/โครงการ/บรรทัด BOQ) — movement + ยอดคงเหลือ atomic
 *      · `unit_cost` = ราคาที่เลือก ?? ราคาประเมิน — **ห้ามเขียน `total_cost`** (trigger ต้นทุนคิดให้)
 *   3. บวก `received_qty` ของบรรทัด
 *   4. **อ่านบรรทัดจาก DB ใหม่** แล้วคิดสถานะ PR จากของจริง (ไม่เชื่อ payload)
 */
export async function receivePurchaseRequest(
  db: SupabaseClient,
  args: {
    orgId: string;
    prId: string;
    userId: string;
    warehouseId?: string | null;
    lines: ReceiveLineInput[];
    note?: string | null;
    /** uuid จากหน้าเว็บ — กันกดรับของซ้ำ (ผูกต่อบรรทัด + ยอดที่รับไปแล้ว) */
    clientToken?: string | null;
  },
): Promise<{ ok: true; result: ReceiveResult } | PurchasingFail> {
  const pr = await getPurchaseRequest(db, args.orgId, args.prId);
  if (!pr) return { ok: false, error: "ไม่พบใบขอซื้อนี้", status: 404 };
  if (!PR_RECEIVABLE_STATUSES.includes(pr.status)) {
    return {
      ok: false,
      error:
        pr.status === "received"
          ? "ใบขอซื้อนี้รับของครบแล้ว"
          : "รับของได้เฉพาะใบที่อนุมัติ/สั่งซื้อแล้วเท่านั้น",
      status: 409,
    };
  }

  const warehouseId = args.warehouseId || pr.warehouse_id;
  if (!warehouseId) return { ok: false, error: "กรุณาระบุคลังปลายทางที่รับของเข้า", status: 400 };
  const { count: whCount, error: whErr } = await db
    .from("just_me_warehouses")
    .select("id", { count: "exact", head: true })
    .eq("org_id", args.orgId)
    .eq("id", warehouseId);
  if (whErr) return { ok: false, error: whErr.message, status: 500 };
  if (!whCount) return { ok: false, error: "ไม่พบคลังปลายทางในองค์กรนี้", status: 400 };

  const items = await listPurchaseRequestItems(db, args.orgId, args.prId);
  const byId = new Map(items.map((i) => [i.id, i]));

  interface Planned {
    item: JustMePrItem;
    qty: number;
    unitCost: number | null;
  }
  const planned: Planned[] = [];
  for (const line of args.lines) {
    const item = byId.get(line.pr_item_id);
    if (!item) return { ok: false, error: "มีรายการรับของที่ไม่อยู่ในใบขอซื้อนี้", status: 400 };
    const qty = Number(line.qty);
    if (!Number.isFinite(qty) || qty <= 0) continue; // ไม่ได้รับบรรทัดนี้รอบนี้
    if (!item.item_id) {
      return {
        ok: false,
        error: `รายการ "${item.name}" ยังไม่ได้ผูกกับวัสดุในคลัง — แก้บรรทัดให้เลือกวัสดุก่อนรับของ`,
        status: 400,
      };
    }
    const remaining = (item.qty ?? 0) - (item.received_qty ?? 0);
    if (qty > remaining + 0.0001) {
      return {
        ok: false,
        error: `รับของ "${item.name}" เกินที่สั่งไว้ (คงเหลือรับได้ ${round(remaining)} ${item.unit}) — ถ้าผู้ขายส่งเกิน ให้รับของส่วนเกินที่หน้าคลังแทน`,
        status: 400,
      };
    }
    planned.push({
      item,
      qty,
      unitCost: item.selected_unit_cost ?? item.estimated_unit_cost ?? null,
    });
  }
  if (planned.length === 0) return { ok: false, error: "ยังไม่ได้ระบุจำนวนที่รับของ", status: 400 };

  // วัสดุที่ต้องระบุ Serial ต้องรับผ่านหน้าคลัง (ที่นั่นมีช่องกรอก Serial ครบ)
  const itemIds = Array.from(new Set(planned.map((p) => p.item.item_id!)));
  const { data: invItems, error: invErr } = await db
    .from("just_me_inventory_items")
    .select("id, name, has_serial")
    .eq("org_id", args.orgId)
    .in("id", itemIds);
  if (invErr) return { ok: false, error: invErr.message, status: 500 };
  const inv = new Map(
    ((invItems ?? []) as { id: string; name: string; has_serial: boolean }[]).map((i) => [i.id, i]),
  );
  if (inv.size !== itemIds.length) {
    return { ok: false, error: "มีวัสดุที่ไม่อยู่ในคลังขององค์กรนี้", status: 400 };
  }
  const serialItem = planned.find((p) => inv.get(p.item.item_id!)?.has_serial);
  if (serialItem) {
    return {
      ok: false,
      error: `"${serialItem.item.name}" เป็นวัสดุที่ต้องระบุ Serial — ให้รับของที่หน้าคลัง (เมนูคลังสินค้า) แล้วอ้างเลขที่ ${pr.pr_code}`,
      status: 400,
    };
  }

  const movementIds: string[] = [];
  for (const p of planned) {
    // ของเข้าคลัง + ยอดคงเหลือ = คำสั่งเดียวแบบ atomic (`postStockMovement`)
    // token ผูกกับบรรทัด + ยอดที่รับไปแล้ว ⇒ กดรับซ้ำรอบเดิมไม่ได้ของสองเท่า
    const posted = await postStockMovement(db, {
      orgId: args.orgId,
      itemId: p.item.item_id!,
      type: "receive",
      qty: p.qty,
      destinationWarehouseId: warehouseId,
      referenceNo: pr.pr_code,
      note: args.note ?? null,
      unitCost: p.unitCost,
      projectId: pr.project_id,
      boqItemId: p.item.boq_item_id,
      purchaseRequestId: pr.id,
      createdBy: args.userId,
      clientToken: lineToken(args.clientToken, `${p.item.id}:${p.item.received_qty ?? 0}`),
    });
    if (!posted.ok) return { ok: false, error: posted.error, status: posted.status };
    movementIds.push(posted.movementId);

    const { error: updErr } = await db
      .from("just_me_pr_items")
      .update({ received_qty: (p.item.received_qty ?? 0) + p.qty })
      .eq("org_id", args.orgId)
      .eq("id", p.item.id);
    if (updErr) return { ok: false, error: updErr.message, status: 500 };
  }

  // สถานะคิดจากของจริงใน DB หลังอัปเดต — ไม่ใช่จาก payload
  const after = await listPurchaseRequestItems(db, args.orgId, args.prId);
  const nextStatus = receiveStatus(after);
  let prAfter = pr;
  if (nextStatus && nextStatus !== pr.status) {
    const { data, error } = await db
      .from("just_me_purchase_requests")
      .update({ status: nextStatus })
      .eq("org_id", args.orgId)
      .eq("id", args.prId)
      .select("*")
      .single();
    if (error) return { ok: false, error: error.message, status: 500 };
    prAfter = data as JustMePurchaseRequest;
  }

  return {
    ok: true,
    result: {
      pr: prAfter,
      items: after,
      movement_ids: movementIds,
      status_changed_to: nextStatus && nextStatus !== pr.status ? nextStatus : null,
    },
  };
}
