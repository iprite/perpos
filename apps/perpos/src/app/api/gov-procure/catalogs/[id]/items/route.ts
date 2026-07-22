// GET    /api/gov-procure/catalogs/[id]/items?orgId=  → list รายการในชุด (member)
// POST   /api/gov-procure/catalogs/[id]/items?orgId=  → วางรายการ (paste/CSV) + จับคู่คลัง (canWrite)
// DELETE /api/gov-procure/catalogs/[id]/items?orgId=  → ลบหลายรายการ (canDelete — C-B3)
// contract: §5.9 C-B3 · A-B2 (server-set fields) · C-1 (path) · A-10 (ลบไฟล์)

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "../../../../_lib/supabase";
import { setAuditContext } from "../../../../_lib/audit";
import {
  requireGovProcureMember,
  canWrite,
  canDelete,
  orgIdFromQuery,
  govError,
} from "../../../_lib";
import { catalogBelongsToOrg, removeStorageFiles } from "../../../_catalog-lib";
import { listItems, type CatalogItemSource } from "@/lib/gov-procure/catalog";
import {
  parseCatalogPaste,
  parseCatalogCsv,
  type ParsedCatalogRow,
} from "@/lib/gov-procure/catalog-parse";
import {
  findProductsByNames,
  normalizeName,
  applyProductToItem,
} from "@/lib/gov-procure/catalog-products";

type Ctx = { params: Promise<{ id: string }> };

const SOURCES: CatalogItemSource[] = ["manual", "ai_draft", "human_verified", "library"];
/** กัน paste ก้อนยักษ์ (cap เดียวกับ MAX_ITEMS_PER_JOB ของ AI) */
const MAX_ROWS_PER_PASTE = 300;

export async function GET(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const orgId = orgIdFromQuery(req);
  if (!orgId) return govError("missing orgId");

  const auth = await requireGovProcureMember(req, orgId);
  if (!auth.ok) return auth.res;

  const sp = req.nextUrl.searchParams;
  const sourceParam = sp.get("source");

  try {
    const page = await listItems(createAdminClient(), orgId, id, {
      source:
        sourceParam && SOURCES.includes(sourceParam as CatalogItemSource)
          ? (sourceParam as CatalogItemSource)
          : undefined,
      category: sp.get("category") ?? undefined,
      q: sp.get("q") ?? undefined,
      limit: sp.get("limit") ? Number(sp.get("limit")) : undefined,
      offset: sp.get("offset") ? Number(sp.get("offset")) : undefined,
    });

    return NextResponse.json({
      items: page.rows,
      total: page.total,
      truncated: page.truncated,
    });
  } catch (e) {
    return govError((e as Error).message, 500);
  }
}

