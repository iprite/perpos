/**
 * ตัวช่วยกลางของ `/api/mail/*` — ตรวจ session + refresh + รูปแบบ error (spec §5)
 *
 * รูปแบบ error ของโมดูลนี้คือ `{ error, message }` (message เป็นภาษาไทยพร้อมแสดงผู้ใช้)
 * ต่างจาก `_lib/response.ts` ของส่วนอื่นโดยตั้งใจ — contract ล็อกไว้
 *
 * ทุก response ต้อง `Cache-Control: private, no-store` และทุก route ต้อง `dynamic = 'force-dynamic'`
 * (§7.6 — instance เดียวเสิร์ฟหลายคน ห้าม cache ข้ามผู้ใช้)
 */

import { NextResponse, type NextRequest } from "next/server";

import { MailServiceError, MailUnauthorizedError } from "@/lib/mail/jmap";
import { MailArchiveError } from "@/lib/mail/messages";
import { MailFolderError } from "@/lib/mail/folders";
import { MailSieveInvalidError } from "@/lib/mail/rules";
import { readMailConfig } from "@/lib/mail/oauth";
import {
  clearMailSession,
  needsRefresh,
  readMailSession,
  refreshMailSession,
  writeMailSession,
} from "@/lib/mail/session";
import type { MailSession } from "@/lib/mail/types";

export const MAIL_NO_STORE = { "Cache-Control": "private, no-store" } as const;

export function mailJson<T>(data: T, status = 200): NextResponse {
  return NextResponse.json(data, { status, headers: { ...MAIL_NO_STORE } });
}

export function mailError(error: string, message: string, status: number): NextResponse {
  return mailJson({ error, message }, status);
}

export function mailSessionExpired(): NextResponse {
  const res = mailError("mail_session_expired", "เซสชันอีเมลหมดอายุ กรุณาเชื่อมกล่องเมลใหม่", 401);
  clearMailSession(res);
  return res;
}

export function mailNotConfigured(): NextResponse {
  return mailError("mail_not_configured", "ยังไม่ได้ตั้งค่าระบบอีเมล", 503);
}

/** แปลง error ภายในเป็นข้อความไทยที่ผู้ใช้เห็นได้ — ห้าม leak รายละเอียด/เนื้อหาเมล */
export function mailErrorResponse(e: unknown): NextResponse {
  if (e instanceof MailUnauthorizedError) return mailSessionExpired();
  if (e instanceof MailArchiveError) {
    return mailError("mail_archive_unavailable", "ยังสร้างกล่องคลังเก็บไม่ได้", 409);
  }
  // ข้อความของสองตัวนี้เขียนไว้ให้ผู้ใช้อ่านโดยตรงแล้ว (ไม่มีรายละเอียดภายใน)
  if (e instanceof MailFolderError) return mailError("mail_folder_error", e.message, e.status);
  if (e instanceof MailSieveInvalidError) {
    return mailError("mail_rules_invalid", e.message, 400);
  }
  if (e instanceof MailServiceError) {
    if (e.status === 404) return mailError("mail_not_found", e.message, 404);
    if (e.status === 400) return mailError("mail_bad_request", "คำขอไม่ถูกต้อง", 400);
    return mailError("mail_upstream_error", "ระบบอีเมลไม่ตอบสนอง ลองใหม่อีกครั้ง", 502);
  }
  return mailError("mail_error", "เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง", 500);
}

/**
 * ห่อ handler ด้วยการตรวจ session:
 *  - ไม่มี session / refresh ไม่ผ่าน → 401 mail_session_expired + ลบ cookie
 *  - เหลืออายุ < 60 วิ → refresh ก่อน
 *  - เจอ 401 จาก JMAP ระหว่างทาง → refresh **ได้ครั้งเดียวต่อ request** แล้วยิงซ้ำ 1 ครั้ง
 *  - refresh สำเร็จ → เขียน cookie ใหม่ใน response เดียวกับผลลัพธ์
 *
 * ⚠️ ผู้เรียกต้อง parse body ของ request **ก่อน** เรียกฟังก์ชันนี้ (handler อาจถูกยิงซ้ำ)
 */
export async function withMailSession(
  req: NextRequest,
  handler: (session: MailSession) => Promise<NextResponse>,
): Promise<NextResponse> {
  const config = readMailConfig();
  if (!config) return mailNotConfigured();

  let session = readMailSession(req);
  if (!session) return mailSessionExpired();

  let refreshed = false;
  try {
    if (needsRefresh(session)) {
      session = await refreshMailSession(session, config);
      refreshed = true;
    }

    let res: NextResponse;
    try {
      res = await handler(session);
    } catch (e) {
      if (e instanceof MailUnauthorizedError && !refreshed) {
        session = await refreshMailSession(session, config);
        refreshed = true;
        res = await handler(session);
      } else {
        throw e;
      }
    }

    if (refreshed) writeMailSession(res, session);
    return res;
  } catch (e) {
    const res = mailErrorResponse(e);
    /**
     * 🔴 refresh สำเร็จแล้วค่อยพังทีหลัง = refresh token ถูก "หมุน" ไปแล้วที่ฝั่งเซิร์ฟเวอร์
     *    ถ้าไม่เขียน cookie ใหม่ลง response นี้ ของเดิมในเบราว์เซอร์จะใช้ไม่ได้อีกเลย
     *    ⇒ ผู้ใช้หลุดถาวรเพราะ error ชั่วคราวครั้งเดียว
     *    ยกเว้น `MailUnauthorizedError` — กรณีนั้น session ตายจริงและ `mailErrorResponse`
     *    ลบ cookie ไปแล้ว ห้ามเขียนทับกลับเข้าไป
     */
    if (refreshed && !(e instanceof MailUnauthorizedError)) writeMailSession(res, session);
    return res;
  }
}

/**
 * คำขอมาจากหน้าเว็บของเราเองไหม (กัน CSRF ของ route ที่ **ไม่ต้องมี session**)
 *
 * route ที่ต้องมี session ปลอดภัยอยู่แล้วเพราะ cookie เป็น `SameSite=strict`
 * แต่ `oauth/disconnect` ทำงานได้โดยไม่ต้องมี session ⇒ ฟอร์มจากเว็บอื่นสั่งเตะผู้ใช้ออกได้
 *
 * pure โดยตั้งใจ (รับ `Headers` ไม่ใช่ `NextRequest`) เพื่อให้เทสได้ตรง ๆ
 */
export function isSameOriginRequest(headers: Headers, appBaseUrl: string): boolean {
  const site = headers.get("sec-fetch-site");
  if (site) return site === "same-origin";
  const origin = headers.get("origin");
  if (!origin) return false; // POST ที่ไม่บอก origin เลย = ไม่ไว้ใจ
  return origin.replace(/[/]+$/, "") === appBaseUrl.replace(/[/]+$/, "");
}

/** อ่าน JSON body แบบไม่โยน */
export async function readJsonBody(req: NextRequest): Promise<Record<string, unknown>> {
  try {
    const body = await req.json();
    return body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}
