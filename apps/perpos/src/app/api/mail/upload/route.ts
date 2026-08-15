/**
 * อัปโหลดไฟล์แนบ (M2) — proxy ไป JMAP upload endpoint แล้วคืน `blobId`
 *
 * ทำไมต้อง proxy (ห้ามให้เบราว์เซอร์ยิงตรง):
 *  - access token อยู่ใน cookie httpOnly ฝั่งเรา — ส่งให้ JS ไม่ได้เด็ดขาด (spec §7.4)
 *  - ต้องคุมเพดานขนาด/ชนิดไฟล์ก่อนถึงเซิร์ฟเวอร์เมล
 *
 * ⚠️ ไฟล์ไม่ถูกเก็บที่ฝั่งเราเลย — สตรีมผ่านแล้วทิ้ง (PDPA: ไม่มีสำเนาที่ต้องตามลบ)
 */

import { type NextRequest } from "next/server";

import { mailError, mailJson, withMailSession } from "../_lib";
import { MailServiceError, sanitizeAttachmentName } from "@/lib/mail/jmap";
import { MAX_MESSAGE_BYTES } from "@/lib/mail/compose";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

/** ไฟล์เดียวห้ามเกินเพดานของทั้งฉบับ (ชั้น compose คิด base64 ซ้ำอีกที) */
const MAX_UPLOAD_BYTES = MAX_MESSAGE_BYTES;

function uploadEndpoint(session: {
  uploadUrl?: string;
  apiUrl: string;
  accountId: string;
}): string {
  const template =
    session.uploadUrl ?? new URL("/jmap/upload/{accountId}/", session.apiUrl).toString();
  return template.replace("{accountId}", encodeURIComponent(session.accountId));
}

export async function POST(req: NextRequest) {
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return mailError("mail_bad_request", "ไม่พบไฟล์ที่อัปโหลด", 400);
  if (file.size <= 0) return mailError("mail_bad_request", "ไฟล์ว่าง", 400);
  if (file.size > MAX_UPLOAD_BYTES) {
    return mailError("mail_bad_request", "ไฟล์ใหญ่เกิน 25 MB", 413);
  }

  const name = sanitizeAttachmentName(file.name);
  const type = file.type || "application/octet-stream";
  const bytes = await file.arrayBuffer();

  return withMailSession(req, async (session) => {
    let res: Response;
    try {
      res = await fetch(uploadEndpoint(session), {
        method: "POST",
        redirect: "manual",
        cache: "no-store",
        headers: { Authorization: `Bearer ${session.accessToken}`, "Content-Type": type },
        body: bytes,
        signal: AbortSignal.timeout(60_000),
      });
    } catch {
      throw new MailServiceError(504);
    }
    if (res.status === 401) throw new MailServiceError(401);
    if (!res.ok) throw new MailServiceError(502, "อัปโหลดไฟล์แนบไม่สำเร็จ");

    const data = (await res.json().catch(() => null)) as { blobId?: string; size?: number } | null;
    if (!data?.blobId) throw new MailServiceError(502, "อัปโหลดไฟล์แนบไม่สำเร็จ");

    return mailJson({
      blobId: data.blobId,
      name,
      type,
      size: typeof data.size === "number" ? data.size : file.size,
    });
  });
}
