// GET /api/gov-procure/catalogs/[id]/items/[itemId]/suggestions?orgId=[&q=]
//   → สินค้าในคลังที่ "ใกล้เคียง" ชื่อของรายการนี้ (fuzzy, pg_trgm) — member อ่านได้
//
// ทำไมแยกเป็น route ของตัวเอง (ไม่รวมเป็น query param ของ GET [itemId]):
//   1) GET [itemId] มี **side effect** ประทับ `viewed_at` (B-B1) และถูกเรียกทุกครั้งที่เปิดรายการ
//      → ถ้าพ่วง fuzzy เข้าไป ทุกการเปิดรายการจะจ่ายค่า trigram scan ทั้งคลังฟรี ๆ
//   2) ข้อเสนอแนะเป็นงาน on-demand (คนกด "ค้นจากคลัง") → โหลดแยกได้ ไม่ถ่วงหน้าเปิดรายการ
//   3) ADDITIVE เต็มตัว — ไม่แตะ response shape/พฤติกรรมของ endpoint เดิมเลย
//
// ⚠️ read-only เท่านั้น — **ห้าม** endpoint นี้เขียนอะไรลง item
//    fuzzy match เป็นได้แค่ข้อเสนอแนะให้คนเลือก (จับคู่ผิด = ของคนละตัวไหลเข้าเอกสาร
//    ที่ยื่นราชการ พร้อมป้าย "จากคลัง") · การ apply จริงเดินผ่าน PATCH [itemId] ตามเดิม
//    ส่วน exact match ยัง auto-apply ที่ POST /items เหมือนเดิมทุกประการ

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "../../../../../../_lib/supabase";
import { requireGovProcureMember, orgIdFromQuery, govError } from "../../../../../_lib";
import {
  suggestProductsByName,
  FUZZY_MIN_SCORE,
  FUZZY_SUGGESTION_LIMIT,
} from "@/lib/gov-procure/catalog-products";

type Ctx = { params: Promise<{ id: string; itemId: string }> };

/** กันคิวรียาวผิดปกติ (trigram scan + payload) */
const MAX_QUERY_LEN = 200;

export async function GET(req: NextRequest, ctx: Ctx) {
  const { id, itemId } = await ctx.params;
  const orgId = orgIdFromQuery(req);
  if (!orgId) return govError("missing orgId");

  const auth = await requireGovProcureMember(req, orgId);
  if (!auth.ok) return auth.res;

  try {
    const admin = createAdminClient();

    // G5 — กรอง id + org_id + catalog_id ในคิวรีเดียวกันเสมอ (กัน IDOR ผ่าน path)
    const { data: item, error } = await admin
      .from("gov_procure_catalog_items")
      .select("id, name, product_id")
      .eq("id", itemId)
      .eq("org_id", orgId)
      .eq("catalog_id", id)
      .maybeSingle();

    if (error) return govError(error.message, 500);
    if (!item) return govError("ไม่พบรายการนี้", 404);

    const row = item as { id: string; name: string; product_id: string | null };
    const q = (req.nextUrl.searchParams.get("q") ?? "").trim();
    const query = (q || row.name || "").slice(0, MAX_QUERY_LEN);
    if (!query) {
      return NextResponse.json({ query: "", threshold: FUZZY_MIN_SCORE, suggestions: [] });
    }

    const found = await suggestProductsByName(admin, orgId, query, {
      limit: FUZZY_SUGGESTION_LIMIT + 1, // เผื่อกรองตัวที่ผูกอยู่แล้วออก
    });

    // สินค้าที่รายการนี้ผูกอยู่แล้ว ไม่ต้องเสนอซ้ำ
    const suggestions = found
      .filter((s) => s.product.id !== row.product_id)
      .slice(0, FUZZY_SUGGESTION_LIMIT);

    return NextResponse.json({
      query,
      threshold: FUZZY_MIN_SCORE,
      suggestions,
    });
  } catch (e) {
    return govError((e as Error).message, 500);
  }
}
