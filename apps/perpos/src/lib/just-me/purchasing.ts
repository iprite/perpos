/**
 * purchasing.ts — fetch layer ฝั่งจัดซื้อ (PR + บรรทัด PR)
 * contract: .claude/feature-factory/specs/just-me-project-loop.md §4.4 / §8
 *
 * รอบนี้ทำเฉพาะ "ส่วนที่ตัวเลขโครงการต้องใช้" (ต้นทุนผูกพัน `committed_cost`)
 * — endpoint ของ PR/เทียบราคา/รับของ อยู่รอบถัดไป แต่ตัวอ่านวางไว้ให้ต่อได้เลย
 *
 * ⛔ ทั้งไฟล์เป็นข้อมูลต้นทุน — caller ต้องผ่าน cost-access ก่อน (viewer ห้ามเห็น)
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { JustMePrItem, JustMePurchaseRequest } from "./types";

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
): Promise<Map<string, number>> {
  const ids = Array.from(new Set(boqItemIds.filter(Boolean)));
  if (ids.length === 0) return new Map();

  const { data, error } = await db
    .from("just_me_pr_items")
    .select("boq_item_id, qty, pr:just_me_purchase_requests!inner(status)")
    .eq("org_id", orgId)
    .in("boq_item_id", ids);
  if (error) throw new Error(error.message);

  const out = new Map<string, number>();
  for (const raw of (data ?? []) as unknown as {
    boq_item_id: string | null;
    qty: number | null;
    pr: { status: string } | { status: string }[] | null;
  }[]) {
    const pr = Array.isArray(raw.pr) ? raw.pr[0] : raw.pr;
    if (!raw.boq_item_id || !pr || pr.status === "cancelled") continue;
    out.set(raw.boq_item_id, (out.get(raw.boq_item_id) ?? 0) + (raw.qty ?? 0));
  }
  return out;
}
