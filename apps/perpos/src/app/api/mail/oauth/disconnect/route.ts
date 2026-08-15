/**
 * ตัดการเชื่อมต่อ = **ลบ cookie ฝั่งเราเท่านั้น** (spec §2.4 / §11 ข้อ 1)
 *
 * 🔴 Stalwart ไม่มี revocation endpoint (ทดสอบแล้ว 404 ทั้ง /auth/revoke และ /oauth/revoke)
 * ⇒ ห้ามเขียนโค้ดยิง endpoint ที่รู้อยู่แล้วว่าไม่มี และ **ห้ามบอกผู้ใช้ว่า "เพิกถอนสิทธิ์แล้ว"**
 * ถ้าอุปกรณ์สูญหายต้องเปลี่ยนรหัสผ่านกล่องเมล · "ออกจากทุกอุปกรณ์" = ผู้ดูแลหมุน MAIL_SESSION_SECRET
 */

import { type NextRequest } from "next/server";

import { isSameOriginRequest, mailError, mailJson, mailNotConfigured } from "../../_lib";
import { readMailConfig } from "@/lib/mail/oauth";
import { clearMailOAuthState, clearMailSession } from "@/lib/mail/session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const config = readMailConfig();
  if (!config) return mailNotConfigured();
  // เว็บอื่นสั่งเตะผู้ใช้ออกจากระบบไม่ได้ (route นี้ไม่ต้องมี session จึงไม่มีเกราะ SameSite)
  if (!isSameOriginRequest(req.headers, config.appBaseUrl)) {
    return mailError("mail_bad_request", "คำขอไม่ถูกต้อง", 403);
  }
  const res = mailJson({ ok: true, redirectTo: "/login?reason=disconnected" });
  clearMailSession(res);
  clearMailOAuthState(res);
  return res;
}
