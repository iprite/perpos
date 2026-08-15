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
import { MailServiceError, buildUploadUrl, sanitizeAttachmentName } from "@/lib/mail/jmap";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * เพดานจริงของ **แพลตฟอร์ม** ไม่ใช่ของเมล — Vercel จำกัด request body ~4.5 MB
 * ⇒ ประกาศเพดานที่ทำได้จริง ไม่งั้นผู้ใช้แนบ 10 MB แล้วเจอ 413 ภาษาอังกฤษของ Vercel
 *   แทนข้อความไทยของเรา (`MAX_MESSAGE_BYTES` 25 MB ยังใช้เป็นเพดานรวมของทั้งฉบับเหมือนเดิม)
 */
const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;

export async function POST(req: NextRequest) {
  // 🔴 ตรวจ session **ก่อน** อ่าน body — ไม่งั้นคนที่ไม่มีสิทธิ์ก็ทำให้เราบัฟเฟอร์ไฟล์ได้
  return withMailSession(req, async (session) => {
    const form = await req.formData().catch(() => null);
    const file = form?.get("file");
    if (!(file instanceof File)) return mailError("mail_bad_request", "ไม่พบไฟล์ที่อัปโหลด", 400);
    if (file.size <= 0) return mailError("mail_bad_request", "ไฟล์ว่าง", 400);
    if (file.size > MAX_UPLOAD_BYTES) {
      return mailError("mail_bad_request", "ไฟล์ใหญ่เกิน 4 MB", 413);
    }

    const name = sanitizeAttachmentName(file.name);
    const type = file.type || "application/octet-stream";
    const bytes = await file.arrayBuffer();

    let res: Response;
    try {
      res = await fetch(buildUploadUrl(session), {
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
