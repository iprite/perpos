/**
 * Proxy ไฟล์แนบ — จุดอ่อนที่สุดของฟีเจอร์นี้ (spec §7.7) ทุกข้อบังคับ:
 *  - blobId ต้องผ่าน regex ก่อน ไม่ผ่าน = 400 ทันที ไม่ยิงต่อ
 *  - URL ประกอบจาก downloadUrl template ของ JMAP session (ห้ามฮาร์ดโค้ด) + assert prefix/origin
 *  - ชื่อไฟล์ถูกตัด CR/LF/`"`/`\`/`/` ก่อนใส่ header (header injection)
 *  - ตอบ attachment เสมอ ยกเว้น allowlist รูป 4 ชนิด (ห้าม inline svg/html/pdf)
 *  - nosniff + CSP `default-src 'none'; sandbox`
 *  - เพดาน 25 MB นับ byte จริงระหว่าง stream (ห้ามเชื่อ Content-Length)
 */

import { NextResponse, type NextRequest } from "next/server";

import { mailError, withMailSession } from "../../_lib";
import {
  INLINE_IMAGE_TYPES,
  fetchBlob,
  isValidBlobId,
  resolveDownloadType,
  sanitizeAttachmentName,
} from "@/lib/mail/jmap";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MAX_BYTES = 25 * 1024 * 1024;

export async function GET(req: NextRequest, ctx: { params: Promise<{ blobId: string }> }) {
  const { blobId } = await ctx.params;
  if (!isValidBlobId(blobId)) {
    return mailError("mail_bad_request", "รหัสไฟล์แนบไม่ถูกต้อง", 400);
  }

  const params = req.nextUrl.searchParams;
  const name = sanitizeAttachmentName(params.get("name"));
  const contentType = resolveDownloadType(params.get("type"));
  const forceDownload = params.get("download") === "1";
  const inline = !forceDownload && (INLINE_IMAGE_TYPES as readonly string[]).includes(contentType);

  return withMailSession(req, async (session) => {
    const upstream = await fetchBlob(session, { blobId, name, type: contentType });
    const body = upstream.body;
    if (!body) return mailError("mail_upstream_error", "ดาวน์โหลดไฟล์แนบไม่สำเร็จ", 502);

    const reader = body.getReader();
    let total = 0;
    const stream = new ReadableStream<Uint8Array>({
      async pull(controller) {
        const { done, value } = await reader.read();
        if (done) {
          controller.close();
          return;
        }
        total += value.byteLength;
        if (total > MAX_BYTES) {
          await reader.cancel();
          controller.error(new Error("attachment too large"));
          return;
        }
        controller.enqueue(value);
      },
      cancel() {
        void reader.cancel();
      },
    });

    const disposition = inline ? "inline" : "attachment";
    return new NextResponse(stream, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": `${disposition}; filename*=UTF-8''${encodeURIComponent(name)}`,
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'; sandbox",
        "Cache-Control": "private, no-store",
      },
    });
  });
}
