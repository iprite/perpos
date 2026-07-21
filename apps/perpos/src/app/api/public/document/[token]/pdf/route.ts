import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "../../../../_lib/supabase";
import { getDocument } from "@/lib/accounting/documents";
import { buildDocumentHtml } from "@/lib/accounting/document-html";
import { lookupShare } from "@/lib/accounting/document-share";

type Ctx = { params: Promise<{ token: string }> };

/**
 * GET /api/public/document/<token>/pdf → PDF ของเอกสารที่ถูกแชร์ (ไม่ต้อง login)
 * สิทธิ์ = การถือ token เท่านั้น → ต้องผ่าน lookupShare ทุกครั้ง (เพิกถอน/หมดอายุมีผลทันที)
 * ไม่รับ ?copy= จากภายนอก — ลูกค้าได้ "ต้นฉบับ" เสมอ (สำเนาเป็นเรื่องภายในของผู้ขาย)
 */
export async function GET(_req: NextRequest, ctx: Ctx) {
  const { token } = await ctx.params;
  const admin = createAdminClient();

  const found = await lookupShare(admin, token);
  if (!found.ok) return NextResponse.json({ error: "ลิงก์ใช้ไม่ได้" }, { status: 404 });

  const doc = await getDocument(admin, found.share.org_id, found.share.document_id);
  if (!doc) return NextResponse.json({ error: "ไม่พบเอกสาร" }, { status: 404 });

  const renderUrl = process.env.PDF_RENDER_URL;
  if (!renderUrl) return NextResponse.json({ error: "ยังไม่ได้ตั้งค่า PDF" }, { status: 503 });

  const { data: settings } = await admin
    .from("acc_org_settings")
    .select("logo_data_url, signature_data_url")
    .eq("org_id", found.share.org_id)
    .maybeSingle();

  const html = buildDocumentHtml(doc, doc.lines ?? [], {
    copy: false,
    orgSettings: settings as {
      logo_data_url?: string | null;
      signature_data_url?: string | null;
    } | null,
  });

  const resp = await fetch(`${renderUrl.replace(/\/$/, "")}/render`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(process.env.PDF_SERVICE_SECRET ? { "x-pdf-secret": process.env.PDF_SERVICE_SECRET } : {}),
    },
    body: JSON.stringify({ html, filename: `${doc.doc_number}.pdf` }),
  });
  if (!resp.ok) return NextResponse.json({ error: "สร้าง PDF ไม่สำเร็จ" }, { status: 502 });

  return new NextResponse(await resp.arrayBuffer(), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${doc.doc_number}.pdf"`,
      // ลิงก์เป็นความลับ → ห้าม CDN/proxy เก็บไว้แจกต่อ
      "Cache-Control": "private, no-store",
    },
  });
}
