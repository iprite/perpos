import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "../../../../_lib/auth";
import { createAdminClient } from "../../../../_lib/supabase";

export const maxDuration = 60; // render Chromium อาจกินเวลา

type Ctx = { params: Promise<{ id: string }> };

// POST /api/admin/product-docs/[id]/pdf — render HTML ของเอกสารเป็น PDF ผ่าน pdf-renderer (Chromium)
// คืน PDF stream (ไม่เก็บไฟล์ — export on-demand). ภาษาไทย shaping ถูกต้องเพราะ render ด้วย Chromium จริง
export async function POST(req: NextRequest, { params }: Ctx) {
  const auth = await requireAdmin(req);
  if (!auth.ok) return auth.res;
  const { id } = await params;

  const renderUrl = process.env.PDF_RENDER_URL;
  const renderSecret = process.env.PDF_SERVICE_SECRET;
  if (!renderUrl)
    return NextResponse.json({ error: "ยังไม่ได้ตั้งค่า PDF_RENDER_URL" }, { status: 503 });

  const admin = createAdminClient();
  const { data: doc } = await admin
    .from("product_documents")
    .select("html, slug, version")
    .eq("id", id)
    .maybeSingle();
  if (!doc) return NextResponse.json({ error: "ไม่พบเอกสาร" }, { status: 404 });
  if (!doc.html?.trim())
    return NextResponse.json({ error: "เอกสารยังไม่มีเนื้อหาให้ export" }, { status: 400 });

  let resp: Response;
  try {
    resp = await fetch(`${renderUrl.replace(/\/$/, "")}/render`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(renderSecret ? { "x-pdf-secret": renderSecret } : {}),
      },
      // ชื่อไฟล์ฝั่ง server เป็น ASCII (กัน header encode) — ชื่อไทยตั้งที่ frontend (a.download)
      body: JSON.stringify({ html: doc.html, filename: `product-doc-${doc.slug}` }),
    });
  } catch (e) {
    return NextResponse.json(
      { error: `เรียก PDF renderer ไม่สำเร็จ: ${(e as Error).message}` },
      { status: 502 },
    );
  }

  if (!resp.ok) {
    const detail = (await resp.text().catch(() => "")).slice(0, 300);
    return NextResponse.json({ error: `PDF renderer ${resp.status}: ${detail}` }, { status: 502 });
  }

  const pdf = await resp.arrayBuffer();
  return new Response(pdf, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="product-doc-${doc.slug}-v${doc.version}.pdf"`,
    },
  });
}