export async function POST(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const orgId = orgIdFromQuery(req);
  if (!orgId) return govError("missing orgId");

  const auth = await requireGovProcureMember(req, orgId);
  if (!auth.ok) return auth.res;
  if (!canWrite(auth.role)) return govError("ไม่มีสิทธิ์เพิ่มรายการ", 403);

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const text = typeof body.text === "string" ? body.text : "";
  if (!text.trim()) return govError("กรุณาวางรายการสินค้าก่อน");

  const admin = createAdminClient();

  try {
    const { data: catalog } = await admin
      .from("gov_procure_catalogs")
      .select("id, status")
      .eq("id", id)
      .eq("org_id", orgId)
      .maybeSingle();
    if (!catalog) return govError("ไม่พบชุดแคตตาล็อกนี้", 404);

    if ((catalog as { status: string }).status === "enriching") {
      return govError("ชุดนี้กำลังให้ AI เติมข้อมูลอยู่ — เพิ่มรายการได้หลังทำเสร็จ", 409);
    }

    // seq ต่อจากรายการเดิมของชุด
    const { data: last } = await admin
      .from("gov_procure_catalog_items")
      .select("seq_no")
      .eq("org_id", orgId)
      .eq("catalog_id", id)
      .order("seq_no", { ascending: false })
      .limit(1)
      .maybeSingle();
    const startSeq = ((last as { seq_no: number } | null)?.seq_no ?? 0) + 1;

    const parsed =
      body.format === "csv"
        ? parseCatalogCsv(text, { startSeq })
        : parseCatalogPaste(text, { startSeq });

    if (parsed.rows.length === 0) {
      return NextResponse.json(
        { items: [], issues: parsed.issues, matched: 0, error: "แยกรายการจากข้อความไม่ได้เลย" },
        { status: 400 },
      );
    }
    if (parsed.rows.length > MAX_ROWS_PER_PASTE) {
      return govError(
        `วางได้สูงสุด ${MAX_ROWS_PER_PASTE} รายการต่อครั้ง (พบ ${parsed.rows.length} รายการ)`,
      );
    }

    // library match — คิวรีเดียวสำหรับทุกชื่อ
    const products = await findProductsByNames(
      admin,
      orgId,
      parsed.rows.map((r) => r.name),
    );

    let matched = 0;
    const rows = parsed.rows.map((r: ParsedCatalogRow) => {
      const base: Record<string, unknown> = {
        org_id: orgId,
        catalog_id: id,
        seq_no: r.seq_no,
        name_raw: r.raw,
        name: r.name,
        qty: r.qty,
        unit: r.unit,
        source: "manual" as CatalogItemSource,
      };
      const product = products.get(normalizeName(r.name));
      if (!product) return base;
      matched += 1;
      // ตรงกับคลัง → source='library' + ข้อมูลจากคลัง (คนเคยยืนยันแล้ว)
      // qty/unit ของผู้ใช้ชนะเสมอ (คลังเก็บแค่ default_unit)
      return {
        ...base,
        ...applyProductToItem(product),
        qty: r.qty,
        unit: r.unit ?? product.default_unit ?? null,
      };
    });

    await setAuditContext(req, auth.userId, orgId);

    const { data, error } = await admin.from("gov_procure_catalog_items").insert(rows).select("*");

    if (error) return govError(error.message, 500);

    return NextResponse.json(
      { items: data ?? [], issues: parsed.issues, matched, totalLines: parsed.totalLines },
      { status: 201 },
    );
  } catch (e) {
    return govError((e as Error).message, 500);
  }
}

/** DELETE ?orgId=&itemIds=a,b,c (หรือ `all=1` = ลบทั้งชุด) — canDelete (C-B3) */
export async function DELETE(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const orgId = orgIdFromQuery(req);
  if (!orgId) return govError("missing orgId");

  const auth = await requireGovProcureMember(req, orgId);
  if (!auth.ok) return auth.res;
  if (!canDelete(auth.role)) {
    return govError("ไม่มีสิทธิ์ลบหลายรายการ (เฉพาะเจ้าของ/ผู้จัดการ)", 403);
  }

  const sp = req.nextUrl.searchParams;
  const all = sp.get("all") === "1";
  const itemIds = (sp.get("itemIds") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  if (!all && itemIds.length === 0) return govError("กรุณาระบุรายการที่ต้องการลบ");

  const admin = createAdminClient();
  if (!(await catalogBelongsToOrg(admin, id, orgId))) {
    return govError("ไม่พบชุดแคตตาล็อกนี้", 404);
  }

  try {
    // อ่าน path ของไฟล์ก่อนลบแถว (กรอง org_id + catalog_id ในคิวรีเดียว — G5)
    let q = admin
      .from("gov_procure_catalog_items")
      .select("id, image_path")
      .eq("org_id", orgId)
      .eq("catalog_id", id);
    if (!all) q = q.in("id", itemIds);

    const { data: targets, error: readErr } = await q;
    if (readErr) return govError(readErr.message, 500);
    if (!targets || targets.length === 0) return NextResponse.json({ deleted: 0 });

    await setAuditContext(req, auth.userId, orgId);

    const ids = (targets as { id: string }[]).map((t) => t.id);
    const { error } = await admin
      .from("gov_procure_catalog_items")
      .delete()
      .eq("org_id", orgId)
      .eq("catalog_id", id)
      .in("id", ids);

    if (error) return govError(error.message, 500);

    await removeStorageFiles(
      admin,
      (targets as { image_path: string | null }[]).map((t) => t.image_path),
      orgId,
    );

    return NextResponse.json({ deleted: ids.length });
  } catch (e) {
    return govError((e as Error).message, 500);
  }
}
