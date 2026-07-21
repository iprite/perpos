import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "../../../../_lib/supabase";
import { recordMetric } from "@/lib/metrics";
import { requireAccountingMember, accError, orgIdFromQuery } from "../../../_lib";
import { getDocument } from "@/lib/accounting/documents";
import { buildDocumentHtml } from "@/lib/accounting/document-html";

const ROUTE = "/api/accounting/documents/[id]/pdf";
type Ctx = { params: Promise<{ id: string }> };

/**
 * GET ?orgId=&copy=1 → PDF ของเอกสารขาย (Phase 1.7 — เดิมปุ่มดาวน์โหลดเป็น toast จำลอง)
 *
 * ยิงไป services/pdf-renderer (Playwright/Chromium) แล้ว stream PDF กลับ
 * ทุกค่าบนกระดาษมาจาก snapshot ของเอกสาร → ใบเก่าพิมพ์ซ้ำได้เหมือนเดิมตลอด
 * copy=1 = สำเนา (ใบกำกับภาษีต้องระบุต้นฉบับ/สำเนา)
 */
export async function GET(req: NextRequest, ctx: Ctx) {
  const t0 = Date.now();
  const { id } = await ctx.params;
  const orgId = orgIdFromQuery(req);
  if (!orgId) return accError("missing orgId");

  const auth = await requireAccountingMember(req, orgId);
  if (!auth.ok) return auth.res;

  const renderUrl = process.env.PDF_RENDER_URL;
  if (!renderUrl)
    return accError("ยังไม่ได้ตั้งค่า PDF_RENDER_URL — ใช้ปุ่มพิมพ์ผ่านเบราว์เซอร์แทนได้", 503);

  const admin = createAdminClient();
  const doc = await getDocument(admin, orgId, id);
  if (!doc) return accError("ไม่พบเอกสาร", 404);

  // โลโก้/ลายเซนอยู่ที่ตั้งค่า org (ไม่ใช่ snapshot — เป็นภาพประกอบ ไม่ใช่ข้อมูลตาม ม.86/4)
  const { data: settings } = await admin
    .from("acc_org_settings")
    .select("logo_data_url, signature_data_url")
    .eq("org_id", orgId)
    .maybeSingle();

  const isCopy = req.nextUrl.searchParams.get("copy") === "1";
  const html = buildDocumentHtml(doc, doc.lines ?? [], {
    copy: isCopy,
    orgSettings: settings as {
      logo_data_url?: string | null;
      signature_data_url?: string | null;
    } | null,
  });

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
        filename: `${doc.doc_number}${isCopy ? "-copy" : ""}`,
      }),
    });
  } catch (e) {
    void recordMetric({ orgId, route: ROUTE, method: req.method, status: 502, t0 });
    return accError(`เรียกบริการสร้าง PDF ไม่สำเร็จ: ${(e as Error).message}`, 502);
  }

  if (!resp.ok) {
    const detail = await resp.text().catch(() => "");
    void recordMetric({ orgId, route: ROUTE, method: req.method, status: 502, t0 });
    return accError(`สร้าง PDF ไม่สำเร็จ: ${detail.slice(0, 200)}`, 502);
  }

  const pdf = await resp.arrayBuffer();
  void recordMetric({ orgId, route: ROUTE, method: req.method, status: 200, t0 });
  return new NextResponse(pdf, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${doc.doc_number}${isCopy ? "-copy" : ""}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
