// GET /api/gov-procure/catalogs/[id]/pdf?orgId=&prices=1&template=&format=html  → PDF ของชุด (member — C-B3) · format=html = พรีวิว HTML ตัวเดียวกับที่ส่งเข้า renderer
//
// contract: §5.9 A-B1 (signed URL สร้างฝั่ง server ก่อน build HTML · ห้ามใส่ secret ลง HTML)
//           · C-6 (narrative ต้องมีบริษัท) · B-P1-6 (ลายน้ำ "ฉบับร่าง")
// pattern: `accounting/documents/[id]/pdf/route.ts` (pdf-renderer + PDF_SERVICE_SECRET)

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "../../../../_lib/supabase";
import { setAuditContext } from "../../../../_lib/audit";
import { requireGovProcureMember, orgIdFromQuery, govError } from "../../../_lib";
import { CATALOG_BUCKET, pathBelongsToOrg } from "../../../_catalog-lib";
import { getCatalog, listItems, type CatalogItem } from "@/lib/gov-procure/catalog";
import { buildCatalogHtml, buildCatalogFooterTemplate } from "@/lib/gov-procure/catalog-html";

type Ctx = { params: Promise<{ id: string }> };

/** TTL ของ signed URL — สั้นที่สุดที่ยังพอให้ renderer ดึงรูปทัน (A-B1: ≤300s) */
const SIGNED_URL_TTL = 300;
const MAX_ITEMS = 1000;

export async function GET(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const orgId = orgIdFromQuery(req);
  if (!orgId) return govError("missing orgId");

  const auth = await requireGovProcureMember(req, orgId);
  if (!auth.ok) return auth.res;

  // `?format=html` = พรีวิวหน้าจอ (ไม่เรียก pdf-renderer) → ไม่ต้องมี PDF_RENDER_URL
  const wantsHtml = req.nextUrl.searchParams.get("format") === "html";

  const renderUrl = process.env.PDF_RENDER_URL;
  if (!renderUrl && !wantsHtml) {
    return govError("ยังไม่ได้ตั้งค่า PDF_RENDER_URL — ใช้ปุ่มพิมพ์ผ่านเบราว์เซอร์แทนได้", 503);
  }

  const admin = createAdminClient();

  try {
    const catalog = await getCatalog(admin, orgId, id);
    if (!catalog) return govError("ไม่พบชุดแคตตาล็อกนี้", 404);

    const sp = req.nextUrl.searchParams;
    const templateParam = sp.get("template");
    const template =
      templateParam === "table" || templateParam === "narrative" ? templateParam : catalog.template;

    // C-6 — เทมเพลตบรรยายพิมพ์หัวจดหมายทุกหน้า ไม่มีบริษัท = เอกสารใช้ไม่ได้
    if (template === "narrative" && !catalog.company) {
      return govError("เลือกบริษัทของชุดนี้ก่อน จึงจะส่งออกเอกสารแบบบรรยายได้", 400);
    }

    const pricesParam = sp.get("prices");
    const showPrices = pricesParam === null ? catalog.show_prices : pricesParam === "1";

    const page = await listItems(admin, orgId, id, { limit: MAX_ITEMS });
    const items = page.rows as CatalogItem[];
    if (items.length === 0) return govError("ชุดนี้ยังไม่มีรายการสินค้า", 400);

    // A-B1 — สร้าง signed URL ฝั่ง server (bucket เป็น private · HTML ไม่มี key ใด ๆ)
    const imageUrls: Record<string, string> = {};
    const withImage = items.filter((it) => pathBelongsToOrg(it.image_path, orgId));
    if (withImage.length > 0) {
      const { data: signed } = await admin.storage.from(CATALOG_BUCKET).createSignedUrls(
        withImage.map((it) => it.image_path as string),
        SIGNED_URL_TTL,
      );
      (signed ?? []).forEach((s, idx) => {
        const item = withImage[idx];
        if (s?.signedUrl && item) imageUrls[item.id] = s.signedUrl;
      });
    }

    const html = buildCatalogHtml(catalog, items, { imageUrls, showPrices, template });
    const notVerified = items.filter((i) => i.source !== "human_verified").length;

    // พรีวิว: คืน HTML **ตัวเดียวกับที่ส่งเข้า pdf-renderer** (ไม่ใช่ของจำลอง)
    // → สิ่งที่ผู้ใช้เห็นก่อนกดดาวน์โหลด = เนื้อหาจริงของไฟล์
    //   (ต่างจากไฟล์จริงแค่การแบ่งหน้า/ฟอนต์ ซึ่งเป็นงานของ Chromium ฝั่ง renderer)
    // signed URL ของรูปมีอายุสั้น (SIGNED_URL_TTL) → ฝัง iframe ได้ ไม่มี key ใน HTML
    if (wantsHtml) {
      return new NextResponse(html, {
        status: 200,
        headers: {
          "Content-Type": "text/html; charset=utf-8",
          // กัน cache ฝั่ง client — signed URL ในเนื้อ HTML หมดอายุเร็วกว่า
          "Cache-Control": "no-store",
          "X-Catalog-Not-Verified": String(notVerified),
        },
      });
    }

    // ถึงตรงนี้ = ไม่ใช่โหมด html → renderUrl ถูกเช็คไปแล้วด้านบน (TS narrow ไม่ข้าม await ให้)
    if (!renderUrl) {
      return govError("ยังไม่ได้ตั้งค่า PDF_RENDER_URL — ใช้ปุ่มพิมพ์ผ่านเบราว์เซอร์แทนได้", 503);
    }

    let resp: Response;
    try {
      resp = await fetch(`${renderUrl.replace(/\/$/, "")}/render`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(process.env.PDF_SERVICE_SECRET
            ? { "x-pdf-secret": process.env.PDF_SERVICE_SECRET }
            : {}),
        },
        body: JSON.stringify({
          html,
          filename: `catalog-${id.slice(0, 8)}`,
          // ชื่อคีย์ตาม services/pdf-renderer/src/main.ts:51 (`footerHtml`)
          footerHtml: buildCatalogFooterTemplate(notVerified),
        }),
      });
    } catch (e) {
      return govError(`เรียกบริการสร้าง PDF ไม่สำเร็จ: ${(e as Error).message}`, 502);
    }

    if (!resp.ok) {
      const detail = await resp.text().catch(() => "");
      return govError(`สร้าง PDF ไม่สำเร็จ: ${detail.slice(0, 200)}`, 502);
    }

    const pdf = await resp.arrayBuffer();

    // บันทึกเวลาส่งออกล่าสุด (server-set · ไม่เปลี่ยน state ของชุด)
    await setAuditContext(req, auth.userId, orgId);
    await admin
      .from("gov_procure_catalogs")
      .update({ last_exported_at: new Date().toISOString() })
      .eq("id", id)
      .eq("org_id", orgId);

    return new NextResponse(pdf, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="catalog-${id.slice(0, 8)}.pdf"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    return govError((e as Error).message, 500);
  }
}
