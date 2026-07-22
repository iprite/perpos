// GET  /api/gov-procure/products?orgId=&q=&category=  → คลังสินค้าของ org (member)
// POST /api/gov-procure/products?orgId=               → บันทึกรายการเข้าคลัง (canWrite)
//
// contract: §5.9 A-2 (**คลังรับเฉพาะ `source='human_verified'`**) · C-8 · C-1 (path รูปของคลัง)
// invariant นี้บังคับใน `upsertProductFromItem` ที่เดียว — route ห้าม insert เองตรง ๆ

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "../../_lib/supabase";
import { setAuditContext } from "../../_lib/audit";
import { requireGovProcureMember, canWrite, orgIdFromQuery, govError } from "../_lib";
import { buildProductImagePath, CATALOG_BUCKET, pathBelongsToOrg } from "../_catalog-lib";
import { upsertProductFromItem } from "@/lib/gov-procure/catalog-products";
import type { CatalogItem, CatalogProduct } from "@/lib/gov-procure/catalog";
import { normalizePage, toPaged } from "@/lib/accounting/paging";

/** จำนวนรายการสูงสุดต่อการกด "บันทึกเข้าคลัง" 1 ครั้ง */
const MAX_BATCH = 300;

export async function GET(req: NextRequest) {
  const orgId = orgIdFromQuery(req);
  if (!orgId) return govError("missing orgId");

  const auth = await requireGovProcureMember(req, orgId);
  if (!auth.ok) return auth.res;

  const sp = req.nextUrl.searchParams;
  const { limit, offset } = normalizePage({
    limit: sp.get("limit") ? Number(sp.get("limit")) : undefined,
    offset: sp.get("offset") ? Number(sp.get("offset")) : undefined,
  });

  try {
    const admin = createAdminClient();
    let q = admin.from("gov_procure_products").select("*", { count: "exact" }).eq("org_id", orgId);

    const search = sp.get("q")?.trim();
    const category = sp.get("category")?.trim();
    if (search) q = q.ilike("name", `%${search}%`);
    if (category) q = q.eq("category", category);

    const { data, error, count } = await q
      .order("name", { ascending: true })
      .range(offset, offset + limit - 1);

    if (error) return govError(error.message, 500);

    const page = toPaged((data ?? []) as CatalogProduct[], count, limit, offset);
    return NextResponse.json({
      products: page.rows,
      total: page.total,
      truncated: page.truncated,
    });
  } catch (e) {
    return govError((e as Error).message, 500);
  }
}

/** POST body: `{ itemId }` หรือ `{ itemIds: [] }` — ต้องเป็นรายการที่ยืนยันแล้วเท่านั้น */
export async function POST(req: NextRequest) {
  const orgId = orgIdFromQuery(req);
  if (!orgId) return govError("missing orgId");

  const auth = await requireGovProcureMember(req, orgId);
  if (!auth.ok) return auth.res;
  if (!canWrite(auth.role)) return govError("ไม่มีสิทธิ์บันทึกเข้าคลังสินค้า", 403);

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const ids = Array.isArray(body.itemIds)
    ? (body.itemIds as unknown[]).map((x) => String(x ?? "")).filter(Boolean)
    : typeof body.itemId === "string" && body.itemId
      ? [body.itemId]
      : [];

  if (ids.length === 0) return govError("กรุณาเลือกรายการที่ต้องการบันทึกเข้าคลัง");
  if (ids.length > MAX_BATCH) return govError(`บันทึกได้สูงสุด ${MAX_BATCH} รายการต่อครั้ง`);

  const admin = createAdminClient();

  try {
    // G5 — อ่านรายการพร้อมกรอง org_id ในคิวรีเดียว
    const { data, error } = await admin
      .from("gov_procure_catalog_items")
      .select("*")
      .eq("org_id", orgId)
      .in("id", ids);

    if (error) return govError(error.message, 500);
    const items = (data ?? []) as CatalogItem[];
    if (items.length === 0) return govError("ไม่พบรายการที่เลือก", 404);

    await setAuditContext(req, auth.userId, orgId);

    const saved: CatalogProduct[] = [];
    const rejected: { itemId: string; reason: string }[] = [];

    for (const item of items) {
      // A-2 — invariant บังคับใน helper (ai_draft / manual / library ถูกปฏิเสธ)
      const result = await upsertProductFromItem(admin, orgId, item, auth.userId);
      if (!result.ok) {
        rejected.push({ itemId: item.id, reason: result.reason });
        continue;
      }

      let product = result.product;

      // คัดลอกรูปของรายการไปยัง prefix ของคลัง (ไฟล์ของชุดถูกลบตอนลบชุดได้ — C-1)
      if (pathBelongsToOrg(item.image_path, orgId) && !product.image_path) {
        const baseName = (item.image_path as string).split("/").pop() ?? "image";
        const dest = buildProductImagePath(orgId, product.id, baseName);
        const { error: copyErr } = await admin.storage
          .from(CATALOG_BUCKET)
          .copy(item.image_path as string, dest);
        if (copyErr) {
          console.warn("[gov-procure:catalog] คัดลอกรูปเข้าคลังไม่สำเร็จ:", copyErr.message);
        } else {
          const { data: withImage } = await admin
            .from("gov_procure_products")
            .update({ image_path: dest })
            .eq("id", product.id)
            .eq("org_id", orgId)
            .select("*")
            .maybeSingle();
          if (withImage) product = withImage as CatalogProduct;
        }
      }

      // ผูกรายการกับสินค้าในคลัง (ครั้งหน้าชื่อซ้ำจะจับคู่ได้ทันที)
      await admin
        .from("gov_procure_catalog_items")
        .update({ product_id: product.id })
        .eq("id", item.id)
        .eq("org_id", orgId);

      saved.push(product);
    }

    return NextResponse.json({ products: saved, saved: saved.length, rejected }, { status: 201 });
  } catch (e) {
    return govError((e as Error).message, 500);
  }
}
