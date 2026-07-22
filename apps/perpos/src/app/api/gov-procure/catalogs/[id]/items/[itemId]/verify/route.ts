// POST /api/gov-procure/catalogs/[id]/items/[itemId]/verify?orgId= → ยืนยันรายการ (canWrite)
// contract: §5.4 (ยืนยันรายการ = canWrite) · A-1 (409 ระหว่าง enrich) · B-B1 (ยืนยัน = เปิดอ่านแล้ว)

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "../../../../../../_lib/supabase";
import { setAuditContext } from "../../../../../../_lib/audit";
import { requireGovProcureMember, canWrite, orgIdFromQuery, govError } from "../../../../../_lib";
import type { CatalogItem } from "@/lib/gov-procure/catalog";

type Ctx = { params: Promise<{ id: string; itemId: string }> };

const LOCKED_STATES = ["queued", "running"];

export async function POST(req: NextRequest, ctx: Ctx) {
  const { id, itemId } = await ctx.params;
  const orgId = orgIdFromQuery(req);
  if (!orgId) return govError("missing orgId");

  const auth = await requireGovProcureMember(req, orgId);
  if (!auth.ok) return auth.res;
  if (!canWrite(auth.role)) return govError("ไม่มีสิทธิ์ยืนยันรายการ", 403);

  const admin = createAdminClient();

  try {
    // G5 — กรอง org_id + catalog_id ในคิวรีเดียวกัน
    const { data: item, error: readErr } = await admin
      .from("gov_procure_catalog_items")
      .select("id, enrich_state, viewed_at")
      .eq("id", itemId)
      .eq("org_id", orgId)
      .eq("catalog_id", id)
      .maybeSingle();

    if (readErr) return govError(readErr.message, 500);
    if (!item) return govError("ไม่พบรายการนี้", 404);

    const row = item as { enrich_state: string; viewed_at: string | null };
    if (LOCKED_STATES.includes(row.enrich_state)) {
      return govError("รายการนี้กำลังให้ AI เติมข้อมูลอยู่ — ยืนยันได้หลังทำเสร็จ", 409);
    }

    await setAuditContext(req, auth.userId, orgId);

    const now = new Date().toISOString();
    const { data, error } = await admin
      .from("gov_procure_catalog_items")
      .update({
        source: "human_verified",
        verified_by: auth.userId,
        verified_at: now,
        viewed_at: row.viewed_at ?? now,
      })
      .eq("id", itemId)
      .eq("org_id", orgId)
      .eq("catalog_id", id)
      .select("*")
      .maybeSingle();

    if (error) return govError(error.message, 500);
    if (!data) return govError("ไม่พบรายการนี้", 404);

    return NextResponse.json({ item: data as CatalogItem });
  } catch (e) {
    return govError((e as Error).message, 500);
  }
}
